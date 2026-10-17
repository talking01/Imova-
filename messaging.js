// Imova — messaging.js : conversations privées entre deux personnes (Firestore, temps réel).
// Une conversation par paire d'utilisateurs : identifiant = les deux UID triés (donc jamais de doublon).
// Données : conversations/{id} (dernier message, non-lus, épinglé, sourdine...) et conversations/{id}/messages/{id}.
// Seuls les deux participants peuvent lire ou écrire (règles Firestore).
import { firestore } from './firebase.js';

export const convId = (a, b) => [a, b].sort().join('_');
export const otherOf = (conv, me) => (conv.members || []).find((u) => u !== me);

export const millis = (t) => {
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.toDate === 'function') return t.toDate().getTime();
  const n = new Date(t).getTime();
  return isNaN(n) ? 0 : n;
};

async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

const dataOf = (d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) });

// ───────── Écoute en temps réel
export async function watchConversations(me, onData, onError) {
  const { m, db } = await need();
  const q = m.query(m.collection(db, 'conversations'), m.where('members', 'array-contains', me), m.limit(50));
  return m.onSnapshot(q, (snap) => onData(snap.docs.map(dataOf), { fromCache: snap.metadata.fromCache }), onError);
}

export async function watchConversation(cid, onData, onError) {
  const { m, db } = await need();
  return m.onSnapshot(m.doc(db, 'conversations', cid), (snap) => onData(snap.exists() ? dataOf(snap) : null), onError);
}

// Les 30 derniers messages, en direct ; includeMetadataChanges : on sait quand un message passe de « en cours » à « envoyé »
export async function watchMessages(cid, onData, onError, size = 30) {
  const { m, db } = await need();
  const q = m.query(m.collection(db, 'conversations', cid, 'messages'), m.orderBy('createdAt', 'desc'), m.limit(size));
  return m.onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    onData(snap.docs.map((d) => ({ ...dataOf(d), _pending: d.metadata.hasPendingWrites, _doc: d })), { hasMore: snap.size >= size, last: snap.docs[snap.docs.length - 1] || null });
  }, onError);
}

// Messages plus anciens (30 de plus)
export async function loadOlder(cid, afterDoc, size = 30) {
  const { m, db } = await need();
  const snap = await m.getDocs(m.query(m.collection(db, 'conversations', cid, 'messages'), m.orderBy('createdAt', 'desc'), m.startAfter(afterDoc), m.limit(size)));
  return { items: snap.docs.map((d) => ({ ...dataOf(d), _pending: false, _doc: d })), hasMore: snap.size >= size, last: snap.docs[snap.docs.length - 1] || afterDoc };
}

export async function watchUser(uid, onData) {
  const { m, db } = await need();
  return m.onSnapshot(m.doc(db, 'users', uid), (snap) => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null), () => {});
}

// ───────── Protection contre l'abus (côté application ; les règles Firestore imposent aussi un délai entre deux messages)
const sentTimes = [];
export function canSend() {
  const now = Date.now();
  while (sentTimes.length && now - sentTimes[0] > 60000) sentTimes.shift();
  return sentTimes.length < 20; // 20 messages par minute au maximum
}
function noteSent() { sentTimes.push(Date.now()); }

const DAY_KEY = 'imova-newconv';
export function canStartConversation() {
  try {
    const d = JSON.parse(localStorage.getItem(DAY_KEY) || '{}');
    const today = new Date().toDateString();
    return d.day !== today || (d.n || 0) < 30; // 30 nouvelles conversations par jour au maximum
  } catch (e) { return true; }
}
function noteNewConversation() {
  try {
    const today = new Date().toDateString();
    const d = JSON.parse(localStorage.getItem(DAY_KEY) || '{}');
    localStorage.setItem(DAY_KEY, JSON.stringify({ day: today, n: d.day === today ? (d.n || 0) + 1 : 1 }));
  } catch (e) { /* ignoré */ }
}

// ───────── Envoi
// type : text | image | audio ; ref : { propertyId, title, image } pour la carte d'annonce dans la bulle
export async function sendMessage({ me, other, type = 'text', text = '', mediaUrl = '', duration = 0, ref = null, context = null, exists }) {
  if (!canSend()) { const e = new Error('rate'); e.code = 'imova/rate'; throw e; }
  const { m, db } = await need();
  const cid = convId(me, other);
  const convRef = m.doc(db, 'conversations', cid);
  const msgRef = m.doc(m.collection(db, 'conversations', cid, 'messages'));
  let known = exists;
  if (known === undefined) known = (await m.getDoc(convRef)).exists();
  if (!known && !canStartConversation()) { const e = new Error('rate-day'); e.code = 'imova/rate-day'; throw e; }

  const preview = type === 'text' ? text.slice(0, 120) : type === 'image' ? 'Photo' : 'Message vocal';
  const msg = { senderId: me, type, text: type === 'text' ? text : '', createdAt: m.serverTimestamp() };
  if (type !== 'text') msg.mediaUrl = mediaUrl;
  if (type === 'audio') msg.duration = Math.max(1, Math.round(duration));
  if (ref) msg.ref = ref;
  const last = { text: preview, type, senderId: me, at: m.serverTimestamp() };

  const batch = m.writeBatch(db);
  if (!known) {
    batch.set(convRef, {
      members: [me, other].sort(), lastMessage: last,
      unread: { [me]: 0, [other]: 1 }, lastRead: {}, lastSent: { [me]: m.serverTimestamp() },
      pinnedBy: [], mutedBy: [], hidden: {}, clearedAt: {}, typing: {}, context: context || null,
      createdAt: m.serverTimestamp(), updatedAt: m.serverTimestamp()
    });
  } else {
    const upd = {
      lastMessage: last, [`unread.${other}`]: m.increment(1), [`lastSent.${me}`]: m.serverTimestamp(),
      [`hidden.${other}`]: false, [`hidden.${me}`]: false, [`typing.${me}`]: 0, updatedAt: m.serverTimestamp()
    };
    if (context) upd.context = context;
    batch.update(convRef, upd);
  }
  batch.set(msgRef, msg);
  await batch.commit();
  noteSent();
  if (!known) noteNewConversation();
  return msgRef.id;
}

// ───────── Lecture, saisie, modification, suppression
export async function markRead(cid, me) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'conversations', cid), { [`unread.${me}`]: 0, [`lastRead.${me}`]: m.serverTimestamp() });
}

export async function setTyping(cid, me) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'conversations', cid), { [`typing.${me}`]: m.serverTimestamp() });
}

export async function editMessage(cid, mid, text) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'conversations', cid, 'messages', mid), { text, editedAt: m.serverTimestamp() });
}

export async function deleteForMe(cid, mid, me) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'conversations', cid, 'messages', mid), { deletedFor: m.arrayUnion(me) });
}

// Suppression pour tout le monde : le contenu est effacé (la bulle reste : « Ce message a été supprimé »)
export async function deleteForAll(cid, mid, { isLast = false, lastAt = null, me = '' } = {}) {
  const { m, db } = await need();
  const batch = m.writeBatch(db);
  batch.update(m.doc(db, 'conversations', cid, 'messages', mid), { deletedForAll: true, text: '', mediaUrl: '' });
  if (isLast) batch.update(m.doc(db, 'conversations', cid), { lastMessage: { text: 'Message supprimé', type: 'deleted', senderId: me, at: lastAt || m.serverTimestamp() } });
  await batch.commit();
}

// ───────── Options d'une conversation
export async function setPinned(cid, me, on) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'conversations', cid), { pinnedBy: on ? m.arrayUnion(me) : m.arrayRemove(me) });
}
export async function setMuted(cid, me, on) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'conversations', cid), { mutedBy: on ? m.arrayUnion(me) : m.arrayRemove(me) });
}
// « Supprimer la conversation » : elle disparaît de ma liste (l'autre personne la garde) et revient si un nouveau message arrive
export async function hideConversation(cid, me) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'conversations', cid), { [`hidden.${me}`]: true, [`clearedAt.${me}`]: m.serverTimestamp(), [`unread.${me}`]: 0 });
}
// « Effacer la discussion » : les messages disparaissent pour moi, la conversation reste
export async function clearDiscussion(cid, me) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'conversations', cid), { [`clearedAt.${me}`]: m.serverTimestamp(), [`unread.${me}`]: 0 });
}
export async function hideAll(convs, me) {
  const { m, db } = await need();
  const batch = m.writeBatch(db);
  convs.forEach((c) => batch.update(m.doc(db, 'conversations', c.id), { [`hidden.${me}`]: true, [`clearedAt.${me}`]: m.serverTimestamp(), [`unread.${me}`]: 0 }));
  await batch.commit();
}
export async function markAllRead(convs, me) {
  const { m, db } = await need();
  const batch = m.writeBatch(db);
  convs.filter((c) => ((c.unread || {})[me] || 0) > 0).forEach((c) => batch.update(m.doc(db, 'conversations', c.id), { [`unread.${me}`]: 0, [`lastRead.${me}`]: m.serverTimestamp() }));
  await batch.commit();
}

// ───────── Blocage
export async function blockUser(me, other) {
  const { m, db } = await need();
  await m.setDoc(m.doc(db, 'blocks', `${me}_${other}`), { blockerId: me, blockedId: other, createdAt: m.serverTimestamp() });
  blockedCache = null;
}
export async function unblockUser(me, other) {
  const { m, db } = await need();
  await m.deleteDoc(m.doc(db, 'blocks', `${me}_${other}`));
  blockedCache = null;
}
let blockedCache = null;
export async function getBlockedIds(me, { force = false } = {}) {
  if (blockedCache && blockedCache.me === me && !force) return blockedCache.set;
  const { m, db } = await need();
  const snap = await m.getDocs(m.query(m.collection(db, 'blocks'), m.where('blockerId', '==', me), m.limit(200)));
  const set = new Set(snap.docs.map((d) => d.data().blockedId));
  blockedCache = { me, set };
  return set;
}
