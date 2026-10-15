// Imova — users.js : lecture et modification d'un profil (collection users)
import { firestore } from './firebase.js';

export async function getUserDoc(id) {
  const fs = await firestore();
  if (!fs) return null;
  const snap = await fs.m.getDoc(fs.m.doc(fs.db, 'users', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Modifie UNIQUEMENT son propre profil (les règles Firestore l'imposent aussi)
export async function updateMyProfile(uid, fields) {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  await fs.m.updateDoc(fs.m.doc(fs.db, 'users', uid), fields);
}
