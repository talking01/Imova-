// Imova — messages.js : page messages.html (liste des conversations, en temps réel)
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import { watchConversations, otherOf, millis, setPinned, setMuted, hideConversation, hideAll, markAllRead, blockUser, unblockUser, getBlockedIds } from './messaging.js';
import { startPresence } from './presence.js';
import { unreadTotal } from './badges.js';
import { setBadge } from './navbar.js';
import { loadAuthors } from './properties.js';
import { getUserDoc } from './users.js';
import { openSheet, openModal } from './modal.js';
import { pageHeader, bindBack, emptyState } from './components.js';
import { isConfigured } from './firebase.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, listTime, explainError } from './utils.js';
import { optimized } from './viewer.js';
import { normalizeText } from './search.js';

const main = document.getElementById('main');
const MAX_PINNED = 5;
let me = null, convs = [], authors = new Map(), blocked = new Set(), query = '', fromCache = false, loaded = false, typingTimer = null;

document.getElementById('pageHeader').innerHTML = pageHeader('Messages', `<button class="icon-btn" id="settingsBtn" aria-label="Réglages des messages">${icon('sliders')}</button>`);
bindBack();

main.innerHTML = `
  <div class="net-note" id="netNote" hidden>${icon('info', 18)}<span>Hors connexion : la liste peut ne pas être à jour.</span></div>
  <label class="sticky-search glass">${icon('search', 20)}<input id="q" type="search" placeholder="Rechercher une conversation" autocomplete="off" aria-label="Rechercher une conversation"></label>
  <div id="list" class="conv-list" aria-live="polite"></div>`;
const listEl = document.getElementById('list');
const input = document.getElementById('q');

const skeleton = () => `<div class="list">${Array.from({ length: 5 }, () => `
  <div class="conv"><div class="conv-main"><span class="sk sk-dot" style="width:52px;height:52px"></span><span class="conv-body"><span class="sk sk-line" style="width:45%"></span><span class="sk sk-line" style="width:75%"></span></span></div></div>`).join('')}</div>`;

const isMine = (c) => c.lastMessage && c.lastMessage.senderId === me.uid;
const muted = (c) => (c.mutedBy || []).includes(me.uid);
const pinned = (c) => (c.pinnedBy || []).includes(me.uid);
const lastAt = (c) => millis(c.lastMessage && c.lastMessage.at) || millis(c.updatedAt);

function visibleConvs() {
  return convs.filter((c) => !(c.hidden || {})[me.uid]).sort((a, b) => (pinned(b) - pinned(a)) || (lastAt(b) - lastAt(a)));
}

function previewHtml(c, other) {
  const lm = c.lastMessage || {};
  const cleared = millis((c.clearedAt || {})[me.uid]);
  if (!lm.type || (cleared && lastAt(c) <= cleared)) return '<em>Discussion effacée</em>';
  const typing = other && millis((c.typing || {})[other]) && Date.now() - millis((c.typing || {})[other]) < 7000;
  if (typing) return '<span class="typing">écrit…</span>';
  const prefix = lm.senderId === me.uid && lm.type === 'text' ? 'Vous : ' : '';
  if (lm.type === 'audio') return `${icon('mic', 15)}<span>Message vocal</span>`;
  if (lm.type === 'image') return `${icon('image', 15)}<span>Photo</span>`;
  if (lm.type === 'file') return `${icon('file', 15)}<span>${esc(lm.text || 'Document')}</span>`;
  if (lm.type === 'deleted') return `${icon('ban', 15)}<em>Message supprimé</em>`;
  return `<span>${esc(prefix + (lm.text || ''))}</span>`;
}

function rowHtml(c) {
  const other = otherOf(c, me.uid);
  const a = authors.get(other) || {};
  const name = a.name || 'Utilisateur';
  const unread = (c.unread || {})[me.uid] || 0;
  const lm = c.lastMessage || {};
  const readByOther = isMine(c) && millis((c.lastRead || {})[other]) >= millis(lm.at) && millis(lm.at) > 0;
  const tick = isMine(c) && lm.type && lm.type !== 'deleted' ? `<span class="tick ${readByOther ? 'read' : ''}" title="${readByOther ? 'Lu' : 'Envoyé'}">${icon(readByOther ? 'checks' : 'check', 16)}</span>` : '';
  const t = lastAt(c);
  return `
    <div class="conv ${unread ? 'unread' : ''}" data-id="${esc(c.id)}">
      <button class="conv-main" data-open="${esc(c.id)}" aria-label="Ouvrir la conversation avec ${esc(name)}${unread ? `, ${unread} non lu${unread > 1 ? 's' : ''}` : ''}">
        <span class="avatar-wrap">
          <span class="avatar">${a.photoUrl ? `<img src="${esc(optimized(a.photoUrl, 120))}" alt="" loading="lazy">` : esc(name.trim().charAt(0).toUpperCase() || '?')}</span>
          ${pinned(c) ? `<span class="pin" title="Épinglée">${icon('pushpin', 12)}</span>` : ''}
        </span>
        <span class="conv-body">
          <span class="conv-top"><span class="conv-name">${esc(name)}${a.verified ? `<span class="verified">${icon('badge', 15)}</span>` : ''}</span><time class="conv-time">${t ? esc(listTime(new Date(t))) : ''}</time></span>
          <span class="conv-bottom">
            ${tick}
            <span class="conv-preview">${blocked.has(other) ? '<span class="blocked-tag">Bloqué</span>' : ''}${previewHtml(c, other)}</span>
            ${muted(c) ? `<span class="muted-ic" title="Sourdine">${icon('bellOff', 15)}</span>` : ''}
            ${unread && !muted(c) ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
            ${unread && muted(c) ? '<span class="unread-badge" style="background:var(--text-muted);color:#fff">•</span>' : ''}
          </span>
        </span>
      </button>
      <button class="icon-btn" data-more="${esc(c.id)}" aria-label="Options de la conversation avec ${esc(name)}">${icon('more')}</button>
    </div>`;
}

function render() {
  if (!loaded) { listEl.innerHTML = skeleton(); return; }
  document.getElementById('netNote').hidden = !(fromCache || !navigator.onLine);
  let list = visibleConvs();
  const q = normalizeText(query.trim());
  if (q) {
    list = list.filter((c) => {
      const a = authors.get(otherOf(c, me.uid)) || {};
      return normalizeText(a.name || '').includes(q) || normalizeText((c.lastMessage && c.lastMessage.text) || '').includes(q);
    });
  }
  if (!list.length) {
    listEl.innerHTML = q
      ? emptyState({ iconName: 'search', title: 'Aucun résultat', text: 'Aucune conversation ne correspond à votre recherche.' })
      : emptyState({ iconName: 'message', title: 'Aucune conversation', text: "Touchez « Discuter » sur une annonce, ou « Message » sur un profil, pour écrire à quelqu'un.", actionLabel: 'Voir les annonces', actionHref: 'index.html' });
  } else {
    listEl.innerHTML = `<div class="list">${list.map(rowHtml).join('')}</div>`;
  }
  hydrateIcons(listEl);
  // une conversation où l'autre « écrit… » se met à jour toute seule dès qu'il s'arrête
  clearTimeout(typingTimer);
  if (list.some((c) => { const o = otherOf(c, me.uid); return millis((c.typing || {})[o]) && Date.now() - millis((c.typing || {})[o]) < 7000; })) typingTimer = setTimeout(render, 1500);
  const n = unreadTotal(convs, me.uid);
  setBadge('messages', n);
  try { sessionStorage.setItem('imova-unread', String(n)); } catch (e) { /* ignoré */ }
}

// ───── Actions
function openRowMenu(id) {
  const c = convs.find((x) => x.id === id);
  if (!c) return;
  const other = otherOf(c, me.uid);
  const a = authors.get(other) || {};
  const isPinned = pinned(c);
  const isBlocked = blocked.has(other);
  openSheet([
    { icon: 'trash', label: 'Supprimer la conversation', danger: true, onClick: () => confirmDelete(c) },
    { icon: 'pushpin', label: isPinned ? 'Désépingler' : 'Épingler', onClick: () => togglePin(c, isPinned) },
    { icon: muted(c) ? 'bell' : 'bellOff', label: muted(c) ? 'Réactiver les notifications' : 'Mode silencieux', onClick: () => run(() => setMuted(c.id, me.uid, !muted(c))) },
    { icon: 'user', label: 'Afficher le profil', onClick: () => { location.href = `profile.html?id=${encodeURIComponent(other)}`; } },
    { icon: 'ban', label: isBlocked ? 'Débloquer' : 'Bloquer', danger: !isBlocked, onClick: () => toggleBlock(other, a.name, isBlocked) }
  ], a.name || 'Conversation');
}

async function run(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); } catch (e) { console.error(e); toast(explainError(e)); }
}

function togglePin(c, isPinned) {
  if (!isPinned && convs.filter(pinned).length >= MAX_PINNED) { toast(`Vous pouvez épingler ${MAX_PINNED} conversations au maximum.`); return; }
  run(() => setPinned(c.id, me.uid, !isPinned), isPinned ? 'Conversation désépinglée' : 'Conversation épinglée');
}

function confirmDelete(c) {
  openModal({
    title: 'Supprimer la conversation ?',
    html: "<p class=\"muted\">Elle disparaîtra de votre liste et les messages seront effacés pour vous. L'autre personne la conserve. Si elle vous écrit à nouveau, la conversation réapparaîtra.</p>",
    actions: [{ label: 'Annuler' }, { label: 'Supprimer', danger: true, onClick: () => run(() => hideConversation(c.id, me.uid), 'Conversation supprimée') }]
  });
}

function toggleBlock(other, name, isBlocked) {
  if (isBlocked) {
    run(async () => { await unblockUser(me.uid, other); blocked.delete(other); render(); }, 'Contact débloqué');
    return;
  }
  openModal({
    title: `Bloquer ${name || 'ce contact'} ?`,
    html: "<p class=\"muted\">Cette personne ne pourra plus vous envoyer de messages. Vous pouvez la débloquer à tout moment depuis cette page.</p>",
    actions: [{ label: 'Annuler' }, { label: 'Bloquer', danger: true, onClick: () => run(async () => { await blockUser(me.uid, other); blocked.add(other); render(); }, 'Contact bloqué') }]
  });
}

async function showBlockedList() {
  let ids = [];
  try { ids = [...(await getBlockedIds(me.uid, { force: true }))]; } catch (e) { toast(explainError(e)); return; }
  if (!ids.length) { openModal({ title: 'Contacts bloqués', html: '<p class="muted">Vous n\'avez bloqué personne.</p>', actions: [{ label: 'Fermer', primary: true }] }); return; }
  const info = await Promise.all(ids.map(async (id) => { try { return [id, await getUserDoc(id)]; } catch (e) { return [id, null]; } }));
  openModal({
    title: 'Contacts bloqués',
    html: `<div class="list">${info.map(([id, u]) => `<div class="recent-row"><span>${esc((u && u.name) || 'Utilisateur')}</span><button class="btn btn-ghost btn-sm" data-unblock="${esc(id)}">Débloquer</button></div>`).join('')}</div>`,
    actions: [{ label: 'Fermer', primary: true }],
    onOpen: (el) => el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-unblock]');
      if (!b) return;
      try { await unblockUser(me.uid, b.dataset.unblock); blocked.delete(b.dataset.unblock); b.closest('.recent-row').remove(); render(); toast('Contact débloqué'); } catch (err) { toast(explainError(err)); }
    })
  });
}

function openSettings() {
  let muteAll = false;
  try { muteAll = localStorage.getItem('imova-mute-all') === '1'; } catch (e) { /* ignoré */ }
  openSheet([
    { icon: muteAll ? 'bell' : 'bellOff', label: muteAll ? 'Désactiver le mode silencieux' : 'Mode silencieux (tout mettre en sourdine)', onClick: () => {
      try { localStorage.setItem('imova-mute-all', muteAll ? '0' : '1'); } catch (e) { /* ignoré */ }
      render();
      toast(muteAll ? 'Notifications réactivées' : 'Mode silencieux activé : plus de pastille de messages');
    } },
    { icon: 'checks', label: 'Tout marquer comme lu', onClick: () => run(() => markAllRead(convs, me.uid), 'Tout est marqué comme lu') },
    { icon: 'ban', label: 'Contacts bloqués', onClick: showBlockedList },
    { icon: 'help', label: 'Aide et assistance', onClick: () => { location.href = 'help.html'; } },
    { icon: 'trash', label: 'Effacer toutes les discussions', danger: true, onClick: () => {
      openModal({
        title: 'Effacer toutes les discussions ?',
        html: "<p class=\"muted\">Toutes vos conversations disparaîtront de votre liste. Les autres personnes les conservent. Cette action est irréversible pour vous.</p>",
        actions: [{ label: 'Annuler' }, { label: 'Tout effacer', danger: true, onClick: () => run(() => hideAll(visibleConvs(), me.uid), 'Discussions effacées') }]
      });
    } }
  ], 'Réglages des messages');
}

// ───── Démarrage
listEl.addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (more) { openRowMenu(more.dataset.more); return; }
  const open = e.target.closest('[data-open]');
  if (open) location.href = `chat.html?id=${encodeURIComponent(open.dataset.open)}`;
});
document.getElementById('settingsBtn').addEventListener('click', () => { if (me) openSettings(); });
input.addEventListener('input', () => { query = input.value; render(); });
window.addEventListener('online', render);
window.addEventListener('offline', render);

async function boot() {
  render();
  if (!isConfigured) { listEl.innerHTML = emptyState({ iconName: 'message', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js pour utiliser la messagerie.' }); hydrateIcons(listEl); return; }
  me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  startPresence(me.uid);
  try { blocked = await getBlockedIds(me.uid); } catch (e) { /* ignoré */ }
  try {
    await watchConversations(me.uid, async (list, meta) => {
      convs = list;
      fromCache = !!meta.fromCache;
      const ids = list.map((c) => otherOf(c, me.uid)).filter(Boolean);
      if (ids.some((id) => !authors.has(id))) {
        const got = await loadAuthors(ids);
        ids.forEach((id) => { if (got.has(id)) authors.set(id, got.get(id)); });
      }
      loaded = true;
      render();
    }, (e) => { console.error(e); loaded = true; listEl.innerHTML = emptyState({ iconName: 'message', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(listEl); });
  } catch (e) {
    console.error(e);
    loaded = true;
    listEl.innerHTML = emptyState({ iconName: 'message', title: 'Chargement impossible', text: explainError(e) });
    hydrateIcons(listEl);
  }
}
boot();
