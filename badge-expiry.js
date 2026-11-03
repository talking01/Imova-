// Imova — badge-expiry.js : fin automatique des badges et rappels avant la fin.
// Sans serveur, deux mécanismes se complètent :
//   1. à l'affichage, un badge dont la date de fin est passée n'est plus montré (badge-rules.js) ;
//   2. dans la base, le badge est retiré (verified = false) dès que le titulaire ouvre l'application, ou dès qu'un administrateur ouvre
//      l'administration (balayage de tous les badges expirés). Les rappels « votre badge expire bientôt » (7 jours avant) suivent le même chemin.
import { firestore } from './firebase.js';
import { notify } from './notifs.js';
import { untilMs } from './badge-rules.js';

export const REMIND_DAYS = 7;
const DAY = 86400000;
const fmt = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// Côté titulaire : retire son propre badge expiré, ou se rappelle sa fin proche. Au plus une vérification toutes les 30 minutes.
export async function checkMyBadge(uid) {
  try {
    const last = Number(sessionStorage.getItem('imova-badge-check') || 0);
    if (Date.now() - last < 30 * 60 * 1000) return null;
    sessionStorage.setItem('imova-badge-check', String(Date.now()));
  } catch (e) { /* ignoré */ }
  const fs = await firestore();
  if (!fs) return null;
  const { m, db } = fs;
  const snap = await m.getDoc(m.doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const u = snap.data();
  if (u.verified !== true || !u.verifiedUntil) return null;
  const until = untilMs(u);
  if (until <= Date.now()) {
    await m.updateDoc(m.doc(db, 'users', uid), { verified: false });
    return { expired: true, until };
  }
  if (until - Date.now() <= REMIND_DAYS * DAY) {
    try {
      await m.setDoc(m.doc(db, 'notifications', uid, 'items', `badge_expiry_${until}`), {
        type: 'verification', actorId: uid, refId: '', title: 'Votre badge expire bientôt',
        body: `Il sera retiré automatiquement le ${fmt(until)}. Renouvelez-le pour le garder.`, link: 'badge.html', read: false, createdAt: m.serverTimestamp()
      });
    } catch (e) { /* déjà créé pour cette échéance */ }
    return { remind: true, until };
  }
  return null;
}

// Côté administration : retire tous les badges expirés (50 par passage) et prévient les titulaires. Retourne le nombre de badges retirés.
export async function sweepExpired(ctx) {
  const { m, db } = ctx;
  const snap = await m.getDocs(m.query(m.collection(db, 'users'), m.where('verifiedUntil', '<', new Date()), m.limit(50)));
  const due = snap.docs.filter((d) => d.data().verified === true);
  if (!due.length) return 0;
  const batch = m.writeBatch(db);
  due.forEach((d) => batch.update(m.doc(db, 'users', d.id), { verified: false }));
  await batch.commit();
  await Promise.all(due.map((d) => notify(d.id, {
    type: 'verification', id: `badge_expired_${untilMs(d.data())}`, title: 'Votre badge a expiré',
    body: 'Votre badge de vérification a pris fin. Renouvelez-le depuis Menu → Vérification.', link: 'badge.html'
  })));
  return due.length;
}

// Côté administration : rappelle aux titulaires dont le badge se termine dans 7 jours. Retourne la liste des profils concernés.
export async function remindExpiring(ctx) {
  const { m, db } = ctx;
  const now = Date.now();
  const snap = await m.getDocs(m.query(m.collection(db, 'users'), m.where('verifiedUntil', '>', new Date(now)), m.where('verifiedUntil', '<=', new Date(now + REMIND_DAYS * DAY)), m.limit(50)));
  const soon = snap.docs.filter((d) => d.data().verified === true).map((d) => ({ id: d.id, ...d.data() }));
  await Promise.all(soon.map((u) => notify(u.id, {
    type: 'verification', id: `badge_reminder_${untilMs(u)}`, title: 'Votre badge expire bientôt',
    body: `Il sera retiré le ${fmt(untilMs(u))}. Renouvelez-le pour le garder.`, link: 'badge.html'
  })));
  return soon;
}
