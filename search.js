// Imova — search.js : mots-clés de recherche d'une annonce (la page de recherche arrive à l'étape 5).
// À la publication, on enregistre dans l'annonce les mots importants, sans accents ni majuscules.
const STOP = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'en', 'au', 'aux', 'a', 'à', 'pour', 'avec', 'sur', 'dans', 'par', 'ou', 'qui', 'que', 'est', 'sont', 'ce', 'cet', 'cette', 'ces', 'son', 'sa', 'ses', 'il', 'elle', 'nous', 'vous', 'the', 'and', 'for']);

export function normalizeText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Renvoie au plus 40 mots distincts (chiffres compris : prix, nombre de pièces...)
export function buildTokens(title, description, max = 40) {
  const words = normalizeText(`${title} ${title} ${description}`).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, max);
}
