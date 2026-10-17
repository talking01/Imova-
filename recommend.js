// Imova — recommend.js : « Pour vous » (annonces) et « Profils à suivre ».
// Méthode (simple et transparente, pas de boîte noire) : on rassemble des candidats (annonces récentes, annonces
// proches de vos centres d'intérêt, annonces des annonceurs qui vous intéressent ou que vous suivez), puis on note
// chacune : fraîcheur + proximité avec vos intérêts + affinité avec l'annonceur + popularité, avec une pénalité pour ce
// que vous avez déjà ouvert ou vu plusieurs fois, et un peu de hasard pour varier. Chaque recommandation a une raison affichée.
import { fetchProperties, fetchByTokens, fetchFromAuthors } from './properties.js';
import { getProfile, topTokens, topAuthors, hasSignals } from './interests.js';
import { firestore } from './firebase.js';
import { listFollowing } from './follows.js';

// Réglages du nombre de lectures Firestore par ouverture de l'accueil (quota gratuit : 50 000 lectures par jour)
const POOL_RECENT = 20, POOL_TOKENS = 10, POOL_AUTHORS = 10, SUGGEST_SCAN = 15;

const millis = (t) => (t && t.toDate ? t.toDate().getTime() : new Date(t || 0).getTime());
const tanh = Math.tanh;

export function scoreProperty(p, prof, ctx) {
  const ageH = Math.max(0, (Date.now() - millis(p.createdAt)) / 3600e3);
  const recency = Math.exp(-ageH / 96); // une annonce perd la moitié de son attrait en ~3 jours
  const toks = p.tokens || [];
  let interest = 0;
  let best = ['', 0];
  toks.forEach((t) => { const v = prof.tokens[t] || 0; interest += v; if (v > best[1]) best = [t, v]; });
  interest = interest / (1 + Math.sqrt(toks.length || 1));
  const author = prof.authors[p.authorId] || 0;
  const follow = ctx.following.has(p.authorId) ? 1 : 0;
  const pop = Math.log1p(p.likesCount || 0) / 5;
  const media = p.media && p.media.length ? 0.15 : 0;
  const opened = prof.clicked[p.id] ? 0.35 : 0;
  const tired = Math.min(0.5, 0.08 * (prof.seen[p.id] || 0));
  const parts = { recency, interest: 1.6 * tanh(interest / 3), author: 1.2 * tanh(author / 4), follow: 0.9 * follow, pop: 0.4 * pop };
  const score = parts.recency + parts.interest + parts.author + parts.follow + parts.pop + media - opened - tired + Math.random() * 0.08;
  let reason = '';
  const top = Object.entries(parts).sort((a, b) => b[1] - a[1])[0];
  if (parts.follow > 0 && top[0] !== 'interest') reason = 'Vous suivez cet annonceur';
  else if (top[0] === 'author' && parts.author > 0.25) reason = "Vous vous intéressez à cet annonceur";
  else if (top[0] === 'interest' && parts.interest > 0.25) reason = best[0] ? `Selon vos centres d'intérêt (${best[0]})` : "Selon vos centres d'intérêt";
  else if (top[0] === 'follow') reason = 'Vous suivez cet annonceur';
  return { score, reason };
}

// Classe les candidats puis évite que le même annonceur occupe tout le haut de la liste
function rank(candidates, prof, ctx) {
  const scored = candidates.map((p) => ({ p, ...scoreProperty(p, prof, ctx) }));
  const out = [];
  const used = new Map();
  while (scored.length) {
    scored.sort((a, b) => b.score - a.score);
    const next = scored.shift();
    out.push(next);
    used.set(next.p.authorId, (used.get(next.p.authorId) || 0) + 1);
    scored.forEach((s) => { if (s.p.authorId === next.p.authorId) s.score -= 0.3; });
  }
  return out;
}

// Retourne { ranked: [{p, reason}], cursor, fromCache, personalised }
export async function buildForYou({ me = null } = {}) {
  const prof = getProfile();
  let following = new Set();
  if (me) { try { following = new Set(await listFollowing(me.uid)); } catch (e) { /* sans abonnements */ } }
  const tokens = topTokens(prof, 8);
  const authors = [...new Set([...topAuthors(prof, 5), ...following])].slice(0, 8);
  const [recent, byTokens, byAuthors] = await Promise.all([
    fetchProperties({ size: POOL_RECENT }),
    tokens.length ? fetchByTokens(tokens, POOL_TOKENS).catch(() => []) : [],
    authors.length ? fetchFromAuthors(authors, POOL_AUTHORS).catch(() => []) : []
  ]);
  const map = new Map();
  [...recent.items, ...byTokens, ...byAuthors].forEach((p) => { if (!map.has(p.id)) map.set(p.id, p); });
  const ranked = rank([...map.values()], prof, { following });
  return { ranked, recentCursor: recent.cursor, recentDone: recent.done, fromCache: recent.fromCache, personalised: hasSignals(prof) || following.size > 0, ids: new Set(map.keys()) };
}

// Profils à suivre : annonceurs proches de vos intérêts, bien notés, nombreux abonnés — sans ceux déjà suivis
export async function suggestProfiles({ me = null, limit = 8 } = {}) {
  const fs = await firestore();
  if (!fs) return [];
  const { m, db } = fs;
  const prof = getProfile();
  // résultat gardé 5 minutes pour économiser des lectures
  try {
    const c = JSON.parse(sessionStorage.getItem('imova-suggest') || 'null');
    if (c && c.me === (me && me.uid) && Date.now() - c.t < 5 * 60 * 1000) return c.list;
  } catch (e) { /* ignoré */ }
  let following = new Set();
  if (me) { try { following = new Set(await listFollowing(me.uid)); } catch (e) { /* ignoré */ } }
  const snap = await m.getDocs(m.query(m.collection(db, 'users'), m.orderBy('followersCount', 'desc'), m.limit(SUGGEST_SCAN)));
  const byId = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  // annonceurs qui vous intéressent mais qui ne sont pas parmi les plus suivis
  await Promise.all(topAuthors(prof, 6).filter((id) => !byId.has(id)).map(async (id) => {
    try { const s = await m.getDoc(m.doc(db, 'users', id)); if (s.exists()) byId.set(id, { id, ...s.data() }); } catch (e) { /* ignoré */ }
  }));
  const list = [...byId.values()]
    .filter((u) => u.id !== (me && me.uid) && !following.has(u.id) && u.name)
    .map((u) => {
      const aff = prof.authors[u.id] || 0;
      const avg = u.ratingCount ? u.ratingSum / u.ratingCount : 0;
      const score = 2 * tanh(aff / 4) + Math.log1p(u.followersCount || 0) / 3 + avg / 5 + (u.verified ? 0.5 : 0) + (u.type === 'agence' ? 0.2 : 0) + Math.random() * 0.05;
      return { u, score, reason: aff > 0.5 ? 'Proche de vos centres d\'intérêt' : (u.verified ? 'Profil vérifié' : 'Populaire sur Imova') };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  try { sessionStorage.setItem('imova-suggest', JSON.stringify({ t: Date.now(), me: me && me.uid, list })); } catch (e) { /* ignoré */ }
  return list;
}

// Annonces proches de celle qu'on regarde (mêmes mots-clés), pour « Annonces similaires »
export async function similarTo(property, size = 6) {
  const tokens = (property.tokens || []).slice(0, 10);
  const found = tokens.length ? await fetchByTokens(tokens, 25) : [];
  const mine = new Set(tokens);
  return found
    .filter((p) => p.id !== property.id)
    .map((p) => ({ p, s: (p.tokens || []).filter((t) => mine.has(t)).length + (p.authorId === property.authorId ? 1 : 0) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, size)
    .map((r) => r.p);
}
