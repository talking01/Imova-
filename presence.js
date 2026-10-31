// Imova — presence.js : « en ligne » / « vu à 14:32 ».
// On enregistre l'heure de dernière activité dans le profil (users/ID.lastSeen) : à l'ouverture, puis toutes les 90 secondes
// seulement tant qu'une page de messagerie est visible (peu d'écritures : le quota gratuit est limité).
import { firestore } from './firebase.js';
import { millis } from './messaging.js';
import { getUserDoc } from './users.js';

const EVERY = 90 * 1000;
let started = false;

let allowed = null; // réglage « afficher mon statut » (confidentialité)
async function touch(uid) {
  try {
    if (allowed === null) { const u = await getUserDoc(uid); allowed = !(u && u.showStatus === false); }
    if (!allowed) return;
    const fs = await firestore();
    if (fs) await fs.m.updateDoc(fs.m.doc(fs.db, 'users', uid), { lastSeen: fs.m.serverTimestamp() });
  } catch (e) { /* ignoré : la présence n'est pas essentielle */ }
}

export function startPresence(uid) {
  if (started) return;
  started = true;
  touch(uid);
  setInterval(() => { if (document.visibilityState === 'visible') touch(uid); }, EVERY);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') touch(uid); });
}

// Vrai si la dernière activité date de moins de 3 minutes
export const isOnline = (lastSeen) => !!lastSeen && Date.now() - millis(lastSeen) < 3 * 60 * 1000;
