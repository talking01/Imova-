// Imova — admin-users.js : admin-users.html (tous les comptes) et admin-agencies.html (agences seulement)
import { initAdmin, audit, fmtDate, pill, confirmAction } from './admin.js';
import { openModal } from './modal.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, explainError, compact } from './utils.js';
import { emptyState } from './components.js';
import { optimized } from './viewer.js';

const mode = document.body.dataset.mode || 'all';
const main = document.getElementById('main');
let ctx, rows = [], filter = 'all', text = '', cursor = null, more = false;

const matchMode = (u) => mode !== 'agence' || u.type === 'agence';
const matchFilter = (u) => (filter === 'verified' ? !!u.verified : filter === 'suspended' ? !!u.suspended : filter === 'particulier' ? u.type !== 'agence' : true);

async function load(append = false) {
  const list = main.querySelector('#list');
  if (!append) { list.innerHTML = '<div class="skeleton"><div class="sk sk-line"></div><div class="sk sk-img"></div></div>'; cursor = null; rows = []; }
  const { m, db } = ctx;
  try {
    let q;
    const t = text.trim().toLowerCase();
    if (t.length >= 2) q = m.query(m.collection(db, 'users'), m.where('nameLower', '>=', t), m.where('nameLower', '<=', t + '\uf8ff'), m.limit(40));
    else if (filter === 'verified') q = m.query(m.collection(db, 'users'), m.where('verified', '==', true), m.limit(100));
    else if (filter === 'suspended') q = m.query(m.collection(db, 'users'), m.where('suspended', '==', true), m.limit(100));
    else if (mode === 'agence') q = m.query(m.collection(db, 'users'), m.where('type', '==', 'agence'), m.limit(100));
    else q = m.query(m.collection(db, 'users'), m.orderBy('createdAt', 'desc'), ...(cursor ? [m.startAfter(cursor)] : []), m.limit(30));
    const snap = await m.getDocs(q);
    const got = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    more = !t && !filter.match(/verified|suspended/) && mode !== 'agence' && snap.size >= 30;
    cursor = snap.docs[snap.docs.length - 1] || cursor;
    rows = append ? rows.concat(got) : got;
    if (mode === 'agence') rows.sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
  } catch (e) { console.error(e); list.innerHTML = emptyState({ iconName: 'users', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(list); return; }
  render();
}

function render() {
  const list = main.querySelector('#list');
  const shown = rows.filter(matchMode).filter(matchFilter);
  list.innerHTML = shown.length ? `<div class="card adm-list">${shown.map((u) => `
    <button class="adm-row" data-id="${esc(u.id)}" style="text-align:left;width:100%">
      <span class="avatar">${u.photoUrl ? `<img src="${esc(optimized(u.photoUrl, 100))}" alt="">` : esc((u.name || '?').trim().charAt(0).toUpperCase())}</span>
      <span class="grow"><strong>${esc(u.name || 'Utilisateur')}</strong><small>${u.type === 'agence' ? 'Agence' : 'Particulier'} · inscrit le ${esc(fmtDate(u.createdAt))} · ${compact(u.followersCount || 0)} abonnés</small></span>
      ${u.verified ? pill('Vérifié', 'ok') : ''}${u.suspended ? pill('Suspendu', 'bad') : ''}
    </button>`).join('')}</div>${more ? '<div class="more-wrap"><button class="btn btn-ghost" id="moreBtn">Voir plus</button></div>' : ''}`
    : emptyState({ iconName: 'users', title: 'Aucun résultat' });
  hydrateIcons(list);
}

function openUser(u) {
  const self = u.id === ctx.me.uid;
  openModal({
    title: u.name || 'Utilisateur',
    html: `<dl class="kv">
        <dt>Type</dt><dd>${u.type === 'agence' ? 'Agence' : 'Particulier'}</dd>
        <dt>Inscrit le</dt><dd>${esc(fmtDate(u.createdAt))}</dd>
        <dt>Abonnés</dt><dd>${compact(u.followersCount || 0)}</dd>
        <dt>Avis</dt><dd>${u.ratingCount ? `${(u.ratingSum / u.ratingCount).toFixed(1).replace('.', ',')} (${u.ratingCount})` : 'Aucun'}</dd>
        <dt>Badge</dt><dd>${u.verified ? 'Vérifié' : 'Non vérifié'}</dd>
        <dt>Statut</dt><dd>${u.suspended ? `Suspendu${u.suspendedReason ? ' — ' + esc(u.suspendedReason) : ''}` : 'Actif'}</dd>
        <dt>Identifiant</dt><dd><small>${esc(u.id)}</small></dd>
      </dl>
      <div class="adm-actions">
        <a class="btn btn-ghost" href="profile.html?id=${encodeURIComponent(u.id)}">${icon('user', 16)} Profil</a>
        ${self ? '' : `<a class="btn btn-ghost" href="chat.html?with=${encodeURIComponent(u.id)}">${icon('message', 16)} Écrire</a>
        <button class="btn btn-ghost" id="uVerify">${u.verified ? 'Retirer le badge' : 'Accorder le badge'}</button>
        <button class="btn btn-ghost" id="uSuspend" style="color:${u.suspended ? 'var(--success)' : 'var(--danger)'}">${u.suspended ? 'Réactiver le compte' : 'Suspendre le compte'}</button>`}
      </div>`,
    actions: [{ label: 'Fermer', primary: true }],
    onOpen: (el, close) => {
      const v = el.querySelector('#uVerify');
      if (v) v.onclick = () => { close(); confirmAction({
        title: u.verified ? `Retirer le badge de ${u.name} ?` : `Accorder le badge à ${u.name} ?`, confirmLabel: 'Confirmer',
        onConfirm: async () => { await ctx.m.updateDoc(ctx.m.doc(ctx.db, 'users', u.id), { verified: !u.verified }); await audit(ctx, u.verified ? 'user_unverify' : 'user_verify', 'user', u.id, u.name); toast('Badge mis à jour'); u.verified = !u.verified; render(); }
      }); };
      const s = el.querySelector('#uSuspend');
      if (s) s.onclick = () => { close(); if (u.suspended) confirmAction({
        title: `Réactiver ${u.name} ?`, confirmLabel: 'Réactiver',
        onConfirm: async () => { await ctx.m.updateDoc(ctx.m.doc(ctx.db, 'users', u.id), { suspended: false, suspendedReason: '' }); await audit(ctx, 'user_unsuspend', 'user', u.id, u.name); toast('Compte réactivé'); u.suspended = false; render(); }
      }); else confirmAction({
        title: `Suspendre ${u.name} ?`, text: 'Ce compte ne pourra plus publier, écrire, suivre ni noter. Ses annonces restent visibles sauf si vous les masquez.', confirmLabel: 'Suspendre', danger: true, reason: { label: 'Motif', required: true },
        onConfirm: async (r) => { await ctx.m.updateDoc(ctx.m.doc(ctx.db, 'users', u.id), { suspended: true, suspendedReason: r }); await audit(ctx, 'user_suspend', 'user', u.id, `${u.name} — ${r}`); toast('Compte suspendu'); u.suspended = true; render(); }
      }); };
    }
  });
}

(async () => {
  ctx = await initAdmin({ minRank: 2, active: mode === 'agence' ? 'admin-agencies.html' : 'admin-users.html' });
  if (!ctx) return;
  main.innerHTML = `<div class="adm-title"><h1>${mode === 'agence' ? 'Agences' : 'Utilisateurs'}</h1></div>
    <div class="adm-filters"><input class="input" id="s" type="search" placeholder="Rechercher par nom (début du nom)" aria-label="Rechercher">
      <select class="select" id="f" aria-label="Filtrer"><option value="all">Tous</option><option value="verified">Vérifiés</option><option value="suspended">Suspendus</option>${mode === 'all' ? '<option value="particulier">Particuliers</option>' : ''}</select></div>
    <div id="list"></div>`;
  let timer;
  main.querySelector('#s').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { text = e.target.value; load(); }, 350); });
  main.querySelector('#f').addEventListener('change', (e) => { filter = e.target.value; load(); });
  main.addEventListener('click', (e) => {
    const r = e.target.closest('[data-id]'); if (r) { const u = rows.find((x) => x.id === r.dataset.id); if (u) openUser(u); return; }
    if (e.target.closest('#moreBtn')) load(true);
  });
  load();
})();
