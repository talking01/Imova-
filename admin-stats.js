// Imova — admin-stats.js : statistiques de la plateforme (administrateurs)
import { initAdmin, count, names, nameOf } from './admin.js';
import { lineChart, barChart } from './charts.js';
import { buckets } from './stats.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, compact, explainError } from './utils.js';

const main = document.getElementById('main');
const PERIODS = { 7: 7, 30: 10, 90: 9 };
let ctx, days = 30;

async function render() {
  const box = main.querySelector('#box');
  box.innerHTML = '<div class="skeleton"><div class="sk sk-line"></div><div class="sk sk-img"></div></div>';
  const { m, db } = ctx;
  try {
    const q = (col, ...f) => count(ctx, col, ...f).catch(() => 0);
    const to = new Date(); const from = new Date(to.getTime() - days * 86400000);
    const bk = buckets(from, to, PERIODS[days]);
    const series = (col) => Promise.all(bk.map(([a, b]) => q(col, ['createdAt', '>=', a], ['createdAt', '<', b])));
    const [users, agences, verified, suspended, props, hidden, reviews, rOpen, rDone, vPend, vOk, vKo, newU, newP, newR, newRep, topAg, topProps] = await Promise.all([
      q('users'), q('users', ['type', '==', 'agence']), q('users', ['verified', '==', true]), q('users', ['suspended', '==', true]),
      q('properties'), q('properties', ['status', '==', 'hidden']), q('reviews'), q('reports', ['status', '==', 'open']), q('reports', ['status', '==', 'resolved']),
      q('verificationRequests', ['status', '==', 'pending']), q('verificationRequests', ['status', '==', 'approved']), q('verificationRequests', ['status', '==', 'rejected']),
      series('users'), series('properties'), series('reviews'), series('reports'),
      m.getDocs(m.query(m.collection(db, 'users'), m.orderBy('followersCount', 'desc'), m.limit(10))),
      m.getDocs(m.query(m.collection(db, 'properties'), m.orderBy('likesCount', 'desc'), m.limit(10)))
    ]);
    // Informations personnelles : répartition par sexe, âge, mode de connexion (comptages, sans lire les comptes un par un)
    const today = new Date();
    const yearsAgo = (n) => new Date(Date.UTC(today.getUTCFullYear() - n, today.getUTCMonth(), today.getUTCDate()));
    const brackets = [['18-24 ans', 18, 25], ['25-34 ans', 25, 35], ['35-44 ans', 35, 45], ['45-54 ans', 45, 55], ['55 ans et plus', 55, 120]];
    const [pTotal, gF, gM, lEmail, lPhone, agP] = await Promise.all([
      q('userPrivate'), q('userPrivate', ['gender', '==', 'F']), q('userPrivate', ['gender', '==', 'M']),
      q('userPrivate', ['loginType', '==', 'email']), q('userPrivate', ['loginType', '==', 'phone']), q('userPrivate', ['accountType', '==', 'agence'])
    ]);
    const ages = await Promise.all(brackets.map(([, lo, hi]) => q('userPrivate', ['birthDate', '<=', yearsAgo(lo)], ['birthDate', '>', yearsAgo(hi)])));
    const bar = (label, v, total) => `<div class="rank-row" style="padding:8px 14px"><span class="rank-text"><strong>${esc(label)}</strong></span><span style="width:42%;height:8px;border-radius:4px;background:var(--surface-2);overflow:hidden"><i style="display:block;height:100%;width:${total ? Math.max(v ? 4 : 0, Math.round((v / total) * 100)) : 0}%;background:var(--accent)"></i></span><strong style="min-width:64px;text-align:right">${compact(v)} <small class="muted">${total ? Math.round((v / total) * 100) : 0} %</small></strong></div>`;
    const ag = topAg.docs.map((d) => ({ id: d.id, ...d.data() }));
    const tp = topProps.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nm = await names(tp.map((p) => p.authorId));
    const labels = bk.map(([a]) => a.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const kv = (rows) => `<div class="card kpi" style="padding:6px 0">${rows.map(([l, v]) => `<div class="switch-line" style="padding:10px 14px"><span>${esc(l)}</span><strong>${compact(v)}</strong></div>`).join('')}</div>`;
    box.innerHTML = `
      <div class="adm-split">
        <div><h3 class="section-title">Comptes</h3>${kv([['Total', users], ['Particuliers', users - agences], ['Agences', agences], ['Profils vérifiés', verified], ['Comptes suspendus', suspended]])}</div>
        <div><h3 class="section-title">Contenu</h3>${kv([['Annonces', props], ['Annonces masquées', hidden], ['Avis', reviews], ['Signalements ouverts', rOpen], ['Signalements résolus', rDone]])}</div>
        <div><h3 class="section-title">Vérifications</h3>${kv([['En attente', vPend], ['Approuvées', vOk], ['Refusées', vKo]])}</div>
      </div>
      <h3 class="section-title">Profil des utilisateurs <small class="muted">(${compact(pTotal)} comptes avec informations personnelles, ${compact(Math.max(0, users - pTotal))} sans)</small></h3>
      <div class="adm-split">
        <div class="card" style="padding:6px 0"><h4 style="padding:8px 14px 0">Sexe</h4>${bar('Féminin', gF, pTotal)}${bar('Masculin', gM, pTotal)}<h4 style="padding:8px 14px 0">Mode de connexion</h4>${bar('Adresse e-mail', lEmail, pTotal)}${bar('Téléphone', lPhone, pTotal)}<h4 style="padding:8px 14px 0">Type de compte</h4>${bar('Particuliers', pTotal - agP, pTotal)}${bar('Agences', agP, pTotal)}</div>
        <div class="card" style="padding:6px 0"><h4 style="padding:8px 14px 0">Âge</h4>${brackets.map(([l], i) => bar(l, ages[i], pTotal)).join('')}</div>
      </div>
      <section class="card chart-card"><h3>Nouveaux comptes</h3><p class="chart-sub">${sum(newU)} sur ${days} jours</p>${lineChart({ labels, values: newU, name: 'Nouveaux comptes' })}</section>
      <section class="card chart-card"><h3>Nouvelles annonces</h3><p class="chart-sub">${sum(newP)} sur ${days} jours</p>${lineChart({ labels, values: newP, name: 'Nouvelles annonces' })}</section>
      <div class="adm-split">
        <section class="card chart-card"><h3>Nouveaux avis</h3><p class="chart-sub">${sum(newR)} sur ${days} jours</p>${barChart({ labels, values: newR, name: 'Nouveaux avis' })}</section>
        <section class="card chart-card"><h3>Nouveaux signalements</h3><p class="chart-sub">${sum(newRep)} sur ${days} jours</p>${barChart({ labels, values: newRep, name: 'Nouveaux signalements', alt: true })}</section>
      </div>
      <div class="adm-split">
        <div><h3 class="section-title">Profils les plus suivis</h3><div class="card adm-list">${ag.map((u, i) => `<a class="adm-row" href="profile.html?id=${encodeURIComponent(u.id)}"><span class="rank-n">${i + 1}</span><span class="grow"><strong>${esc(u.name || 'Utilisateur')}</strong><small>${u.type === 'agence' ? 'Agence' : 'Particulier'}</small></span><strong>${compact(u.followersCount || 0)}</strong></a>`).join('')}</div></div>
        <div><h3 class="section-title">Annonces les plus aimées</h3><div class="card adm-list">${tp.map((p, i) => `<a class="adm-row" href="property.html?id=${encodeURIComponent(p.id)}"><span class="rank-n">${i + 1}</span><span class="grow"><strong>${esc(p.title)}</strong><small>${esc(nameOf(nm, p.authorId))}</small></span><strong>${compact(p.likesCount || 0)}</strong></a>`).join('')}</div></div>
      </div>
      <p class="muted" style="font-size:.8rem">Par respect de la vie privée, les messages ne sont ni lus ni comptés par l'administration.</p>`;
    hydrateIcons(box);
  } catch (e) { console.error(e); box.innerHTML = `<div class="empty"><h2>Chargement impossible</h2><p>${esc(explainError(e))}</p></div>`; }
}

(async () => {
  ctx = await initAdmin({ minRank: 2, active: 'admin-stats.html' });
  if (!ctx) return;
  main.innerHTML = `<div class="adm-title"><h1>Statistiques</h1><select class="select" id="p" style="width:auto" aria-label="Période"><option value="7">7 jours</option><option value="30" selected>30 jours</option><option value="90">90 jours</option></select></div><div id="box"></div>`;
  main.querySelector('#p').addEventListener('change', (e) => { days = Number(e.target.value); render(); });
  render();
})();
