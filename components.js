// Imova — components.js : petits morceaux d'interface réutilisables (HTML en texte)
import { icon } from './icons.js';
import { esc } from './utils.js';

export function emptyState({ iconName = 'building', title, text = '', actionLabel = '', actionHref = '' }) {
  return `
    <div class="empty">
      <div class="empty-ic">${icon(iconName, 30)}</div>
      <h2>${esc(title)}</h2>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${actionLabel ? `<a class="btn btn-primary" href="${esc(actionHref)}">${esc(actionLabel)}</a>` : ''}
    </div>`;
}

export function skeletonCard() {
  return `
    <div class="skeleton" aria-hidden="true">
      <div style="display:flex;gap:10px;align-items:center">
        <div class="sk sk-dot"></div>
        <div style="flex:1;display:grid;gap:6px"><div class="sk sk-line" style="width:40%"></div><div class="sk sk-line" style="width:22%"></div></div>
      </div>
      <div class="sk sk-img"></div>
      <div class="sk sk-line"></div><div class="sk sk-line" style="width:70%"></div>
    </div>`;
}

// En-tête avec flèche retour : <div id="pageHeader"></div> puis pageHeader('Menu')
export function pageHeader(title, right = '', extraClass = '') {
  return `
    <header class="page-header glass ${extraClass}">
      <button class="icon-btn" data-back aria-label="Retour">${icon('back')}</button>
      <h1>${esc(title)}</h1>
      <div>${right}</div>
    </header>`;
}

// Active les boutons [data-back] : retour à la page précédente, sinon accueil
export function bindBack(root = document) {
  root.querySelectorAll('[data-back]').forEach((b) => {
    b.addEventListener('click', () => {
      const same = document.referrer && new URL(document.referrer).origin === location.origin;
      if (same && history.length > 1) history.back();
      else location.href = 'index.html';
    });
  });
}

// Cinq étoiles (icônes SVG) dont `filled` sont pleines : stars(3) → ★★★☆☆
export function stars(filled, size = 18) {
  const n = Math.max(0, Math.min(5, Math.round(Number(filled) || 0)));
  return `<span class="stars" role="img" aria-label="${n} étoile${n > 1 ? 's' : ''} sur 5">${
    [1, 2, 3, 4, 5].map((i) => `<span class="star ${i <= n ? 'on' : ''}">${icon('star', size)}</span>`).join('')
  }</span>`;
}

export function average(user) {
  const c = Number(user.ratingCount) || 0;
  return c ? (Number(user.ratingSum) || 0) / c : 0;
}

export const formatAverage = (avg) => avg.toFixed(1).replace('.', ',');
