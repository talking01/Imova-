// Imova — search.js : mots-clés d'une annonce + recherche d'annonces et de profils.
// Firestore n'a pas de recherche plein texte : à la publication on enregistre les mots importants de l'annonce
// (sans accents ni majuscules), et la recherche les compare, avec synonymes et singulier/pluriel, puis classe les résultats.
import { fetchByTokens } from './properties.js';
import { firestore } from './firebase.js';

const STOP = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'en', 'au', 'aux', 'a', 'à', 'pour', 'avec', 'sur', 'dans', 'par', 'ou', 'qui', 'que', 'est', 'sont', 'ce', 'cet', 'cette', 'ces', 'son', 'sa', 'ses', 'il', 'elle', 'nous', 'vous', 'the', 'and', 'for']);

// Mots qui veulent dire à peu près la même chose pour un acheteur ou un locataire
const SYNONYMS = [
  ['maison', 'villa', 'residence', 'duplex', 'pavillon', 'bungalow'],
  ['appartement', 'appart', 'studio', 'flat', 'logement'],
  ['terrain', 'parcelle', 'lot', 'concession'],
  ['location', 'louer', 'loue', 'louez', 'bail', 'locatif'],
  ['vente', 'vendre', 'vend', 'achat', 'acheter', 'acquerir'],
  ['bureau', 'commerce', 'boutique', 'magasin', 'local'],
  ['meuble', 'meublee', 'equipe', 'equipee']
];

export function normalizeText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const wordsOf = (s) => normalizeText(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));

// Mots enregistrés avec l'annonce : au plus 40, distincts (chiffres compris : prix, nombre de pièces...)
export function buildTokens(title, description, max = 40) {
  return [...new Set(wordsOf(`${title} ${title} ${description}`))].slice(0, max);
}

const stem = (w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);

// Pour un mot : lui-même, son singulier/pluriel et ses synonymes
function variantsOf(word) {
  const base = new Set([word, stem(word), stem(word) + 's']);
  SYNONYMS.forEach((group) => {
    if (group.some((g) => base.has(g) || base.has(stem(g)))) group.forEach((g) => { base.add(g); base.add(g + 's'); });
  });
  return base;
}

export function parseQuery(q) {
  const words = [...new Set(wordsOf(q))].slice(0, 6);
  return { words, variants: words.map((w) => variantsOf(w)) };
}

const millis = (t) => (t && t.toDate ? t.toDate().getTime() : new Date(t || 0).getTime());

// Annonces correspondant à la recherche, classées : le plus de mots trouvés d'abord, puis les plus récentes
export async function searchProperties(q) {
  const { words, variants } = parseQuery(q);
  if (!words.length) return { items: [], words };
  // on interroge d'abord avec les mots exacts, puis on complète avec les variantes (10 valeurs maximum)
  const query = [...new Set([...words, ...variants.flatMap((v) => [...v])])].slice(0, 10);
  const found = await fetchByTokens(query, 40);
  const now = Date.now();
  const scored = found.map((p) => {
    const have = new Set([...(p.tokens || []), ...wordsOf(p.title)]);
    const titleWords = new Set(wordsOf(p.title));
    let score = 0;
    let matched = 0;
    words.forEach((w, i) => {
      // formes du même mot (singulier/pluriel) : correspondance « exacte » ; synonymes : correspondance plus faible
      const same = [w, stem(w), stem(w) + 's'];
      const hit = same.find((f) => have.has(f));
      if (hit) { score += 2; matched++; if (same.some((f) => titleWords.has(f))) score += 1; }
      else if ([...variants[i]].some((v) => have.has(v))) { score += 1; matched++; }
    });
    score += 1.5 * Math.exp(-(now - millis(p.createdAt)) / (30 * 24 * 3600 * 1000));
    return { p, score, matched };
  }).filter((r) => r.matched > 0);
  scored.sort((a, b) => b.score - a.score);
  return { items: scored.map((r) => r.p), words };
}

// Profils dont le nom commence par ce qu'on tape
export async function searchProfiles(q) {
  const text = String(q || '').trim().toLowerCase();
  if (text.length < 2) return [];
  const fs = await firestore();
  if (!fs) return [];
  const { m, db } = fs;
  const snap = await m.getDocs(m.query(
    m.collection(db, 'users'), m.where('nameLower', '>=', text), m.where('nameLower', '<=', text + '\uf8ff'), m.limit(20)
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Recherches récentes (sur cet appareil)
const RECENT_KEY = 'imova-recent-searches';
export function recentSearches() {
  try { const l = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
export function rememberSearch(q) {
  const t = String(q || '').trim();
  if (t.length < 2) return;
  const list = [t, ...recentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* ignoré */ }
}
export function forgetSearch(q) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentSearches().filter((x) => x !== q))); } catch (e) { /* ignoré */ }
}
