// Imova — admin-properties.js : admin-properties.html (toutes les annonces)
import { initAdmin, audit, names, nameOf, fmtDate, pill, confirmAction } from './admin.js';
import { buildTokens } from './search.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, explainError, compact } from './utils.js';
import { emptyState } from './components.js';
import { optimized } from './viewer.js';

const main = document.getElementById('main');
let ctx, rows = [], authors = new Map(), filter = 'all', text = '', cursor = null, more = false;
const firstImg = (p) => ((p.images || []).find((i) => i && /^https:\/\/res\.cloudinary\.com\//.test(i.url)) || {}).url;

async function load(append = false) {
  const list = main.querySelector('#list');
  if (!append) { list.innerHTML = '<div class="skeleton"><div class="sk sk-line"></div><div class="sk sk-img"></div></div>'; cursor = null; rows = []; }
  const { m, db } = ctx;
  try {
    let q; const words = buildTokens(text, '').slice(0, 10);
    if (words.length) q = m.query(m.collection(db, 'properties'), m.where('tokens', 'array-contains-any', words), m.limit(40));
    else if (filter === 'hidden') q = m.query(m.collection(db, 'properties'), m.where('status', '==', 'hidden'), m.limit(100));
    else q = m.query(m.collection(db, 'properties'), m.orderBy('createdAt', 'desc'), ...(cursor ? [m.startAfter(cursor)] : []), m.limit(20));
    const snap = await m.getDocs(q);
    const got = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    more = !words.length && filter !== 'hidden' && snap.size >= 20;
    cursor = snap.docs[snap.docs.length - 1] || cursor;
    rows = append ? rows.concat(got) : got;
    authors = await names(rows.map((p) => p.authorId));
  } catch (e) { console.error(e); list.innerHTML = emptyState({ iconName: 'building', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(list); return; }
  render();
}

function render() {
  const list = main.querySelector('#list');
  const shown = rows.filter((p) => filter !== 'hidden' || p.status === 'hidden');
  list.innerHTML = shown.length ? `<div class="card adm-list">${shown.map((p) => `
    <div class="adm-row" data-id="${esc(p.id)}">
      ${firstImg(p) ? `<img class="adm-thumb" src="${esc(optimized(firstImg(p), 120))}" alt="">` : `<span class="adm-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted)">${icon('building', 22)}</span>`}
      <span class="grow"><strong>${esc(p.title)}</strong><small>${esc(nameOf(authors, p.authorId))} · ${esc(fmtDate(p.createdAt))} · ${compact(p.viewsCount || 0)} vues · ${compact(p.likesCount || 0)} J'aime</small>
        ${p.status === 'hidden' ? `<small>${pill('Masquée', 'bad')} ${esc(p.moderationNote || '')}</small>` : ''}</span>
      <span class="adm-actions" style="margin:0">
        <a class="btn btn-ghost btn-sm" href="property.html?id=${encodeURIComponent(p.id)}" aria-label="Voir l'annonce">${icon('eyeOpen', 16)}</a>
        <button class="btn btn-ghost btn-sm" data-act="toggle" aria-label="${p.status === 'hidden' ? 'Réactiver' : 'Masquer'}">${icon(p.status === 'hidden' ? 'eyeOpen' : 'eyeOff', 16)}</button>
        <button class="btn btn-ghost btn-sm" data-act="delete" style="color:var(--danger)" aria-label="Supprimer">${icon('trash', 16)}</button>
      </span>
    </div>`).join('')}</div>${more ? '<div class="more-wrap"><button class="btn btn-ghost" id="moreBtn">Voir plus</button></div>' : ''}` : emptyState({ iconName: 'building', title: 'Aucune annonce' });
  hydrateIcons(list);
}

main.addEventListener('click', (e) => {
  if (e.target.closest('#moreBtn')) { load(true); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const p = rows.find((x) => x.id === b.closest('[data-id]').dataset.id);
  const { m, db } = ctx;
  if (b.dataset.act === 'toggle') {
    const hide = p.status !== 'hidden';
    confirmAction({
      title: hide ? 'Masquer cette annonce ?' : 'Réactiver cette annonce ?', text: hide ? "Elle ne sera plus visible dans l'application (sauf pour son auteur)." : '', confirmLabel: hide ? 'Masquer' : 'Réactiver', danger: hide,
      reason: hide ? { label: 'Motif (visible par l\'auteur)', max: 300 } : null,
      onConfirm: async (note) => {
        await m.updateDoc(m.doc(db, 'properties', p.id), hide ? { status: 'hidden', moderationNote: note || '' } : { status: 'active', moderationNote: '' });
        await audit(ctx, hide ? 'property_hide' : 'property_show', 'property', p.id, `${p.title}${note ? ' — ' + note : ''}`);
        p.status = hide ? 'hidden' : 'active'; p.moderationNote = hide ? note : ''; toast(hide ? 'Annonce masquée' : 'Annonce réactivée'); render();
      }
    });
  } else if (b.dataset.act === 'delete') {
    confirmAction({
      title: 'Supprimer définitivement ?', text: `« ${p.title} » sera supprimée pour tout le monde. Cette action est irréversible.`, confirmLabel: 'Supprimer', danger: true,
      onConfirm: async () => { await m.deleteDoc(m.doc(db, 'properties', p.id)); await audit(ctx, 'property_delete', 'property', p.id, p.title); rows = rows.filter((x) => x.id !== p.id); toast('Annonce supprimée'); render(); }
    });
  }
});

(async () => {
  ctx = await initAdmin({ minRank: 1, active: 'admin-properties.html' });
  if (!ctx) return;
  main.innerHTML = `<div class="adm-title"><h1>Annonces</h1></div>
    <div class="adm-filters"><input class="input" id="s" type="search" placeholder="Rechercher des mots (maison, terrain...)" aria-label="Rechercher">
      <select class="select" id="f" aria-label="Filtrer"><option value="all">Toutes (récentes)</option><option value="hidden">Masquées</option></select></div>
    <div id="list"></div>`;
  let timer;
  main.querySelector('#s').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { text = e.target.value; load(); }, 350); });
  main.querySelector('#f').addEventListener('change', (e) => { filter = e.target.value; load(); });
  load();
})();
