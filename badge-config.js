// Imova — badge-config.js : offres du badge de vérification (durées, prix), types de pièces et avantages.
export const DEFAULT_PRICES = { m1: 4, m3: 12, y1: 45 }; // en dollars US ; modifiables par le propriétaire (Administration → Paramètres)
// Un mois = 30 jours, trois mois = 90 jours, un an = 365 jours
export const PLANS = [
  { id: 'm1', label: '1 mois', months: 1, days: 30 },
  { id: 'm3', label: '3 mois', months: 3, days: 90 },
  { id: 'y1', label: '1 an', months: 12, days: 365 }
];
export const planOf = (id) => PLANS.find((p) => p.id === id) || null;
export const planDays = (id) => (planOf(id) || { days: 30 }).days;

// Offres avec prix par mois et économie par rapport au tarif mensuel
export function pricedPlans(prices = {}) {
  const p = { ...DEFAULT_PRICES, ...(prices || {}) };
  const monthly = Number(p.m1) || DEFAULT_PRICES.m1;
  return PLANS.map((pl) => {
    const price = Number(p[pl.id]) || DEFAULT_PRICES[pl.id];
    const full = monthly * pl.months;
    const saving = Math.max(0, Math.round((full - price) * 100) / 100);
    return { ...pl, price, perMonth: Math.round((price / pl.months) * 100) / 100, full, saving, savingPct: full > 0 ? Math.round((saving / full) * 100) : 0 };
  });
}
export const fmtMoney = (n) => `${Number.isInteger(n) ? n : Number(n).toFixed(2).replace('.', ',')} $`;

export const ID_TYPES = [['carte_electeur', "Carte d'électeur"], ['carte_identite', "Carte d'identité"], ['passeport', 'Passeport'], ['permis', 'Permis de conduire'], ['autre', 'Autre document personnel']];
export const idTypeLabel = (k) => (ID_TYPES.find(([v]) => v === k) || [k, k || '—'])[1];

// [icône, titre, texte]
export const BENEFITS = [
  ['badge', 'Un badge bleu à côté de votre nom', 'Visible partout : annonces, recherche, messages, profil et avis.'],
  ['shield', 'Confiance immédiate', "Les acheteurs et locataires savent que l'identité du titulaire (ou l'existence de l'agence) a été vérifiée par l'équipe Imova."],
  ['trending', 'Plus de visibilité', "Les profils vérifiés passent en premier dans l'annuaire des agences et sont mieux placés dans les profils recommandés."],
  ['message', 'Un suivi direct', 'Votre demande est traitée avec le support Imova dans la messagerie : questions, justificatifs, modalités de paiement.'],
  ['star', 'Moins de méfiance', "Un profil vérifié est plus facilement contacté : le badge réduit les doutes face aux annonces frauduleuses."]
];
