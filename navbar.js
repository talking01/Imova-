// Imova — navbar.js : barre du haut, onglets et champ « Vous cherchez ? » sur chaque page.
// Chaque page contient <div id="navbar"></div> et indique son onglet actif sur le <body> :
//   <body data-tab="home|messages|profile" data-search="true">
import { icon, hydrateIcons } from './icons.js';
import { isReady, guardLinks } from './pages.js';

const TABS = [
  { key: 'home', href: 'index.html', icon: 'home', label: 'Accueil' },
  { key: 'messages', href: 'messages.html', icon: 'message', label: 'Messages' },
  { key: 'profile', href: 'profile.html', icon: 'user', label: 'Profil' }
];

export function renderNavbar() {
  const host = document.getElementById('navbar');
  if (!host) return;
  const active = document.body.dataset.tab || '';
  const withSearch = document.body.dataset.search === 'true';

  host.innerHTML = `
    <header class="navbar">
      <div class="topbar glass">
        <a class="brand" href="index.html" aria-label="Imova, accueil"><img src="logo.svg" width="32" height="32" alt=""><span>Imova</span></a>
        <div class="topbar-actions">
          <a class="icon-btn" href="search.html" aria-label="Rechercher">${icon('search')}</a>
          <a class="icon-btn" href="notifications.html" aria-label="Notifications">${icon('bell')}<span class="badge" data-badge="notifications" hidden></span></a>
          <a class="icon-btn" href="menu.html" aria-label="Menu">${icon('gear')}</a>
        </div>
      </div>
      <nav class="tabs" aria-label="Navigation principale">
        ${TABS.map((t) => `
          <a href="${t.href}" aria-label="${t.label}" ${t.key === active ? 'aria-current="page"' : ''}>
            ${icon(t.icon, 24)}<span class="badge" data-badge="${t.key}" hidden></span>
          </a>`).join('')}
      </nav>
      ${withSearch ? `<a class="searchpill glass" id="searchPill" href="search.html?focus=1">${icon('search', 18)}<span>Vous cherchez ?</span></a>` : ''}
    </header>`;

  guardLinks(host);
  const pill = host.querySelector('#searchPill');
  if (pill && isReady('search.html')) {
    // Le champ glisse vers le haut avant d'ouvrir la recherche
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      pill.classList.add('opening');
      setTimeout(() => { location.href = 'search.html?focus=1'; }, 180);
    });
  }
}

// Change l'onglet souligné (ex. profil : seulement quand c'est MON profil)
export function setActiveTab(key) {
  document.querySelectorAll('.tabs a').forEach((a, i) => {
    const on = TABS[i] && TABS[i].key === key;
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// Affiche une pastille : setBadge('messages', 3) ; setBadge('messages', 0) la cache
export function setBadge(name, count) {
  document.querySelectorAll(`[data-badge="${name}"]`).forEach((el) => {
    el.hidden = !(count > 0);
    el.textContent = count > 99 ? '99+' : String(count);
  });
}

renderNavbar();
hydrateIcons();
