// Imova — properties.js : lecture des annonces (Firestore) et de leurs auteurs.
import { firestore } from './firebase.js';

// Une annonce stocke « images » (15 max) et « video » (1 max). Pour l'affichage on les rassemble dans media[].
// Seules les adresses Cloudinary sont affichées : une adresse venant d'ailleurs est ignorée (protection des lecteurs).
const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\//;
const okUrl = (u) => typeof u === 'string' && CLOUDINARY.test(u);

export function normalizeProperty(p) {
  const media = [];
  (Array.isArray(p.images) ? p.images : []).forEach((i) => { if (i && okUrl(i.url)) media.push({ url: i.url, publicId: i.publicId || '', type: 'image', w: Number(i.w) || 0, h: Number(i.h) || 0 }); });
  if (p.video && okUrl(p.video.url)) media.push({ url: p.video.url, publicId: p.video.publicId || '', type: 'video' });
  if (!p.images && !p.video && Array.isArray(p.media)) {
    p.media.forEach((m) => { if (m && okUrl(m.url)) media.push({ url: m.url, publicId: m.publicId || '', type: m.type === 'video' ? 'video' : 'image' }); });
  }
  return { ...p, media };
}

// Lecture « serveur d'abord » : si le réseau est lent ou absent, Firebase renvoie sinon silencieusement ce que le
// téléphone a en mémoire (c'est-à-dire surtout VOS propres annonces). Ici on essaie le serveur, et seulement en cas
// d'échec on utilise la mémoire, en le signalant (fromCache) pour que l'écran puisse prévenir l'utilisateur.
async function runQuery(m, q) {
  try {
    return { snap: await m.getDocsFromServer(q), fromCache: false };
  } catch (e) {
    try {
      const snap = await m.getDocsFromCache(q);
      return { snap, fromCache: true };
    } catch (e2) {
      throw e;
    }
  }
}

const mapDocs = (snap) => snap.docs.map((d) => normalizeProperty({ id: d.id, ...d.data() }));

// Lit les annonces, les plus récentes d'abord, par lots (fil continu)
export async function fetchProperties({ after = null, size = 8 } = {}) {
  const fs = await firestore();
  if (!fs) return { items: [], cursor: null, done: true, configured: false };
  const { m, db } = fs;
  const parts = [m.collection(db, 'properties'), m.orderBy('createdAt', 'desc')];
  if (after) parts.push(m.startAfter(after));
  parts.push(m.limit(size));
  const { snap, fromCache } = await runQuery(m, m.query(...parts));
  return {
    items: mapDocs(snap),
    cursor: snap.docs[snap.docs.length - 1] || after,
    done: snap.size < size,
    configured: true,
    fromCache
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
  const { snap, fromCache } = await runQuery(m, m.query(...parts));
  return {
    items: mapDocs(snap),
    cursor: snap.docs[snap.docs.length - 1] || after,
    done: snap.size < size,
    fromCache
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

// ───────── Pour la recherche et les recommandations
// Annonces contenant au moins un des mots donnés (jusqu'à 10 mots) ; sans tri : on classe dans le navigateur
export async function fetchByTokens(tokens, size = 30) {
  const list = [...new Set(tokens)].slice(0, 10);
  if (!list.length) return [];
  const { m, db } = await need();
  const { snap } = await runQuery(m, m.query(m.collection(db, 'properties'), m.where('tokens', 'array-contains-any', list), m.limit(size)));
  return mapDocs(snap);
}

// Dernières annonces de plusieurs auteurs (jusqu'à 10) — utilise l'index « authorId + createdAt »
export async function fetchFromAuthors(authorIds, size = 20) {
  const list = [...new Set(authorIds)].slice(0, 10);
  if (!list.length) return [];
  const { m, db } = await need();
  const { snap } = await runQuery(m, m.query(m.collection(db, 'properties'), m.where('authorId', 'in', list), m.orderBy('createdAt', 'desc'), m.limit(size)));
  return mapDocs(snap);
}

// Annonces par identifiants (favoris)
export async function fetchByIds(ids) {
  const { m, db } = await need();
  const out = await Promise.all(ids.map(async (id) => {
    try {
      const s = await m.getDoc(m.doc(db, 'properties', id));
      return s.exists() ? normalizeProperty({ id: s.id, ...s.data() }) : null;
    } catch (e) { return null; }
  }));
  return out.filter(Boolean);
}
