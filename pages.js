// Imova — pages.js : liste des pages déjà livrées.
// Ajoutez le nom d'une page ici dès qu'elle est terminée. Tant qu'une page n'est pas dans la liste,
// les liens qui y mènent affichent un message au lieu d'ouvrir une page inexistante.
import { toast } from './utils.js';

export const READY = ['index.html', '404.html', 'menu.html', 'property.html', 'login.html', 'register.html', 'reset.html', 'profile.html', 'followers.html', 'reviews.html', 'publish.html'];

export const isReady = (href) => READY.includes(String(href).split('?')[0].split('#')[0]);

export function notReadyMessage() {
  toast('Cette page sera disponible à une prochaine étape.');
}

// Sur tous les liens <a> d'un bloc, bloque ceux qui mènent à une page pas encore livrée
export function guardLinks(root = document) {
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (/^(https?:|mailto:|tel:|#)/.test(href) || isReady(href)) return;
    a.addEventListener('click', (e) => { e.preventDefault(); notReadyMessage(); });
  });
}
