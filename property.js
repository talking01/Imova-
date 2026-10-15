// Imova — property.js : page property.html?id=... (une annonce seule, lien partageable)
import { getProperty, loadAuthors } from './properties.js';
import { createPostCard } from './postcard.js';
import { skeletonCard, emptyState, pageHeader, bindBack } from './components.js';
import { isConfigured } from './firebase.js';
import { param } from './utils.js';
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
    const p = await getProperty(id);
    if (!p) {
      main.innerHTML = emptyState({ iconName: 'search', title: 'Annonce introuvable', text: "Cette annonce n'existe plus ou a été supprimée.", actionLabel: "Retour à l'accueil", actionHref: 'index.html' });
      return;
    }
    const authors = await loadAuthors([p.authorId]);
    main.innerHTML = '';
    main.appendChild(createPostCard(p, authors.get(p.authorId)));
    if (p.title) document.title = `${p.title} — Imova`;
  } catch (e) {
    console.error(e);
    main.innerHTML = emptyState({ iconName: 'building', title: 'Chargement impossible', text: 'Vérifiez votre connexion et les règles Firestore.' });
  }
  hydrateIcons(main);
}

document.getElementById('pageHeader').innerHTML = header;
bindBack();
hydrateIcons();
run();
