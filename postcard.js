// Imova — postcard.js : la carte d'une annonce (comme sur ton croquis de l'accueil)
import { icon } from './icons.js';
import { openSheet, openModal } from './modal.js';
import { openViewer, optimized } from './viewer.js';
import { requireAuth } from './guards.js';
import { getUser } from './auth.js';
import { copyLink, shareLink, downloadImages, propertyUrl } from './sharing.js';
import { deleteProperty, setPinned, fetchPinned } from './properties.js';
import { setLike, setFavorite } from './likes.js';
import { track } from './interests.js';
import { openReport } from './reports.js';
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
  // opts.state : { liked: Set, faved: Set } (mes « J'aime » et favoris) ; opts.reason : pourquoi cette annonce est recommandée
  const st = opts.state || { liked: new Set(), faved: new Set() };
  const liked0 = st.liked.has(property.id);
  const faved0 = st.faved.has(property.id);
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
      <small>${esc(timeAgo(property.createdAt))}${property.pinned ? ` · <span class="pinned-tag">${icon('pushpin', 13)} Épinglée</span>` : ''}${property.status === 'hidden' ? ` · <span class="hidden-tag">Masquée par la modération</span>` : ''}</small>
    </span>`;

  // Le cadre prend la forme de la première photo (limitée entre 4:5 portrait et 1,91:1 paysage) ; la photo reste ENTIÈRE
  const clampRatio = (r) => Math.max(0.8, Math.min(1.91, r));
  const first = media[0];
  const ratio0 = first && first.w && first.h ? clampRatio(first.w / first.h) : 4 / 3;
  const mediaHtml = media.length ? `
    <div class="media-wrap">
      <div class="media-strip" style="aspect-ratio:${ratio0.toFixed(3)}">
        ${media.map((m, i) => m.type === 'video'
          ? `<div class="media-item"><video src="${esc(m.url)}" controls playsinline preload="metadata"></video></div>`
          : `<button class="media-item" data-view="${i}" aria-label="Agrandir l'image ${i + 1}" style="--bg:url('${esc(optimized(m.url, 80))}')"><img src="${esc(optimized(m.url, 900))}" alt="" loading="lazy"></button>`).join('')}
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
    ${opts.reason ? `<p class="reason-tag">${icon('star', 13)} ${esc(opts.reason)}</p>` : ''}
    ${property.title ? `<h3 class="post-title">${preview ? esc(property.title) : `<a href="${esc(`property.html?id=${property.id}`)}">${esc(property.title)}</a>`}</h3>` : ''}
    ${mediaHtml}
    <p class="post-desc ${long ? 'clamped' : ''}">${esc(desc)}</p>
    ${long ? `<button class="link-btn" data-act="expand">Voir plus</button>` : ''}
    <footer class="post-actions">
      <button class="btn btn-primary btn-discuss" data-act="discuss">Discuter</button>
      <button class="act ${liked0 ? 'on' : ''}" data-act="like" aria-label="J'aime" aria-pressed="${liked0}">${icon('thumb', 20)}<span>${compact(property.likesCount || 0)}</span></button>
      <button class="act ${faved0 ? 'on' : ''}" data-act="fav" aria-label="Enregistrer dans mes favoris" aria-pressed="${faved0}">${icon('bookmark', 20)}</button>
      <button class="act" data-act="share" aria-label="Partager">${icon('share', 20)}</button>
    </footer>`;

  // Anciennes annonces sans dimensions : on règle le cadre dès que la première photo est chargée
  const firstImg = el.querySelector('.media-item img');
  if (firstImg && first && first.type === 'image' && !(first.w && first.h)) {
    firstImg.addEventListener('load', () => {
      if (firstImg.naturalWidth && firstImg.naturalHeight) el.querySelector('.media-strip').style.aspectRatio = clampRatio(firstImg.naturalWidth / firstImg.naturalHeight).toFixed(3);
    }, { once: true });
  }

  const titleLink = el.querySelector('.post-title a');
  if (titleLink && !preview) titleLink.addEventListener('click', () => track('open', property));

  // Compteur « 2 / 5 » qui suit le défilement des images
  const strip = el.querySelector('.media-strip');
  const counter = el.querySelector('.media-count');
  if (strip && counter) {
    strip.addEventListener('scroll', () => {
      counter.textContent = `${Math.round(strip.scrollLeft / strip.clientWidth) + 1} / ${media.length}`;
    }, { passive: true });
  }

  function discuss() {
    if (!requireAuth('discuter avec cet annonceur')) return;
    const me = getUser();
    if (me.uid === property.authorId) { toast("C'est votre propre annonce."); return; }
    track('discuss', property);
    location.href = `chat.html?with=${encodeURIComponent(property.authorId)}&property=${encodeURIComponent(property.id)}`;
  }

  async function toggleLike(btn) {
    if (!requireAuth("aimer cette annonce")) return;
    const me = getUser();
    const was = st.liked.has(property.id);
    btn.disabled = true;
    try {
      await setLike(me.uid, property.id, !was);
      if (was) { st.liked.delete(property.id); property.likesCount = Math.max(0, (property.likesCount || 0) - 1); }
      else { st.liked.add(property.id); property.likesCount = (property.likesCount || 0) + 1; track('like', property); }
      btn.classList.toggle('on', !was);
      btn.setAttribute('aria-pressed', String(!was));
      btn.querySelector('span').textContent = compact(property.likesCount);
    } catch (e) { console.error(e); toast(explainError(e)); } finally { btn.disabled = false; }
  }

  async function toggleFav(btn) {
    if (!requireAuth("enregistrer cette annonce en favori")) return;
    const me = getUser();
    const was = st.faved.has(property.id);
    if (btn) btn.disabled = true;
    try {
      await setFavorite(me.uid, property.id, !was);
      if (was) st.faved.delete(property.id); else { st.faved.add(property.id); track('fav', property); }
      const b = btn || el.querySelector('[data-act="fav"]');
      b.classList.toggle('on', !was);
      b.setAttribute('aria-pressed', String(!was));
      toast(was ? 'Retirée de vos favoris' : 'Ajoutée à vos favoris');
    } catch (e) { console.error(e); toast(explainError(e)); } finally { if (btn) btn.disabled = false; }
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
      items.push({ icon: 'bookmark', label: st.faved.has(property.id) ? 'Retirer des favoris' : "Enregistrer l'annonce", onClick: () => toggleFav(null) });
    }
    if (own) items.push({ icon: 'bookmark', label: st.faved.has(property.id) ? 'Retirer des favoris' : 'Ajouter aux favoris', onClick: () => toggleFav(null) });
    items.push({ icon: 'download', label: 'Enregistrer les images', onClick: () => downloadImages(media, 'imova') });
    if (!own) items.push({ icon: 'message', label: "Discuter de l'annonce", onClick: discuss });
    items.push({ icon: 'link', label: 'Copier le lien', onClick: () => copyLink(url) });
    if (!own) items.push({ icon: 'flag', label: 'Signaler cette annonce', danger: true, onClick: () => openReport({ targetType: 'property', targetId: property.id, targetUserId: property.authorId }) });
    openSheet(items);
  }

  el.addEventListener('click', (e) => {
    const view = e.target.closest('[data-view]');
    if (view) { if (!preview) track('view', property); openViewer(media, Number(view.dataset.view)); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'expand') {
      el.querySelector('.post-desc').classList.remove('clamped');
      btn.remove();
      if (!preview) track('view', property);
      return;
    }
    if (preview) { toast("Aperçu : les boutons seront actifs après la publication."); return; }
    switch (act) {
      case 'share': track('share', property); shareLink(property.title || 'Annonce Imova', url); break;
      case 'discuss': discuss(); break;
      case 'like': toggleLike(btn); break;
      case 'fav': toggleFav(btn); break;
      case 'more': openMenu(); break;
    }
  });
  return el;
}
