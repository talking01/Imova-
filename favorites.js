// Imova — favorites.js : page favorites.html (mes annonces enregistrées)
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import { getFavoriteIds } from './likes.js';
import { fetchByIds, loadAuthors } from './properties.js';
import { getLikedSet } from './likes.js';
import { createPostCard } from './postcard.js';
import { pageHeader, bindBack, emptyState, skeletonCard } from './components.js';
import { isConfigured } from './firebase.js';
import { hydrateIcons } from './icons.js';
import { explainError } from './utils.js';

const main = document.getElementById('main');
document.getElementById('pageHeader').innerHTML = pageHeader('Mes favoris');
bindBack();

async function run() {
  if (!isConfigured) { main.innerHTML = emptyState({ iconName: 'heart', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js.' }); hydrateIcons(); return; }
  main.innerHTML = skeletonCard();
  const me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  try {
    const ids = await getFavoriteIds(me.uid, { force: true });
    if (!ids.length) { main.innerHTML = emptyState({ iconName: 'heart', title: 'Aucun favori', text: "Touchez l'icône marque-page d'une annonce pour la retrouver ici.", actionLabel: 'Voir les annonces', actionHref: 'index.html' }); hydrateIcons(); return; }
    main.innerHTML = '<div class="feed" id="favFeed"></div><div class="more-wrap" id="more"></div>';
    const feed = main.querySelector('#favFeed');
    const more = main.querySelector('#more');
    const states = { liked: new Set(), faved: new Set(ids) };
    let pos = 0;
    async function page() {
      more.innerHTML = '';
      const chunk = ids.slice(pos, pos + 8);
      pos += chunk.length;
      const items = await fetchByIds(chunk);
      const authors = await loadAuthors(items.map((p) => p.authorId));
      try { (await getLikedSet(me.uid, items.map((p) => p.id))).forEach((id) => states.liked.add(id)); } catch (e) { /* ignoré */ }
      items.forEach((p) => feed.appendChild(createPostCard(p, authors.get(p.authorId), { state: states })));
      if (!feed.children.length) main.innerHTML = emptyState({ iconName: 'heart', title: 'Favoris indisponibles', text: 'Les annonces enregistrées ont peut-être été supprimées.' });
      if (pos < ids.length) { more.innerHTML = '<button class="btn btn-ghost" id="loadMore">Voir plus</button>'; more.querySelector('#loadMore').onclick = () => page().catch(console.error); }
      hydrateIcons(main);
    }
    await page();
  } catch (e) {
    console.error(e);
    main.innerHTML = emptyState({ iconName: 'heart', title: 'Chargement impossible', text: explainError(e) });
    hydrateIcons();
  }
}
run();
