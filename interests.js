// Imova — interests.js : ce qui intéresse l'utilisateur (centres d'intérêt), appris de ses actions.
// Tout reste sur CET appareil (localStorage, séparé par compte) : rien n'est envoyé à un serveur.
// Chaque action ajoute du « poids » aux mots de l'annonce et à son auteur ; le poids diminue avec le temps.
import { activeSlot } from './firebase.js';
import { buildTokens } from './search.js';

const WEIGHTS = { view: 1, open: 2, like: 3, fav: 4, share: 2, discuss: 3, search: 1.5, follow: 4, profile: 1 };
const HALF_LIFE = 14 * 24 * 3600 * 1000; // l'intérêt perd la moitié de sa force en 14 jours
const MAX_TOKENS = 250;

const key = () => 'imova-interests-' + activeSlot();
const empty = () => ({ tokens: {}, authors: {}, seen: {}, clicked: {}, lastView: {} });

function load() {
  try { return { ...empty(), ...(JSON.parse(localStorage.getItem(key()) || 'null') || {}) }; } catch (e) { return empty(); }
}
function save(p) {
  try { localStorage.setItem(key(), JSON.stringify(p)); } catch (e) { /* stockage plein ou indisponible */ }
}

const decayed = (entry, now) => (entry ? entry[0] * Math.pow(0.5, (now - entry[1]) / HALF_LIFE) : 0);

function bump(map, name, amount, now) {
  map[name] = [decayed(map[name], now) + amount, now];
}

function prune(map, max, now) {
  const names = Object.keys(map);
  if (names.length <= max) return;
  names.sort((a, b) => decayed(map[a], now) - decayed(map[b], now));
  names.slice(0, names.length - max).forEach((n) => delete map[n]);
}

// type : view | open | like | fav | share | discuss | follow | profile | search
// target : une annonce ({ id, authorId, tokens, title, description }) ou { authorId } ou { tokens: [...] }
export function track(type, target = {}) {
  const w = WEIGHTS[type];
  if (!w) return;
  const now = Date.now();
  const p = load();
  if (type === 'view' && target.id) {
    if (p.lastView[target.id] && now - p.lastView[target.id] < 10 * 60 * 1000) return; // pas deux fois en 10 minutes
    p.lastView[target.id] = now;
  }
  const tokens = target.tokens && target.tokens.length ? target.tokens : (target.title ? buildTokens(target.title, target.description || '') : []);
  const share = tokens.length ? w / Math.sqrt(tokens.length) : 0; // une longue annonce ne domine pas
  tokens.forEach((t) => bump(p.tokens, t, share, now));
  if (target.authorId) bump(p.authors, target.authorId, w, now);
  if (target.id && type !== 'search') p.clicked[target.id] = now;
  prune(p.tokens, MAX_TOKENS, now);
  prune(p.authors, 100, now);
  const ids = Object.keys(p.lastView);
  if (ids.length > 200) ids.sort((a, b) => p.lastView[a] - p.lastView[b]).slice(0, ids.length - 200).forEach((i) => delete p.lastView[i]);
  const cl = Object.keys(p.clicked);
  if (cl.length > 300) cl.sort((a, b) => p.clicked[a] - p.clicked[b]).slice(0, cl.length - 300).forEach((i) => delete p.clicked[i]);
  save(p);
}

// Annonces affichées dans le fil : celles vues plusieurs fois sans clic sont peu à peu mises en retrait
export function markSeen(ids) {
  const p = load();
  ids.forEach((id) => { p.seen[id] = (p.seen[id] || 0) + 1; });
  const keys = Object.keys(p.seen);
  if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((k) => delete p.seen[k]);
  save(p);
}

// Vue « figée » pour le calcul : { tokens: {mot: force}, authors: {id: force}, seen, clicked }
export function getProfile() {
  const now = Date.now();
  const p = load();
  const out = { tokens: {}, authors: {}, seen: p.seen, clicked: p.clicked };
  Object.keys(p.tokens).forEach((t) => { const v = decayed(p.tokens[t], now); if (v > 0.05) out.tokens[t] = v; });
  Object.keys(p.authors).forEach((a) => { const v = decayed(p.authors[a], now); if (v > 0.05) out.authors[a] = v; });
  return out;
}

const topOf = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
export const topTokens = (prof, n = 10) => topOf(prof.tokens, n);
export const topAuthors = (prof, n = 10) => topOf(prof.authors, n);
export const hasSignals = (prof) => Object.keys(prof.tokens).length > 0 || Object.keys(prof.authors).length > 0;

export function resetInterests() {
  try { localStorage.removeItem(key()); } catch (e) { /* ignoré */ }
}
