// Imova — modal.js : fenêtre de dialogue et feuille d'options (menu à trois points)
import { icon } from './icons.js';
import { esc, overlayRoot } from './utils.js';

function mount(wrap) {
  overlayRoot().appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
}

function closer(wrap, onKeyRef) {
  return () => {
    wrap.classList.remove('show');
    document.removeEventListener('keydown', onKeyRef.fn);
    setTimeout(() => wrap.remove(), 220);
  };
}

// html : contenu déjà sûr (échappez tout texte utilisateur avec esc())
export function openModal({ title, html = '', actions = [], onOpen = null }) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `
    <div class="modal glass" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h2 class="modal-title">${esc(title)}</h2>
      <div>${html}</div>
      <div class="modal-actions"></div>
    </div>`;
  const ref = {};
  const close = closer(wrap, ref);
  ref.fn = (e) => { if (e.key === 'Escape') close(); };
  const bar = wrap.querySelector('.modal-actions');
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost');
    b.textContent = a.label;
    // onClick peut être asynchrone ; s'il renvoie false, la fenêtre reste ouverte (ex. saisie invalide)
    b.onclick = async () => {
      b.disabled = true;
      let keep = false;
      try { keep = a.onClick ? (await a.onClick(wrap.querySelector('.modal'), b)) === false : false; } finally { b.disabled = false; }
      if (!keep) close();
    };
    bar.appendChild(b);
  });
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', ref.fn);
  mount(wrap);
  if (onOpen) onOpen(wrap.querySelector('.modal'), close);
  return close;
}

// items : [{ icon, label, danger, onClick }]
export function openSheet(items, title = '') {
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `
    <div class="sheet glass" role="menu">
      ${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
      ${items.map((it, i) => `
        <button class="row ${it.danger ? 'danger' : ''}" role="menuitem" data-i="${i}">
          ${icon(it.icon || 'chevron')}<span class="row-label">${esc(it.label)}</span>
        </button>`).join('')}
    </div>`;
  const ref = {};
  const close = closer(wrap, ref);
  ref.fn = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-i]');
    if (btn) { close(); const it = items[Number(btn.dataset.i)]; if (it.onClick) it.onClick(); return; }
    if (e.target === wrap) close();
  });
  document.addEventListener('keydown', ref.fn);
  mount(wrap);
  return close;
}
