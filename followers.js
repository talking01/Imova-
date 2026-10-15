// Imova — followers.js : page followers.html?id=... (liste des abonnés d'un profil)
import { listFollowers } from './follows.js';
import { getUserDoc } from './users.js';
import { loadAuthors } from './properties.js';
import { pageHeader, bindBack, emptyState, skeletonCard } from './components.js';
import { isConfigured } from './firebase.js';
import { esc, param, explainError, compact } from './utils.js';
import { optimized } from './viewer.js';
import { hydrateIcons, icon } from './icons.js';

const main = document.getElementById('main');
const id = param('id');
const TYPES = { particulier: 'Particulier', agence: 'Agence' };

document.getElementById('pageHeader').innerHTML = pageHeader('Abonnés');
bindBack();

const person = (uid, a) => `
  <a class="person" href="profile.html?id=${encodeURIComponent(uid)}">
    <span class="avatar">${a.photoUrl ? `<img src="${esc(optimized(a.photoUrl, 120))}" alt="" loading="lazy">` : esc((a.name || '?').trim().charAt(0).toUpperCase() || '?')}</span>
    <span class="person-text"><strong>${esc(a.name || 'Utilisateur')}${a.verified ? `<span class="verified">${icon('badge', 16)}</span>` : ''}</strong><small>${esc(TYPES[a.type] || '')}</small></span>
  </a>`;

async function run() {
  if (!id) { main.innerHTML = emptyState({ iconName: 'users', title: 'Profil introuvable', actionLabel: "Retour à l'accueil", actionHref: 'index.html' }); hydrateIcons(); return; }
  if (!isConfigured) { main.innerHTML = emptyState({ iconName: 'users', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js.' }); hydrateIcons(); return; }
  main.innerHTML = skeletonCard();
  try {
    const owner = await getUserDoc(id);
    if (!owner) { main.innerHTML = emptyState({ iconName: 'user', title: 'Profil introuvable', actionLabel: "Retour à l'accueil", actionHref: 'index.html' }); hydrateIcons(); return; }
    const total = Number(owner.followersCount) || 0;
    main.innerHTML = `<p class="muted" style="padding:0 6px 10px">${esc(owner.name || '')} · ${compact(total)} abonné${total > 1 ? 's' : ''}</p><div class="list" id="people"></div><div class="more-wrap" id="more"></div>`;
    const people = main.querySelector('#people');
    const more = main.querySelector('#more');
    let cursor = null;
    async function load() {
      more.innerHTML = '';
      const res = await listFollowers(id, { after: cursor });
      const authors = await loadAuthors(res.ids);
      res.ids.forEach((uid) => people.insertAdjacentHTML('beforeend', person(uid, authors.get(uid) || {})));
      cursor = res.cursor;
      if (!people.children.length) people.outerHTML = emptyState({ iconName: 'users', title: 'Aucun abonné', text: "Personne ne suit ce profil pour l'instant." });
      if (!res.done) { more.innerHTML = '<button class="btn btn-ghost" id="loadMore">Voir plus</button>'; more.querySelector('#loadMore').onclick = () => load().catch(fail); }
      hydrateIcons(main);
    }
    const fail = (e) => { console.error(e); main.insertAdjacentHTML('beforeend', `<p class="error" style="padding:10px">${esc(explainError(e))}</p>`); };
    await load();
  } catch (e) {
    console.error(e);
    main.innerHTML = emptyState({ iconName: 'users', title: 'Chargement impossible', text: explainError(e) });
    hydrateIcons();
  }
}

run();
