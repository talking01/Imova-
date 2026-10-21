// Imova — verification.js : demande de badge de vérification.
// Une demande par compte (verificationRequests/UID). Elle est enregistrée « en attente » (liste d'attente de l'administration)
// ET envoyée au Support dans la messagerie, avec tous les détails. Le badge n'est accordé que par un administrateur.
import { firestore } from './firebase.js';
import { sendMessage } from './messaging.js';
import { SUPPORT_UID } from './app-config.js';

async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

export async function getMyRequest(uid) {
  const { m, db } = await need();
  const s = await m.getDoc(m.doc(db, 'verificationRequests', uid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

// Réglages publics de la plateforme (annonce, publication ouverte, vérifications ouvertes)
export async function getSettings() {
  try {
    const raw = sessionStorage.getItem('imova-settings');
    if (raw) { const c = JSON.parse(raw); if (Date.now() - c.t < 5 * 60 * 1000) return c.v; }
  } catch (e) { /* ignoré */ }
  let v = {};
  try {
    const { m, db } = await need();
    const s = await m.getDoc(m.doc(db, 'platformSettings', 'main'));
    if (s.exists()) v = s.data();
  } catch (e) { /* paramètres par défaut */ }
  try { sessionStorage.setItem('imova-settings', JSON.stringify({ t: Date.now(), v })); } catch (e) { /* ignoré */ }
  return v;
}

const LABELS = {
  legalName: 'Nom légal', registrationNumber: "N° d'enregistrement (RCCM / ID.NAT / NIF)", idType: 'Pièce d\'identité (type déclaré)',
  address: 'Adresse', phone: 'Téléphone', website: 'Site web / réseaux', activity: 'Activité', notes: 'Remarques'
};

export function formatRequestMessage({ accountType, name, uid, data }) {
  const lines = ['DEMANDE DE BADGE DE VÉRIFICATION', `Compte : ${accountType === 'agence' ? 'Agence' : 'Particulier'} — ${name}`];
  Object.keys(LABELS).forEach((k) => { if (data[k]) lines.push(`${LABELS[k]} : ${data[k]}`); });
  lines.push(`Profil : ${new URL('profile.html?id=' + encodeURIComponent(uid), document.baseURI).href}`);
  lines.push('Statut : en attente (liste d\'attente)');
  return lines.join('\n').slice(0, 2000);
}

// Crée (ou relance après un refus) la demande, puis écrit au Support.
// Retourne { messageSent } : la demande est enregistrée même si le message n'a pas pu partir.
export async function submitRequest({ me, accountType, name, data, previous }) {
  const { m, db } = await need();
  const ref = m.doc(db, 'verificationRequests', me);
  if (previous) {
    await m.updateDoc(ref, {
      data, status: 'pending', updatedAt: m.serverTimestamp(),
      reviewNote: m.deleteField(), reviewedBy: m.deleteField(), reviewedAt: m.deleteField()
    });
  } else {
    await m.setDoc(ref, { userId: me, accountType, data, status: 'pending', createdAt: m.serverTimestamp(), updatedAt: m.serverTimestamp() });
  }
  let messageSent = false;
  try {
    await sendMessage({ me, other: SUPPORT_UID, type: 'text', text: formatRequestMessage({ accountType, name, uid: me, data }) });
    messageSent = true;
  } catch (e) { console.error('Message au support non envoyé', e); }
  return { messageSent };
}

export async function cancelRequest(me) {
  const { m, db } = await need();
  await m.deleteDoc(m.doc(db, 'verificationRequests', me));
}
