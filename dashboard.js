// Imova — dashboard.js : page dashboard.html (mon tableau de bord)
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import { getUserDoc } from './users.js';
import { fetchByAuthor } from './properties.js';
import { timeline, countEvents } from './stats.js';
import { lineChart, barChart } from './charts.js';
import { pageHeader, bindBack, emptyState, skeletonCard, stars, average, formatAverage } from './components.js';
import { isConfigured } from './firebase.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, compact, explainError } from './utils.js';

const main = document.getElementById('main');
document.getElementById('pageHeader').innerHTML = pageHeader('Tableau de bord');
bindBack();

const PERIODS = { 7: { n: 7, label: '7 jours' }, 30: { n: 10, label: '30 jours' }, 90: { n: 9, label: '90 jours' } };
let me = null, user = null, myPosts = [], days = 30;

const labelOf = (d, span) => (span <= 1.2 * 86400000 ? d.toLocaleDateString('fr-FR', { weekday: 'short' }) : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));

function deltaHtml(cur, prev) {
  if (!prev && !cur) return '<span class="delta flat">—</span>';
  if (!prev) return `<span class="delta up">${icon('trending', 14)} Nouveau</span>`;
  const p = Math.round(((cur - prev) / prev) * 100);
  const cls = p > 0 ? 'up' : p < 0 ? 'down' : 'flat';
  return `<span class="delta ${cls}">${p > 0 ? '+' : ''}${p} %</span>`;
}

function kpi(ic, label, value, sub = '') {
  return `<div class="card kpi"><div class="kpi-top">${icon(ic, 16)}<span>${esc(label)}</span></div><div class="kpi-val">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

async function loadPeriod() {
  const box = document.getElementById('periodBox');
  box.innerHTML = skeletonCard();
  const { n } = PERIODS[days];
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const prevFrom = new Date(from.getTime() - days * 86400000);
  try {
    const [views, visits, convs, prevViews, prevVisits, prevConvs] = await Promise.all([
      timeline(me.uid, 'view', from, to, n), timeline(me.uid, 'profile', from, to, n), timeline(me.uid, 'conversation', from, to, n),
      countEvents(me.uid, 'view', prevFrom, from), countEvents(me.uid, 'profile', prevFrom, from), countEvents(me.uid, 'conversation', prevFrom, from)
    ]);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const step = (to - from) / n;
    const labels = Array.from({ length: n }, (_, i) => labelOf(new Date(from.getTime() + i * step), step));
    const totalLikes = myPosts.reduce((s, p) => s + (Number(p.likesCount) || 0), 0);
    const totalViews = myPosts.reduce((s, p) => s + (Number(p.viewsCount) || 0), 0);
    const avg = average(user);
    const top = [...myPosts].sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0) || (b.likesCount || 0) - (a.likesCount || 0)).slice(0, 5);

    const tips = [];
    if (!myPosts.length) tips.push("Publiez votre première annonce : c'est le meilleur moyen d'apparaître dans les recommandations.");
    if (myPosts.some((p) => !(p.media || []).length)) tips.push('Certaines de vos annonces n\'ont pas de photo : les annonces avec photos sont bien plus consultées.');
    if (!user.verified) tips.push('Demandez le badge de vérification (Menu → Vérification) pour inspirer confiance.');
    if (!user.bio) tips.push('Ajoutez une courte bio à votre profil.');

    box.innerHTML = `
      <div class="kpis">
        ${kpi('eyeOpen', 'Vues des annonces', compact(sum(views)), `${deltaHtml(sum(views), prevViews)} <span>vs période précédente</span>`)}
        ${kpi('user', 'Visites du profil', compact(sum(visits)), `${deltaHtml(sum(visits), prevVisits)} <span>vs période précédente</span>`)}
        ${kpi('message', 'Nouvelles conversations', compact(sum(convs)), `${deltaHtml(sum(convs), prevConvs)} <span>vs période précédente</span>`)}
        ${kpi('building', 'Annonces publiées', compact(myPosts.length), `${compact(totalViews)} vues au total`)}
        ${kpi('thumb', "J'aime reçus", compact(totalLikes), 'sur toutes vos annonces')}
        ${kpi('users', 'Abonnés', compact(user.followersCount || 0), 'à votre profil')}
        ${kpi('star', 'Note moyenne', user.ratingCount ? formatAverage(avg) : '—', user.ratingCount ? `${stars(avg, 14)} ${compact(user.ratingCount)} avis` : "Pas encore d'avis")}
      </div>
      <section class="card chart-card"><h3>Vues des annonces</h3><p class="chart-sub">${sum(views)} sur ${PERIODS[days].label}</p>${lineChart({ labels, values: views, name: 'Vues des annonces' })}</section>
      <section class="card chart-card"><h3>Visites du profil</h3><p class="chart-sub">${sum(visits)} sur ${PERIODS[days].label}</p>${lineChart({ labels, values: visits, name: 'Visites du profil' })}</section>
      <section class="card chart-card"><h3>Nouvelles conversations</h3><p class="chart-sub">${sum(convs)} sur ${PERIODS[days].label}</p>${barChart({ labels, values: convs, name: 'Nouvelles conversations', alt: true })}</section>
      <h3 class="section-title">Vos annonces les plus vues</h3>
      ${top.length ? `<section class="card rank">${top.map((p, i) => `
        <a class="rank-row" href="property.html?id=${encodeURIComponent(p.id)}"><span class="rank-n">${i + 1}</span>
          <span class="rank-text"><strong>${esc(p.title)}</strong><small>${esc(new Date(p.createdAt && p.createdAt.toDate ? p.createdAt.toDate() : p.createdAt).toLocaleDateString('fr-FR'))}</small></span>
          <span class="rank-stats"><span>${icon('eyeOpen', 15)} ${compact(p.viewsCount || 0)}</span><span>${icon('thumb', 15)} ${compact(p.likesCount || 0)}</span></span></a>`).join('')}</section>`
        : emptyState({ iconName: 'building', title: 'Pas encore d\'annonce', text: 'Vos statistiques par annonce apparaîtront ici.', actionLabel: 'Publier une annonce', actionHref: 'publish.html' })}
      ${tips.length ? `<h3 class="section-title">Conseils</h3>${tips.map((t) => `<div class="tip">${icon('info', 18)}<span>${esc(t)}</span></div>`).join('')}` : ''}
      <p class="muted" style="font-size:.8rem;padding:8px 6px">Les vues et visites comptent les personnes connectées (une fois par jour et par élément). Vos propres visites ne sont pas comptées.</p>`;
    hydrateIcons(box);
  } catch (e) {
    console.error(e);
    box.innerHTML = emptyState({
      iconName: 'chart', title: 'Statistiques indisponibles',
      text: e && e.code === 'failed-precondition' ? "Un index Firestore est nécessaire : créez l'index « events » (voir GUIDE-FIREBASE.md, étape A8)." : explainError(e)
    });
    hydrateIcons(box);
  }
}

async function run() {
  if (!isConfigured) { main.innerHTML = emptyState({ iconName: 'chart', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js.' }); hydrateIcons(); return; }
  main.innerHTML = skeletonCard();
  me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  try {
    user = await getUserDoc(me.uid);
    myPosts = (await fetchByAuthor(me.uid, { size: 100, includeHidden: true })).items;
  } catch (e) { console.error(e); main.innerHTML = emptyState({ iconName: 'chart', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(); return; }
  main.innerHTML = `
    <div class="seg-periods glass" role="tablist" aria-label="Période">${Object.keys(PERIODS).map((d) => `<button type="button" role="tab" data-d="${d}" aria-selected="${Number(d) === days}">${PERIODS[d].label}</button>`).join('')}</div>
    <div id="periodBox"></div>`;
  main.querySelector('.seg-periods').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b || Number(b.dataset.d) === days) return;
    days = Number(b.dataset.d);
    main.querySelectorAll('[data-d]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    loadPeriod();
  });
  loadPeriod();
}
run();
