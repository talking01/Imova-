// Imova — feed.js : le fil d'annonces de index.html (défilement continu)
// Un seul fil : les annonces de tous les utilisateurs, classées selon vos centres d'intérêt (et par fraîcheur au début).
import { fetchProperties, loadAuthors } from './properties.js';
import { buildForYou, suggestProfiles } from './recommend.js';
import { getLikedSet, getFavoriteIds } from './likes.js';
import { markSeen } from './interests.js';
import { follow } from './follows.js';
import { whenReady } from './auth.js';
import { requireAuth } from './guards.js';
import { createPostCard } from './postcard.js';
import { skeletonCard, emptyState } from './components.js';
import { isConfigured } from './firebase.js';
import { hydrateIcons, icon } from './icons.js';
import { esc, toast, explainError } from './utils.js';
import { optimized } from './viewer.js';
import { getSettings } from './verification.js';

const feed = document.getElementById('feed');
const end = document.getElementById('feedEnd');
const notice = document.getElementById('setupNotice');
const cacheNotice = document.getElementById('cacheNotice');
let me = null;
let run = 0;                    // change à chaque redémarrage du fil : les chargements anciens sont abandonnés
let loading = false, done = false, first = true;
let ranked = [], idx = 0, recentCursor = null, recentDone = false, seen = new Set(); // fil « Pour vous »
const states = { liked: new Set(), faved: new Set() };
let favLoaded = false;

async function loadStates(ids) {
  if (!me) return;
  try {
    if (!favLoaded) { (await getFavoriteIds(me.uid)).forEach((id) => states.faved.add(id)); favLoaded = true; }
  } catch (e) { favLoaded = true; }
  try { (await getLikedSet(me.uid, ids)).forEach((id) => states.liked.add(id)); } catch (e) { /* ignoré */ }
}

async function appendCards(entries, my) {
  const ids = entries.map((e) => e.p.id);
  const [authors] = await Promise.all([loadAuthors(entries.map((e) => e.p.authorId)), loadStates(ids)]);
  if (my !== run) return;
  entries.forEach((e) => feed.appendChild(createPostCard(e.p, authors.get(e.p.authorId), { state: states, reason: e.reason })));
  markSeen(ids);
  hydrateIcons(feed);
}

function showCache(on) { cacheNotice.hidden = !on; }

async function nextBatch() {
  if (first) {
    const built = await buildForYou({ me });
    ranked = built.ranked.map((r) => ({ p: r.p, reason: r.reason }));
    ranked.forEach((r) => seen.add(r.p.id));
    recentCursor = built.recentCursor; recentDone = built.recentDone;
    showCache(built.fromCache);
  }
  const batch = ranked.slice(idx, idx + 8);
  idx += batch.length;
  if (batch.length < 8 && !recentDone) {
    const res = await fetchProperties({ after: recentCursor });
    recentCursor = res.cursor; recentDone = res.done;
    res.items.filter((p) => !seen.has(p.id)).forEach((p) => { seen.add(p.id); batch.push({ p, reason: '' }); });
  }
  done = idx >= ranked.length && recentDone;
  return batch;
}

async function loadMore() {
  if (loading || done || !isConfigured) return;
  loading = true;
  const my = run;
  const holder = document.createElement('div');
  holder.className = 'feed';
  holder.innerHTML = skeletonCard() + (first ? skeletonCard() : '');
  feed.appendChild(holder);
  try {
    const batch = await nextBatch();
    if (my !== run) return;
    holder.remove();
    await appendCards(batch, my);
    if (my !== run) return;
    if (first && batch.length === 0) {
      feed.innerHTML = emptyState({ iconName: 'building', title: 'Aucune annonce pour le moment', text: 'Les nouvelles annonces apparaîtront ici.' });
    }
    if (first && batch.length) insertSuggestions(my);
    first = false;
  } catch (e) {
    console.error(e);
    if (my !== run) return;
    holder.innerHTML = `<div class="empty"><h2>Chargement impossible</h2><p>${esc(explainError(e))}</p><button class="btn btn-primary" id="retry">Réessayer</button></div>`;
    holder.querySelector('#retry').onclick = () => { holder.remove(); loading = false; loadMore(); };
    return;
  } finally {
    if (my === run) loading = false;
  }
}

// « Profils à suivre » : une rangée glissée après la 4e annonce
async function insertSuggestions(my) {
  try {
    const list = await suggestProfiles({ me, limit: 8 });
    if (my !== run || !list.length) return;
    const cards = feed.querySelectorAll(':scope > article.post');
    const anchor = cards[Math.min(3, cards.length - 1)];
    if (!anchor) return;
    const sec = document.createElement('section');
    sec.className = 'suggest';
    sec.innerHTML = `<h3>Profils à suivre</h3><div class="suggest-row">${list.map(({ u, reason }) => `
      <div class="card suggest-card">
        <a href="profile.html?id=${encodeURIComponent(u.id)}" class="avatar">${u.photoUrl ? `<img src="${esc(optimized(u.photoUrl, 120))}" alt="">` : esc((u.name || '?').trim().charAt(0).toUpperCase())}</a>
        <strong>${esc(u.name)}</strong>
        <small>${esc(reason)}</small>
        <button class="btn btn-primary" data-follow="${esc(u.id)}">Suivre</button>
      </div>`).join('')}</div>`;
    anchor.after(sec);
    sec.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-follow]');
      if (!b || !requireAuth('suivre ce profil')) return;
      b.disabled = true;
      try { await follow(me.uid, b.dataset.follow); try { sessionStorage.removeItem('imova-suggest'); } catch (x) { /* ignoré */ } b.textContent = 'Abonné'; b.classList.replace('btn-primary', 'btn-ghost'); toast('Vous suivez ce profil'); }
      catch (err) { console.error(err); toast(explainError(err)); b.disabled = false; }
    });
  } catch (e) { /* les suggestions sont facultatives */ }
}

async function start() {
  run++;
  loading = false; done = false; first = true; ranked = []; idx = 0; recentCursor = null; recentDone = false; seen = new Set();
  feed.innerHTML = '';
  showCache(false);
  if (!isConfigured) return;
  me = await whenReady();
  loadMore();
}

document.getElementById('cacheRetry').addEventListener('click', start);

// Bandeau d'annonce défini par l'administration (réglages de la plateforme)
if (isConfigured) {
  getSettings().then((s) => {
    const a = s && s.announcement;
    if (!a || !a.enabled || !a.text) return;
    const key = 'imova-ann-' + a.text.length + a.text.slice(0, 12);
    try { if (sessionStorage.getItem(key)) return; } catch (e) { /* ignoré */ }
    const el = document.getElementById('announce');
    el.innerHTML = `${icon('info', 18)}<span>${esc(a.text)}</span><button type="button" aria-label="Fermer">${icon('close', 16)}</button>`;
    el.hidden = false;
    el.querySelector('button').onclick = () => { el.hidden = true; try { sessionStorage.setItem(key, '1'); } catch (e) { /* ignoré */ } };
  }).catch(() => {});
}

if (!isConfigured) {
  notice.hidden = false;
  feed.innerHTML = emptyState({ iconName: 'building', title: 'Aucune annonce à afficher', text: 'Connectez Firebase pour voir les annonces.' });
} else {
  start();
}

// Fil continu : on charge la suite quand le bas de la liste approche
new IntersectionObserver((entries) => { if (entries[0].isIntersecting && !first) loadMore(); }, { rootMargin: '600px' }).observe(end);
