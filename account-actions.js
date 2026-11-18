// Imova — account-actions.js : modération des comptes et des annonces (restriction, suspension, suppression, examen, masquage).
// Utilisé par l'administration ET par les boutons de modération des options d'un profil ou d'une annonce.
// Chaque action : met à jour le compte, écrit le dossier d'examen visible par la personne (moderation/UID), masque ou réaffiche ses annonces,
// PRÉVIENT la personne par une notification avec le motif, et est inscrite au journal d'activité.
import { firestore } from './firebase.js';
import { getUser } from './auth.js';
import { notify } from './notifs.js';
import { fmtWhen, fmtDay } from './account-status.js';

async function env() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  const me = getUser();
  if (!me) throw new Error('Non connecté');
  return { ...fs, me };
}
const clip = (s, n) => String(s || '').slice(0, n);

async function audit(e, action, targetType, targetId, details) {
  try {
    await e.m.setDoc(e.m.doc(e.m.collection(e.db, 'auditLog')), { actorId: e.me.uid, action, targetType, targetId: String(targetId), details: clip(details, 500), createdAt: e.m.serverTimestamp() });
  } catch (x) { console.error('Journal non écrit', x); }
}

export async function getModeration(uid) {
  const { m, db } = await env();
  const s = await m.getDoc(m.doc(db, 'moderation', uid));
  return s.exists() ? s.data() : null;
}

// Masque (ou réaffiche) toutes les annonces d'un compte. Les annonces masquées par la modération restent masquées à la restauration.
async function setAccountListings(e, uid, hide) {
  const { m, db } = e;
  const snap = await m.getDocs(m.query(m.collection(db, 'properties'), m.where('authorId', '==', uid), m.limit(400)));
  const todo = snap.docs.filter((d) => (hide ? d.data().status !== 'hidden' : d.data().hiddenBy === 'account'));
  for (let i = 0; i < todo.length; i += 400) {
    const batch = m.writeBatch(db);
    todo.slice(i, i + 400).forEach((d) => batch.update(m.doc(db, 'properties', d.id), hide ? { status: 'hidden', hiddenBy: 'account' } : { status: 'active', hiddenBy: m.deleteField() }));
    await batch.commit();
  }
  return todo.length;
}

const TITLES = {
  restricted: 'Votre compte est temporairement restreint', suspended: 'Votre compte est suspendu',
  deleted: 'Votre compte a été supprimé', restored: 'Votre compte a été restauré', continuing: "L'examen de votre compte se poursuit", lifted: 'La restriction de votre compte est levée'
};

// Cœur : applique un nouvel état, écrit le dossier d'examen et prévient la personne
async function apply({ uid, name = '', state, reason = '', message = '', hours = 0 }) {
  const e = await env();
  const { m, db } = e;
  const prev = await getModeration(uid).catch(() => null);
  const until = state === 'restricted' ? Date.now() + hours * 3600 * 1000 : 0;
  const examState = { restricted: 'in_progress', suspended: 'in_progress', continuing: 'continuing', restored: 'restored', lifted: 'restored', deleted: 'deleted' }[state];
  const accountState = { restricted: 'restricted', suspended: 'suspended', continuing: prev ? prev.status : 'suspended', restored: 'active', lifted: 'active', deleted: 'deleted' }[state];
  const entry = { at: Date.now(), state, reason: clip(reason, 400), message: clip(message, 400), until };
  const history = [...((prev && prev.history) || []), entry].slice(-40);
  const batch = m.writeBatch(db);
  const u = { status: accountState, statusAt: m.serverTimestamp(), statusBy: e.me.uid };
  if (accountState === 'restricted') Object.assign(u, { restrictedUntil: new Date(until), statusReason: clip(reason, 500), suspended: false });
  else if (accountState === 'suspended' || accountState === 'deleted') Object.assign(u, { suspended: true, suspendedReason: clip(reason, 300), statusReason: clip(reason, 500), restrictedUntil: m.deleteField() });
  else Object.assign(u, { suspended: false, suspendedReason: '', statusReason: m.deleteField(), restrictedUntil: m.deleteField() });
  if (state !== 'continuing') batch.update(m.doc(db, 'users', uid), u);
  batch.set(m.doc(db, 'moderation', uid), {
    status: accountState, kind: state === 'continuing' ? (prev ? prev.kind || accountState : accountState) : accountState === 'active' ? ((prev && prev.kind) || 'restricted') : accountState,
    reason: clip(reason || (prev && prev.reason) || '', 500), since: state === 'continuing' && prev ? prev.since : m.serverTimestamp(),
    ...(accountState === 'restricted' && until ? { until: new Date(until) } : state === 'continuing' && prev && prev.until ? { until: prev.until } : {}),
    examination: { state: examState, message: clip(message, 400) }, history, updatedAt: m.serverTimestamp(), updatedBy: e.me.uid
  });
  await batch.commit();
  let hidden = 0;
  if (accountState === 'suspended' || accountState === 'deleted') { if (state !== 'continuing') hidden = await setAccountListings(e, uid, true); }
  if (accountState === 'active') hidden = await setAccountListings(e, uid, false);
  const body = clip({
    restricted: `Jusqu'au ${fmtWhen(until)}. Motif : ${reason}`, suspended: `Motif : ${reason}. Examen en cours : consultez la page d'examen.`, deleted: `Motif : ${reason}`,
    restored: message || 'Votre compte fonctionne de nouveau normalement.', lifted: message || 'Vous pouvez de nouveau utiliser toutes les fonctions.', continuing: message || "L'examen se poursuit."
  }[state], 200);
  await notify(uid, { type: 'moderation', id: `account_${state}_${Date.now()}`, title: TITLES[state], body, link: 'examination.html' });
  await audit(e, `account_${state}`, 'user', uid, `${name}${reason ? ' — ' + reason : ''}${state === 'restricted' ? ` — jusqu'au ${fmtDay(until)}` : ''}`);
  return { hidden };
}

export const restrictAccount = (p) => apply({ ...p, state: 'restricted' });
export const suspendAccount = (p) => apply({ ...p, state: 'suspended' });
export const deleteAccountByStaff = (p) => apply({ ...p, state: 'deleted' });
export const restoreAccount = (p) => apply({ ...p, state: 'restored' });
export const liftRestriction = (p) => apply({ ...p, state: 'lifted' });
export const continueExamination = (p) => apply({ ...p, state: 'continuing' });

// Notes internes (invisibles pour la personne concernée)
export async function addNote(uid, text) {
  const e = await env();
  const { m, db } = e;
  const ref = m.doc(db, 'moderationNotes', uid);
  const s = await m.getDoc(ref);
  const notes = [...((s.exists() && s.data().notes) || []), { at: Date.now(), by: e.me.uid, byName: e.me.name || '', text: clip(text, 600) }].slice(-100);
  await m.setDoc(ref, { notes, updatedAt: m.serverTimestamp() });
  return notes;
}
export async function getNotes(uid) {
  const { m, db } = await env();
  const s = await m.getDoc(m.doc(db, 'moderationNotes', uid));
  return s.exists() ? s.data().notes || [] : [];
}

// ───────── Annonces
export async function hideListing({ id, title, authorId, reason }) {
  const e = await env();
  await e.m.updateDoc(e.m.doc(e.db, 'properties', id), { status: 'hidden', moderationNote: clip(reason, 300), hiddenBy: 'moderation' });
  await notify(authorId, { type: 'moderation', id: `moderation_${Date.now()}`, title: 'Votre annonce a été masquée', body: clip(`« ${title} » ne respecte pas nos politiques. Motif : ${reason}`, 200), link: 'profile.html' });
  await audit(e, 'property_hide', 'property', id, `${title} — ${reason}`);
}
export async function showListing({ id, title, authorId }) {
  const e = await env();
  await e.m.updateDoc(e.m.doc(e.db, 'properties', id), { status: 'active', moderationNote: '', hiddenBy: e.m.deleteField() });
  await notify(authorId, { type: 'moderation', id: `moderation_${Date.now()}`, title: 'Votre annonce est de nouveau visible', body: clip(`« ${title} »`, 200), link: 'profile.html' });
  await audit(e, 'property_show', 'property', id, title);
}
export async function deleteListing({ id, title, authorId, reason }) {
  const e = await env();
  await e.m.deleteDoc(e.m.doc(e.db, 'properties', id));
  await notify(authorId, { type: 'moderation', id: `moderation_${Date.now()}`, title: 'Votre annonce a été supprimée', body: clip(`« ${title} » ne respecte pas nos politiques. Motif : ${reason}`, 200), link: 'profile.html' });
  await audit(e, 'property_delete', 'property', id, `${title} — ${reason}`);
}

// Balayage : lève les restrictions dont la durée est terminée (le compte redevient actif, la personne est prévenue). Retourne le nombre de comptes.
export async function sweepRestrictions(ctx) {
  const { m, db } = ctx;
  const snap = await m.getDocs(m.query(m.collection(db, 'users'), m.where('restrictedUntil', '<', new Date()), m.limit(20)));
  const due = snap.docs.filter((d) => d.data().status === 'restricted');
  for (const d of due) await apply({ uid: d.id, name: d.data().name || '', state: 'lifted', message: 'La durée de la restriction est terminée.' });
  return due.length;
}
