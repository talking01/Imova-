// Imova — menu.js : page menu.html (d'après ton croquis) + comptes enregistrés sur l'appareil
import { icon, hydrateIcons } from './icons.js';
import { getTheme, toggleTheme, toast, esc } from './utils.js';
import { pageHeader, bindBack } from './components.js';
import { isReady, notReadyMessage } from './pages.js';
import { whenReady, getUser, logout, switchAccount } from './auth.js';
import { listAccounts } from './accounts.js';
import { activeSlot, isConfigured } from './firebase.js';
import { openModal } from './modal.js';
import { optimized } from './viewer.js';
import { firestore } from './firebase.js';
import { getUserDoc } from './users.js';
import { getMyRequest } from './verification.js';

const TYPES = { particulier: 'Particulier', agence: 'Agence' };

const LINKS_AFTER_MODE = [
  { icon: 'heart', label: 'Mes favoris', href: 'favorites.html' },
  { icon: 'chart', label: 'Tableau de bord', href: 'dashboard.html' },
  { icon: 'badge', label: 'Vérification', href: 'badge.html' },
  { icon: 'lock', label: 'Confidentialité', href: 'privacy.html' },
  { icon: 'help', label: 'Aide et assistance', href: 'help.html' },
  { icon: 'file', label: 'Politique de confidentialité', href: 'policy.html' }
];

const linkRow = (ic, label, href) =>
  `<a class="row" href="${href}">${icon(ic)}<span class="row-label">${label}</span>${icon('chevron', 18)}</a>`;

function modeRow() {
  const dark = getTheme() === 'dark';
  return `<button class="row" id="rowMode" role="switch" aria-checked="${dark}">
    <span id="modeIcon">${icon(dark ? 'moon' : 'sun')}</span>
    <span class="row-label" id="modeLabel">Mode ${dark ? 'sombre' : 'clair'}</span>
    <span class="switch ${dark ? 'on' : ''}" id="modeSwitch"></span>
  </button>`;
}

function avatar(name, photoUrl) {
  const initial = esc((name || '?').trim().charAt(0).toUpperCase() || '?');
  return `<span class="avatar">${photoUrl ? `<img src="${esc(optimized(photoUrl, 120))}" alt="">` : initial}</span>`;
}

function renderList(user) {
  const profile = user
    ? `<a class="row account" href="profile.html">${avatar(user.name || user.email, user.photoUrl)}<span class="row-label"><strong>${esc(user.name || 'Mon profil')}</strong><small>Voir mon profil</small></span>${icon('chevron', 18)}</a>`
    : linkRow('user', 'Mon profil', 'profile.html');
  const last = user
    ? `<button class="row danger" id="rowLogout">${icon('logout')}<span class="row-label">Déconnexion</span></button>`
    : linkRow('login', 'Se connecter', 'login.html');
  document.getElementById('menuList').innerHTML =
    profile + modeRow() + LINKS_AFTER_MODE.map((r) => linkRow(r.icon, r.label, r.href)).join('') + last;

  // Les pages pas encore livrées affichent un message au lieu d'ouvrir une page inexistante
  document.querySelectorAll('#menuList a[href]').forEach((a) => {
    if (!isReady(a.getAttribute('href'))) a.addEventListener('click', (e) => { e.preventDefault(); notReadyMessage(); });
  });

  document.getElementById('rowMode').addEventListener('click', () => {
    const next = toggleTheme();
    const dark = next === 'dark';
    document.getElementById('modeSwitch').classList.toggle('on', dark);
    document.getElementById('modeLabel').textContent = `Mode ${dark ? 'sombre' : 'clair'}`;
    document.getElementById('modeIcon').innerHTML = icon(dark ? 'moon' : 'sun');
    document.getElementById('rowMode').setAttribute('aria-checked', String(dark));
    toast(dark ? 'Mode sombre activé' : 'Mode clair activé');
  });

  const out = document.getElementById('rowLogout');
  if (out) {
    out.addEventListener('click', () => openModal({
      title: 'Se déconnecter ?',
      html: '<p class="muted">Ce compte sera retiré de cet appareil. Vous pourrez vous reconnecter à tout moment.</p>',
      actions: [
        { label: 'Annuler' },
        { label: 'Se déconnecter', primary: true, onClick: async () => { await logout(); location.href = 'index.html'; } }
      ]
    }));
  }
}

function renderAccounts(user) {
  const list = listAccounts();
  const active = activeSlot();
  const rows = list.map((a) => `
    <button class="row account" data-slot="${esc(a.slot)}">
      ${avatar(a.name || a.email, a.photoUrl)}
      <span class="row-label"><strong>${esc(a.name || a.email)}</strong><small>${esc(a.email || '')}${a.type ? ' · ' + esc(TYPES[a.type] || a.type) : ''}</small></span>
      ${user && a.slot === active ? '<span class="tag">Actif</span>' : ''}
    </button>`).join('');
  document.getElementById('accounts').innerHTML = `
    <div class="stack">
      ${list.length
        ? `<div class="list">${rows}</div>`
        : `<div class="notice" style="background:var(--surface);border-color:var(--border);color:var(--text-muted)">Aucun compte enregistré sur cet appareil.</div>`}
      ${isConfigured ? `<a class="btn btn-ghost" href="login.html?add=1">${icon('plus', 18)} Ajouter un compte</a>` : ''}
    </div>`;
  document.querySelectorAll('#accounts [data-slot]').forEach((b) => {
    b.addEventListener('click', () => {
      if (user && b.dataset.slot === active) return;
      switchAccount(b.dataset.slot);
      location.href = 'index.html';
    });
  });
}

// Après affichage : état du badge (Vérifié / En attente) et ligne « Administration » pour l'équipe
async function enrich(user) {
  if (!user) return;
  try {
    const [u, req] = await Promise.all([getUserDoc(user.uid), getMyRequest(user.uid).catch(() => null)]);
    const row = document.querySelector('#menuList a[href="badge.html"] .row-label');
    if (row) {
      const tag = u && u.verified ? ['Vérifié', 'ok'] : req && req.status === 'pending' ? ['En attente', 'warn'] : null;
      if (tag) row.insertAdjacentHTML('beforeend', ` <span class="pill ${tag[1]}">${tag[0]}</span>`);
    }
  } catch (e) { /* facultatif */ }
  try {
    const fs = await firestore();
    const s = await fs.m.getDoc(fs.m.doc(fs.db, 'admins', user.uid));
    if (s.exists() && !document.getElementById('adminRow')) {
      document.getElementById('menuList').insertAdjacentHTML('afterbegin', `<a class="row" id="adminRow" href="admin.html">${icon('shield')}<span class="row-label">Administration</span>${icon('chevron', 18)}</a>`);
      hydrateIcons(document.getElementById('menuList'));
    }
  } catch (e) { /* pas membre de l'équipe */ }
}

async function run() {
  document.getElementById('pageHeader').innerHTML = pageHeader('Menu');
  bindBack();
  renderList(null);
  renderAccounts(null);
  hydrateIcons();
  const user = await whenReady();
  renderList(user || getUser());
  renderAccounts(user || getUser());
  hydrateIcons();
  enrich(user || getUser());
}

run();
