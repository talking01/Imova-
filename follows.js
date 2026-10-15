// Imova — follows.js : suivre / ne plus suivre un profil, liste des abonnés.
// Le document d'abonnement et le compteur d'abonnés sont écrits ENSEMBLE (lot atomique) :
// les règles Firestore refusent l'un sans l'autre, donc le compteur ne peut pas être falsifié.
import { firestore } from './firebase.js';

async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

export async function isFollowing(me, target) {
  const { m, db } = await need();
  const snap = await m.getDoc(m.doc(db, 'follows', `${me}_${target}`));
  return snap.exists();
}

export async function follow(me, target) {
  const { m, db } = await need();
  const batch = m.writeBatch(db);
  batch.set(m.doc(db, 'follows', `${me}_${target}`), { followerId: me, targetId: target, createdAt: m.serverTimestamp() });
  batch.update(m.doc(db, 'users', target), { followersCount: m.increment(1) });
  await batch.commit();
}

export async function unfollow(me, target) {
  const { m, db } = await need();
  const batch = m.writeBatch(db);
  batch.delete(m.doc(db, 'follows', `${me}_${target}`));
  batch.update(m.doc(db, 'users', target), { followersCount: m.increment(-1) });
  await batch.commit();
}

// Abonnés d'un profil, par lots (sans index particulier)
export async function listFollowers(targetId, { after = null, size = 20 } = {}) {
  const { m, db } = await need();
  const parts = [m.collection(db, 'follows'), m.where('targetId', '==', targetId)];
  if (after) parts.push(m.startAfter(after));
  parts.push(m.limit(size));
  const snap = await m.getDocs(m.query(...parts));
  return {
    ids: snap.docs.map((d) => d.data().followerId),
    cursor: snap.docs[snap.docs.length - 1] || after,
    done: snap.size < size
  };
}
