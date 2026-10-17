// Imova — likes.js : « J'aime » et favoris.
// J'aime : le document (properties/ID/likes/UID) et le compteur de l'annonce sont écrits ENSEMBLE (lot atomique),
// les règles Firestore refusent l'un sans l'autre : le compteur ne peut pas être falsifié.
// Favoris : privés (favorites/UID_ID), visibles seulement par leur propriétaire.
import { firestore } from './firebase.js';

async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

// Parmi ces annonces, lesquelles ai-je aimées ? (une lecture par annonce, mise en mémoire de la session)
const likedCache = new Map();
export async function getLikedSet(uid, ids) {
  const { m, db } = await need();
  await Promise.all(ids.map(async (id) => {
    const key = uid + '_' + id;
    if (likedCache.has(key)) return;
    try {
      const s = await m.getDoc(m.doc(db, 'properties', id, 'likes', uid));
      likedCache.set(key, s.exists());
    } catch (e) { /* inconnu : traité comme non aimé */ }
  }));
  return new Set(ids.filter((id) => likedCache.get(uid + '_' + id)));
}

export async function setLike(uid, propertyId, like) {
  const { m, db } = await need();
  const batch = m.writeBatch(db);
  const likeRef = m.doc(db, 'properties', propertyId, 'likes', uid);
  if (like) batch.set(likeRef, { userId: uid, createdAt: m.serverTimestamp() });
  else batch.delete(likeRef);
  batch.update(m.doc(db, 'properties', propertyId), { likesCount: m.increment(like ? 1 : -1) });
  await batch.commit();
  likedCache.set(uid + '_' + propertyId, like);
}

// Mes favoris (identifiants), les plus récents d'abord
let favCache = null;
export async function getFavoriteIds(uid, { force = false } = {}) {
  if (favCache && favCache.uid === uid && !force) return favCache.list;
  const { m, db } = await need();
  const snap = await m.getDocs(m.query(m.collection(db, 'favorites'), m.where('userId', '==', uid), m.limit(200)));
  const t = (d) => { const c = d.createdAt; return c && c.toDate ? c.toDate().getTime() : new Date(c || 0).getTime(); };
  const list = snap.docs.map((d) => d.data()).sort((a, b) => t(b) - t(a)).map((d) => d.propertyId);
  favCache = { uid, list };
  return list;
}

export async function setFavorite(uid, propertyId, fav) {
  const { m, db } = await need();
  const ref = m.doc(db, 'favorites', `${uid}_${propertyId}`);
  if (fav) await m.setDoc(ref, { userId: uid, propertyId, createdAt: m.serverTimestamp() });
  else await m.deleteDoc(ref);
  if (favCache && favCache.uid === uid) {
    favCache.list = fav ? [propertyId, ...favCache.list.filter((i) => i !== propertyId)] : favCache.list.filter((i) => i !== propertyId);
  }
}
