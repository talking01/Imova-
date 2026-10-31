// Imova — sw.js : service worker (à la racine du site).
// Rôle : afficher les notifications du navigateur sur Android/ordinateur et ouvrir la bonne page au clic.
// Il ne met RIEN en cache (pas de problème de mise à jour) et n'intercepte aucune requête.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // gestionnaire vide : aucune interception

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(url); } catch (err) { /* ignoré */ } }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
