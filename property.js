// Imova — property.js : page property.html?id=... (une annonce seule, lien partageable) + annonces similaires
import { getProperty, loadAuthors } from './properties.js';
import { similarTo } from './recommend.js';
import { track } from './interests.js';
import { recordView } from './stats.js';
import { getLikedSet, getFavoriteIds } from './likes.js';
import { whenReady } from './auth.js';
import { createPostCard } from './postcard.js';
import { skeletonCard, emptyState, pageHeader, bindBack } from './components.js';
import { isConfigured } from './firebase.js';
import { param, explainError } from './utils.js';
import { hydrateIcons } from './icons.js';

const main = document.getElementById('main');
const id = param('id');
const header = pageHeader('Annonce');

async function run() {
  if (!id) {
    main.innerHTML = emptyState({ iconName: 'search', title: 'Annonce introuvable', text: "L'adresse ne contient pas d'annonce.", actionLabel: "Retour à l'accueil", actionHref: 'index.html' });
    return;
  }
  if (!isConfigured) {
    main.innerHTML = emptyState({ iconName: 'building', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js pour afficher cette annonce.' });
    return;
  }
  main.innerHTML = skeletonCard();
  try {
    const me = await whenReady();
    const p = await getProperty(id);
    if (!p) {
      main.innerHTML = emptyState({ iconName: 'search', title: 'Annonce introuvable', text: "Cette annonce n'existe plus ou a été supprimée.", actionLabel: "Retour à l'accueil", actionHref: 'index.html' });
      return;
    }
    track('open', p);
    if (me) recordView(me.uid, p);
    const states = { liked: new Set(), faved: new Set() };
    let similar = [];
    try { similar = await similarTo(p); } catch (e) { /* facultatif */ }
    const ids = [p.id, ...similar.map((s) => s.id)];
    const authors = await loadAuthors([p.authorId, ...similar.map((s) => s.authorId)]);
    if (me) {
      try { (await getFavoriteIds(me.uid)).forEach((i) => states.faved.add(i)); } catch (e) { /* ignoré */ }
      try { (await getLikedSet(me.uid, ids)).forEach((i) => states.liked.add(i)); } catch (e) { /* ignoré */ }
    }
    main.innerHTML = '';
    main.appendChild(createPostCard(p, authors.get(p.authorId), { state: states }));
    if (similar.length) {
      main.insertAdjacentHTML('beforeend', '<h3 class="section-title" style="margin-top:22px">Annonces similaires</h3><div class="feed" id="similar"></div>');
      const box = main.querySelector('#similar');
      similar.forEach((s) => box.appendChild(createPostCard(s, authors.get(s.authorId), { state: states })));
    }
    if (p.title) document.title = `${p.title} — Imova`;
  } catch (e) {
    console.error(e);
    main.innerHTML = emptyState({ iconName: 'building', title: 'Chargement impossible', text: explainError(e) });
  }
  hydrateIcons(main);
}

document.getElementById('pageHeader').innerHTML = header;
bindBack();
hydrateIcons();
run();
