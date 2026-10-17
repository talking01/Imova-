// Imova — agencies.js : page agencies.html (annuaire des agences)
import { firestore, isConfigured } from './firebase.js';
import { pageHeader, bindBack, emptyState, skeletonCard, stars, average } from './components.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, compact, explainError } from './utils.js';
import { optimized } from './viewer.js';
import { normalizeText } from './search.js';

const main = document.getElementById('main');
document.getElementById('pageHeader').innerHTML = pageHeader('Agences');
bindBack();

function rows(list) {
  if (!list.length) return emptyState({ iconName: 'building', title: 'Aucune agence', text: 'Aucune agence ne correspond.' });
  return `<div class="list">${list.map((u) => `
    <a class="person" href="profile.html?id=${encodeURIComponent(u.id)}">
      <span class="avatar">${u.photoUrl ? `<img src="${esc(optimized(u.photoUrl, 120))}" alt="" loading="lazy">` : esc((u.name || '?').trim().charAt(0).toUpperCase())}</span>
      <span class="person-text"><strong>${esc(u.name)}${u.verified ? `<span class="verified">${icon('badge', 16)}</span>` : ''}</strong>
        <small>${stars(average(u), 13)} ${u.ratingCount ? `(${compact(u.ratingCount)})` : ''} · ${compact(u.followersCount || 0)} abonné${(u.followersCount || 0) > 1 ? 's' : ''}</small></span>
    </a>`).join('')}</div>`;
}

async function run() {
  if (!isConfigured) { main.innerHTML = emptyState({ iconName: 'building', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js.' }); hydrateIcons(); return; }
  main.innerHTML = skeletonCard();
  try {
    const { m, db } = await firestore();
    const snap = await m.getDocs(m.query(m.collection(db, 'users'), m.where('type', '==', 'agence'), m.limit(60)));
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.name)
      .sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0) || (b.followersCount || 0) - (a.followersCount || 0) || average(b) - average(a));
    main.innerHTML = `
      <label class="sticky-search glass">${icon('search', 20)}<input id="f" type="search" placeholder="Filtrer par nom" autocomplete="off" aria-label="Filtrer les agences"></label>
      <p class="result-meta" id="count"></p><div id="list"></div>`;
    const list = main.querySelector('#list');
    const count = main.querySelector('#count');
    const paint = (items) => { list.innerHTML = rows(items); count.textContent = `${items.length} agence${items.length > 1 ? 's' : ''}`; hydrateIcons(list); };
    paint(all);
    hydrateIcons(main);
    main.querySelector('#f').addEventListener('input', (e) => {
      const q = normalizeText(e.target.value.trim());
      paint(q ? all.filter((u) => normalizeText(u.name).includes(q)) : all);
    });
  } catch (e) {
    console.error(e);
    main.innerHTML = emptyState({ iconName: 'building', title: 'Chargement impossible', text: explainError(e) });
    hydrateIcons();
  }
}
run();
