// Imova — recommend.js : recommandations personnalisées, calculées puis ENREGISTRÉES dans la base (recommendations/UID).
//
// Ce que le système retient pour chaque compte (userInterests/UID) : les mots et les « concepts » (maison, terrain, location...) des annonces
// qu'il ouvre, aime, met en favoris, discute ou recherche ; les annonceurs qu'il suit, visite ou aime ; ses préférences (types de bien,
// quartiers, mots-clés) ; ses recherches ; et ce qu'il refuse (« Pas intéressé »).
//
// Pour classer les annonces : fraîcheur + proximité de concepts (« villa » aide à trouver aussi les « maisons ») + proximité de mots +
// préférences déclarées + affinité avec l'annonceur + annonceur suivi + annonceur suivi par vos abonnements + popularité + qualité (photos)
// − ce qui est refusé − ce qui a déjà été ouvert ou vu plusieurs fois, avec de la diversité (pas dix annonces du même annonceur ni du même type)
// et un peu d'exploration (les annonces toutes neuves ont leur chance). Chaque recommandation a une raison affichée.
import { fetchProperties, fetchByTokens, fetchFromAuthors, loadAuthors } from './properties.js';
import { getProfile, topTokens, topAuthors, topConcepts, hasSignals, hasPrefs, personalizationOn, pushRemote, currentSignals } from './interests.js';
import { conceptsOf, wordsOfConcept, CONCEPT_LABEL, PREF_GROUPS } from './concepts.js';
import { loadRecs, saveRecs } from './reco-store.js';
import { buildTokens } from './search.js';
import { firestore } from './firebase.js';
import { listFollowing } from './follows.js';
import { withBadge } from './badge-rules.js';

export const VERSION = 2;
const POOL = { recent: 25, tokens: 15, prefs: 15, concepts: 12, authors: 15, social: 10 };
const STALE_MS = 25 * 60 * 1000;
const STALE_SIGNALS = 6;
const millis = (t) => (t && t.toDate ? t.toDate().getTime() : new Date(t || 0).getTime());
const tanh = Math.tanh;

// Mots à chercher pour les préférences choisies
function prefWords(prefs) {
  const words = [];
  [...(prefs.types || []), ...(prefs.goals || [])].forEach((c) => words.push(...wordsOfConcept(c).slice(0, 4)));
  words.push(...(prefs.places || []), ...(prefs.keywords || []));
  return [...new Set(words)];
}

export function scoreProperty(p, prof, ctx) {
  const ageH = Math.max(0, (Date.now() - millis(p.createdAt)) / 3600e3);
  const toks = p.tokens || [];
  const pcs = conceptsOf(toks);
  // mots
  let interest = 0; let bestTok = ['', 0];
  toks.forEach((t) => { const v = prof.tokens[t] || 0; interest += v; if (v > bestTok[1]) bestTok = [t, v]; });
  interest = interest / (1 + Math.sqrt(toks.length || 1));
  // concepts
  let cs = 0; let bestC = ['', 0];
  pcs.forEach((c) => { const v = prof.concepts[c] || 0; cs += v; if (v > bestC[1]) bestC = [c, v]; });
  // préférences déclarées
  const pf = prof.prefs || {};
  let pref = 0; let prefWhy = '';
  [...(pf.types || []), ...(pf.goals || [])].forEach((c) => { if (pcs.includes(c)) { pref += 1; prefWhy = prefWhy || (CONCEPT_LABEL[c] || ''); } });
  (pf.places || []).forEach((pl) => { if (toks.includes(pl)) { pref += 1.3; prefWhy = pl; } });
  (pf.keywords || []).forEach((k) => { if (toks.includes(k)) { pref += 1; prefWhy = prefWhy || k; } });
  // refus
  let negT = 0; toks.forEach((t) => { negT += prof.negTokens[t] || 0; });
  const neg = tanh(negT / 3) * 0.9 + tanh((prof.negAuthors[p.authorId] || 0) / 3) * 1.2;
  const authorAff = prof.authors[p.authorId] || 0;
  const social = ctx.social ? Math.min(1, (ctx.social.get(p.authorId) || 0) / 3) : 0;
  const pop = Math.min(1, Math.log1p((p.likesCount || 0) + 0.5 * (p.viewsCount || 0)) / 5);
  const fresh = Math.exp(-ageH / 36) * Math.exp(-(p.viewsCount || 0) / 8) * 0.25; // exploration : les annonces neuves sont montrées
  const parts = {
    recency: Math.exp(-ageH / 96),
    concept: 1.1 * tanh(cs / 4),
    interest: 0.9 * tanh(interest / 3),
    pref: 1.2 * tanh(pref / 2.5),
    author: 1.1 * tanh(authorAff / 4),
    follow: ctx.following.has(p.authorId) ? 0.9 : 0,
    social: 0.5 * social,
    pop: 0.4 * pop
  };
  const media = p.media && p.media.length ? 0.12 : 0;
  const opened = prof.clicked[p.id] ? 0.35 : 0;
  const tired = Math.min(0.5, 0.08 * (prof.seen[p.id] || 0));
  const score = Object.values(parts).reduce((a, b) => a + b, 0) + media + fresh - neg - opened - tired + Math.random() * 0.06;
  // raison : la composante qui pèse le plus (hors fraîcheur, sauf si rien d'autre)
  const order = ['pref', 'follow', 'author', 'concept', 'interest', 'social', 'pop'].map((k) => [k, parts[k]]).sort((a, b) => b[1] - a[1]);
  const [k, v] = order[0];
  let reason = '';
  if (v > 0.2) {
    reason = {
      pref: prefWhy ? `Correspond à vos préférences (${prefWhy})` : 'Correspond à vos préférences',
      follow: 'Vous suivez cet annonceur',
      author: "Vous vous intéressez à cet annonceur",
      concept: bestC[0] ? `Vous aimez : ${(CONCEPT_LABEL[bestC[0]] || '').toLowerCase()}` : "Selon vos centres d'intérêt",
      interest: bestTok[0] ? `Selon vos centres d'intérêt (${bestTok[0]})` : "Selon vos centres d'intérêt",
      social: 'Annonceur suivi par des personnes que vous suivez',
      pop: 'Populaire en ce moment'
    }[k];
  } else if (ageH < 24) reason = 'Nouvelle annonce';
  return { score, reason, concept: pcs[0] || '' };
}

// Classement avec diversité : on évite le même annonceur et le même type de bien en rafale
function rank(candidates, prof, ctx) {
  const scored = candidates.map((p) => ({ p, ...scoreProperty(p, prof, ctx) }));
  const out = [];
  while (scored.length) {
    scored.sort((a, b) => b.score - a.score);
    const next = scored.shift();
    out.push(next);
    const sameC = out.filter((o) => o.concept && o.concept === next.concept).length;
    scored.forEach((s) => {
      if (s.p.authorId === next.p.authorId) s.score -= 0.3;
      if (next.concept && s.concept === next.concept && sameC > 3) s.score -= 0.12;
    });
  }
  return out;
}

// Annonceurs suivis par les personnes que je suis : Map(annonceur → nombre d'abonnés « proches »)
async function socialAuthors(meUid, following) {
  const out = new Map();
  if (!following.length) return out;
  try {
    const fs = await firestore();
    const { m, db } = fs;
    const snap = await m.getDocs(m.query(m.collection(db, 'follows'), m.where('followerId', 'in', following.slice(0, 10)), m.limit(120)));
    const mine = new Set(following);
    snap.docs.forEach((d) => { const t = d.data().targetId; if (t && t !== meUid && !mine.has(t)) out.set(t, (out.get(t) || 0) + 1); });
  } catch (e) { /* facultatif */ }
  return out;
}

async function candidatePool(me, prof, following, social) {
  const pw = prefWords(prof.prefs || {});
  const conceptWords = topConcepts(prof, 2).flatMap((c) => wordsOfConcept(c).slice(0, 5));
  const authors = [...new Set([...topAuthors(prof, 5), ...following])].slice(0, 10);
  const socialTop = [...social.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
  const safe = (promise) => promise.catch(() => []);
  const [recent, byTokens, byPrefs, byConcepts, byAuthors, bySocial] = await Promise.all([
    fetchProperties({ size: POOL.recent }),
    topTokens(prof, 8).length ? safe(fetchByTokens(topTokens(prof, 8), POOL.tokens)) : [],
    pw.length ? safe(fetchByTokens(pw.slice(0, 10), POOL.prefs)) : [],
    conceptWords.length ? safe(fetchByTokens(conceptWords.slice(0, 10), POOL.concepts)) : [],
    authors.length ? safe(fetchFromAuthors(authors, POOL.authors)) : [],
    socialTop.length ? safe(fetchFromAuthors(socialTop, POOL.social)) : []
  ]);
  const map = new Map();
  [...recent.items, ...byTokens, ...byPrefs, ...byConcepts, ...byAuthors, ...bySocial].forEach((p) => { if (!map.has(p.id)) map.set(p.id, p); });
  return { list: [...map.values()], recent };
}

// Recherches suggérées : combinaisons type de bien + lieu / type de bien + vente ou location, puis mots forts
function suggestSearches(prof) {
  const placeLabel = new Map(PREF_GROUPS.find((g) => g.key === 'places').items.map(([k, l]) => [k, l]));
  const pf = prof.prefs || {};
  const cs = topConcepts(prof, 6);
  // le type de bien et l'objectif viennent d'abord des préférences déclarées, puis de ce que l'utilisateur consulte
  const type = [...(pf.types || []), ...cs].find((c) => c.startsWith('type:'));
  const op = [...(pf.goals || []), ...cs].find((c) => c.startsWith('op:'));
  const word = (c) => wordsOfConcept(c)[0];
  const places = [...(pf.places || [])].map((k) => placeLabel.get(k) || k);
  const out = [];
  if (type && places[0]) out.push([`${word(type)} ${places[0]}`, 'Selon vos préférences']);
  if (type && op) out.push([`${word(type)} ${word(op)}`, "Selon vos centres d'intérêt"]);
  if (type && op && places[0]) out.push([`${word(type)} ${word(op)} ${places[0]}`, 'Selon vos préférences']);
  places.slice(0, 3).forEach((pl) => out.push([pl, 'Un de vos quartiers']));
  topTokens(prof, 5).forEach((t) => { if (t.length >= 4) out.push([t, 'Vous le cherchez souvent']); });
  const done = new Set((prof.searches || []).map((s) => String(s.q).toLowerCase()));
  const seen = new Set();
  return out.filter(([q]) => { const k = q.toLowerCase(); if (seen.has(k) || done.has(k)) return false; seen.add(k); return true; }).slice(0, 8).map(([q, reason]) => ({ q, reason }));
}

// Profils à suivre : annonceurs des annonces recommandées, suivis par mes abonnements, populaires et fiables
async function rankProfiles(me, ranked, social, following, prof) {
  const fs = await firestore();
  const { m, db } = fs;
  const byAuthor = new Map();
  ranked.slice(0, 30).forEach((r) => byAuthor.set(r.p.authorId, (byAuthor.get(r.p.authorId) || 0) + Math.max(0, r.score)));
  const cand = new Set([...byAuthor.keys(), ...social.keys(), ...topAuthors(prof, 5)]);
  following.forEach((f) => cand.delete(f));
  cand.delete(me.uid);
  let ids = [...cand].sort((a, b) => ((byAuthor.get(b) || 0) + (social.get(b) || 0)) - ((byAuthor.get(a) || 0) + (social.get(a) || 0))).slice(0, 12);
  // complément : les profils les plus suivis
  try {
    const top = await m.getDocs(m.query(m.collection(db, 'users'), m.orderBy('followersCount', 'desc'), m.limit(10)));
    top.docs.forEach((d) => { if (!cand.has(d.id) && d.id !== me.uid && !following.includes(d.id) && ids.length < 18) ids.push(d.id); });
  } catch (e) { /* facultatif */ }
  ids = [...new Set(ids)];
  const users = (await Promise.all(ids.map(async (id) => { try { const s = await m.getDoc(m.doc(db, 'users', id)); return s.exists() ? withBadge({ id, ...s.data() }) : null; } catch (e) { return null; } }))).filter(Boolean);
  return users.filter((u) => u.name && u.discoverable !== false && u.suspended !== true).map((u) => {
    const rel = byAuthor.get(u.id) || 0; const soc = social.get(u.id) || 0; const aff = prof.authors[u.id] || 0;
    const avg = u.ratingCount ? u.ratingSum / u.ratingCount : 0;
    const score = 1.4 * tanh(rel / 3) + 0.9 * tanh(soc / 2) + 1.2 * tanh(aff / 4) + (u.verified ? 0.5 : 0) + (u.type === 'agence' ? 0.2 : 0) + Math.log1p(u.followersCount || 0) / 6 + avg / 10 + Math.random() * 0.04;
    const reason = soc > 0 ? `Suivi par ${soc} personne${soc > 1 ? 's' : ''} que vous suivez` : aff > 0.5 ? "Proche de vos centres d'intérêt" : rel > 0.5 ? 'Publie des annonces qui vous correspondent' : u.verified ? 'Profil vérifié' : 'Populaire sur Imova';
    return { id: u.id, score: Math.round(score * 100) / 100, reason };
  }).sort((a, b) => b.score - a.score).slice(0, 16);
}

// ───────── Calcul + enregistrement dans la base
let inflight = null;
export function computeRecommendations(me) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await pushRemote(me.uid).catch(() => {}); // le profil d'intérêts enregistré est à jour avant le calcul
      const prof = getProfile();
      let following = [];
      try { following = await listFollowing(me.uid); } catch (e) { /* sans abonnements */ }
      const social = await socialAuthors(me.uid, following);
      const { list } = await candidatePool(me, prof, following, social);
      const ctx = { following: new Set(following), social };
      const ranked = rank(list.filter((p) => !prof.hidden.has(p.id) && p.authorId !== me.uid), prof, ctx);
      const profiles = await rankProfiles(me, ranked, social, following, prof);
      const top = [...topConcepts(prof, 3).map((c) => CONCEPT_LABEL[c]).filter(Boolean), ...topTokens(prof, 3)].slice(0, 5);
      const doc = {
        version: VERSION,
        properties: ranked.slice(0, 60).map((r) => ({ id: r.p.id, score: Math.round(r.score * 100) / 100, reason: r.reason || '' })),
        profiles,
        searches: suggestSearches(prof),
        basedOn: { signals: currentSignals(), top, follows: following.length }
      };
      await saveRecs(me.uid, doc);
      memo = { uid: me.uid, doc: { ...doc, computedAt: Date.now() } };
      return memo.doc;
    } finally { inflight = null; }
  })();
  return inflight;
}

let memo = null;
// Retourne les recommandations enregistrées (les recalcule si elles sont anciennes ou si de nouveaux signaux sont arrivés).
// Si des recommandations existent déjà, on les affiche tout de suite et on recalcule en arrière-plan.
export async function ensureRecommendations(me, { force = false } = {}) {
  if (!me || !personalizationOn()) return null;
  let doc = memo && memo.uid === me.uid ? memo.doc : null;
  if (!doc) { try { doc = await loadRecs(me.uid); } catch (e) { doc = null; } if (doc) memo = { uid: me.uid, doc }; }
  const age = doc ? Date.now() - millis(doc.computedAt) : Infinity;
  const delta = currentSignals() - ((doc && doc.basedOn && doc.basedOn.signals) || 0);
  const stale = !doc || doc.version !== VERSION || age > STALE_MS || delta >= STALE_SIGNALS;
  if (force || !doc) { try { return await computeRecommendations(me); } catch (e) { console.error(e); return doc; } }
  if (stale) computeRecommendations(me).catch(() => {});
  return doc;
}
export const forgetRecommendations = () => { memo = null; };

// ───────── Sans compte, ou personnalisation désactivée : classement simple (fraîcheur, popularité, qualité)
export async function buildForYou({ me = null } = {}) {
  const prof = personalizationOn() ? getProfile() : { tokens: {}, concepts: {}, authors: {}, negTokens: {}, negAuthors: {}, seen: {}, clicked: {}, hidden: new Set(), searches: [], prefs: { types: [], goals: [], places: [], keywords: [] } };
  let following = new Set();
  if (me) { try { following = new Set(await listFollowing(me.uid)); } catch (e) { /* sans abonnements */ } }
  const tokens = topTokens(prof, 8);
  const authors = [...new Set([...topAuthors(prof, 5), ...following])].slice(0, 8);
  const [recent, byTokens, byAuthors] = await Promise.all([
    fetchProperties({ size: POOL.recent }),
    tokens.length ? fetchByTokens(tokens, POOL.tokens).catch(() => []) : [],
    authors.length ? fetchFromAuthors(authors, POOL.authors).catch(() => []) : []
  ]);
  const map = new Map();
  [...recent.items, ...byTokens, ...byAuthors].forEach((p) => { if (!map.has(p.id) && !prof.hidden.has(p.id)) map.set(p.id, p); });
  const ranked = rank([...map.values()], prof, { following, social: null });
  return { ranked, recentCursor: recent.cursor, recentDone: recent.done, fromCache: recent.fromCache, personalised: hasSignals(prof) || following.size > 0, ids: new Set(map.keys()) };
}

// « Profils à suivre » : ceux de la base si disponibles, sinon les plus suivis
export async function suggestProfiles({ me = null, limit = 8 } = {}) {
  const fs = await firestore();
  if (!fs) return [];
  const { m, db } = fs;
  if (me && personalizationOn()) {
    const doc = await ensureRecommendations(me).catch(() => null);
    if (doc && doc.profiles && doc.profiles.length) {
      const picks = doc.profiles.slice(0, limit + 4);
      const users = (await Promise.all(picks.map(async (r) => { try { const s = await m.getDoc(m.doc(db, 'users', r.id)); return s.exists() ? { u: withBadge({ id: r.id, ...s.data() }), reason: r.reason } : null; } catch (e) { return null; } }))).filter(Boolean);
      let following = new Set();
      try { following = new Set(await listFollowing(me.uid)); } catch (e) { /* ignoré */ }
      return users.filter(({ u }) => !following.has(u.id) && u.discoverable !== false).slice(0, limit);
    }
  }
  let following = new Set();
  if (me) { try { following = new Set(await listFollowing(me.uid)); } catch (e) { /* ignoré */ } }
  const snap = await m.getDocs(m.query(m.collection(db, 'users'), m.orderBy('followersCount', 'desc'), m.limit(15)));
  return snap.docs.map((d) => withBadge({ id: d.id, ...d.data() }))
    .filter((u) => u.id !== (me && me.uid) && !following.has(u.id) && u.name && u.discoverable !== false)
    .map((u) => ({ u, reason: u.verified ? 'Profil vérifié' : 'Populaire sur Imova', s: Math.log1p(u.followersCount || 0) + (u.verified ? 1 : 0) }))
    .sort((a, b) => b.s - a.s).slice(0, limit).map(({ u, reason }) => ({ u, reason }));
}

// Annonces proches de celle qu'on regarde (mêmes mots-clés), pour « Annonces similaires »
export async function similarTo(property, size = 6) {
  const tokens = (property.tokens || []).slice(0, 10);
  const found = tokens.length ? await fetchByTokens(tokens, 25) : [];
  const mine = new Set(tokens);
  const myC = new Set(conceptsOf(tokens));
  return found
    .filter((p) => p.id !== property.id)
    .map((p) => ({ p, s: (p.tokens || []).filter((t) => mine.has(t)).length + conceptsOf(p.tokens || []).filter((c) => myC.has(c)).length * 0.7 + (p.authorId === property.authorId ? 1 : 0) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, size)
    .map((r) => r.p);
}
