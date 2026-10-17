// Imova — search-page.js : page search.html
// Onglets : Tout (annonces + agences + particuliers en même temps), Annonces, Agences, Particuliers.
import { searchProperties, searchProfiles, recentSearches, rememberSearch, forgetSearch } from './search.js';
import { getProfile, topTokens, track } from './interests.js';
import { loadAuthors } from './properties.js';
import { getLikedSet, getFavoriteIds } from './likes.js';
import { whenReady } from './auth.js';
import { createPostCard } from './postcard.js';
import { pageHeader, bindBack, emptyState, skeletonCard } from './components.js';
import { isConfigured } from './firebase.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, param, explainError } from './utils.js';
import { optimized } from './viewer.js';

const main = document.getElementById('main');
const TYPES = { particulier: 'Particulier', agence: 'Agence' };
const SHOWN_IN_ALL = { props: 10, agence: 5, particulier: 5 }; // dans l'onglet « Tout », on montre un aperçu de chaque
let tab = 'all';
let me = null;
let timer = null;
let current = 0;
const states = { liked: new Set(), faved: new Set() };

document.getElementById('pageHeader').innerHTML = pageHeader('Recherche');
bindBack();
main.innerHTML = `
  <label class="sticky-search glass">${icon('search', 20)}<input id="q" type="search" placeholder="Vous cherchez ?" autocomplete="off" enterkeyhint="search" aria-label="Rechercher"></label>
  <div class="feed-tabs four glass" role="tablist" id="sTabs">
    <button type="button" role="tab" data-t="all" aria-selected="true">Tout</button>
    <button type="button" role="tab" data-t="props" aria-selected="false">Annonces</button>
    <button type="button" role="tab" data-t="agence" aria-selected="false">Agences</button>
    <button type="button" role="tab" data-t="particulier" aria-selected="false">Particuliers</button>
  </div>
  <div id="idle"></div>
  <div id="results"></div>`;
const input = document.getElementById('q');
const idle = document.getElementById('idle');
const results = document.getElementById('results');

const HINTS = {
  all: 'Tapez un mot (maison, terrain, location...) ou un nom : annonces, agences et particuliers sont cherchés en même temps.',
  props: 'Tapez un mot : maison, appartement, terrain, location, un quartier...',
  agence: "Tapez le début du nom d'une agence.",
  particulier: "Tapez le début du nom d'un particulier."
};

function showIdle() {
  results.innerHTML = '';
  const recents = recentSearches();
  const interests = topTokens(getProfile(), 6);
  idle.innerHTML = `
    ${interests.length ? `<h3 class="section-title">Pour vous</h3><div class="chips">${interests.map((t) => `<button class="chip" data-q="${esc(t)}">${icon('star', 14)} ${esc(t)}</button>`).join('')}</div>` : ''}
    ${recents.length ? `<h3 class="section-title">Recherches récentes</h3><div class="list">${recents.map((r) => `
      <div class="recent-row"><button class="go" data-q="${esc(r)}">${icon('clock', 18)}<span>${esc(r)}</span></button><button class="icon-btn" data-forget="${esc(r)}" aria-label="Retirer cette recherche">${icon('close', 18)}</button></div>`).join('')}</div>` : ''}
    ${!interests.length && !recents.length ? emptyState({ iconName: 'search', title: 'Que cherchez-vous ?', text: HINTS[tab] }) : ''}
    ${tab === 'agence' || tab === 'all' ? `<p class="form-links" style="margin-top:14px"><a href="agencies.html">Voir toutes les agences</a></p>` : ''}`;
  hydrateIcons(idle);
}

async function loadStates(ids) {
  if (!me) return;
  try { (await getFavoriteIds(me.uid)).forEach((id) => states.faved.add(id)); } catch (e) { /* ignoré */ }
  try { (await getLikedSet(me.uid, ids)).forEach((id) => states.liked.add(id)); } catch (e) { /* ignoré */ }
}

const personRow = (u) => `
  <a class="person" href="profile.html?id=${encodeURIComponent(u.id)}">
    <span class="avatar">${u.photoUrl ? `<img src="${esc(optimized(u.photoUrl, 120))}" alt="" loading="lazy">` : esc((u.name || '?').trim().charAt(0).toUpperCase())}</span>
    <span class="person-text"><strong>${esc(u.name)}${u.verified ? `<span class="verified">${icon('badge', 16)}</span>` : ''}</strong><small>${esc(TYPES[u.type] || '')} · ${Number(u.followersCount) || 0} abonné${(u.followersCount || 0) > 1 ? 's' : ''}</small></span>
  </a>`;

// Un bloc de profils (agences ou particuliers) ; en mode « Tout » on limite et on propose « Voir tout »
function peopleBlock(list, type, limited) {
  if (!list.length) return '';
  const label = type === 'agence' ? 'Agences' : 'Particuliers';
  const shown = limited ? list.slice(0, SHOWN_IN_ALL[type]) : list;
  return `
    <div class="section-head"><h3>${label} (${list.length})</h3>${limited && list.length > shown.length ? `<button class="link-btn" data-goto="${type}">Voir tout</button>` : ''}</div>
    <div class="list">${shown.map(personRow).join('')}</div>`;
}

async function propsBlock(items, limited) {
  if (!items.length) return '';
  const shown = limited ? items.slice(0, SHOWN_IN_ALL.props) : items;
  const authors = await loadAuthors(shown.map((p) => p.authorId));
  await loadStates(shown.map((p) => p.id));
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="section-head"><h3>Annonces (${items.length})</h3>${limited && items.length > shown.length ? '<button class="link-btn" data-goto="props">Voir tout</button>' : ''}</div><div class="feed"></div>`;
  const feed = wrap.querySelector('.feed');
  shown.forEach((p) => feed.appendChild(createPostCard(p, authors.get(p.authorId), { state: states })));
  return wrap;
}

async function search(q, remember = false) {
  const text = q.trim();
  const my = ++current;
  if (text.length < 2) { showIdle(); return; }
  idle.innerHTML = '';
  results.innerHTML = skeletonCard();
  try {
    const wantProps = tab === 'all' || tab === 'props';
    const wantPeople = tab !== 'props';
    const [propsRes, people] = await Promise.all([
      wantProps ? searchProperties(text) : Promise.resolve({ items: [], words: [] }),
      wantPeople ? searchProfiles(text) : Promise.resolve([])
    ]);
    if (my !== current) return;
    const agencies = people.filter((u) => u.type === 'agence');
    const particuliers = people.filter((u) => u.type !== 'agence');
    const limited = tab === 'all';
    const total = propsRes.items.length + (tab === 'agence' || tab === 'all' ? agencies.length : 0) + (tab === 'particulier' || tab === 'all' ? particuliers.length : 0);
    if (remember && total) rememberSearch(text);
    if (propsRes.items.length) track('search', { tokens: propsRes.words });
    if (!total) {
      results.innerHTML = emptyState({ iconName: 'search', title: 'Aucun résultat', text: tab === 'agence' ? 'Aucune agence ne commence par ces lettres.' : tab === 'particulier' ? 'Aucun particulier ne commence par ces lettres.' : 'Essayez un autre mot, ou un mot plus simple (maison, terrain, location...).' });
      hydrateIcons(results);
      return;
    }
    const box = document.createElement('div');
    if (tab === 'all' || tab === 'agence') box.insertAdjacentHTML('beforeend', peopleBlock(agencies, 'agence', limited));
    if (tab === 'all' || tab === 'particulier') box.insertAdjacentHTML('beforeend', peopleBlock(particuliers, 'particulier', limited));
    if (wantProps) { const block = await propsBlock(propsRes.items, limited); if (block) box.appendChild(block); }
    if (my !== current) return;
    results.innerHTML = '';
    results.appendChild(box);
    hydrateIcons(results);
  } catch (e) {
    console.error(e);
    if (my === current) { results.innerHTML = emptyState({ iconName: 'search', title: 'Recherche impossible', text: explainError(e) }); hydrateIcons(results); }
  }
}

function setTab(t) {
  tab = t;
  document.querySelectorAll('#sTabs [data-t]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.t === tab)));
  search(input.value);
}

input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(input.value), 350); });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); input.blur(); search(input.value, true); } });
document.getElementById('sTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-t]');
  if (b && b.dataset.t !== tab) setTab(b.dataset.t);
});
main.addEventListener('click', (e) => {
  const f = e.target.closest('[data-forget]');
  if (f) { forgetSearch(f.dataset.forget); showIdle(); return; }
  const g = e.target.closest('[data-goto]');
  if (g) { setTab(g.dataset.goto); window.scrollTo(0, 0); return; }
  const q = e.target.closest('[data-q]');
  if (q) { input.value = q.dataset.q; search(q.dataset.q, true); }
});

async function boot() {
  if (!isConfigured) { idle.innerHTML = emptyState({ iconName: 'search', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js pour rechercher.' }); hydrateIcons(idle); input.disabled = true; return; }
  me = await whenReady();
  const q0 = param('q');
  if (q0) { input.value = q0; search(q0, true); } else { showIdle(); if (param('focus')) setTimeout(() => input.focus(), 60); }
}
boot();
