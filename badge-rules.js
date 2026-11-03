// Imova — badge-rules.js : le badge de vérification a une DURÉE (1 mois, 3 mois, 1 an).
// Un badge n'est actif que s'il est accordé (verified) ET que sa date de fin (verifiedUntil) n'est pas dépassée.
// Cette règle est appliquée partout à l'affichage : le badge disparaît donc au moment exact de la fin, sans attendre un traitement.
// (La base est aussi mise à jour : voir badge-expiry.js.) Fichier sans dépendance.
export const untilMs = (u) => {
  const t = u && u.verifiedUntil;
  if (!t) return 0;
  const ms = t.toDate ? t.toDate().getTime() : new Date(t).getTime();
  return isNaN(ms) ? 0 : ms;
};
export const isBadgeActive = (u, now = Date.now()) => !!(u && u.verified === true && (!u.verifiedUntil || untilMs(u) > now));
// Expiré : une date de fin existe et elle est passée (le drapeau « verified » peut déjà avoir été remis à faux dans la base)
export const isBadgeExpired = (u, now = Date.now()) => !!(u && u.verifiedUntil && untilMs(u) <= now);
export const daysLeft = (u, now = Date.now()) => (untilMs(u) ? Math.ceil((untilMs(u) - now) / 86400000) : null);
// Copie du profil avec « verified » = badge réellement actif
export const withBadge = (u, now = Date.now()) => (u ? { ...u, verified: isBadgeActive(u, now), badgeExpired: isBadgeExpired(u, now) } : u);
