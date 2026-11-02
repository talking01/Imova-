// Imova — reco-store.js : lecture et écriture, dans la base, des centres d'intérêt et des recommandations de chaque compte.
//   userInterests/UID    : ce que le compte aime (mots, concepts, annonceurs, préférences, recherches), mis à jour au fil des actions
//   recommendations/UID  : les recommandations calculées pour ce compte (annonces, profils, recherches suggérées)
// Ces deux documents sont privés : seul le propriétaire peut les lire ou les modifier.
import { firestore } from './firebase.js';

async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

export async function loadInterests(uid) {
  const { m, db } = await need();
  const s = await m.getDoc(m.doc(db, 'userInterests', uid));
  return s.exists() ? s.data() : null;
}

export async function saveInterests(uid, data) {
  const { m, db } = await need();
  await m.setDoc(m.doc(db, 'userInterests', uid), { ...data, updatedAt: m.serverTimestamp() });
}

export async function loadRecs(uid) {
  const { m, db } = await need();
  const s = await m.getDoc(m.doc(db, 'recommendations', uid));
  return s.exists() ? s.data() : null;
}

export async function saveRecs(uid, data) {
  const { m, db } = await need();
  await m.setDoc(m.doc(db, 'recommendations', uid), { ...data, computedAt: m.serverTimestamp() });
}

// « Effacer mes données de recommandation » : supprime les deux documents
export async function deleteRecoData(uid) {
  const { m, db } = await need();
  await Promise.all([m.deleteDoc(m.doc(db, 'userInterests', uid)).catch(() => {}), m.deleteDoc(m.doc(db, 'recommendations', uid)).catch(() => {})]);
}
