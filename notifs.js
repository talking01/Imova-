// Imova — notifs.js : notifications dans l'application (abonné, J'aime, avis, modération, badge).
// Les messages et les nouvelles annonces des profils suivis ne sont pas stockés : ils sont calculés à l'affichage.
// Chaque notification est créée par la personne qui agit, avec un identifiant fixe (une seule par personne et par sujet) ;
// les règles Firestore vérifient que l'action existe vraiment.
import { firestore } from './firebase.js';
import { getUser } from './auth.js';

async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

// type : follow | like | review | moderation | verification | system. Échec silencieux : une notification ne doit jamais bloquer une action.
export async function notify(toUid, { type, id, title, body = '', link, refId = '' }) {
  const me = getUser();
  if (!me || !toUid || toUid === me.uid) return false;
  try {
    const { m, db } = await need();
    await m.setDoc(m.doc(db, 'notifications', toUid, 'items', id || `${type}_${me.uid}_${Date.now()}`), {
      type, actorId: me.uid, refId: String(refId).slice(0, 200), title: String(title).slice(0, 120), body: String(body).slice(0, 200),
      link, read: false, createdAt: m.serverTimestamp()
    });
    return true;
  } catch (e) { return false; }
}

const mapDoc = (d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) });

// Notifications non lues en direct (pastille de la cloche)
export async function watchUnread(uid, onData, onError) {
  const { m, db } = await need();
  const q = m.query(m.collection(db, 'notifications', uid, 'items'), m.where('read', '==', false), m.limit(50));
  return m.onSnapshot(q, (snap) => onData(snap.docs.map(mapDoc)), onError);
}

export async function listNotifications(uid, { after = null, size = 25 } = {}) {
  const { m, db } = await need();
  const parts = [m.collection(db, 'notifications', uid, 'items'), m.orderBy('createdAt', 'desc')];
  if (after) parts.push(m.startAfter(after));
  parts.push(m.limit(size));
  const snap = await m.getDocs(m.query(...parts));
  return { items: snap.docs.map(mapDoc), cursor: snap.docs[snap.docs.length - 1] || after, done: snap.size < size };
}

export async function markRead(uid, id) {
  const { m, db } = await need();
  await m.updateDoc(m.doc(db, 'notifications', uid, 'items', id), { read: true });
}

export async function markAllRead(uid, ids) {
  const { m, db } = await need();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = m.writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.update(m.doc(db, 'notifications', uid, 'items', id), { read: true }));
    await batch.commit();
  }
}

export async function removeNotifications(uid, ids) {
  const { m, db } = await need();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = m.writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.delete(m.doc(db, 'notifications', uid, 'items', id)));
    await batch.commit();
  }
}
