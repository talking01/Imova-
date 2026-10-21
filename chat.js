// Imova — chat.js : page chat.html?id=CONVERSATION  ou  chat.html?with=UTILISATEUR[&property=ANNONCE]
// Messages en temps réel : texte, photos, messages vocaux ; modification, suppression, accusés de lecture, « écrit… », « en ligne ».
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import {
  watchConversation, watchMessages, loadOlder, watchUser, sendMessage, markRead, setTyping, editMessage, deleteForMe, deleteForAll,
  setMuted, clearDiscussion, blockUser, unblockUser, getBlockedIds, convId, millis
} from './messaging.js';
import { startPresence, isOnline } from './presence.js';
import { getUserDoc } from './users.js';
import { getProperty } from './properties.js';
import { uploadImage, uploadAudio, uploadDocument, checkImageFile, checkDocFile, cloudinaryReady, formatSize, fileExt, DOC_EXTENSIONS } from './cloudinary.js';
import { canRecord, startRecorder, voiceHtml, bindVoice, stopAllVoices } from './voice.js';
import { openSheet, openModal } from './modal.js';
import { openViewer, optimized } from './viewer.js';
import { openReport } from './reports.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, clean, toast, clock, dayLabel, lastSeenLabel, mmss, param, explainError } from './utils.js';
import { isConfigured } from './firebase.js';
import { SUPPORT_UID } from './app-config.js';
import { emptyState } from './components.js';

const PREDEFINED = 'Salut ! Je suis intéressé par cet article, pouvons-nous en discuter ?';
const $ = (id) => document.getElementById(id);
const head = $('chatHead'), scroll = $('scroll'), msgsEl = $('msgs'), uploadsEl = $('uploads'), composer = $('composer'), jump = $('jump');

const S = {
  me: '', other: '', cid: '', other_user: null, conv: null, live: new Map(), older: new Map(), liveLast: null, olderLast: null,
  hasMore: false, loadingOlder: false, msgWatch: false, blocked: false, pending: null, creating: false, editing: null, rec: null,
  seen: new Set(), firstLoad: true, newCount: 0, atBottom: true, lastTyping: 0, marking: false, prefilled: false, menuOpen: false, cache: new Map()
};
let input, actionBtn;

const ts = (m) => millis(m.createdAt) || Date.now();
const linkify = (t) => esc(t).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
const draftKey = () => 'imova-draft-' + S.cid;

function fatal(title, text) {
  document.body.classList.remove('chat-page');
  document.querySelector('.chat').innerHTML = `<div style="padding:20px">${emptyState({ iconName: 'message', title, text, actionLabel: 'Retour aux messages', actionHref: 'messages.html' })}</div>`;
  hydrateIcons();
}

// ───────────────────────── En-tête et état
function renderHead() {
  const u = S.other_user;
  const name = u.name || 'Utilisateur';
  head.innerHTML = `
    <button class="icon-btn" id="backBtn" aria-label="Retour">${icon('back')}</button>
    <a class="chat-who" href="profile.html?id=${encodeURIComponent(S.other)}" aria-label="Voir le profil de ${esc(name)}">
      <span class="avatar">${u.photoUrl ? `<img src="${esc(optimized(u.photoUrl, 120))}" alt="">` : esc(name.trim().charAt(0).toUpperCase() || '?')}</span>
      <span class="chat-who-text"><strong>${esc(name)}${u.verified ? `<span class="verified">${icon('badge', 16)}</span>` : ''}</strong><span class="chat-status" id="chatStatus"></span></span>
    </a>
    <button class="icon-btn" id="menuBtn" aria-label="Options de la conversation">${icon('more')}</button>`;
  $('backBtn').onclick = () => {
    const same = document.referrer && new URL(document.referrer).origin === location.origin;
    if (same && history.length > 1) history.back(); else location.href = 'messages.html';
  };
  $('menuBtn').onclick = openHeaderMenu;
  document.title = `${name} — Imova`;
  hydrateIcons(head);
  renderStatus();
}

function renderStatus() {
  const el = $('chatStatus');
  if (!el) return;
  const u = S.other_user || {};
  const t = S.conv && (S.conv.typing || {})[S.other];
  let text = '', cls = '';
  if (t && Date.now() - millis(t) < 8000) { text = 'écrit…'; cls = 'typing'; }
  else if (u.showStatus === false) text = '';
  else if (isOnline(u.lastSeen)) { text = 'en ligne'; cls = 'online'; }
  else if (u.lastSeen) text = lastSeenLabel(new Date(millis(u.lastSeen)));
  el.textContent = text;
  el.className = 'chat-status ' + cls;
}

function renderCtx() {
  const bar = $('ctxBar');
  const c = S.pending || (S.conv && S.conv.context);
  if (!c || !c.propertyId) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `${c.image ? `<img src="${esc(optimized(c.image, 120))}" alt="">` : `<span class="avatar" style="border-radius:8px;width:42px;height:42px">${icon('building', 20)}</span>`}
    <span class="ctx-text"><small>${S.pending ? 'Annonce concernée' : 'À propos de'}</small><strong>${esc(c.title || 'Annonce')}</strong></span>
    <a class="btn btn-ghost" href="property.html?id=${encodeURIComponent(c.propertyId)}">Voir l'annonce</a>`;
  hydrateIcons(bar);
}

// ───────────────────────── Messages
function visible(m) {
  if ((m.deletedFor || []).includes(S.me)) return false;
  const cl = S.conv && millis((S.conv.clearedAt || {})[S.me]);
  if (cl && ts(m) <= cl) return false;
  return true;
}

function allMessages() {
  const map = new Map(S.older);
  S.live.forEach((m, id) => map.set(id, m));
  return [...map.values()].filter(visible).sort((a, b) => ts(a) - ts(b) || (a.id < b.id ? -1 : 1));
}

const tickHtml = (status) => status === 'pending' ? `<span class="tick" title="En cours d'envoi">${icon('clock', 13)}</span>`
  : status === 'read' ? `<span class="tick read" title="Lu">${icon('checks', 15)}</span>` : `<span class="tick" title="Envoyé">${icon('check', 14)}</span>`;

function statusOf(m) {
  if (m._pending) return 'pending';
  const lr = S.conv && millis((S.conv.lastRead || {})[S.other]);
  return lr && ts(m) <= lr ? 'read' : 'sent';
}

function buildMessage(m, cont) {
  const mine = m.senderId === S.me;
  const el = document.createElement('div');
  el.className = `msg ${mine ? 'mine' : 'theirs'}${cont ? ' cont' : ''}`;
  el.dataset.id = m.id;
  if (m.deletedForAll) {
    el.innerHTML = `<div class="bubble gone">${icon('ban', 15)}<span>${mine ? 'Vous avez supprimé ce message' : 'Ce message a été supprimé'}</span></div>`;
    return el;
  }
  const meta = `<div class="meta">${m.editedAt ? 'modifié · ' : ''}${clock(new Date(ts(m)))}${mine ? tickHtml(statusOf(m)) : ''}</div>`;
  const ref = m.ref && m.ref.propertyId ? `<a class="ref-card" href="property.html?id=${encodeURIComponent(m.ref.propertyId)}">${m.ref.image ? `<img src="${esc(optimized(m.ref.image, 120))}" alt="">` : ''}<span><small>Annonce</small><strong>${esc(m.ref.title || 'Annonce')}</strong></span></a>` : '';
  if (m.type === 'file') {
    el.innerHTML = `<div class="bubble">${ref}<a class="file-card" href="${esc(m.mediaUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir ${esc(m.fileName || 'le document')}"><span class="file-ic">${icon('file', 26)}<small>${esc(fileExt(m.fileName).toUpperCase().slice(0, 4))}</small></span><span class="file-text"><strong>${esc(m.fileName || 'Document')}</strong><small>${esc(formatSize(m.fileSize))}</small></span><span class="file-dl">${icon('download', 20)}</span></a>${meta}</div>`;
  } else if (m.type === 'image') {
    el.innerHTML = `<div class="bubble img">${ref}<button class="img-msg" data-view="${esc(m.mediaUrl)}" aria-label="Agrandir la photo"><img src="${esc(optimized(m.mediaUrl, 600))}" alt="Photo envoyée" loading="lazy"></button>${meta}</div>`;
  } else if (m.type === 'audio') {
    el.innerHTML = `<div class="bubble">${ref}${voiceHtml(m.duration)}${meta}</div>`;
    bindVoice(el, m.id, m.mediaUrl, m.duration);
  } else {
    el.innerHTML = `<div class="bubble">${ref}<div class="text">${linkify(m.text)}</div>${meta}<button class="bubble-more" data-more aria-label="Options du message">${icon('chevron', 14)}</button></div>`;
  }
  return el;
}

function renderMessages() {
  const list = allMessages();
  const nodes = [];
  const keep = new Set();
  let prev = null, prevDay = '';
  list.forEach((m) => {
    const day = dayLabel(new Date(ts(m)));
    if (day !== prevDay) {
      const k = 'day-' + day;
      let d = S.cache.get(k);
      if (!d) { d = { sig: day, el: Object.assign(document.createElement('div'), { className: 'day-sep', textContent: day }) }; S.cache.set(k, d); }
      keep.add(k); nodes.push(d.el);
      prevDay = day; prev = null;
    }
    const cont = !!prev && prev.senderId === m.senderId && ts(m) - ts(prev) < 180000 && !prev.deletedForAll && !m.deletedForAll;
    const sig = [m.type, m.text, m.mediaUrl, m.deletedForAll ? 1 : 0, millis(m.editedAt), statusOf(m), cont ? 1 : 0, m.senderId === S.me ? 1 : 0].join('|');
    let c = S.cache.get(m.id);
    if (!c || c.sig !== sig) { c = { sig, el: buildMessage(m, cont) }; S.cache.set(m.id, c); }
    keep.add(m.id); nodes.push(c.el);
    prev = m;
  });
  [...S.cache.keys()].forEach((k) => { if (!keep.has(k)) S.cache.delete(k); });
  msgsEl.replaceChildren(...nodes);
  hydrateIcons(msgsEl);
  if (!list.length) {
    msgsEl.innerHTML = `<div style="margin:auto;text-align:center;padding:30px 20px;color:var(--text-muted)">${icon('message', 34)}<p style="margin-top:8px">${S.blocked ? '' : 'Écrivez votre premier message.'}</p></div>`;
    hydrateIcons(msgsEl);
  }
  const older = $('older');
  older.hidden = !S.hasMore;
  older.textContent = S.loadingOlder ? 'Chargement des messages précédents…' : 'Messages précédents';
}

const isNearBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 140;
function scrollToBottom(smooth = false) {
  scroll.scrollTo({ top: scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  S.atBottom = true; S.newCount = 0; paintJump();
}
function paintJump() {
  jump.hidden = S.atBottom;
  const n = $('jumpN');
  n.hidden = !S.newCount;
  n.textContent = String(S.newCount);
  $('jumpLabel').textContent = S.newCount ? 'Nouveaux messages' : 'Aller en bas';
}

function onMessages(items, meta) {
  const stick = S.atBottom;
  S.live = new Map(items.map((m) => [m.id, m]));
  S.liveLast = meta.last;
  if (!S.olderLast) S.hasMore = meta.hasMore;
  const fresh = items.filter((m) => !S.seen.has(m.id) && m.senderId !== S.me && !m._pending);
  items.forEach((m) => S.seen.add(m.id));
  const lastMine = allMessages().slice(-1)[0];
  renderMessages();
  if (S.firstLoad) { S.firstLoad = false; scrollToBottom(); }
  else if (stick || (lastMine && lastMine.senderId === S.me && lastMine._pending)) scrollToBottom(true);
  else if (fresh.length) { S.newCount += fresh.length; paintJump(); }
  if (fresh.length) maybeMarkRead();
}

async function loadMoreOlder() {
  if (S.loadingOlder || !S.hasMore) return;
  const cursor = S.olderLast || S.liveLast;
  if (!cursor) return;
  S.loadingOlder = true;
  $('older').textContent = 'Chargement des messages précédents…';
  const before = scroll.scrollHeight - scroll.scrollTop;
  try {
    const res = await loadOlder(S.cid, cursor);
    res.items.forEach((m) => S.older.set(m.id, m));
    S.olderLast = res.last;
    S.hasMore = res.hasMore;
  } catch (e) { console.error(e); toast(explainError(e)); }
  S.loadingOlder = false;
  renderMessages();
  scroll.scrollTop = scroll.scrollHeight - before;
}

function maybeMarkRead() {
  if (document.visibilityState !== 'visible' || !S.conv || S.marking) return;
  if (((S.conv.unread || {})[S.me] || 0) > 0) {
    S.marking = true;
    markRead(S.cid, S.me).catch(() => {}).finally(() => setTimeout(() => { S.marking = false; }, 800));
  }
}

function onConv(conv) {
  const wasNull = !S.conv;
  S.conv = conv;
  if (conv && !S.msgWatch) {
    S.msgWatch = true;
    watchMessages(S.cid, onMessages, (e) => { console.error(e); toast(explainError(e)); });
  }
  if (!conv && S.firstLoad) { S.firstLoad = false; renderMessages(); }
  if (conv) { S.creating = false; renderMessages(); }
  renderStatus();
  renderCtx();
  applyPrefill();
  maybeMarkRead();
  if (wasNull && conv) paintComposerState();
}

// ───────────────────────── Menus
function openMsgMenu(id) {
  if (S.menuOpen) return;
  const m = S.cache.size && (S.live.get(id) || S.older.get(id));
  if (!m) return;
  const mine = m.senderId === S.me;
  const items = [];
  if (m.deletedForAll) {
    items.push({ icon: 'trash', label: 'Effacer pour moi', onClick: () => delMe(m) });
  } else {
    if (mine && m.type === 'text' && !m._pending) items.push({ icon: 'pencil', label: 'Modifier', onClick: () => startEdit(m) });
    if (m.type === 'text') items.push({ icon: 'copy', label: 'Copier', onClick: () => copyText(m.text) });
    if (!m._pending) items.push({ icon: 'trash', label: mine ? 'Supprimer pour moi' : 'Effacer', onClick: () => delMe(m) });
    if (mine && !m._pending) items.push({ icon: 'trash', label: 'Supprimer pour tout le monde', danger: true, onClick: () => confirmDeleteAll(m) });
  }
  if (!items.length) return;
  S.menuOpen = true;
  openSheet(items);
  setTimeout(() => { S.menuOpen = false; }, 600);
}

async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Message copié'); } catch (e) { toast('Impossible de copier.'); } }
async function delMe(m) { try { await deleteForMe(S.cid, m.id, S.me); } catch (e) { console.error(e); toast(explainError(e)); } }
function confirmDeleteAll(m) {
  openModal({
    title: 'Supprimer pour tout le monde ?',
    html: '<p class="muted">Ce message sera retiré pour vous et pour votre interlocuteur. Une mention « message supprimé » restera visible.</p>',
    actions: [{ label: 'Annuler' }, {
      label: 'Supprimer', danger: true,
      onClick: async () => {
        try {
          const last = allMessages().slice(-1)[0];
          await deleteForAll(S.cid, m.id, { isLast: !!last && last.id === m.id, lastAt: S.conv && S.conv.lastMessage && S.conv.lastMessage.at, me: S.me });
        } catch (e) { console.error(e); toast(explainError(e)); return false; }
      }
    }]
  });
}

function openHeaderMenu() {
  const muted = S.conv && (S.conv.mutedBy || []).includes(S.me);
  openSheet([
    { icon: 'user', label: 'Afficher le profil', onClick: () => { location.href = `profile.html?id=${encodeURIComponent(S.other)}`; } },
    { icon: muted ? 'bell' : 'bellOff', label: muted ? 'Réactiver les notifications' : 'Mode silencieux', onClick: async () => {
      if (!S.conv) { toast("Envoyez d'abord un message."); return; }
      try { await setMuted(S.cid, S.me, !muted); toast(muted ? 'Notifications réactivées' : 'Conversation en sourdine'); } catch (e) { toast(explainError(e)); }
    } },
    { icon: 'trash', label: 'Effacer la discussion', onClick: () => {
      if (!S.conv) { toast('Aucun message à effacer.'); return; }
      openModal({
        title: 'Effacer la discussion ?',
        html: "<p class=\"muted\">Les messages disparaîtront pour vous uniquement. L'autre personne les conserve.</p>",
        actions: [{ label: 'Annuler' }, { label: 'Effacer', danger: true, onClick: async () => { try { await clearDiscussion(S.cid, S.me); toast('Discussion effacée'); } catch (e) { toast(explainError(e)); return false; } } }]
      });
    } },
    { icon: 'flag', label: 'Signaler', danger: true, onClick: () => openReport({ targetType: 'conversation', targetId: S.cid, targetUserId: S.other, evidence: evidenceOf() }) },
    { icon: 'ban', label: S.blocked ? 'Débloquer' : 'Bloquer', danger: !S.blocked, onClick: () => toggleBlock() }
  ]);
}

// Derniers messages visibles, joints à un signalement
function evidenceOf() {
  return allMessages().filter((m) => !m.deletedForAll).slice(-10).map((m) => ({
    from: m.senderId === S.me ? 'Auteur du signalement' : (S.other_user.name || 'Autre personne'),
    text: m.type === 'text' ? m.text : m.type === 'file' ? `[Document] ${m.fileName || ''}` : m.type === 'image' ? '[Photo]' : '[Message vocal]',
    at: new Date(ts(m)).toISOString()
  }));
}

function toggleBlock() {
  const name = S.other_user.name || 'ce contact';
  if (S.blocked) { doUnblock(); return; }
  openModal({
    title: `Bloquer ${name} ?`,
    html: '<p class="muted">Cette personne ne pourra plus vous envoyer de messages. Vous pourrez la débloquer à tout moment.</p>',
    actions: [{ label: 'Annuler' }, { label: 'Bloquer', danger: true, onClick: async () => { try { await blockUser(S.me, S.other); S.blocked = true; paintComposerState(); renderMessages(); toast('Contact bloqué'); } catch (e) { toast(explainError(e)); return false; } } }]
  });
}
async function doUnblock() {
  try { await unblockUser(S.me, S.other); S.blocked = false; paintComposerState(); toast('Contact débloqué'); } catch (e) { toast(explainError(e)); }
}

// ───────────────────────── Zone de saisie
function renderComposer() {
  composer.innerHTML = `
    <div class="banner-row" id="editBanner" hidden>${icon('pencil', 18)}<span class="grow" id="editText"></span><button class="icon-btn" id="editCancel" aria-label="Annuler la modification">${icon('close', 18)}</button></div>
    <div class="blocked-box" id="blockedBox" hidden><span>Vous avez bloqué ce contact.</span><button class="btn btn-ghost" id="unblockBtn">Débloquer</button></div>
    <div class="row" id="normalRow">
      <div class="input-pill">
        <textarea id="input" rows="1" maxlength="2000" placeholder="Message" enterkeyhint="send" aria-label="Votre message"></textarea>
        <button class="icon-btn" id="attachBtn" aria-label="Joindre une photo">${icon('paperclip', 22)}</button>
      </div>
      <button class="round-btn" id="actionBtn" aria-label="Enregistrer un message vocal">${icon('mic', 22)}</button>
    </div>
    <div class="rec-row" id="recRow" hidden>
      <button class="icon-btn" id="recCancel" aria-label="Annuler l'enregistrement">${icon('trash', 22)}</button>
      <div class="rec-info"><span class="rec-dot"></span><span class="rec-time" id="recTime">0:00</span><span class="rec-hint">Enregistrement…</span></div>
      <button class="round-btn" id="recSend" aria-label="Envoyer le message vocal">${icon('send', 22)}</button>
    </div>`;
  input = $('input');
  actionBtn = $('actionBtn');
  const saved = (() => { try { return localStorage.getItem(draftKey()) || ''; } catch (e) { return ''; } })();
  if (saved) { input.value = saved; grow(); }
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); submit(); }
  });
  actionBtn.addEventListener('click', () => { if (clean(input.value, 2000)) submit(); else startRec(); });
  $('attachBtn').addEventListener('click', attach);
  $('editCancel').addEventListener('click', cancelEdit);
  $('unblockBtn').addEventListener('click', doUnblock);
  $('recCancel').addEventListener('click', () => finishRec(false));
  $('recSend').addEventListener('click', () => finishRec(true));
  hydrateIcons(composer);
  updateAction();
  paintComposerState();
}

function paintComposerState() {
  $('blockedBox').hidden = !S.blocked;
  $('normalRow').hidden = S.blocked || !!S.rec;
  $('recRow').hidden = !S.rec;
  $('editBanner').hidden = !S.editing;
}

function grow() {
  input.style.height = 'auto';
  input.style.height = Math.min(120, input.scrollHeight) + 'px';
}

function updateAction() {
  const hasText = !!clean(input.value, 2000);
  actionBtn.innerHTML = icon(S.editing ? 'check' : hasText ? 'send' : 'mic', 22);
  actionBtn.setAttribute('aria-label', S.editing ? 'Enregistrer la modification' : hasText ? 'Envoyer' : 'Enregistrer un message vocal');
}

function onInput() {
  grow();
  updateAction();
  if (!S.editing) { try { localStorage.setItem(draftKey(), input.value); } catch (e) { /* ignoré */ } }
  if (clean(input.value, 2000) && S.conv && !S.editing && Date.now() - S.lastTyping > 4000) { S.lastTyping = Date.now(); setTyping(S.cid, S.me).catch(() => {}); }
}

// Message prédéfini quand on arrive depuis une annonce (« Discuter »)
function applyPrefill() {
  if (S.prefilled || !S.pending) return;
  S.prefilled = true;
  const same = S.conv && S.conv.context && S.conv.context.propertyId === S.pending.propertyId;
  if (same) { S.pending = null; renderCtx(); return; }
  if (!clean(input.value, 2000)) { input.value = PREDEFINED; grow(); updateAction(); }
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function onSendError(e, text) {
  console.error(e);
  S.creating = false;
  if (e && e.code === 'imova/rate') toast('Doucement : trop de messages envoyés. Patientez quelques secondes.');
  else if (e && e.code === 'imova/rate-day') toast('Limite quotidienne de nouvelles conversations atteinte. Réessayez demain.');
  else if (e && e.code === 'permission-denied') toast("Message non envoyé. Ce contact n'est peut-être plus joignable.");
  else toast(explainError(e));
  if (text && !clean(input.value, 2000)) { input.value = text; grow(); updateAction(); }
}

function send(args) {
  const known = !!S.conv || S.creating;
  if (!known) S.creating = true;
  return sendMessage({ me: S.me, other: S.other, exists: known, ...args });
}

async function submit() {
  const text = clean(input.value, 2000);
  if (!text) return;
  if (S.editing) { await saveEdit(text); return; }
  if (S.blocked) { toast('Débloquez ce contact pour lui écrire.'); return; }
  input.value = '';
  grow();
  updateAction();
  try { localStorage.removeItem(draftKey()); } catch (e) { /* ignoré */ }
  const args = { type: 'text', text };
  if (S.pending) { args.ref = { propertyId: S.pending.propertyId, title: S.pending.title || '', image: S.pending.image || '' }; args.context = args.ref; S.pending = null; renderCtx(); }
  S.atBottom = true;
  send(args).catch((e) => onSendError(e, text));
}

function startEdit(m) {
  S.editing = m;
  $('editText').textContent = m.text;
  input.value = m.text;
  grow();
  updateAction();
  paintComposerState();
  input.focus();
}
function cancelEdit() {
  S.editing = null;
  input.value = '';
  grow();
  updateAction();
  paintComposerState();
}
async function saveEdit(text) {
  const m = S.editing;
  if (text === m.text) { cancelEdit(); return; }
  try { await editMessage(S.cid, m.id, text); cancelEdit(); } catch (e) { console.error(e); toast(explainError(e)); }
}

// ───────────────────────── Photos et messages vocaux
function uploading(label) {
  const el = document.createElement('div');
  el.className = 'msg mine uploading';
  el.innerHTML = `<div class="bubble"><span>${esc(label)}</span><div class="up-track"><div class="up-fill"></div></div></div>`;
  uploadsEl.appendChild(el);
  scrollToBottom(true);
  return { set: (f) => { el.querySelector('.up-fill').style.width = `${Math.round(f * 100)}%`; }, remove: () => el.remove() };
}

function pickImages() {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/jpeg,image/png,image/webp'; i.multiple = true;
    i.onchange = () => resolve([...i.files]);
    i.oncancel = () => resolve([]);
    i.click();
  });
}

// Le trombone propose : Photo ou Document (PDF, Word, Excel, PowerPoint, texte...)
function attach() {
  if (S.blocked) { toast('Débloquez ce contact pour lui écrire.'); return; }
  if (!cloudinaryReady) { toast("Cloudinary n'est pas encore configuré (voir GUIDE-FIREBASE.md)."); return; }
  openSheet([
    { icon: 'image', label: 'Photo', onClick: attachPhotos },
    { icon: 'file', label: 'Document (PDF, Word, Excel...)', onClick: attachDocument }
  ], 'Joindre');
}

function pickDocument() {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = DOC_EXTENSIONS.map((e) => '.' + e).join(',');
    i.onchange = () => resolve(i.files[0] || null);
    i.oncancel = () => resolve(null);
    i.click();
  });
}

async function attachDocument() {
  const f = await pickDocument();
  if (!f) return;
  const err = checkDocFile(f);
  if (err) { toast(err); return; }
  const up = uploading(`Envoi de ${f.name}…`);
  try {
    const res = await uploadDocument(f, { onProgress: up.set });
    up.remove();
    await send({ type: 'file', mediaUrl: res.url, fileName: f.name, fileSize: f.size });
  } catch (e) {
    up.remove();
    console.error(e);
    toast(e && e.code ? explainError(e) : "L'envoi du document a échoué. Vérifiez votre connexion et le preset Cloudinary (formats de documents).");
  }
}

async function attachPhotos() {
  const files = (await pickImages()).slice(0, 5);
  await sendPhotos(files);
}

async function sendPhotos(files) {
  for (const f of files) {
    const err = checkImageFile(f);
    if (err) { toast(err); continue; }
    const up = uploading('Envoi de la photo…');
    try {
      const res = await uploadImage(f, { maxSide: 1600, onProgress: up.set });
      up.remove();
      await send({ type: 'image', mediaUrl: res.url });
    } catch (e) {
      up.remove();
      console.error(e);
      toast(e && e.code ? explainError(e) : "L'envoi de la photo a échoué. Vérifiez votre connexion.");
    }
  }
}

async function startRec() {
  if (S.blocked) { toast('Débloquez ce contact pour lui écrire.'); return; }
  if (!canRecord()) { toast("Votre navigateur ne permet pas l'enregistrement vocal."); return; }
  if (!cloudinaryReady) { toast("Cloudinary n'est pas encore configuré (voir GUIDE-FIREBASE.md)."); return; }
  try {
    stopAllVoices();
    S.rec = await startRecorder({ onTick: (s) => { $('recTime').textContent = mmss(s); }, onLimit: () => { toast('Durée maximale atteinte (5 minutes).'); finishRec(true); } });
    $('recTime').textContent = '0:00';
    paintComposerState();
  } catch (e) {
    S.rec = null;
    toast(e && e.name === 'NotAllowedError' ? 'Autorisez le micro dans votre navigateur pour envoyer un message vocal.' : 'Micro indisponible.');
  }
}

async function finishRec(sendIt) {
  const r = S.rec;
  if (!r) return;
  S.rec = null;
  paintComposerState();
  if (!sendIt) { r.cancel(); return; }
  const { blob, duration } = await r.stop();
  if (duration < 1) { toast('Message vocal trop court.'); return; }
  const up = uploading('Envoi du message vocal…');
  try {
    const res = await uploadAudio(blob, { onProgress: up.set });
    up.remove();
    await send({ type: 'audio', mediaUrl: res.url, duration });
  } catch (e) {
    up.remove();
    console.error(e);
    toast(e && e.code ? explainError(e) : "L'envoi du message vocal a échoué. Vérifiez votre connexion.");
  }
}

// ───────────────────────── Démarrage
function bindUi() {
  scroll.addEventListener('scroll', () => {
    S.atBottom = isNearBottom();
    if (S.atBottom) S.newCount = 0;
    paintJump();
    if (scroll.scrollTop < 120) loadMoreOlder();
  }, { passive: true });
  jump.addEventListener('click', () => scrollToBottom(true));
  $('older').addEventListener('click', loadMoreOlder);
  msgsEl.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { openViewer([{ url: v.dataset.view, type: 'image' }], 0); return; }
    const more = e.target.closest('[data-more]');
    if (more) openMsgMenu(more.closest('.msg').dataset.id);
  });
  let lp = null;
  msgsEl.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.bubble');
    if (!b || e.target.closest('a,button,.vp-bar')) return;
    const id = b.closest('.msg').dataset.id;
    lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { lp = null; if (navigator.vibrate) navigator.vibrate(12); openMsgMenu(id); }, 450) };
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => msgsEl.addEventListener(ev, () => { if (lp) { clearTimeout(lp.t); lp = null; } }));
  msgsEl.addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; } });
  msgsEl.addEventListener('contextmenu', (e) => { const b = e.target.closest('.bubble'); if (b) { e.preventDefault(); openMsgMenu(b.closest('.msg').dataset.id); } });
  const net = () => { $('netBar').hidden = navigator.onLine; };
  window.addEventListener('online', net);
  window.addEventListener('offline', net);
  net();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') maybeMarkRead(); });
  window.addEventListener('beforeunload', () => { if (S.rec) S.rec.cancel(); stopAllVoices(); });
  setInterval(renderStatus, 3000);
}

async function init() {
  if (!isConfigured) { fatal('Firebase non configuré', 'Remplissez firebase-config.js pour utiliser la messagerie.'); return; }
  const me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  S.me = me.uid;
  const id = param('id');
  const other = id ? id.split('_').find((u) => u && u !== S.me) : param('with');
  if (!other || other === S.me) { location.replace('messages.html'); return; }
  S.other = other;
  S.cid = convId(S.me, other);
  try { S.other_user = await getUserDoc(other); } catch (e) { fatal('Chargement impossible', explainError(e)); return; }
  if (!S.other_user) { fatal('Profil introuvable', "Cette personne n'existe pas ou n'est plus disponible."); return; }
  try { S.blocked = (await getBlockedIds(S.me)).has(other); } catch (e) { S.blocked = false; }

  const pid = param('property');
  if (pid) {
    try {
      const p = await getProperty(pid);
      if (p && p.authorId === other) S.pending = { propertyId: p.id, title: p.title || '', image: (p.media.find((x) => x.type === 'image') || {}).url || '' };
    } catch (e) { /* le contexte d'annonce est facultatif */ }
  }
  renderHead();
  renderComposer();
  renderCtx();
  bindUi();
  startPresence(S.me);
  watchUser(other, (u) => { if (u) { S.other_user = { ...S.other_user, ...u }; renderStatus(); } }).catch(() => {});
  await watchConversation(S.cid, onConv, (e) => { console.error(e); toast(explainError(e)); });

  // Depuis « Aide et assistance » : le texte déjà saisi par l'utilisateur est envoyé tout de suite
  try {
    const h = JSON.parse(sessionStorage.getItem('imova-handoff') || 'null');
    if (h && h.to === other && h.text && param('support')) {
      sessionStorage.removeItem('imova-handoff');
      send({ type: 'text', text: clean(h.text, 2000) }).catch((e) => onSendError(e, h.text));
    }
  } catch (e) { /* ignoré */ }
}

init();
