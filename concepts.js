// Imova — concepts.js : « concepts » immobiliers et choix de préférences.
// Un concept regroupe des mots qui veulent dire la même chose pour un acheteur ou un locataire : « villa » et « maison » donnent
// le concept « type:maison ». Les recommandations s'appuient dessus : l'intérêt pour « villa » aide à trouver aussi les « maisons ».
import { normalizeText } from './search.js';

export const CONCEPTS = {
  'type:maison': ['maison', 'villa', 'residence', 'duplex', 'pavillon', 'bungalow', 'etage', 'immeuble'],
  'type:appartement': ['appartement', 'appart', 'studio', 'flat', 'logement', 'chambre', 'colocation'],
  'type:terrain': ['terrain', 'parcelle', 'lot', 'concession', 'hectare', 'hectares'],
  'type:bureau': ['bureau', 'bureaux', 'commerce', 'boutique', 'magasin', 'local', 'entrepot', 'hangar'],
  'op:location': ['location', 'louer', 'loue', 'louez', 'bail', 'locatif', 'loyer'],
  'op:vente': ['vente', 'vendre', 'vend', 'achat', 'acheter', 'acquerir', 'vendu'],
  'feat:titre': ['titre', 'foncier', 'certificat', 'enregistre', 'cadastre', 'papiers'],
  'feat:meuble': ['meuble', 'meublee', 'equipe', 'equipee', 'climatise', 'climatisee'],
  'feat:confort': ['piscine', 'jardin', 'garage', 'parking', 'cour', 'terrasse', 'balcon', 'ascenseur', 'generateur', 'forage'],
  'feat:securite': ['securise', 'securisee', 'gardien', 'cloture', 'portail', 'barriere', 'camera']
};
const WORD_TO_CONCEPT = {};
Object.entries(CONCEPTS).forEach(([c, words]) => words.forEach((w) => { WORD_TO_CONCEPT[w] = c; }));

export const conceptOf = (word) => WORD_TO_CONCEPT[normalizeText(word)] || '';
export function conceptsOf(tokens) {
  const out = new Set();
  (tokens || []).forEach((t) => { const c = WORD_TO_CONCEPT[t]; if (c) out.add(c); });
  return [...out];
}
export const wordsOfConcept = (c) => CONCEPTS[c] || [];
export const CONCEPT_LABEL = {
  'type:maison': 'Maisons et villas', 'type:appartement': 'Appartements et studios', 'type:terrain': 'Terrains et parcelles', 'type:bureau': 'Bureaux et commerces',
  'op:location': 'Location', 'op:vente': 'Vente', 'feat:titre': 'Titre foncier', 'feat:meuble': 'Meublé / équipé', 'feat:confort': 'Piscine, jardin, parking', 'feat:securite': 'Sécurité'
};

// Choix proposés dans « Mes préférences » et à l'inscription
export const PREF_GROUPS = [
  { key: 'types', label: 'Type de bien', items: [['type:maison', 'Maison / villa'], ['type:appartement', 'Appartement / studio'], ['type:terrain', 'Terrain / parcelle'], ['type:bureau', 'Bureau / commerce']] },
  { key: 'goals', label: 'Je cherche à', items: [['op:vente', 'Acheter'], ['op:location', 'Louer'], ['feat:titre', 'Titre foncier exigé'], ['feat:meuble', 'Meublé / équipé']] },
  { key: 'places', label: 'Où ?', items: ['Gombe', 'Limete', 'Ngaliema', 'Kintambo', 'Lemba', 'Bandalungwa', 'Kasa-Vubu', 'Masina', "N'Djili", 'Kimbanseke', 'Mont-Ngafula', 'Binza', 'Lingwala', 'Barumbu', 'Kalamu', 'Matete', 'Kisenso', 'Selembao', 'Bumbu', 'Makala', 'Nsele', 'Maluku', 'Lubumbashi', 'Goma', 'Kolwezi', 'Matadi'].map((p) => [normalizeText(p).replace(/[^a-z0-9]+/g, ''), p]) }
];
export const emptyPrefs = () => ({ types: [], goals: [], places: [], keywords: [] });
