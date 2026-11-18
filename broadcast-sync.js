// Imova — broadcast-sync.js : notifications personnalisées envoyées à toute une catégorie (tous, agences, particuliers).
// L'équipe écrit UNE seule annonce (collection broadcasts). À l'ouverture de l'application, chaque compte concerné en garde une copie dans
// ses notifications (elle apparaît alors dans la cloche, se lit et se supprime comme les autres).
import { firestore } from './firebase.js';

const ms = (t) => (t && t.toDate ? t.toDate().getTime() : t ? new Date(t).getTime() : 0);

export async function syncBroadcasts(uid) {
  try {
    const last = Number(sessionStorage.getItem('imova-bc-check') || 0);
    if (Date.now() - last < 5 * 60 * 1000) return 0;
    sessionStorage.setItem('imova-bc-check', String(Date.now()));
  } catch (e) { /* ignoré */ }
  const fs = await firestore();
  if (!fs) return 0;
  const { m, db } = fs;
  const key = 'imova-bc-seen-' + uid;
  let seen = 0;
  try { seen = Number(localStorage.getItem(key) || 0); } catch (e) { /* ignoré */ }
  const us = await m.getDoc(m.doc(db, 'users', uid));
  if (!us.exists()) return 0;
  const type = us.data().type;
  const since = Math.max(seen, ms(us.data().createdAt), Date.now() - 14 * 86400000);
  const snap = await m.getDocs(m.query(m.collection(db, 'broadcasts'), m.where('createdAt', '>', new Date(since)), m.limit(20)));
  let created = 0; let newest = seen;
  for (const d of snap.docs) {
    const b = d.data();
    newest = Math.max(newest, ms(b.createdAt));
    if (!['all', type].includes(b.audience)) continue;
    try {
      await m.setDoc(m.doc(db, 'notifications', uid, 'items', `broadcast_${d.id}`), {
        type: 'system', actorId: uid, refId: d.id, title: b.title, body: b.body, link: b.link || 'notifications.html', read: false, createdAt: m.serverTimestamp()
      });
      created++;
    } catch (e) { /* déjà copiée */ }
  }
  try { localStorage.setItem(key, String(newest || Date.now())); } catch (e) { /* ignoré */ }
  return created;
}
