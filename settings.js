// Imova — settings.js : réglages personnels (privés) et réglages de confidentialité publics.
// Privés (userSettings/UID) : accusés de lecture, « écrit… », notifications. Publics (sur le profil) : statut « en ligne »,
// qui peut m'écrire, apparaître dans la recherche.
import { firestore } from './firebase.js';

export const DEFAULT_PREFS = {
  readReceipts: true,
  typingIndicator: true,
  notif: { messages: true, follows: true, likes: true, reviews: true, followedPosts: true },
  browser: { enabled: false, messages: true, activity: true }
};

export const merge = (p) => ({
  ...DEFAULT_PREFS, ...(p || {}),
  notif: { ...DEFAULT_PREFS.notif, ...((p && p.notif) || {}) },
  browser: { ...DEFAULT_PREFS.browser, ...((p && p.browser) || {}) }
});

const key = (uid) => 'imova-prefs-' + uid;

export async function getPrefs(uid, { force = false } = {}) {
  if (!force) {
    try {
      const c = JSON.parse(sessionStorage.getItem(key(uid)) || 'null');
      if (c && Date.now() - c.t < 5 * 60 * 1000) return merge(c.v);
    } catch (e) { /* ignoré */ }
  }
  let v = {};
  try {
    const fs = await firestore();
    if (fs) { const s = await fs.m.getDoc(fs.m.doc(fs.db, 'userSettings', uid)); if (s.exists()) v = s.data(); }
  } catch (e) { /* réglages par défaut */ }
  try { sessionStorage.setItem(key(uid), JSON.stringify({ t: Date.now(), v })); } catch (e) { /* ignoré */ }
  return merge(v);
}

export async function savePrefs(uid, prefs) {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  const p = merge(prefs);
  await fs.m.setDoc(fs.m.doc(fs.db, 'userSettings', uid), {
    readReceipts: !!p.readReceipts, typingIndicator: !!p.typingIndicator,
    notif: { messages: !!p.notif.messages, follows: !!p.notif.follows, likes: !!p.notif.likes, reviews: !!p.notif.reviews, followedPosts: !!p.notif.followedPosts },
    browser: { enabled: !!p.browser.enabled, messages: !!p.browser.messages, activity: !!p.browser.activity },
    updatedAt: fs.m.serverTimestamp()
  });
  try { sessionStorage.setItem(key(uid), JSON.stringify({ t: Date.now(), v: p })); } catch (e) { /* ignoré */ }
  return p;
}

// Réglages publics (champs du profil) : showStatus, messagesFrom, discoverable
export async function savePublic(uid, fields) {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  await fs.m.updateDoc(fs.m.doc(fs.db, 'users', uid), fields);
}
