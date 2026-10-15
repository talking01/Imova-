// Imova — viewer.js : visionneuse plein écran (on touche une image, on défile les autres)
import { icon } from './icons.js';
import { esc, overlayRoot } from './utils.js';

// Adapte une image Cloudinary à la largeur voulue (les autres adresses restent inchangées)
export function optimized(url, width = 800) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},c_limit/`);
}

export function openViewer(media, start = 0) {
  const el = document.createElement('div');
  el.className = 'viewer';
  el.innerHTML = `
    <div class="viewer-track">
      ${media.map((m) => `<div class="viewer-item">${
        m.type === 'video'
          ? `<video src="${esc(m.url)}" controls playsinline></video>`
          : `<img src="${esc(optimized(m.url, 1600))}" alt="">`
      }</div>`).join('')}
    </div>
    <button class="icon-btn viewer-close" aria-label="Fermer">${icon('close')}</button>
    <div class="viewer-count">${start + 1} / ${media.length}</div>`;
  const track = el.querySelector('.viewer-track');
  const count = el.querySelector('.viewer-count');
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    el.classList.remove('show');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 200);
  }
  el.querySelector('.viewer-close').onclick = close;
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    count.textContent = `${i + 1} / ${media.length}`;
  }, { passive: true });
  document.addEventListener('keydown', onKey);
  overlayRoot().appendChild(el);
  requestAnimationFrame(() => { el.classList.add('show'); track.scrollLeft = start * track.clientWidth; });
}
