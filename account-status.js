// Imova — account-status.js : état d'un compte (actif, restreint, suspendu, supprimé) et messages clairs. Fichier sans dépendance.
//   restreint  : temporaire ; la personne se connecte et peut répondre à un message, mais ne peut ni publier, ni noter, ni aimer, ni suivre,
//                ni ouvrir de nouvelle discussion, ni demander le badge, ni modifier ses informations.
//   suspendu   : la personne n'accède plus qu'à la page d'examen.
//   supprimé   : compte retiré de la plateforme (invisible partout sauf dans l'administration et, sous le nom « Utilisateur », dans la messagerie).
const ms = (t) => (t && t.toDate ? t.toDate().getTime() : t ? new Date(t).getTime() : 0);

export function statusOf(u, now = Date.now()) {
  if (!u) return { state: 'active' };
  const base = { reason: u.statusReason || u.suspendedReason || '', at: ms(u.statusAt) };
  if (u.status === 'deleted') return { state: 'deleted', ...base };
  if (u.status === 'suspended' || u.suspended === true) return { state: 'suspended', ...base };
  if (u.status === 'restricted' && ms(u.restrictedUntil) > now) return { state: 'restricted', until: ms(u.restrictedUntil), ...base };
  return { state: 'active' };
}
export const isHiddenAccount = (u) => { const s = statusOf(u).state; return s === 'suspended' || s === 'deleted'; };

// Durées de restriction proposées (heures)
export const RESTRICTION_PRESETS = [['12 heures', 12], ['24 heures', 24], ['48 heures', 48], ['72 heures', 72], ['1 semaine', 168], ['2 semaines', 336], ['3 semaines', 504]];

export const fmtWhen = (t) => new Date(ms(t) || t).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDay = (t) => new Date(ms(t) || t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

let current = { state: 'active' };
export function setCurrent(s) { current = s || { state: 'active' }; try { window.__imovaStatus = current; } catch (e) { /* ignoré */ } }
export const currentStatus = () => current;

// Phrase claire quand une action est refusée à cause de l'état du compte ('' si le compte est actif)
export function blockedMessage(action = 'effectuer cette action') {
  const s = (typeof window !== 'undefined' && window.__imovaStatus) || current;
  if (s.state === 'suspended') return `Votre compte est suspendu : vous ne pouvez pas ${action}.`;
  if (s.state === 'deleted') return `Votre compte a été supprimé : vous ne pouvez pas ${action}.`;
  if (s.state === 'restricted') return `Votre compte est temporairement restreint jusqu'au ${fmtWhen(s.until)} : vous ne pouvez pas ${action} pendant la vérification de vos informations.`;
  return '';
}
