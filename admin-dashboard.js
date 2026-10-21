// Imova — admin-dashboard.js : admin.html (vue d'ensemble de l'équipe)
import { initAdmin, count, names, nameOf, fmtDate, fmtDateTime, pill, millis, RANK } from './admin.js';
import { lineChart } from './charts.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, explainError } from './utils.js';
import { buckets } from './stats.js';

const main = document.getElementById('main');
const ACTIONS = { verification_approved: 'a approuvé un badge', verification_rejected: 'a refusé un badge', verification_revoked: 'a retiré un badge', user_suspend: 'a suspendu un compte', user_unsuspend: 'a réactivé un compte', user_verify: 'a accordé un badge', user_unverify: 'a retiré un badge', property_hide: 'a masqué une annonce', property_show: 'a réactivé une annonce', property_delete: 'a supprimé une annonce', review_delete: 'a supprimé un avis', report_resolved: 'a résolu un signalement', report_dismissed: 'a rejeté un signalement', report_reviewing: 'a pris un signalement en charge', settings_update: 'a modifié les paramètres', admin_add: 'a ajouté un membre', admin_role: 'a changé un rôle', admin_remove: 'a retiré un membre' };

const card = (ic, label, val, href, alert = false) => `<a class="card adm-card ${alert && val > 0 ? 'alert' : ''}" ${href ? `href="${href}"` : ''}><span class="lbl">${icon(ic, 15)} ${esc(label)}</span><span class="big">${val}</span></a>`;

(async () => {
  const ctx = await initAdmin({ minRank: 1, active: 'admin.html' });
  if (!ctx) return;
  const { m, db, rank } = ctx;
  try {
    const q = (col, ...f) => count(ctx, col, ...f).catch(() => 0);
    const [users, agences, verified, suspended, props, hidden, reviews, reportsOpen, pending] = await Promise.all([
      q('users'), q('users', ['type', '==', 'agence']), q('users', ['verified', '==', true]), q('users', ['suspended', '==', true]),
      q('properties'), q('properties', ['status', '==', 'hidden']), q('reviews'), q('reports', ['status', '==', 'open']),
      rank >= 2 ? q('verificationRequests', ['status', '==', 'pending']) : Promise.resolve(0)
    ]);
    // 14 derniers jours : nouveaux comptes et nouvelles annonces
    const to = new Date(); const from = new Date(to.getTime() - 14 * 86400000);
    const bk = buckets(from, to, 14);
    const series = async (col) => Promise.all(bk.map(([a, b]) => count(ctx, col, ['createdAt', '>=', a], ['createdAt', '<', b]).catch(() => 0)));
    const [newUsers, newProps] = await Promise.all([series('users'), series('properties')]);
    const labels = bk.map(([a]) => a.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
    const [recentUsersSnap, recentPropsSnap] = await Promise.all([
      m.getDocs(m.query(m.collection(db, 'users'), m.orderBy('createdAt', 'desc'), m.limit(6))),
      m.getDocs(m.query(m.collection(db, 'properties'), m.orderBy('createdAt', 'desc'), m.limit(6)))
    ]);
    const ru = recentUsersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const rp = recentPropsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    let logs = [];
    if (rank >= 2) {
      try { logs = (await m.getDocs(m.query(m.collection(db, 'auditLog'), m.orderBy('createdAt', 'desc'), m.limit(10)))).docs.map((d) => d.data()); } catch (e) { /* ignoré */ }
    }
    const nm = await names([...rp.map((p) => p.authorId), ...logs.map((l) => l.actorId)]);

    main.innerHTML = `
      <div class="adm-title"><h1>Tableau de bord</h1></div>
      <section class="adm-grid">
        ${card('flag', 'Signalements ouverts', reportsOpen, 'admin-reports.html', true)}
        ${rank >= 2 ? card('badge', 'Vérifications en attente', pending, 'admin-verifications.html', true) : ''}
        ${card('building', 'Annonces masquées', hidden, 'admin-moderation.html')}
        ${rank >= 2 ? card('lock', 'Comptes suspendus', suspended, 'admin-users.html') : ''}
      </section>
      <section class="adm-grid">
        ${card('users', 'Utilisateurs', users, rank >= 2 ? 'admin-users.html' : '')}
        ${card('home', 'Agences', agences, rank >= 2 ? 'admin-agencies.html' : '')}
        ${card('badge', 'Profils vérifiés', verified)}
        ${card('building', 'Annonces', props, 'admin-properties.html')}
        ${card('star', 'Avis', reviews, 'admin-moderation.html')}
      </section>
      <section class="adm-split">
        <div class="card chart-card"><h3>Nouveaux comptes</h3><p class="chart-sub">${newUsers.reduce((a, b) => a + b, 0)} sur 14 jours</p>${lineChart({ labels, values: newUsers, name: 'Nouveaux comptes' })}</div>
        <div class="card chart-card"><h3>Nouvelles annonces</h3><p class="chart-sub">${newProps.reduce((a, b) => a + b, 0)} sur 14 jours</p>${lineChart({ labels, values: newProps, name: 'Nouvelles annonces' })}</div>
      </section>
      <section class="adm-split">
        <div><h3 class="section-title">Derniers comptes</h3><div class="card adm-list">${ru.map((u) => `<a class="adm-row" href="profile.html?id=${encodeURIComponent(u.id)}"><span class="avatar">${esc((u.name || '?').charAt(0).toUpperCase())}</span><span class="grow"><strong>${esc(u.name || 'Utilisateur')}</strong><small>${u.type === 'agence' ? 'Agence' : 'Particulier'} · ${esc(fmtDate(u.createdAt))}</small></span>${u.verified ? pill('Vérifié', 'ok') : ''}${u.suspended ? pill('Suspendu', 'bad') : ''}</a>`).join('') || '<p class="muted" style="padding:14px">Aucun compte.</p>'}</div></div>
        <div><h3 class="section-title">Dernières annonces</h3><div class="card adm-list">${rp.map((p) => `<a class="adm-row" href="property.html?id=${encodeURIComponent(p.id)}"><span class="grow"><strong>${esc(p.title)}</strong><small>${esc(nameOf(nm, p.authorId))} · ${esc(fmtDate(p.createdAt))}</small></span>${p.status === 'hidden' ? pill('Masquée', 'bad') : ''}</a>`).join('') || '<p class="muted" style="padding:14px">Aucune annonce.</p>'}</div></div>
      </section>
      ${rank >= 2 ? `<h3 class="section-title">Activité de l'équipe</h3><div class="card">${logs.length ? logs.map((l) => `<div class="log-line"><strong>${esc(nameOf(nm, l.actorId))}</strong> ${esc(ACTIONS[l.action] || l.action)}${l.details ? ` — ${esc(l.details)}` : ''}<small>${esc(fmtDateTime(l.createdAt))}</small></div>`).join('') : '<p class="muted" style="padding:14px">Aucune action enregistrée.</p>'}</div>` : ''}`;
    hydrateIcons(main);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="empty"><h2>Chargement impossible</h2><p>${esc(explainError(e))}</p></div>`;
  }
})();
