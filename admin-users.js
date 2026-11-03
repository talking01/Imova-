// Imova — admin-users.js : admin-users.html (tous les comptes) et admin-agencies.html (agences seulement)
import { initAdmin, audit, fmtDate, fmtDateTime, pill, confirmAction } from './admin.js';
import { normalizePhone, fullNameOf, genderLabel, ageOf, dateToIso, isPhoneEmail, emailToPhone } from './identity.js';
import { openModal } from './modal.js';
import { dossierHtml, grantModal, untilLabel } from './verif-view.js';
import { isBadgeActive, isBadgeExpired, daysLeft, untilMs } from './badge-rules.js';
import { planOf } from './badge-config.js';
import { notify } from './notifs.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, explainError, compact } from './utils.js';
import { emptyState } from './components.js';
import { optimized } from './viewer.js';

const mode = document.body.dataset.mode || 'all';
const main = document.getElementById('main');
let ctx, rows = [], filter = 'all', text = '', cursor = null, more = false;
let priv = new Map(); // informations personnelles (userPrivate) des comptes affichés

// Une recherche qui ressemble à une adresse e-mail ou un numéro cherche dans les coordonnées des comptes
function contactKey(t) {
  const s = String(t || '').trim().toLowerCase();
  if (s.includes('@')) return s;
  return /^[+\d][\d\s().-]{6,}$/.test(s) ? normalizePhone(s) : '';
}
async function loadPriv(list) {
  const { m, db } = ctx;
  const ids = list.map((u) => u.id).filter((id) => !priv.has(id));
  await Promise.all(ids.map(async (id) => { try { const s = await m.getDoc(m.doc(db, 'userPrivate', id)); priv.set(id, s.exists() ? s.data() : null); } catch (e) { priv.set(id, null); } }));
}
const contactOf = (p) => (p ? [p.phone, p.email].filter(Boolean).join(' · ') : '');

const matchMode = (u) => mode !== 'agence' || u.type === 'agence';
const matchFilter = (u) => (filter === 'verified' ? !!u.verified : filter === 'suspended' ? !!u.suspended : filter === 'particulier' ? u.type !== 'agence' : true);

async function load(append = false) {
  const list = main.querySelector('#list');
  if (!append) { list.innerHTML = '<div class="skeleton"><div class="sk sk-line"></div><div class="sk sk-img"></div></div>'; cursor = null; rows = []; }
  const { m, db } = ctx;
  try {
    const ck = contactKey(text);
    if (ck) {
      const ps = await m.getDocs(m.query(m.collection(db, 'userPrivate'), m.where('searchKeys', 'array-contains', ck), m.limit(10)));
      const users = await Promise.all(ps.docs.map((d) => m.getDoc(m.doc(db, 'users', d.id))));
      ps.docs.forEach((d) => priv.set(d.id, d.data()));
      rows = users.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }));
      more = false; render(); return;
    }
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
    await loadPriv(rows);
  } catch (e) { console.error(e); list.innerHTML = emptyState({ iconName: 'users', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(list); return; }
  render();
}

function render() {
  const list = main.querySelector('#list');
  const shown = rows.filter(matchMode).filter(matchFilter);
  list.innerHTML = shown.length ? `<div class="card adm-list">${shown.map((u) => `
    <button class="adm-row" data-id="${esc(u.id)}" style="text-align:left;width:100%">
      <span class="avatar">${u.photoUrl ? `<img src="${esc(optimized(u.photoUrl, 100))}" alt="">` : esc((u.name || '?').trim().charAt(0).toUpperCase())}</span>
      <span class="grow"><strong>${esc(u.name || 'Utilisateur')}</strong><small>${u.type === 'agence' ? 'Agence' : 'Particulier'} · inscrit le ${esc(fmtDate(u.createdAt))} · ${compact(u.followersCount || 0)} abonnés</small>
        ${priv.get(u.id) ? `<small>${u.type === 'agence' ? 'Responsable : ' : ''}${esc(fullNameOf(priv.get(u.id)))} · ${esc(contactOf(priv.get(u.id)))}</small>` : '<small>Informations personnelles non renseignées</small>'}</span>
      ${isBadgeActive(u) ? pill('Vérifié', 'ok') : isBadgeExpired(u) ? pill('Badge expiré', 'warn') : ''}${u.suspended ? pill('Suspendu', 'bad') : ''}
    </button>`).join('')}</div>${more ? '<div class="more-wrap"><button class="btn btn-ghost" id="moreBtn">Voir plus</button></div>' : ''}`
    : emptyState({ iconName: 'users', title: 'Aucun résultat' });
  hydrateIcons(list);
}

function personalHtml(u) {
  const p = priv.get(u.id);
  if (!p) return '<p class="muted" style="margin:8px 0">Informations personnelles non renseignées (compte créé avant l\'étape 8).</p>';
  const iso = dateToIso(p.birthDate);
  const row = (l, v) => `<dt>${esc(l)}</dt><dd>${esc(v || '—')}</dd>`;
  return `<h4 style="margin:12px 0 4px">Informations personnelles</h4><dl class="kv">
    ${p.accountType === 'agence' ? row("Nom de l'agence", p.agencyName) : ''}
    ${row(p.accountType === 'agence' ? "Responsable de l'agence" : 'Nom complet', fullNameOf(p))}
    ${row('Sexe', genderLabel(p.gender))}
    ${row('Date de naissance', iso ? `${new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} (${ageOf(iso)} ans)` : '')}
    ${row('Téléphone', p.phone)}
    ${row('E-mail', p.email)}
    ${row('Identifiant de connexion', p.loginType === 'phone' ? `Téléphone ${p.loginId}` : p.loginId)}
    ${row('Conditions acceptées', p.consent && p.consent.acceptedAt ? `le ${fmtDateTime(p.consent.acceptedAt)} (version ${p.consent.version || '—'})` : '')}
  </dl>`;
}

async function exportCsv() {
  const { m, db } = ctx;
  const parts = [m.collection(db, 'userPrivate')];
  if (mode === 'agence') parts.push(m.where('accountType', '==', 'agence'));
  const snap = await m.getDocs(m.query(...parts, m.limit(500)));
  const rowsP = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const users = await Promise.all(rowsP.map(async (r) => { try { const s = await m.getDoc(m.doc(db, 'users', r.id)); return s.exists() ? s.data() : {}; } catch (e) { return {}; } }));
  const esc2 = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const head = ['Identifiant', 'Type', 'Nom affiché', 'Agence', 'Nom', 'Post-nom', 'Prénom', 'Sexe', 'Date de naissance', 'Âge', 'Téléphone', 'E-mail', 'Connexion', 'Vérifié', 'Suspendu', 'Inscrit le'];
  const lines = rowsP.map((r, i) => { const iso = dateToIso(r.birthDate); const u = users[i] || {}; return [r.id, r.accountType, u.name, r.agencyName, r.lastName, r.postName, r.firstName, genderLabel(r.gender), iso, iso ? ageOf(iso) : '', r.phone, r.email, r.loginType === 'phone' ? r.loginId : r.loginId, u.verified ? 'oui' : 'non', u.suspended ? 'oui' : 'non', fmtDate(u.createdAt || r.createdAt)].map(esc2).join(','); });
  const blob = new Blob(['\ufeff' + [head.map(esc2).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `imova-${mode === 'agence' ? 'agences' : 'comptes'}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  await audit(ctx, 'export_users', 'users', mode, `${rowsP.length} lignes`);
  toast(`${rowsP.length} comptes exportés`);
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
        <dt>Badge</dt><dd>${isBadgeActive(u) ? (u.verifiedUntil ? `Actif jusqu'au ${esc(untilLabel(u))} (${daysLeft(u)} j)${u.verifiedPlan ? ' · ' + esc((planOf(u.verifiedPlan) || {}).label || '') : ''}` : 'Actif (sans date de fin)') : isBadgeExpired(u) ? `Expiré le ${esc(untilLabel(u))}` : 'Non vérifié'}</dd>
        <dt>Statut</dt><dd>${u.suspended ? `Suspendu${u.suspendedReason ? ' — ' + esc(u.suspendedReason) : ''}` : 'Actif'}</dd>
        <dt>Identifiant</dt><dd><small>${esc(u.id)}</small></dd>
      </dl>
      ${personalHtml(u)}
      <div class="adm-actions">
        <a class="btn btn-ghost" href="profile.html?id=${encodeURIComponent(u.id)}">${icon('user', 16)} Profil</a>
        ${self ? '' : `<a class="btn btn-ghost" href="chat.html?with=${encodeURIComponent(u.id)}">${icon('message', 16)} Écrire</a>
        <button class="btn btn-ghost" id="uGrant">${isBadgeActive(u) ? 'Prolonger le badge…' : 'Accorder le badge…'}</button>
        ${u.verified ? '<button class="btn btn-ghost" id="uRevoke" style="color:var(--danger)">Retirer le badge</button>' : ''}
        <button class="btn btn-ghost" id="uDossier">Dossier de vérification</button>
        <button class="btn btn-ghost" id="uSuspend" style="color:${u.suspended ? 'var(--success)' : 'var(--danger)'}">${u.suspended ? 'Réactiver le compte' : 'Suspendre le compte'}</button>`}
      </div>`,
    actions: [{ label: 'Fermer', primary: true }],
    onOpen: (el, close) => {
      const g = el.querySelector('#uGrant');
      if (g) g.onclick = () => { close(); grantModal({
        title: isBadgeActive(u) ? `Prolonger le badge de ${u.name}` : `Accorder le badge à ${u.name}`, plan: u.verifiedPlan || 'm1', currentUntil: isBadgeActive(u) ? untilMs(u) : 0,
        confirmLabel: isBadgeActive(u) ? 'Prolonger' : 'Accorder le badge',
        onConfirm: async ({ plan, until, note }) => {
          await ctx.m.updateDoc(ctx.m.doc(ctx.db, 'users', u.id), { verified: true, verifiedUntil: new Date(until), verifiedPlan: plan });
          await audit(ctx, 'user_verify', 'user', u.id, `${u.name} — ${(planOf(plan) || {}).label} jusqu'au ${new Date(until).toLocaleDateString('fr-FR')}`);
          notify(u.id, { type: 'verification', id: `verification_${Date.now()}`, title: 'Badge de vérification accordé', body: `Actif jusqu'au ${new Date(until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.${note ? ' ' + note : ''}`, link: 'badge.html' });
          toast('Badge accordé'); u.verified = true; u.verifiedUntil = new Date(until); u.verifiedPlan = plan; render();
        }
      }); };
      const rv = el.querySelector('#uRevoke');
      if (rv) rv.onclick = () => { close(); confirmAction({
        title: `Retirer le badge de ${u.name} ?`, text: 'Le badge est retiré tout de suite, sans attendre sa date de fin.', confirmLabel: 'Retirer le badge', danger: true, reason: { label: 'Motif (facultatif)' },
        onConfirm: async (note) => {
          await ctx.m.updateDoc(ctx.m.doc(ctx.db, 'users', u.id), { verified: false, verifiedUntil: ctx.m.deleteField(), verifiedPlan: ctx.m.deleteField() });
          await audit(ctx, 'user_unverify', 'user', u.id, `${u.name}${note ? ' — ' + note : ''}`);
          notify(u.id, { type: 'verification', id: `verification_${Date.now()}`, title: 'Badge de vérification retiré', body: note || '', link: 'badge.html' });
          toast('Badge retiré'); u.verified = false; delete u.verifiedUntil; render();
        }
      }); };
      const dos = el.querySelector('#uDossier');
      if (dos) dos.onclick = async () => {
        close();
        let r = null;
        try { const s = await ctx.m.getDoc(ctx.m.doc(ctx.db, 'verificationRequests', u.id)); r = s.exists() ? s.data() : null; } catch (x) { /* ignoré */ }
        openModal({ title: `Dossier de ${u.name}`, html: r ? dossierHtml(r, priv.get(u.id)) : '<p class="muted">Aucune demande de vérification pour ce compte.</p>', actions: [{ label: 'Fermer', primary: true }] });
      };
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
    <div class="adm-filters"><input class="input" id="s" type="search" placeholder="Nom (début), e-mail ou téléphone" aria-label="Rechercher">
      <select class="select" id="f" aria-label="Filtrer"><option value="all">Tous</option><option value="verified">Vérifiés</option><option value="suspended">Suspendus</option>${mode === 'all' ? '<option value="particulier">Particuliers</option>' : ''}</select></div>
    <div style="display:flex;justify-content:flex-end"><button class="btn btn-ghost" id="csvBtn">Exporter en CSV</button></div>
    <div id="list"></div>`;
  main.querySelector('#csvBtn').addEventListener('click', async (e) => { e.currentTarget.disabled = true; try { await exportCsv(); } catch (x) { console.error(x); toast(explainError(x)); } e.currentTarget.disabled = false; });
  let timer;
  main.querySelector('#s').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { text = e.target.value; load(); }, 350); });
  main.querySelector('#f').addEventListener('change', (e) => { filter = e.target.value; load(); });
  main.addEventListener('click', (e) => {
    const r = e.target.closest('[data-id]'); if (r) { const u = rows.find((x) => x.id === r.dataset.id); if (u) openUser(u); return; }
    if (e.target.closest('#moreBtn')) load(true);
  });
  load();
})();
