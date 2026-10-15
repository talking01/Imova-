// Imova — feed.js : le fil d'annonces de index.html (défilement continu, sans pagination)
import { fetchProperties, loadAuthors } from './properties.js';
import { createPostCard } from './postcard.js';
import { skeletonCard, emptyState } from './components.js';
import { isConfigured } from './firebase.js';
import { hydrateIcons } from './icons.js';

const feed = document.getElementById('feed');
const end = document.getElementById('feedEnd');
const notice = document.getElementById('setupNotice');
let cursor = null, done = false, loading = false, first = true;

if (!isConfigured) {
  notice.hidden = false;
  done = true;
  feed.innerHTML = emptyState({ iconName: 'building', title: 'Aucune annonce à afficher', text: "Connectez Firebase pour voir les annonces." });
}

async function loadMore() {
  if (loading || done) return;
  loading = true;
  const holder = document.createElement('div');
  holder.className = 'feed';
  holder.innerHTML = skeletonCard() + (first ? skeletonCard() : '');
  feed.appendChild(holder);
  try {
    const res = await fetchProperties({ after: cursor });
    const authors = await loadAuthors(res.items.map((p) => p.authorId));
    holder.remove();
    res.items.forEach((p) => feed.appendChild(createPostCard(p, authors.get(p.authorId))));
    cursor = res.cursor;
    done = res.done;
    if (first && res.items.length === 0) {
      feed.innerHTML = emptyState({ iconName: 'building', title: 'Aucune annonce pour le moment', text: 'Les nouvelles annonces apparaîtront ici.' });
    }
    first = false;
  } catch (e) {
    console.error(e);
    holder.innerHTML = `<div class="empty"><h2>Chargement impossible</h2><p>Vérifiez votre connexion et les règles Firestore.</p><button class="btn btn-primary" id="retry">Réessayer</button></div>`;
    holder.querySelector('#retry').onclick = () => { holder.remove(); loading = false; loadMore(); };
    return;
  } finally {
    loading = false;
  }
  hydrateIcons(feed);
}

// Fil continu : on charge la suite quand le bas de la liste approche
new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: '600px' }).observe(end);
