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
    batch.set(m.doc(db, 'events', key), { type: 'view', ownerId: property.authorId, viewerId: meUid, refId: property.id, day: utcDay(), createdAt: m.serverTimestamp() });
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
    await m.setDoc(m.doc(db, 'events', key), { type: 'profile', ownerId, viewerId: meUid, refId: ownerId, day: utcDay(), createdAt: m.serverTimestamp() });
  } catch (e) { /* ignoré */ }
}

// ───────── Lecture pour le tableau de bord
// Les événements portent un champ « day » (AAAAMMJJ) : on compte par jours avec une requête « day in [...] », qui n'a besoin d'AUCUN index composite.
async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

const DAY_MS = 86400000;
// Les `n` jours (UTC, AAAAMMJJ) qui se terminent le jour de `end` (inclus)
export function daysEnding(end, n) {
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Array.from({ length: n }, (_, i) => utcDay(new Date(e - (n - 1 - i) * DAY_MS)));
}
// Période [from, to] découpée en `nb` groupes de jours consécutifs, sans chevauchement
export function periodGroups(from, to, nb) {
  const n = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
  const days = daysEnding(to, n);
  return Array.from({ length: nb }, (_, i) => days.slice(Math.floor((i * n) / nb), Math.floor(((i + 1) * n) / nb))).filter((g) => g.length);
}

async function countDays(ownerId, type, days) {
  const { m, db } = await need();
  let total = 0;
  for (let i = 0; i < days.length; i += 30) { // « in » accepte au plus 30 valeurs
    const snap = await m.getCountFromServer(m.query(m.collection(db, 'events'), m.where('ownerId', '==', ownerId), m.where('type', '==', type), m.where('day', 'in', days.slice(i, i + 30))));
    total += snap.data().count;
  }
  return total;
}

// Nombre d'événements sur les jours de la période (to = dernier jour inclus)
export const countEvents = (ownerId, type, from, to) => countDays(ownerId, type, daysEnding(to, Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS))));

// Une valeur par groupe de jours consécutifs (sans double comptage)
export async function timeline(ownerId, type, from, to, nb) {
  return Promise.all(periodGroups(from, to, nb).map((g) => countDays(ownerId, type, g).catch(() => 0)));
}
