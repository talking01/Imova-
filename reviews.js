// Imova — reviews.js : notes et avis. Un seul avis par personne et par profil (ID = profil_auteur).
// L'avis et les compteurs du profil (somme et nombre de notes) sont écrits ENSEMBLE, pour que la moyenne soit fiable.
import { firestore } from './firebase.js';

async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

const reviewRef = (m, db, target, reviewer) => m.doc(db, 'reviews', `${target}_${reviewer}`);

export async function getReview(target, reviewer) {
  const { m, db } = await need();
  const snap = await m.getDoc(reviewRef(m, db, target, reviewer));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Les 50 avis les plus récents d'un profil (triés dans le navigateur)
export async function listReviews(target, size = 50) {
  const { m, db } = await need();
  const snap = await m.getDocs(m.query(m.collection(db, 'reviews'), m.where('targetId', '==', target), m.limit(size)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const time = (r) => { const t = r.createdAt; return t && t.toDate ? t.toDate().getTime() : new Date(t || 0).getTime(); };
  return items.sort((a, b) => time(b) - time(a));
}

export async function saveReview({ target, reviewer, rating, comment }) {
  const { m, db } = await need();
  const ref = reviewRef(m, db, target, reviewer);
  const existing = await m.getDoc(ref);
  const batch = m.writeBatch(db);
  if (existing.exists()) {
    const old = existing.data().rating;
    batch.update(ref, { rating, comment, updatedAt: m.serverTimestamp() });
    if (rating !== old) batch.update(m.doc(db, 'users', target), { ratingSum: m.increment(rating - old) });
  } else {
    batch.set(ref, { targetId: target, reviewerId: reviewer, rating, comment, createdAt: m.serverTimestamp(), updatedAt: m.serverTimestamp() });
    batch.update(m.doc(db, 'users', target), { ratingSum: m.increment(rating), ratingCount: m.increment(1) });
  }
  await batch.commit();
}

export async function deleteReview({ target, reviewer }) {
  const { m, db } = await need();
  const ref = reviewRef(m, db, target, reviewer);
  const existing = await m.getDoc(ref);
  if (!existing.exists()) return;
  const batch = m.writeBatch(db);
  batch.delete(ref);
  batch.update(m.doc(db, 'users', target), { ratingSum: m.increment(-existing.data().rating), ratingCount: m.increment(-1) });
  await batch.commit();
}
