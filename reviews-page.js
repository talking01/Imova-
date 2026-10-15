// Imova — reviews-page.js : page reviews.html?id=... (avis et commentaires d'un profil)
import { whenReady } from './auth.js';
import { requireAuth } from './guards.js';
import { getUserDoc } from './users.js';
import { listReviews } from './reviews.js';
import { loadAuthors } from './properties.js';
import { openRatingModal } from './rating-modal.js';
import { pageHeader, bindBack, emptyState, skeletonCard, stars, average, formatAverage } from './components.js';
import { isConfigured } from './firebase.js';
import { esc, param, timeAgo, explainError, compact } from './utils.js';
import { optimized } from './viewer.js';
import { hydrateIcons } from './icons.js';

const main = document.getElementById('main');
const id = param('id');

document.getElementById('pageHeader').innerHTML = pageHeader('Avis');
bindBack();

const avatar = (a) => `<span class="avatar">${a.photoUrl ? `<img src="${esc(optimized(a.photoUrl, 120))}" alt="" loading="lazy">` : esc((a.name || '?').trim().charAt(0).toUpperCase() || '?')}</span>`;

async function run() {
  if (!id) { main.innerHTML = emptyState({ iconName: 'star', title: 'Profil introuvable', actionLabel: "Retour à l'accueil", actionHref: 'index.html' }); hydrateIcons(); return; }
  if (!isConfigured) { main.innerHTML = emptyState({ iconName: 'star', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js.' }); hydrateIcons(); return; }
  main.innerHTML = skeletonCard();
  const me = await whenReady();
  try {
    const owner = await getUserDoc(id);
    if (!owner) { main.innerHTML = emptyState({ iconName: 'user', title: 'Profil introuvable', actionLabel: "Retour à l'accueil", actionHref: 'index.html' }); hydrateIcons(); return; }
    const reviews = await listReviews(id);
    const authors = await loadAuthors(reviews.map((r) => r.reviewerId));
    const avg = average(owner);
    const isOwn = !!me && me.uid === id;
    const mine = me ? reviews.find((r) => r.reviewerId === me.uid) : null;

    main.innerHTML = `
      <section class="card summary">
        <p class="muted">${esc(owner.name || '')}</p>
        <p class="big-number">${owner.ratingCount ? formatAverage(avg) : '–'}</p>
        ${stars(avg, 24)}
        <p class="muted">${owner.ratingCount ? `${compact(owner.ratingCount)} avis` : "Pas encore d'avis"}</p>
        ${isOwn ? '' : `<button class="btn btn-primary" id="rateBtn">${mine ? 'Modifier mon avis' : 'Donner mon avis'}</button>`}
      </section>
      <section class="card" style="margin-top:12px" id="list">
        ${reviews.length ? reviews.map((r) => {
          const a = authors.get(r.reviewerId) || {};
          const isMine = me && r.reviewerId === me.uid;
          return `<article class="review ${isMine ? 'mine' : ''}">
            <div class="review-head">${avatar(a)}<div class="meta"><strong>${esc(a.name || 'Utilisateur')}${isMine ? ' (vous)' : ''}</strong><small>${esc(timeAgo(r.updatedAt || r.createdAt))}</small></div>${stars(r.rating)}</div>
            ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
          </article>`;
        }).join('') : emptyState({ iconName: 'star', title: "Pas encore d'avis", text: isOwn ? "Vos avis apparaîtront ici." : "Soyez le premier à donner votre avis." })}
      </section>`;
    const btn = main.querySelector('#rateBtn');
    if (btn) btn.addEventListener('click', () => {
      if (requireAuth('donner votre avis')) openRatingModal({ targetId: id, reviewerId: me.uid, onDone: run });
    });
    hydrateIcons(main);
  } catch (e) {
    console.error(e);
    main.innerHTML = emptyState({ iconName: 'star', title: 'Chargement impossible', text: explainError(e) });
    hydrateIcons();
  }
}

run();
