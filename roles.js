// Imova — roles.js : rôles de l'équipe (lecture tolérante : majuscules, espaces, accents, synonymes)
export const RANK = { moderator: 1, admin: 2, owner: 3 };
export const ROLE_LABEL = { owner: 'Propriétaire', admin: 'Administrateur', moderator: 'Modérateur' };
const ALIASES = { owner: 'owner', proprietaire: 'owner', superadmin: 'owner', super_admin: 'owner', 'super admin': 'owner', admin: 'admin', administrateur: 'admin', administrator: 'admin', moderator: 'moderator', moderateur: 'moderator', mod: 'moderator' };
export function normalizeRole(raw) {
  const t = String(raw == null ? '' : raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/["'`]/g, '').trim();
  return ALIASES[t] || '';
}
export const rankOf = (raw) => RANK[normalizeRole(raw)] || 0;
