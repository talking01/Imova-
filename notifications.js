// Imova — notifications.js : page notifications.html
// Trois sources : messages non lus et nouvelles annonces des profils suivis (calculés ici), et les notifications enregistrées
// (abonné, J'aime, avis, modération, badge). Les préférences (page Confidentialité) filtrent ce qui s'affiche.
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import { watchConversations, otherOf, millis } from './messaging.js';
import { listNotifications, markRead, markAllRead, removeNotifications } from './notifs.js';
import { listFollowing } from './follows.js';
import { fetchFromAuthors, loadAuthors } from './properties.js';
import { getPrefs, savePrefs } from './settings.js';
import { supported, permission, requestPermission, registerSW, showBrowserNotification } from './notify.js';
import { openModal } from './modal.js';
import { pageHeader, bindBack, emptyState, skeletonCard, verifiedMark } from './components.js';
import { isConfigured } from './firebase.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, timeAgo, explainError } from './utils.js';

const main = document.getElementById('main');
document.getElementById('pageHeader').innerHTML = pageHeader('Notifications', `<a class="icon-btn" href="privacy.html#notifications" aria-label="Réglages des notifications">${icon('sliders')}</a>`);
bindBack();

let me, prefs, convs = [], stored = [], cursor = null, doneStored = false, posts = [], authors = new Map(), filter = 'all', loadedPosts = false;
const seenKey = () => 'imova-notif-seen-' + me.uid;
let seenAt = 0;

const IC = { message: 'message', follow: 'user', like: 'thumb', review: 'star', moderation: 'shield', verification: 'badge', system: 'info', post: 'building' };
const PREF_OF = { follow: 'follows', like: 'likes', review: 'reviews' };
const nameOf = (id) => (authors.get(id) || {}).name || 'Utilisateur';

function preview(lm) {
  if (!lm) return '';
  return lm.type === 'audio' ? 'Message vocal' : lm.type === 'image' ? 'Photo' : lm.type === 'file' ? `Document : ${lm.text || ''}` : lm.type === 'deleted' ? 'Message supprimé' : lm.text || '';
}

function allItems() {
  const out = [];
  if (prefs.notif.messages) {
    convs.forEach((c) => {
      const n = (c.unread || {})[me.uid] || 0;
      if (!n || (c.hidden || {})[me.uid] || (c.mutedBy || []).includes(me.uid)) return;
      const o = otherOf(c, me.uid);
      out.push({ key: 'c' + c.id, kind: 'message', unread: true, time: millis(c.lastMessage && c.lastMessage.at) || millis(c.updatedAt), title: nameOf(o), verified: (authors.get(o) || {}).verified, body: `${n > 1 ? n + ' nouveaux messages : ' : ''}${preview(c.lastMessage)}`, link: `chat.html?id=${encodeURIComponent(c.id)}` });
    });
  }
  if (prefs.notif.followedPosts) {
    posts.forEach((p) => out.push({ key: 'p' + p.id, kind: 'post', unread: millis(p.createdAt) > seenAt, time: millis(p.createdAt), title: `${nameOf(p.authorId)} a publié une annonce`, verified: (authors.get(p.authorId) || {}).verified, body: p.title, link: `property.html?id=${encodeURIComponent(p.id)}` }));
  }
  stored.forEach((n) => {
    const pref = PREF_OF[n.type];
    if (pref && prefs.notif[pref] === false) return;
    out.push({ key: 'n' + n.id, kind: n.type, stored: n.id, unread: !n.read, time: millis(n.createdAt), title: n.title, verified: (authors.get(n.actorId) || {}).verified, body: n.body, link: n.link || 'notifications.html' });
  });
  return out.sort((a, b) => b.time - a.time);
}

function render() {
  let items = allItems();
  if (filter === 'unread') items = items.filter((i) => i.unread);
  const unreadStored = stored.filter((n) => !n.read);
  const banner = supported() && permission() === 'default' && !prefs.browser.enabled
    ? `<div class="banner-enable">${icon('bell', 22)}<span class="txt"><strong>Notifications du navigateur</strong><br>Soyez prévenu des nouveaux messages et de l'activité, même quand Imova est en arrière-plan.</span><button class="btn btn-primary btn-sm" id="enableBtn">Activer</button></div>` : '';
  main.innerHTML = `
    ${banner}
    <div class="ntf-filters" role="tablist"><button role="tab" data-f="all" aria-selected="${filter === 'all'}">Toutes</button><button role="tab" data-f="unread" aria-selected="${filter === 'unread'}">Non lues</button>
      <span style="flex:1"></span>
      ${unreadStored.length || posts.some((p) => millis(p.createdAt) > seenAt) ? `<button class="link-btn" id="readAll">Tout marquer comme lu</button>` : ''}</div>
    ${items.length ? `<div class="card" role="list">${items.map((i) => `
      <div class="ntf ${i.unread ? 'unread' : ''}" role="listitem" data-key="${esc(i.key)}">
        <a class="ntf-ic ${esc(i.kind)}" href="${esc(i.link)}" tabindex="-1" aria-hidden="true">${icon(IC[i.kind] || 'bell', 20)}</a>
        <a class="ntf-body" href="${esc(i.link)}"><strong>${esc(i.title)}${verifiedMark(i.verified, 14)}</strong>${i.body ? `<span>${esc(i.body)}</span>` : ''}</a>
        <span class="ntf-time">${esc(i.time ? timeAgo(new Date(i.time)) : '')}</span>
        ${i.unread ? '<span class="ntf-dot" aria-label="Non lue"></span>' : ''}
        ${i.stored ? `<button class="ntf-x" data-del="${esc(i.stored)}" aria-label="Supprimer cette notification">${icon('close', 16)}</button>` : ''}
      </div>`).join('')}</div>
      ${!doneStored ? '<div class="more-wrap"><button class="btn btn-ghost" id="moreBtn">Voir plus</button></div>' : ''}
      ${stored.length ? '<div class="more-wrap"><button class="link-btn" id="clearAll" style="color:var(--danger)">Effacer les notifications enregistrées</button></div>' : ''}`
      : emptyState({ iconName: 'bell', title: filter === 'unread' ? 'Tout est lu' : 'Aucune notification', text: filter === 'unread' ? 'Vous êtes à jour.' : "Les nouveaux abonnés, J'aime, avis, messages et annonces de vos abonnements apparaîtront ici." })}`;
  hydrateIcons(main);
}

async function loadStored(more = false) {
  const res = await listNotifications(me.uid, { after: more ? cursor : null });
  stored = more ? stored.concat(res.items) : res.items;
  cursor = res.cursor; doneStored = res.done;
  const ids = stored.map((n) => n.actorId).filter(Boolean);
  const a = await loadAuthors(ids);
  a.forEach((v, k) => authors.set(k, v));
}

async function loadPosts() {
  try {
    const following = await listFollowing(me.uid);
    if (following.length) {
      const found = await fetchFromAuthors(following.slice(0, 10), 10);
      posts = found.filter((p) => millis(p.createdAt) > Date.now() - 14 * 86400000);
      const a = await loadAuthors(posts.map((p) => p.authorId));
      a.forEach((v, k) => authors.set(k, v));
    }
  } catch (e) { /* facultatif */ }
  loadedPosts = true;
}

main.addEventListener('click', async (e) => {
  const f = e.target.closest('[data-f]');
  if (f) { filter = f.dataset.f; render(); return; }
  if (e.target.closest('#moreBtn')) { try { await loadStored(true); render(); } catch (x) { toast(explainError(x)); } return; }
  if (e.target.closest('#enableBtn')) {
    const r = await requestPermission();
    if (r === 'granted') {
      prefs.browser.enabled = true;
      try { prefs = await savePrefs(me.uid, prefs); } catch (x) { /* réglage local */ }
      await registerSW();
      showBrowserNotification({ title: 'Notifications activées', body: 'Vous serez prévenu des nouveaux messages et de l\'activité.', tag: 'imova-test', url: 'notifications.html' });
      toast('Notifications du navigateur activées');
    } else if (r === 'denied') toast('Notifications refusées : modifiez-les dans les réglages du navigateur.');
    render();
    return;
  }
  if (e.target.closest('#readAll')) {
    try { await markAllRead(me.uid, stored.filter((n) => !n.read).map((n) => n.id)); stored.forEach((n) => { n.read = true; }); seenAt = Date.now(); localStorage.setItem(seenKey(), String(seenAt)); render(); toast('Tout est marqué comme lu'); } catch (x) { toast(explainError(x)); }
    return;
  }
  if (e.target.closest('#clearAll')) {
    openModal({ title: 'Effacer les notifications ?', html: '<p class="muted">Les notifications enregistrées seront supprimées. Les messages ne sont pas concernés.</p>', actions: [{ label: 'Annuler' }, { label: 'Effacer', danger: true, onClick: async () => { try { await removeNotifications(me.uid, stored.map((n) => n.id)); stored = []; render(); toast('Notifications effacées'); } catch (x) { toast(explainError(x)); return false; } } }] });
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) { e.preventDefault(); const id = del.dataset.del; try { await removeNotifications(me.uid, [id]); stored = stored.filter((n) => n.id !== id); render(); } catch (x) { toast(explainError(x)); } return; }
  // toucher une notification enregistrée la marque comme lue
  const row = e.target.closest('.ntf');
  if (row && row.dataset.key.startsWith('n')) {
    const id = row.dataset.key.slice(1);
    const n = stored.find((x) => x.id === id);
    if (n && !n.read) { n.read = true; markRead(me.uid, id).catch(() => {}); }
  }
});

(async () => {
  if (!isConfigured) { main.innerHTML = emptyState({ iconName: 'bell', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js.' }); hydrateIcons(); return; }
  main.innerHTML = skeletonCard();
  me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  prefs = await getPrefs(me.uid);
  try { seenAt = Number(localStorage.getItem(seenKey())) || Date.now() - 7 * 86400000; } catch (e) { seenAt = Date.now() - 7 * 86400000; }
  try { await loadStored(); } catch (e) { console.error(e); main.innerHTML = emptyState({ iconName: 'bell', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(); return; }
  await loadPosts();
  render();
  // les messages non lus arrivent en direct
  try {
    await watchConversations(me.uid, async (list) => {
      convs = list;
      const ids = list.map((c) => otherOf(c, me.uid));
      if (ids.some((i) => !authors.has(i))) { const a = await loadAuthors(ids); a.forEach((v, k) => authors.set(k, v)); }
      render();
    }, () => {});
  } catch (e) { /* facultatif */ }
  // les annonces des abonnements seront « lues » à la prochaine visite
  setTimeout(() => { try { localStorage.setItem(seenKey(), String(Date.now())); } catch (e) { /* ignoré */ } }, 4000);
})();
