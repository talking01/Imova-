// Imova — badges.js : pastille de messages non lus sur l'onglet Messages (toutes les pages avec la barre de navigation).
// Une seule écoute en direct de mes conversations ; le dernier total est gardé pour s'afficher tout de suite sur la page suivante.
import { whenReady } from './auth.js';
import { watchConversations } from './messaging.js';
import { isConfigured } from './firebase.js';
import { setBadge } from './navbar.js';

const KEY = 'imova-unread';

export function unreadTotal(convs, me) {
  let muteAll = false;
  try { muteAll = localStorage.getItem('imova-mute-all') === '1'; } catch (e) { /* ignoré */ }
  if (muteAll) return 0;
  return convs.reduce((sum, c) => {
    if ((c.hidden || {})[me] || (c.mutedBy || []).includes(me)) return sum;
    return sum + ((c.unread || {})[me] || 0);
  }, 0);
}

export async function initBadges() {
  try { setBadge('messages', Number(sessionStorage.getItem(KEY)) || 0); } catch (e) { /* ignoré */ }
  if (!isConfigured) return;
  const me = await whenReady();
  if (!me) { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignoré */ } setBadge('messages', 0); return; }
  try {
    await watchConversations(me.uid, (convs) => {
      const n = unreadTotal(convs, me.uid);
      setBadge('messages', n);
      try { sessionStorage.setItem(KEY, String(n)); } catch (e) { /* ignoré */ }
    }, () => {});
  } catch (e) { /* les pastilles sont facultatives */ }
}
