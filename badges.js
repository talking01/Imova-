// Imova — badges.js : pastilles (messages non lus, notifications) + notifications du navigateur.
// Deux écoutes en direct : mes conversations et mes notifications non lues. Sur toutes les pages avec la barre de navigation
// (et dans la conversation, pour être prévenu des autres messages).
import { whenReady } from './auth.js';
import { watchConversations, otherOf, millis } from './messaging.js';
import { watchUnread } from './notifs.js';
import { getPrefs } from './settings.js';
import { registerSW, showBrowserNotification, permission } from './notify.js';
import { loadAuthors } from './properties.js';
import { isConfigured } from './firebase.js';
import { setBadge } from './navbar.js';

const KEY = 'imova-unread';
const KEY_N = 'imova-notif-unread';
let started = false;

export function unreadTotal(convs, me) {
  let muteAll = false;
  try { muteAll = localStorage.getItem('imova-mute-all') === '1'; } catch (e) { /* ignoré */ }
  if (muteAll) return 0;
  return convs.reduce((sum, c) => {
    if ((c.hidden || {})[me] || (c.mutedBy || []).includes(me)) return sum;
    return sum + ((c.unread || {})[me] || 0);
  }, 0);
}

const preview = (lm) => (!lm ? '' : lm.type === 'audio' ? 'Message vocal' : lm.type === 'image' ? 'Photo' : lm.type === 'file' ? `Document : ${lm.text || ''}` : lm.type === 'deleted' ? 'Message supprimé' : lm.text || '');
const TYPE_PREF = { follow: 'follows', like: 'likes', review: 'reviews' };

export async function initBadges({ currentCid = '' } = {}) {
  if (started) return;
  started = true;
  try { setBadge('messages', Number(sessionStorage.getItem(KEY)) || 0); setBadge('notifications', Number(sessionStorage.getItem(KEY_N)) || 0); } catch (e) { /* ignoré */ }
  if (!isConfigured) return;
  const me = await whenReady();
  if (!me) {
    try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(KEY_N); } catch (e) { /* ignoré */ }
    setBadge('messages', 0); setBadge('notifications', 0);
    return;
  }
  const prefs = await getPrefs(me.uid);
  if (prefs.browser.enabled && permission() === 'granted') registerSW();
  const canPush = () => prefs.browser.enabled && permission() === 'granted' && document.visibilityState === 'hidden';

  // ───── messages
  let known = null; // non-lus par conversation au dernier passage (le premier passage sert de point de départ : aucune alerte)
  try {
    await watchConversations(me.uid, async (convs) => {
      const n = unreadTotal(convs, me.uid);
      setBadge('messages', n);
      try { sessionStorage.setItem(KEY, String(n)); } catch (e) { /* ignoré */ }
      const now = {};
      convs.forEach((c) => { now[c.id] = (c.unread || {})[me.uid] || 0; });
      if (known && prefs.notif.messages && prefs.browser.messages && canPush()) {
        for (const c of convs) {
          if (c.id === currentCid || (c.hidden || {})[me.uid] || (c.mutedBy || []).includes(me.uid)) continue;
          if (now[c.id] > (known[c.id] || 0) && (c.lastMessage || {}).senderId !== me.uid) {
            let name = 'Nouveau message';
            try { const a = await loadAuthors([otherOf(c, me.uid)]); name = (a.get(otherOf(c, me.uid)) || {}).name || name; } catch (e) { /* ignoré */ }
            showBrowserNotification({ title: name, body: preview(c.lastMessage), tag: 'msg_' + c.id, url: `chat.html?id=${encodeURIComponent(c.id)}` });
          }
        }
      }
      known = now;
    }, () => {});
  } catch (e) { /* les pastilles sont facultatives */ }

  // ───── notifications
  const started_at = Date.now();
  const seen = new Set();
  let first = true;
  try {
    await watchUnread(me.uid, async (items) => {
      const shown = items.filter((i) => !TYPE_PREF[i.type] || prefs.notif[TYPE_PREF[i.type]] !== false);
      setBadge('notifications', shown.length);
      try { sessionStorage.setItem(KEY_N, String(shown.length)); } catch (e) { /* ignoré */ }
      for (const i of shown) {
        if (seen.has(i.id)) continue;
        seen.add(i.id);
        if (!first && millis(i.createdAt) >= started_at - 5000 && prefs.browser.activity && canPush()) {
          showBrowserNotification({ title: i.title, body: i.body, tag: 'ntf_' + i.id, url: i.link || 'notifications.html' });
        }
      }
      first = false;
    }, () => {});
  } catch (e) { /* facultatif */ }
}
