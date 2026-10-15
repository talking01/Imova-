// Imova — firebase.js : démarre Firebase à la demande (chargé depuis le CDN officiel de Google).
// Chaque compte enregistré sur l'appareil utilise sa propre « application Firebase » nommée (acc1, acc2...),
// ce qui permet de garder plusieurs sessions ouvertes sans stocker de mot de passe.
import { firebaseConfig, isConfigured } from './firebase-config.js';

const VERSION = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${VERSION}`;

export { isConfigured };
export const SLOT_KEY = 'imova-active-slot';

let slotOverride = null;
let appPromise = null;
let authPromise = null;
let dbPromise = null;

export function activeSlot() {
  if (slotOverride) return slotOverride;
  try { return localStorage.getItem(SLOT_KEY) || 'acc1'; } catch (e) { return 'acc1'; }
}

// À appeler AVANT tout accès à Firebase sur la page (ex. ajout d'un deuxième compte)
export function useSlot(slot) {
  if (appPromise) throw new Error('useSlot doit être appelé avant tout accès à Firebase.');
  slotOverride = slot;
}

function getApp() {
  if (!appPromise) {
    appPromise = import(`${CDN}/firebase-app.js`).then((m) => m.initializeApp(firebaseConfig, activeSlot()));
  }
  return appPromise;
}

// Renvoie { m, instance } pour Authentication, ou null si Firebase n'est pas configuré
export async function auth() {
  if (!isConfigured) return null;
  if (!authPromise) {
    authPromise = (async () => {
      const [app, m] = await Promise.all([getApp(), import(`${CDN}/firebase-auth.js`)]);
      return { m, instance: m.getAuth(app) };
    })();
  }
  return authPromise;
}

// Renvoie { m, db } pour Firestore (avec cache local hors ligne), ou null si non configuré
export async function firestore() {
  if (!isConfigured) return null;
  if (!dbPromise) {
    dbPromise = (async () => {
      const [app, m] = await Promise.all([getApp(), import(`${CDN}/firebase-firestore.js`)]);
      let db;
      try {
        db = m.initializeFirestore(app, {
          localCache: m.persistentLocalCache({ tabManager: m.persistentMultipleTabManager() })
        });
      } catch (e) {
        db = m.getFirestore(app);
      }
      return { m, db };
    })();
  }
  return dbPromise;
}
