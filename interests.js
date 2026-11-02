// Imova — interests.js : ce qui intéresse l'utilisateur, appris de ses actions et de ses préférences.
// Chaque action ajoute du « poids » aux mots, aux concepts (« maisons et villas », « location »...) et à l'annonceur concernés ;
// le poids diminue de moitié en 14 jours. Le profil est gardé sur l'appareil ET enregistré dans la base (userInterests/UID),
// donc retrouvé sur tout appareil. « Pas intéressé » ajoute des poids négatifs. L'utilisateur peut tout désactiver ou effacer.
import { activeSlot } from './firebase.js';
import { buildTokens } from './search.js';
import { conceptsOf, emptyPrefs } from './concepts.js';
import { loadInterests, saveInterests, deleteRecoData } from './reco-store.js';

const WEIGHTS = { view: 1, open: 2, like: 3, fav: 4, share: 2, discuss: 3, search: 1.5, follow: 4, profile: 1, review: 2 };
const HALF_LIFE = 14 * 24 * 3600 * 1000;
const CAP = { tokens: 250, concepts: 40, authors: 100, negTokens: 100, negAuthors: 100, hidden: 300, searches: 30 };

const key = () => 'imova-interests-' + activeSlot();
const empty = () => ({ tokens: {}, concepts: {}, authors: {}, negTokens: {}, negAuthors: {}, hidden: [], searches: [], prefs: emptyPrefs(), seen: {}, clicked: {}, lastView: {}, signals: 0, dirty: false, lastSync: 0 });

export const personalizationOn = () => { try { return localStorage.getItem('imova-personalization') !== '0'; } catch (e) { return true; } };
export function setPersonalization(on) { try { localStorage.setItem('imova-personalization', on ? '1' : '0'); } catch (e) { /* ignoré */ } }

function load() {
  try { return { ...empty(), ...(JSON.parse(localStorage.getItem(key()) || 'null') || {}) }; } catch (e) { return empty(); }
}
function save(p) { try { localStorage.setItem(key(), JSON.stringify(p)); } catch (e) { /* stockage plein ou indisponible */ } }

const decayed = (entry, now) => (entry ? entry[0] * Math.pow(0.5, (now - entry[1]) / HALF_LIFE) : 0);
const bump = (map, name, amount, now) => { map[name] = [decayed(map[name], now) + amount, now]; };
function prune(map, max, now) {
  const names = Object.keys(map);
  if (names.length <= max) return;
  names.sort((a, b) => decayed(map[a], now) - decayed(map[b], now));
  names.slice(0, names.length - max).forEach((n) => delete map[n]);
}
const trimAll = (p, now) => {
  ['tokens', 'concepts', 'authors', 'negTokens', 'negAuthors'].forEach((k) => prune(p[k], CAP[k], now));
  p.hidden = p.hidden.slice(-CAP.hidden);
  p.searches = p.searches.slice(0, CAP.searches);
  const ids = Object.keys(p.lastView);
  if (ids.length > 200) ids.sort((a, b) => p.lastView[a] - p.lastView[b]).slice(0, ids.length - 200).forEach((i) => delete p.lastView[i]);
  const cl = Object.keys(p.clicked);
  if (cl.length > 300) cl.sort((a, b) => p.clicked[a] - p.clicked[b]).slice(0, cl.length - 300).forEach((i) => delete p.clicked[i]);
};

// type : view | open | like | fav | share | discuss | follow | profile | search | review
// target : une annonce ({ id, authorId, tokens, title, description }) ou { authorId } ou { tokens: [...] }
export function track(type, target = {}) {
  const w = WEIGHTS[type];
  if (!w || !personalizationOn()) return;
  const now = Date.now();
  const p = load();
  if (type === 'view' && target.id) {
    if (p.lastView[target.id] && now - p.lastView[target.id] < 10 * 60 * 1000) return;
    p.lastView[target.id] = now;
  }
  const tokens = target.tokens && target.tokens.length ? target.tokens : (target.title ? buildTokens(target.title, target.description || '') : []);
  const share = tokens.length ? w / Math.sqrt(tokens.length) : 0;
  tokens.forEach((t) => bump(p.tokens, t, share, now));
  conceptsOf(tokens).forEach((c) => bump(p.concepts, c, w * 0.8, now));
  if (target.authorId) bump(p.authors, target.authorId, w, now);
  if (target.id && type !== 'search') p.clicked[target.id] = now;
  p.signals++;
  p.dirty = true;
  trimAll(p, now);
  save(p);
  scheduleSync();
}

// Mémorise une recherche (texte) et ses mots
export function trackSearch(q, words = []) {
  if (!personalizationOn()) return;
  const text = String(q || '').trim().slice(0, 80);
  if (text.length < 2) return;
  const p = load();
  p.searches = [{ q: text, ts: Date.now() }, ...p.searches.filter((s) => s.q.toLowerCase() !== text.toLowerCase())].slice(0, CAP.searches);
  save(p);
  track('search', { tokens: words });
}

// « Pas intéressé » : l'annonce disparaît, et les mots / l'annonceur concernés comptent en négatif
export function dislike(property) {
  if (!personalizationOn()) { const p = load(); p.hidden.push(property.id); save(p); return; }
  const now = Date.now();
  const p = load();
  const tokens = property.tokens && property.tokens.length ? property.tokens : buildTokens(property.title || '', property.description || '');
  tokens.forEach((t) => bump(p.negTokens, t, 2 / Math.sqrt(tokens.length || 1), now));
  if (property.authorId) bump(p.negAuthors, property.authorId, 3, now);
  if (!p.hidden.includes(property.id)) p.hidden.push(property.id);
  p.signals++;
  p.dirty = true;
  trimAll(p, now);
  save(p);
  scheduleSync();
}

export function setPreferences(prefs) {
  const p = load();
  p.prefs = { ...emptyPrefs(), ...prefs };
  p.signals++;
  p.dirty = true;
  save(p);
  scheduleSync();
}

export function markSeen(ids) {
  const p = load();
  ids.forEach((id) => { p.seen[id] = (p.seen[id] || 0) + 1; });
  const keys = Object.keys(p.seen);
  if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((k) => delete p.seen[k]);
  save(p);
}

// Vue « figée » pour le calcul
export function getProfile() {
  const now = Date.now();
  const p = load();
  const out = { tokens: {}, concepts: {}, authors: {}, negTokens: {}, negAuthors: {}, seen: p.seen, clicked: p.clicked, hidden: new Set(p.hidden), searches: p.searches, prefs: { ...emptyPrefs(), ...p.prefs }, signals: p.signals };
  ['tokens', 'concepts', 'authors', 'negTokens', 'negAuthors'].forEach((k) => Object.keys(p[k]).forEach((n) => { const v = decayed(p[k][n], now); if (v > 0.05) out[k][n] = v; }));
  return out;
}

const topOf = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
export const topTokens = (prof, n = 10) => topOf(prof.tokens, n);
export const topConcepts = (prof, n = 5) => topOf(prof.concepts, n);
export const topAuthors = (prof, n = 10) => topOf(prof.authors, n);
export const hasPrefs = (prof) => Object.values(prof.prefs).some((a) => a && a.length);
export const hasSignals = (prof) => Object.keys(prof.tokens).length > 0 || Object.keys(prof.authors).length > 0 || hasPrefs(prof);

// ───────── Synchronisation avec la base (userInterests/UID)
let uidSynced = null;
let timer = null;

function mergeMap(local, remote, now) {
  Object.keys(remote || {}).forEach((k) => { if (!local[k] || decayed(remote[k], now) > decayed(local[k], now)) local[k] = remote[k]; });
}

// Au démarrage de la session : on récupère le profil enregistré (autre appareil) et on le fusionne avec celui de cet appareil
export async function startSync(uid) {
  if (!uid || uidSynced === uid || !personalizationOn()) return;
  uidSynced = uid;
  try {
    const now = Date.now();
    const remote = await loadInterests(uid);
    const p = load();
    if (remote) {
      ['tokens', 'concepts', 'authors', 'negTokens', 'negAuthors'].forEach((k) => mergeMap(p[k], remote[k], now));
      p.hidden = [...new Set([...(remote.hidden || []), ...p.hidden])].slice(-CAP.hidden);
      const seenQ = new Set();
      p.searches = [...p.searches, ...(remote.searches || [])].filter((s) => { const k = String(s.q).toLowerCase(); if (seenQ.has(k)) return false; seenQ.add(k); return true; }).sort((a, b) => b.ts - a.ts).slice(0, CAP.searches);
      const rp = remote.preferences || {};
      Object.keys(emptyPrefs()).forEach((g) => { p.prefs[g] = [...new Set([...(p.prefs[g] || []), ...(rp[g] || [])])]; });
      p.signals = Math.max(p.signals, remote.signals || 0);
    }
    // préférences choisies à l'inscription (avant la première connexion)
    try {
      const pend = JSON.parse(localStorage.getItem('imova-pending-prefs') || 'null');
      if (pend) { Object.keys(emptyPrefs()).forEach((g) => { p.prefs[g] = [...new Set([...(p.prefs[g] || []), ...(pend[g] || [])])]; }); localStorage.removeItem('imova-pending-prefs'); p.dirty = true; p.signals++; }
    } catch (e) { /* ignoré */ }
    trimAll(p, now);
    save(p);
    if (p.dirty || !remote) await pushRemote(uid);
  } catch (e) { uidSynced = null; }
  window.addEventListener('pagehide', () => { pushRemote(uid).catch(() => {}); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushRemote(uid).catch(() => {}); });
}

export async function pushRemote(uid) {
  if (!uid || !personalizationOn()) return;
  const p = load();
  if (!p.dirty) return;
  const doc = {
    tokens: p.tokens, concepts: p.concepts, authors: p.authors, negTokens: p.negTokens, negAuthors: p.negAuthors,
    hidden: p.hidden, searches: p.searches, preferences: p.prefs, signals: p.signals
  };
  await saveInterests(uid, doc);
  const q = load(); q.dirty = false; q.lastSync = Date.now(); save(q);
}

let booting = false;
// Enregistre le profil dans la base 25 secondes après la dernière action. Sur une page qui n'a pas encore démarré la synchronisation
// (page sans barre de navigation), on démarre d'abord la session de synchronisation du compte connecté.
function scheduleSync() {
  if (!uidSynced) {
    if (booting) return;
    booting = true;
    import('./auth.js').then((a) => a.whenReady()).then((u) => (u ? startSync(u.uid) : null)).then(() => { booting = false; if (uidSynced) scheduleSync(); }).catch(() => { booting = false; });
    return;
  }
  if (timer) return;
  timer = setTimeout(() => { timer = null; pushRemote(uidSynced).catch(() => {}); }, 25000);
}

export const currentSignals = () => load().signals;

// Efface tout : appareil et base de données
export async function resetInterests(uid = uidSynced) {
  try { localStorage.removeItem(key()); } catch (e) { /* ignoré */ }
  if (uid) { try { await deleteRecoData(uid); } catch (e) { /* ignoré */ } }
}
