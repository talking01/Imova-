// Imova — moderation-menu.js : boutons de modération dans les options d'une annonce ou d'un profil (équipe d'administration seulement).
// Modérateur : masquer, réafficher, supprimer une annonce. Administrateur et propriétaire : en plus restreindre, suspendre ou supprimer un compte.
// Chaque action prévient automatiquement la personne concernée (notification avec le motif) et est inscrite au journal d'activité.
import { ready, staffRank } from './visibility.js';
import { hideListing, showListing, deleteListing, restrictAccount, suspendAccount, deleteAccountByStaff } from './account-actions.js';
import { openModal } from './modal.js';
import { RESTRICTION_PRESETS } from './account-status.js';
import { toast, esc, explainError } from './utils.js';

// Fenêtre « motif obligatoire » (+ durée pour une restriction). onConfirm({ reason, hours })
function ask({ title, text = '', confirmLabel, danger = false, withDuration = false, onConfirm }) {
  openModal({
    title,
    html: `${text ? `<p class="muted" style="margin-bottom:10px">${esc(text)}</p>` : ''}
      ${withDuration ? `<div class="field" style="margin-bottom:10px"><label for="mDur">Durée de la restriction</label><select class="select" id="mDur">${RESTRICTION_PRESETS.map(([l, h], i) => `<option value="${h}" ${i === 1 ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label for="mReason">Motif (envoyé à la personne) *</label><textarea class="input" id="mReason" rows="3" maxlength="300" style="padding:10px 14px" placeholder="Ex. : contenu non conforme à nos politiques"></textarea></div>
      <p class="error" id="mErr" hidden></p>`,
    actions: [{ label: 'Annuler' }, { label: confirmLabel, danger, primary: !danger, onClick: async (el) => {
      const reason = el.querySelector('#mReason').value.trim();
      const err = el.querySelector('#mErr');
      if (reason.length < 3) { err.textContent = 'Le motif est obligatoire (3 caractères minimum).'; err.hidden = false; return false; }
      try { await onConfirm({ reason, hours: withDuration ? Number(el.querySelector('#mDur').value) : 0 }); } catch (e) { console.error(e); err.textContent = explainError(e, 'effectuer cette action de modération'); err.hidden = false; return false; }
    } }]
  });
}

// Éléments à ajouter au menu d'une annonce : onChange() est appelé après l'action
export async function listingItems(property, { authorName = '', onChange = () => {} } = {}) {
  await ready();
  const rank = staffRank();
  if (!rank) return [];
  const items = [];
  const hidden = property.status === 'hidden';
  const base = { id: property.id, title: property.title, authorId: property.authorId };
  if (hidden) items.push({ icon: 'eyeOpen', label: "Modération : réafficher l'annonce", onClick: async () => { try { await showListing(base); toast('Annonce réaffichée, auteur prévenu'); onChange('show'); } catch (e) { toast(explainError(e, "réafficher cette annonce")); } } });
  else items.push({ icon: 'eyeOff', label: "Modération : masquer l'annonce", danger: true, onClick: () => ask({ title: "Masquer l'annonce ?", text: "Elle ne sera plus visible. L'auteur est prévenu avec le motif.", confirmLabel: 'Masquer', danger: true, onConfirm: async ({ reason }) => { await hideListing({ ...base, reason }); toast('Annonce masquée, auteur prévenu'); onChange('hide'); } }) });
  items.push({ icon: 'trash', label: "Modération : supprimer l'annonce", danger: true, onClick: () => ask({ title: "Supprimer l'annonce ?", text: 'Suppression définitive. L\'auteur est prévenu avec le motif.', confirmLabel: 'Supprimer', danger: true, onConfirm: async ({ reason }) => { await deleteListing({ ...base, reason }); toast('Annonce supprimée, auteur prévenu'); onChange('delete'); } }) });
  if (rank >= 2) items.push(...(await accountItems({ id: property.authorId, name: authorName }, { label: " l'auteur", onChange })));
  return items;
}

// Éléments à ajouter au menu d'un profil (administrateur et propriétaire)
export async function accountItems(user, { label = ' ce compte', onChange = () => {} } = {}) {
  await ready();
  if (staffRank() < 2) return [];
  const t = { uid: user.id, name: user.name || '' };
  return [
    { icon: 'clock', label: `Modération : restreindre${label}…`, danger: true, onClick: () => ask({ title: `Restreindre ${user.name || 'ce compte'} ?`, text: 'Elle peut se connecter et répondre aux messages, mais ne peut plus publier, noter, aimer, suivre, ouvrir une nouvelle discussion, demander le badge ni modifier ses informations pendant la durée choisie.', confirmLabel: 'Restreindre', danger: true, withDuration: true, onConfirm: async ({ reason, hours }) => { await restrictAccount({ ...t, reason, hours }); toast('Compte restreint, personne prévenue'); onChange('restrict'); } }) },
    { icon: 'ban', label: `Modération : suspendre${label}…`, danger: true, onClick: () => ask({ title: `Suspendre ${user.name || 'ce compte'} ?`, text: "Le compte n'accède plus qu'à la page d'examen ; son profil et ses annonces disparaissent de la plateforme pendant l'examen.", confirmLabel: 'Suspendre', danger: true, onConfirm: async ({ reason }) => { await suspendAccount({ ...t, reason }); toast('Compte suspendu, personne prévenue'); onChange('suspend'); } }) },
    { icon: 'trash', label: `Modération : supprimer${label}…`, danger: true, onClick: () => ask({ title: `Supprimer ${user.name || 'ce compte'} ?`, text: 'Le compte, son profil et ses annonces disparaissent de toute la plateforme (ils restent consultables par l\'équipe). La personne est informée sur la page d\'examen.', confirmLabel: 'Supprimer le compte', danger: true, onConfirm: async ({ reason }) => { await deleteAccountByStaff({ ...t, reason }); toast('Compte supprimé, personne prévenue'); onChange('delete-account'); } }) },
    { icon: 'shield', label: "Modération : ouvrir l'examen du compte", onClick: () => { location.href = `admin-examinations.html?uid=${encodeURIComponent(user.id)}`; } }
  ];
}
