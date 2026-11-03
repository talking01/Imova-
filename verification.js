// Imova — verification.js : demande de badge de vérification.
// Une demande par compte (verificationRequests/UID) : offre choisie (1 mois, 3 mois, 1 an), pièce d'identité, adresse, et pour une agence
// le document officiel. La demande est enregistrée « en attente » (liste d'attente de l'administration) ET envoyée au Support dans la
// messagerie avec les documents. Le badge n'est accordé, pour une durée, que par un administrateur. Le paiement se discute dans la conversation.
import { firestore } from './firebase.js';
import { sendMessage } from './messaging.js';
import { SUPPORT_UID } from './app-config.js';
import { idTypeLabel, planOf, fmtMoney } from './badge-config.js';

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

// Réglages publics de la plateforme (annonce, publication ouverte, vérifications ouvertes, prix du badge)
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function formatRequestMessage({ accountType, name, uid, data, plan, price, renewal = false }) {
  const pl = planOf(plan);
  const lines = [renewal ? 'DEMANDE DE RENOUVELLEMENT DU BADGE DE VÉRIFICATION' : 'DEMANDE DE BADGE DE VÉRIFICATION', `Compte : ${accountType === 'agence' ? 'Agence' : 'Particulier'} — ${name}`];
  lines.push(`Offre choisie : ${pl ? pl.label : plan} — ${fmtMoney(price)}`);
  lines.push('Paiement : à convenir ensemble dans cette conversation.');
  if (!renewal) {
    lines.push(`Pièce d'identité${accountType === 'agence' ? ' du responsable' : ''} : ${idTypeLabel(data.idType)} (document joint ci-dessous)`);
    if (accountType === 'agence') {
      lines.push(data.orgUrl ? "Document officiel de l'agence : joint ci-dessous" : `Pas encore de document officiel. Justification : ${data.orgJustification || '—'}`);
      if (data.extraDocs && data.extraDocs.length) lines.push(`Autres documents joints : ${data.extraDocs.length}`);
    }
    if (data.address) lines.push(`Adresse : ${data.address}`);
    if (data.website) lines.push(`Site web : ${data.website}`);
    if (data.notes) lines.push(`Remarques : ${data.notes}`);
  }
  lines.push(`Profil : ${new URL('profile.html?id=' + encodeURIComponent(uid), document.baseURI).href}`);
  lines.push("Statut : en attente (liste d'attente)");
  return lines.join('\n').slice(0, 2000);
}

// docs : liste de { url, kind: 'image' | 'raw', name, size } à joindre à la conversation
async function sendDocs(me, docs) {
  for (const d of docs) {
    await sleep(900); // la messagerie limite la cadence des messages
    if (d.kind === 'image') await sendMessage({ me, other: SUPPORT_UID, type: 'image', mediaUrl: d.url });
    else await sendMessage({ me, other: SUPPORT_UID, type: 'file', mediaUrl: d.url, fileName: d.name || 'Document.pdf', fileSize: d.size || 0 });
  }
}

const docsOf = (data) => [
  data.idUrl ? { url: data.idUrl, kind: data.idKind, name: data.idName } : null,
  data.orgUrl ? { url: data.orgUrl, kind: data.orgKind, name: data.orgName } : null,
  ...(data.extraDocs || [])
].filter(Boolean);

// Crée (ou relance après un refus) la demande, puis écrit au Support avec les documents.
// Retourne { messageSent } : la demande est enregistrée même si le message n'a pas pu partir.
export async function submitRequest({ me, accountType, name, data, plan, price, previous }) {
  const { m, db } = await need();
  const ref = m.doc(db, 'verificationRequests', me);
  if (previous) {
    await m.updateDoc(ref, {
      data, plan, price, renewal: false, status: 'pending', updatedAt: m.serverTimestamp(),
      reviewNote: m.deleteField(), reviewedBy: m.deleteField(), reviewedAt: m.deleteField()
    });
  } else {
    await m.setDoc(ref, { userId: me, accountType, data, plan, price, status: 'pending', createdAt: m.serverTimestamp(), updatedAt: m.serverTimestamp() });
  }
  let messageSent = false;
  try {
    await sendMessage({ me, other: SUPPORT_UID, type: 'text', text: formatRequestMessage({ accountType, name, uid: me, data, plan, price }) });
    messageSent = true;
    await sendDocs(me, docsOf(data));
  } catch (e) { console.error('Message au support non envoyé', e); }
  return { messageSent };
}

// Renouvellement : les documents déjà fournis sont conservés, on choisit seulement l'offre
export async function renewRequest({ me, accountType, name, plan, price, previous }) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'verificationRequests', me), { plan, price, renewal: true, status: 'pending', updatedAt: m.serverTimestamp() });
  let messageSent = false;
  try {
    await sendMessage({ me, other: SUPPORT_UID, type: 'text', text: formatRequestMessage({ accountType, name, uid: me, data: previous.data || {}, plan, price, renewal: true }) });
    messageSent = true;
  } catch (e) { console.error('Message au support non envoyé', e); }
  return { messageSent };
}

export async function cancelRequest(me) {
  const { m, db } = await need();
  await m.deleteDoc(m.doc(db, 'verificationRequests', me));
}
