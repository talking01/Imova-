// Imova — properties.js : lecture des annonces (Firestore) et de leurs auteurs.
import { firestore } from './firebase.js';

// Une annonce stocke « images » (15 max) et « video » (1 max). Pour l'affichage on les rassemble dans media[].
// Seules les adresses Cloudinary sont affichées : une adresse venant d'ailleurs est ignorée (protection des lecteurs).
const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\//;
const okUrl = (u) => typeof u === 'string' && CLOUDINARY.test(u);

export function normalizeProperty(p) {
  const media = [];
  (Array.isArray(p.images) ? p.images : []).forEach((i) => { if (i && okUrl(i.url)) media.push({ url: i.url, publicId: i.publicId || '', type: 'image' }); });
  if (p.video && okUrl(p.video.url)) media.push({ url: p.video.url, publicId: p.video.publicId || '', type: 'video' });
  if (!p.images && !p.video && Array.isArray(p.media)) {
    p.media.forEach((m) => { if (m && okUrl(m.url)) media.push({ url: m.url, publicId: m.publicId || '', type: m.type === 'video' ? 'video' : 'image' }); });
  }
  return { ...p, media };
}

// Lit les annonces, les plus récentes d'abord, par lots (fil continu)
export async function fetchProperties({ after = null, size = 8 } = {}) {
  const fs = await firestore();
  if (!fs) return { items: [], cursor: null, done: true, configured: false };
  const { m, db } = fs;
  const parts = [m.collection(db, 'properties'), m.orderBy('createdAt', 'desc')];
  if (after) parts.push(m.startAfter(after));
  parts.push(m.limit(size));
  const snap = await m.getDocs(m.query(...parts));
  return {
    items: snap.docs.map((d) => normalizeProperty({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || after,
    done: snap.size < size,
    configured: true
  };
}

export async function getProperty(id) {
  const fs = await firestore();
  if (!fs) return null;
  const { m, db } = fs;
  const snap = await m.getDoc(m.doc(db, 'properties', id));
  return snap.exists() ? normalizeProperty({ id: snap.id, ...snap.data() }) : null;
}

// Auteurs : on lit users/{id} une seule fois par auteur (mémoire de la page + 10 min en session)
const memory = new Map();
const TTL = 10 * 60 * 1000;

function fromSession(id) {
  try {
    const raw = sessionStorage.getItem('imova-author-' + id);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    return Date.now() - t < TTL ? v : null;
  } catch (e) { return null; }
}

export async function loadAuthors(ids) {
  const fs = await firestore();
  const unique = [...new Set(ids.filter(Boolean))];
  await Promise.all(unique.map(async (id) => {
    if (memory.has(id)) return;
    const cached = fromSession(id);
    if (cached) { memory.set(id, cached); return; }
    if (!fs) return;
    try {
      const snap = await fs.m.getDoc(fs.m.doc(fs.db, 'users', id));
      if (snap.exists()) {
        const d = snap.data();
        const v = { name: d.name || '', photoUrl: d.photoUrl || '', type: d.type || '', verified: !!d.verified };
        memory.set(id, v);
        try { sessionStorage.setItem('imova-author-' + id, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* plein */ }
      }
    } catch (e) { /* auteur illisible : on affichera « Utilisateur » */ }
  }));
  return memory;
}

// Publications épinglées d'un auteur (filtre simple, aucun index nécessaire)
export async function fetchPinned(authorId) {
  const fs = await firestore();
  if (!fs) return [];
  const { m, db } = fs;
  const snap = await m.getDocs(m.query(
    m.collection(db, 'properties'), m.where('authorId', '==', authorId), m.where('pinned', '==', true), m.limit(10)
  ));
  return snap.docs.map((d) => normalizeProperty({ id: d.id, ...d.data() }));
}

// Publications d'un auteur, les plus récentes d'abord (demande l'index « authorId + createdAt », voir GUIDE-FIREBASE.md)
export async function fetchByAuthor(authorId, { after = null, size = 8 } = {}) {
  const fs = await firestore();
  if (!fs) return { items: [], cursor: null, done: true };
  const { m, db } = fs;
  const parts = [m.collection(db, 'properties'), m.where('authorId', '==', authorId), m.orderBy('createdAt', 'desc')];
  if (after) parts.push(m.startAfter(after));
  parts.push(m.limit(size));
  const snap = await m.getDocs(m.query(...parts));
  return {
    items: snap.docs.map((d) => normalizeProperty({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || after,
    done: snap.size < size
  };
}

// À appeler après une modification de son propre profil, pour ne pas garder l'ancienne version en mémoire
export function forgetAuthor(id) {
  memory.delete(id);
  try { sessionStorage.removeItem('imova-author-' + id); } catch (e) { /* ignoré */ }
}

// ───────── Écriture (réservée à l'auteur : les règles Firestore l'imposent aussi)
async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

// images : [{ url, publicId }] ; video : { url, publicId } ou null
export async function createProperty({ authorId, title, description, images, video, tokens }) {
  const { m, db } = await need();
  const ref = m.doc(m.collection(db, 'properties'));
  await m.setDoc(ref, {
    authorId, title, description, images, video: video || null,
    likesCount: 0, viewsCount: 0, pinned: false, status: 'active', tokens,
    createdAt: m.serverTimestamp(), updatedAt: m.serverTimestamp()
  });
  return ref.id;
}

export async function updateProperty(id, { title, description, images, video, tokens }) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'properties', id), {
    title, description, images, video: video || null, tokens, updatedAt: m.serverTimestamp()
  });
}

export async function deleteProperty(id) {
  const { m, db } = await need();
  await m.deleteDoc(m.doc(db, 'properties', id));
}

export async function setPinned(id, pinned) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'properties', id), { pinned });
}

// Nombre d'annonces d'un auteur (compté par Firestore : impossible à falsifier)
export async function countByAuthor(authorId) {
  const { m, db } = await need();
  const snap = await m.getCountFromServer(m.query(m.collection(db, 'properties'), m.where('authorId', '==', authorId)));
  return snap.data().count;
}
