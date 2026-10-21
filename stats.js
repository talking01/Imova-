// Imova — stats.js : enregistre les « événements » qui alimentent le tableau de bord (vues d'annonces, visites de profil, nouvelles conversations).
// Un événement par visiteur, par élément et par jour (l'identifiant le garantit ; les règles Firestore le vérifient) : on ne peut
// donc pas gonfler ses propres chiffres en actualisant la page. Seuls les visiteurs connectés sont comptés.
import { firestore } from './firebase.js';

export const utcDay = (d = new Date()) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

const seen = (k) => { try { return localStorage.getItem('imova-ev-' + k) === '1'; } catch (e) { return false; } };
const mark = (k) => {
  try {
    localStorage.setItem('imova-ev-' + k, '1');
    // ménage : on ne garde que les 300 derniers repères
    const keys = Object.keys(localStorage).filter((x) => x.startsWith('imova-ev-'));
    if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((x) => localStorage.removeItem(x));
  } catch (e) { /* ignoré */ }
};

// Vue d'une annonce par quelqu'un d'autre que son auteur : événement + compteur de l'annonce (écrits ensemble)
export async function recordView(meUid, property) {
  if (!meUid || !property || meUid === property.authorId) return;
  const key = `view_${meUid}_${property.id}_${utcDay()}`;
  if (seen(key)) return;
  mark(key);
  try {
    const fs = await firestore();
    if (!fs) return;
    const { m, db } = fs;
    const batch = m.writeBatch(db);
    batch.set(m.doc(db, 'events', key), { type: 'view', ownerId: property.authorId, viewerId: meUid, refId: property.id, createdAt: m.serverTimestamp() });
    batch.update(m.doc(db, 'properties', property.id), { viewsCount: m.increment(1) });
    await batch.commit();
  } catch (e) { /* les statistiques ne doivent jamais gêner l'utilisateur */ }
}

export async function recordProfileVisit(meUid, ownerId) {
  if (!meUid || !ownerId || meUid === ownerId) return;
  const key = `profile_${meUid}_${ownerId}_${utcDay()}`;
  if (seen(key)) return;
  mark(key);
  try {
    const fs = await firestore();
    if (!fs) return;
    const { m, db } = fs;
    await m.setDoc(m.doc(db, 'events', key), { type: 'profile', ownerId, viewerId: meUid, refId: ownerId, createdAt: m.serverTimestamp() });
  } catch (e) { /* ignoré */ }
}

// ───────── Lecture pour le tableau de bord
// Compte les événements d'un type pour un propriétaire entre deux dates (requête de comptage : très peu de lectures)
export async function countEvents(ownerId, type, from, to) {
  const { m, db } = await need();
  const snap = await m.getCountFromServer(m.query(
    m.collection(db, 'events'), m.where('ownerId', '==', ownerId), m.where('type', '==', type),
    m.where('createdAt', '>=', from), m.where('createdAt', '<', to)
  ));
  return snap.data().count;
}

async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

// Découpe [from, to[ en au plus `n` tranches égales
export function buckets(from, to, n) {
  const step = (to.getTime() - from.getTime()) / n;
  return Array.from({ length: n }, (_, i) => [new Date(from.getTime() + i * step), new Date(from.getTime() + (i + 1) * step)]);
}

export async function timeline(ownerId, type, from, to, n) {
  return Promise.all(buckets(from, to, n).map(([a, b]) => countEvents(ownerId, type, a, b).catch(() => 0)));
}
