// Imova — account.js : gestion du compte (nom, mot de passe, e-mail, export des données, suppression).
import { auth as getAuth, firestore, activeSlot } from './firebase.js';
import { removeAccount, listAccounts, setActive, clearActive, saveAccount } from './accounts.js';
import { forgetAuthor } from './properties.js';
import { millis } from './messaging.js';

async function authx() {
  const x = await getAuth();
  if (!x || !x.instance.currentUser) { const e = new Error('no-user'); e.code = 'auth/requires-recent-login'; throw e; }
  return x;
}
async function fsx() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

// Redemande le mot de passe (opération sensible)
export async function reauth(password) {
  const x = await authx();
  const u = x.instance.currentUser;
  await x.m.reauthenticateWithCredential(u, x.m.EmailAuthProvider.credential(u.email, password));
  return x;
}

export async function changePassword(current, next) {
  const x = await reauth(current);
  await x.m.updatePassword(x.instance.currentUser, next);
}

// L'adresse change seulement après clic sur le lien envoyé à la NOUVELLE adresse
export async function changeEmail(current, newEmail) {
  const x = await reauth(current);
  await x.m.verifyBeforeUpdateEmail(x.instance.currentUser, newEmail);
}

export const NAME_COOLDOWN_DAYS = 30;
export function nameChangeInfo(u) {
  if (u.verified) return { allowed: false, reason: 'verified' };
  const last = millis(u.nameChangedAt);
  const next = last + NAME_COOLDOWN_DAYS * 86400000;
  if (last && Date.now() < next) return { allowed: false, reason: 'cooldown', next: new Date(next) };
  return { allowed: true };
}

export async function changeName(uid, name) {
  const { m, db } = await fsx();
  await m.updateDoc(m.doc(db, 'users', uid), { name, nameLower: name.toLowerCase(), nameChangedAt: m.serverTimestamp() });
  try {
    const x = await getAuth();
    if (x && x.instance.currentUser) await x.m.updateProfile(x.instance.currentUser, { displayName: name });
  } catch (e) { /* le profil Firestore fait foi */ }
  saveAccount({ slot: activeSlot(), name });
  forgetAuthor(uid);
}

// ───────── Export des données personnelles (JSON)
export async function exportMyData(uid) {
  const { m, db } = await fsx();
  const get = async (path) => { try { const s = await m.getDoc(m.doc(db, ...path)); return s.exists() ? s.data() : null; } catch (e) { return null; } };
  const list = async (col, field, extra = []) => {
    try { return (await m.getDocs(m.query(m.collection(db, col), m.where(field, '==', uid), ...extra, m.limit(500)))).docs.map((d) => ({ id: d.id, ...d.data() })); } catch (e) { return []; }
  };
  const x = await getAuth();
  const email = x && x.instance.currentUser ? x.instance.currentUser.email : '';
  const out = {
    exportedAt: new Date().toISOString(), application: 'Imova', compte: { uid, email },
    profil: await get(['users', uid]), reglages: await get(['userSettings', uid]), demandeBadge: await get(['verificationRequests', uid]),
    annonces: await list('properties', 'authorId'), favoris: await list('favorites', 'userId'), abonnements: await list('follows', 'followerId'),
    avisLaisses: await list('reviews', 'reviewerId'), contactsBloques: await list('blocks', 'blockerId')
  };
  return JSON.parse(JSON.stringify(out, (k, v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v)));
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ───────── Suppression du compte
// Supprime : annonces, favoris, blocages, abonnements (compteurs corrigés), avis laissés, réglages, profil, puis le compte de connexion.
// Reste : messages déjà reçus par les autres personnes, avis et abonnements reçus (affichés comme « Utilisateur »).
export async function deleteMyAccount(uid, password) {
  const x = await reauth(password);
  const { m, db } = await fsx();
  const chunks = async (docs, build) => {
    for (let i = 0; i < docs.length; i += 200) { const batch = m.writeBatch(db); docs.slice(i, i + 200).forEach((d) => build(batch, d)); await batch.commit(); }
  };
  const q = async (col, field, n = 400) => (await m.getDocs(m.query(m.collection(db, col), m.where(field, '==', uid), m.limit(n)))).docs;
  await chunks(await q('properties', 'authorId'), (b, d) => b.delete(d.ref || m.doc(db, 'properties', d.id)));
  await chunks(await q('favorites', 'userId'), (b, d) => b.delete(m.doc(db, 'favorites', d.id)));
  await chunks(await q('blocks', 'blockerId'), (b, d) => b.delete(m.doc(db, 'blocks', d.id)));
  try { await chunks(await q('follows', 'followerId', 200), (b, d) => { const t = d.data().targetId; b.delete(m.doc(db, 'follows', d.id)); b.update(m.doc(db, 'users', t), { followersCount: m.increment(-1) }); }); } catch (e) { /* abonnements restants : sans gravité */ }
  try { await chunks(await q('reviews', 'reviewerId', 100), (b, d) => { const r = d.data(); b.delete(m.doc(db, 'reviews', d.id)); b.update(m.doc(db, 'users', r.targetId), { ratingSum: m.increment(-r.rating), ratingCount: m.increment(-1) }); }); } catch (e) { /* ignoré */ }
  try { await m.deleteDoc(m.doc(db, 'userSettings', uid)); } catch (e) { /* ignoré */ }
  try { await m.deleteDoc(m.doc(db, 'verificationRequests', uid)); } catch (e) { /* seulement possible tant qu'elle est en attente */ }
  await m.deleteDoc(m.doc(db, 'users', uid));
  await x.m.deleteUser(x.instance.currentUser);
  // nettoyage de cet appareil
  removeAccount(activeSlot());
  const rest = listAccounts();
  if (rest.length) setActive(rest[0].slot); else clearActive();
  try {
    Object.keys(localStorage).filter((k) => /^imova-(interests|draft|prefs|ev|notif-seen)/.test(k)).forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch (e) { /* ignoré */ }
}
