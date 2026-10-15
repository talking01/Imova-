// Imova — auth.js : inscription, connexion, déconnexion, session et changement de compte.
import { auth as getAuth, firestore, activeSlot, isConfigured } from './firebase.js';
import { saveAccount, removeAccount, listAccounts, setActive, clearActive, getAccount } from './accounts.js';

let current = null;
let settled = false;
let startPromise = null;
const listeners = new Set();

export const getUser = () => current;
export const isSettled = () => settled;

// Démarre (une seule fois) la restauration de la session et renvoie l'utilisateur ou null
export function whenReady() {
  if (!startPromise) {
    startPromise = (async () => {
      if (!isConfigured) { settled = true; return null; }
      try {
        const a = await getAuth();
        return await new Promise((resolve) => {
          let first = true;
          a.m.onAuthStateChanged(a.instance, (u) => {
            current = u ? { uid: u.uid, email: u.email || '', name: u.displayName || '', photoUrl: u.photoURL || '' } : null;
            settled = true;
            if (current && getAccount(activeSlot())) {
              saveAccount({ slot: activeSlot(), uid: current.uid, email: current.email, name: current.name, photoUrl: current.photoUrl });
            }
            listeners.forEach((cb) => cb(current));
            if (first) { first = false; resolve(current); }
          });
        });
      } catch (e) {
        console.error('Authentification indisponible', e);
        settled = true;
        return null;
      }
    })();
  }
  return startPromise;
}

export function onUser(cb) {
  listeners.add(cb);
  if (settled) cb(current);
  return () => listeners.delete(cb);
}

// Compte enregistré dont la session a expiré (utile pour préremplir la page de connexion)
export function expiredAccount() {
  if (!settled || current) return null;
  return getAccount(activeSlot());
}

function fail(code, cause) {
  const e = new Error(code);
  e.code = code;
  e.cause = cause;
  return e;
}

export async function register({ type, name, email, password }) {
  const a = await getAuth();
  const fs = await firestore();
  if (!a || !fs) throw fail('imova/not-configured');
  const cred = await a.m.createUserWithEmailAndPassword(a.instance, email, password);
  const user = cred.user;
  try {
    await a.m.updateProfile(user, { displayName: name });
    await fs.m.setDoc(fs.m.doc(fs.db, 'users', user.uid), {
      type,
      name,
      nameLower: name.toLowerCase(),
      photoUrl: '',
      coverUrl: '',
      bio: '',
      followersCount: 0,
      postsCount: 0,
      ratingSum: 0,
      ratingCount: 0,
      verified: false,
      createdAt: fs.m.serverTimestamp()
    });
  } catch (e) {
    // Le profil n'a pas pu être créé : on annule le compte pour ne pas laisser un compte à moitié créé
    try { await user.delete(); } catch (e2) { /* ignoré */ }
    throw fail('imova/profile-failed', e);
  }
  saveAccount({ slot: activeSlot(), uid: user.uid, email, name, type, photoUrl: '' });
  setActive(activeSlot());
  return user;
}

export async function login({ email, password }) {
  const a = await getAuth();
  const fs = await firestore();
  if (!a || !fs) throw fail('imova/not-configured');
  const cred = await a.m.signInWithEmailAndPassword(a.instance, email, password);
  const user = cred.user;
  let type = '';
  let name = user.displayName || '';
  let photoUrl = user.photoURL || '';
  try {
    const snap = await fs.m.getDoc(fs.m.doc(fs.db, 'users', user.uid));
    if (snap.exists()) {
      const d = snap.data();
      type = d.type || '';
      name = d.name || name;
      photoUrl = d.photoUrl || photoUrl;
    }
  } catch (e) { /* le profil sera relu plus tard */ }
  saveAccount({ slot: activeSlot(), uid: user.uid, email, name, type, photoUrl });
  setActive(activeSlot());
  return user;
}

export async function resetPassword(email) {
  const a = await getAuth();
  if (!a) throw fail('imova/not-configured');
  await a.m.sendPasswordResetEmail(a.instance, email);
}

// Déconnecte le compte actif, l'oublie sur cet appareil, et passe au compte suivant s'il y en a un
export async function logout() {
  const slot = activeSlot();
  const a = await getAuth();
  if (a) await a.m.signOut(a.instance);
  removeAccount(slot);
  const rest = listAccounts();
  if (rest.length) setActive(rest[0].slot); else clearActive();
  return rest.length > 0;
}

// Met à jour la photo du compte actif (Firebase + liste des comptes de l'appareil)
export async function setMyPhoto(url) {
  const a = await getAuth();
  if (a && a.instance.currentUser) await a.m.updateProfile(a.instance.currentUser, { photoURL: url });
  if (current) current.photoUrl = url;
  saveAccount({ slot: activeSlot(), photoUrl: url });
}

export function switchAccount(slot) {
  setActive(slot);
}

// Messages d'erreur en français
export function authMessage(err) {
  const code = (err && err.code) || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Adresse e-mail ou mot de passe incorrect.';
    case 'auth/email-already-in-use': return 'Un compte existe déjà avec cette adresse e-mail.';
    case 'auth/invalid-email': return "Cette adresse e-mail n'est pas valide.";
    case 'auth/weak-password': return 'Mot de passe trop faible : choisissez-en un plus long.';
    case 'auth/too-many-requests': return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
    case 'auth/network-request-failed': return 'Pas de connexion Internet. Vérifiez votre réseau.';
    case 'auth/user-disabled': return 'Ce compte a été désactivé.';
    case 'auth/operation-not-allowed': return "La connexion par e-mail n'est pas activée dans Firebase (Authentication → Méthode de connexion).";
    case 'imova/not-configured': return "Firebase n'est pas encore configuré (firebase-config.js).";
    case 'imova/profile-failed': return "Le profil n'a pas pu être créé. Vérifiez que les règles Firestore de cette étape sont publiées.";
    default: return 'Une erreur est survenue. Réessayez dans un instant.';
  }
}
