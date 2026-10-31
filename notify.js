// Imova — notify.js : notifications du navigateur (messages, activité).
// Limite à connaître : elles s'affichent tant qu'Imova est ouverte (même en arrière-plan ou réduite). Application fermée,
// il faudrait un serveur d'envoi (Firebase Cloud Messaging + fonctions, offre payante) : voir GUIDE-FIREBASE.md.
export const supported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const permission = () => (supported() ? Notification.permission : 'unsupported');

let regPromise = null;
export function registerSW() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!regPromise) regPromise = navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).catch(() => null);
  return regPromise;
}

// À appeler depuis un clic de l'utilisateur
export async function requestPermission() {
  if (!supported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch (e) { return Notification.permission; }
}

export async function showBrowserNotification({ title, body = '', tag = '', url = 'index.html' }) {
  if (!supported() || Notification.permission !== 'granted') return false;
  const reg = await registerSW();
  if (!reg) return false;
  try {
    await reg.showNotification(title, {
      body, tag: tag || undefined, icon: 'icon-192.png', badge: 'icon-192.png', lang: 'fr',
      data: { url: new URL(url, document.baseURI).href }
    });
    return true;
  } catch (e) { return false; }
}
