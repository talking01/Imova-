// Imova — postcard.js : la carte d'une annonce (comme sur ton croquis de l'accueil)
import { icon } from './icons.js';
import { openSheet, openModal } from './modal.js';
import { openViewer, optimized } from './viewer.js';
import { requireAuth } from './guards.js';
import { getUser } from './auth.js';
import { copyLink, shareLink, downloadImages, propertyUrl } from './sharing.js';
import { deleteProperty, setPinned, fetchPinned } from './properties.js';
import { esc, timeAgo, compact, toast, explainError } from './utils.js';
import { isReady } from './pages.js';

const LIMIT = 160;      // au-delà de cette longueur : « Voir plus »
const MAX_PINNED = 3;   // publications épinglées par profil

function avatar(url, name) {
  const initial = esc((name || '?').trim().charAt(0).toUpperCase() || '?');
  return `<span class="avatar">${url ? `<img src="${esc(optimized(url, 120))}" alt="" loading="lazy">` : initial}</span>`;
}

// Connecté : ces fonctions arrivent aux prochaines étapes de la Phase 3, on le dit honnêtement
function needAuth(action) {
  if (requireAuth(action)) toast('Cette fonction arrive bientôt.');
}

// property : annonce (+ id, media[] normalisé) ; author : { name, photoUrl, verified } ;
// opts.preview : aperçu avant publication (boutons inactifs, images locales acceptées)
export function createPostCard(property, author = {}, opts = {}) {
  const preview = !!opts.preview;
  const el = document.createElement('article');
  el.className = 'post card';
  const name = author.name || 'Utilisateur';
  const media = (Array.isArray(property.media) ? property.media : []).filter((m) => m && m.url);
  const desc = String(property.description || '');
  const long = desc.length > LIMIT;
  const url = preview ? '' : propertyUrl(property.id);
  const profileHref = `profile.html?id=${encodeURIComponent(property.authorId || '')}`;
  const authorInner = `
    ${avatar(author.photoUrl, name)}
    <span class="post-author-text">
      <strong>${esc(name)}${author.verified ? `<span class="verified" title="Profil vérifié">${icon('badge', 16)}</span>` : ''}</strong>
      <small>${esc(timeAgo(property.createdAt))}${property.pinned ? ` · <span class="pinned-tag">${icon('pushpin', 13)} Épinglée</span>` : ''}</small>
    </span>`;

  const mediaHtml = media.length ? `
    <div class="media-wrap">
      <div class="media-strip">
        ${media.map((m, i) => m.type === 'video'
          ? `<div class="media-item"><video src="${esc(m.url)}" controls playsinline preload="metadata"></video></div>`
          : `<button class="media-item" data-view="${i}" aria-label="Agrandir l'image ${i + 1}"><img src="${esc(optimized(m.url, 900))}" alt="" loading="lazy"></button>`).join('')}
      </div>
      ${media.length > 1 ? `<span class="media-count">1 / ${media.length}</span>` : ''}
    </div>` : '';

  el.innerHTML = `
    <header class="post-head">
      ${isReady('profile.html') && !preview
        ? `<a class="post-author" href="${profileHref}">${authorInner}</a>`
        : `<div class="post-author">${authorInner}</div>`}
      <button class="icon-btn" data-act="more" aria-label="Options de l'annonce">${icon('more')}</button>
    </header>
    ${property.title ? `<h3 class="post-title">${preview ? esc(property.title) : `<a href="${esc(`property.html?id=${property.id}`)}">${esc(property.title)}</a>`}</h3>` : ''}
    ${mediaHtml}
    <p class="post-desc ${long ? 'clamped' : ''}">${esc(desc)}</p>
    ${long ? `<button class="link-btn" data-act="expand">Voir plus</button>` : ''}
    <footer class="post-actions">
      <button class="btn btn-primary btn-discuss" data-act="discuss">Discuter</button>
      <button class="act" data-act="like" aria-label="J'aime">${icon('thumb', 20)}<span>${compact(property.likesCount || 0)}</span></button>
      <button class="act" data-act="fav" aria-label="Enregistrer dans mes favoris">${icon('bookmark', 20)}</button>
      <button class="act" data-act="share" aria-label="Partager">${icon('share', 20)}</button>
    </footer>`;

  // Compteur « 2 / 5 » qui suit le défilement des images
  const strip = el.querySelector('.media-strip');
  const counter = el.querySelector('.media-count');
  if (strip && counter) {
    strip.addEventListener('scroll', () => {
      counter.textContent = `${Math.round(strip.scrollLeft / strip.clientWidth) + 1} / ${media.length}`;
    }, { passive: true });
  }

  async function togglePin() {
    try {
      if (!property.pinned) {
        const pinned = await fetchPinned(property.authorId);
        if (pinned.length >= MAX_PINNED) { toast(`Vous pouvez épingler ${MAX_PINNED} publications au maximum.`); return; }
      }
      await setPinned(property.id, !property.pinned);
      toast(property.pinned ? 'Publication désépinglée' : 'Publication épinglée');
      property.pinned = !property.pinned;
      window.dispatchEvent(new CustomEvent('imova:posts-changed'));
    } catch (e) { console.error(e); toast(explainError(e)); }
  }

  function confirmDelete() {
    openModal({
      title: "Supprimer l'annonce ?",
      html: '<p class="muted">Cette annonce sera retirée définitivement. Cette action est irréversible.</p>',
      actions: [
        { label: 'Annuler' },
        {
          label: 'Supprimer', danger: true,
          onClick: async () => {
            try {
              await deleteProperty(property.id);
              el.remove();
              toast('Annonce supprimée');
              window.dispatchEvent(new CustomEvent('imova:posts-changed'));
            } catch (e) { console.error(e); toast(explainError(e)); return false; }
          }
        }
      ]
    });
  }

  function openMenu() {
    const me = getUser();
    const own = !!me && me.uid === property.authorId;
    const items = [];
    if (own) {
      items.push({ icon: 'pencil', label: "Modifier l'annonce", onClick: () => { location.href = `publish.html?edit=${encodeURIComponent(property.id)}`; } });
      items.push({ icon: 'pushpin', label: property.pinned ? 'Désépingler' : 'Épingler sur mon profil', onClick: togglePin });
      items.push({ icon: 'trash', label: "Supprimer l'annonce", danger: true, onClick: confirmDelete });
    } else {
      items.push({ icon: 'bookmark', label: "Enregistrer l'annonce", onClick: () => needAuth("enregistrer l'annonce") });
    }
    items.push({ icon: 'download', label: 'Enregistrer les images', onClick: () => downloadImages(media, 'imova') });
    if (!own) items.push({ icon: 'message', label: "Discuter de l'annonce", onClick: () => needAuth('discuter de cette annonce') });
    items.push({ icon: 'link', label: 'Copier le lien', onClick: () => copyLink(url) });
    if (!own) items.push({ icon: 'flag', label: 'Signaler cette annonce', danger: true, onClick: () => needAuth('signaler cette annonce') });
    openSheet(items);
  }

  el.addEventListener('click', (e) => {
    const view = e.target.closest('[data-view]');
    if (view) { openViewer(media, Number(view.dataset.view)); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'expand') {
      el.querySelector('.post-desc').classList.remove('clamped');
      btn.remove();
      return;
    }
    if (preview) { toast("Aperçu : les boutons seront actifs après la publication."); return; }
    switch (act) {
      case 'share': shareLink(property.title || 'Annonce Imova', url); break;
      case 'discuss': needAuth('discuter avec cet annonceur'); break;
      case 'like': needAuth("aimer cette annonce"); break;
      case 'fav': needAuth('enregistrer cette annonce en favori'); break;
      case 'more': openMenu(); break;
    }
  });
  return el;
}
