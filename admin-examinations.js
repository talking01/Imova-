// Imova — admin-examinations.js : examen des comptes (restriction, suspension, suppression) par les administrateurs.
// Le dossier réunit tout ce qu'il faut pour vérifier réellement un compte : identité et coordonnées, profil, annonces, signalements reçus,
// dossier de vérification, historique et notes internes. Les décisions préviennent automatiquement la personne.
import { initAdmin, names, fmtDate, fmtDateTime, pill, millis } from './admin.js';
import { restrictAccount, suspendAccount, deleteAccountByStaff, restoreAccount, liftRestriction, continueExamination, addNote, getNotes } from './account-actions.js';
import { dossierHtml } from './verif-view.js';
import { statusOf, RESTRICTION_PRESETS, fmtWhen } from './account-status.js';
import { isBadgeActive } from './badge-rules.js';
import { fullNameOf, genderLabel, ageOf, dateToIso } from './identity.js';
import { openModal } from './modal.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, explainError, compact, param } from './utils.js';
import { emptyState } from './components.js';

const main = document.getElementById('main');
let ctx, tab = 'open', cases = [], authors = new Map();
const TABS = [['open', 'En cours'], ['deleted', 'Supprimés'], ['closed', 'Terminés']];
const STATE = { restricted: ['Restreint', 'warn'], suspended: ['Suspendu', 'bad'], deleted: ['Supprimé', 'bad'], active: ['Actif', 'ok'] };

async function loadList() {
  const box = main.querySelector('#list');
  box.innerHTML = '<div class="skeleton"><div class="sk sk-line"></div><div class="sk sk-img"></div></div>';
  const { m, db } = ctx;
  try {
    const q = tab === 'open' ? m.query(m.collection(db, 'moderation'), m.where('status', 'in', ['restricted', 'suspended']), m.limit(100))
      : tab === 'deleted' ? m.query(m.collection(db, 'moderation'), m.where('status', '==', 'deleted'), m.limit(100))
        : m.query(m.collection(db, 'moderation'), m.where('status', '==', 'active'), m.limit(100));
    const snap = await m.getDocs(q);
    cases = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt));
    authors = await names(cases.map((c) => c.id));
  } catch (e) { console.error(e); box.innerHTML = emptyState({ iconName: 'shield', title: 'Chargement impossible', text: explainError(e, 'consulter les examens') }); hydrateIcons(box); return; }
  if (!cases.length) { box.innerHTML = emptyState({ iconName: 'shield', title: 'Aucun dossier', text: tab === 'open' ? "Aucun compte n'est restreint ni suspendu." : '' }); hydrateIcons(box); return; }
  box.innerHTML = cases.map((c) => {
    const a = authors.get(c.id) || {};
    const [label, kind] = STATE[c.status] || ['—', ''];
    const ex = (c.examination || {}).state;
    return `<article class="card req-card" data-id="${esc(c.id)}"><div class="req-head"><span class="avatar">${esc((a.name || '?').charAt(0).toUpperCase())}</span>
      <div class="grow"><strong>${esc(a.name || 'Utilisateur')}</strong><small class="muted">${a.type === 'agence' ? 'Agence' : 'Particulier'} · depuis le ${esc(fmtDate(c.since))}${c.until ? ' · jusqu\'au ' + esc(fmtWhen(millis(c.until))) : ''}</small></div>${pill(label, kind)}</div>
      ${c.reason ? `<p><strong>Motif :</strong> ${esc(c.reason)}</p>` : ''}
      <small class="muted">Examen : ${esc({ in_progress: 'en cours', continuing: 'se poursuit', restored: 'terminé (restauré)', deleted: 'terminé (supprimé)' }[ex] || '—')}</small>
      <div class="adm-actions"><button class="btn btn-primary" data-open="${esc(c.id)}">${icon('shield', 16)} Ouvrir le dossier</button></div></article>`;
  }).join('');
  hydrateIcons(box);
}

// Fenêtre de décision : motif et/ou message, durée pour une restriction
function decide({ title, text = '', confirmLabel, danger = false, reason = false, message = false, duration = false, onConfirm }) {
  openModal({
    title,
    html: `${text ? `<p class="muted" style="margin-bottom:10px">${esc(text)}</p>` : ''}
      ${duration ? `<div class="field" style="margin-bottom:10px"><label for="dDur">Durée de la restriction</label><select class="select" id="dDur">${RESTRICTION_PRESETS.map(([l, h], i) => `<option value="${h}" ${i === 1 ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : ''}
      ${reason ? '<div class="field" style="margin-bottom:10px"><label for="dReason">Motif (visible par la personne) *</label><textarea class="input" id="dReason" rows="2" maxlength="300" style="padding:10px 14px"></textarea></div>' : ''}
      ${message ? `<div class="field"><label for="dMsg">Message pour la personne ${reason ? '(facultatif)' : '*'}</label><textarea class="input" id="dMsg" rows="3" maxlength="300" style="padding:10px 14px"></textarea></div>` : ''}
      <p class="error" id="dErr" hidden></p>`,
    actions: [{ label: 'Annuler' }, { label: confirmLabel, danger, primary: !danger, onClick: async (el) => {
      const r = reason ? el.querySelector('#dReason').value.trim() : ''; const ms = message ? el.querySelector('#dMsg').value.trim() : '';
      const err = el.querySelector('#dErr');
      if ((reason && r.length < 3) || (message && !reason && ms.length < 3)) { err.textContent = reason ? 'Le motif est obligatoire.' : 'Le message est obligatoire.'; err.hidden = false; return false; }
      try { await onConfirm({ reason: r, message: ms, hours: duration ? Number(el.querySelector('#dDur').value) : 0 }); } catch (e) { console.error(e); err.textContent = explainError(e, 'effectuer cette décision'); err.hidden = false; return false; }
    } }]
  });
}

const row = (l, v) => (v ? `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>` : '');

async function openCase(uid) {
  const { m, db } = ctx;
  main.innerHTML = '<div class="skeleton"><div class="sk sk-line"></div><div class="sk sk-img"></div></div>';
  const get = async (p) => { try { const s = await m.getDoc(m.doc(db, ...p)); return s.exists() ? s.data() : null; } catch (e) { return null; } };
  const [user, priv, mod, vreq, notes] = await Promise.all([get(['users', uid]), get(['userPrivate', uid]), get(['moderation', uid]), get(['verificationRequests', uid]), getNotes(uid).catch(() => [])]);
  const props = await m.getDocs(m.query(m.collection(db, 'properties'), m.where('authorId', '==', uid), m.limit(50))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
  const reports = await m.getDocs(m.query(m.collection(db, 'reports'), m.where('targetUserId', '==', uid), m.limit(30))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
  if (!user) { main.innerHTML = emptyState({ iconName: 'user', title: 'Compte introuvable' }); hydrateIcons(main); return; }
  const st = statusOf(user);
  const [label, kind] = STATE[st.state] || ['Actif', 'ok'];
  const iso = priv && priv.birthDate ? dateToIso(priv.birthDate) : '';
  const hist = ((mod && mod.history) || []).slice().reverse();
  main.innerHTML = `
    <div class="adm-title"><button class="btn btn-ghost btn-sm" id="back">← Retour aux examens</button></div>
    <article class="card req-card"><div class="req-head"><span class="avatar">${esc((user.name || '?').charAt(0).toUpperCase())}</span><div class="grow"><strong>${esc(user.name || 'Utilisateur')}</strong><small class="muted">${user.type === 'agence' ? 'Agence' : 'Particulier'} · inscrit le ${esc(fmtDate(user.createdAt))}</small></div>${pill(label, kind)}</div>
      <div class="adm-actions">
        <a class="btn btn-ghost" href="profile.html?id=${encodeURIComponent(uid)}">${icon('user', 16)} Voir le profil</a>
        <a class="btn btn-ghost" href="chat.html?with=${encodeURIComponent(uid)}">${icon('message', 16)} Écrire</a></div>
      <div class="adm-actions" id="decisions">
        ${st.state === 'active' || st.state === 'restricted' ? '<button class="btn btn-ghost" data-d="restrict" style="color:var(--danger)">Restreindre…</button>' : ''}
        ${st.state !== 'suspended' && st.state !== 'deleted' ? '<button class="btn btn-ghost" data-d="suspend" style="color:var(--danger)">Suspendre…</button>' : ''}
        ${st.state === 'suspended' || st.state === 'restricted' ? '<button class="btn btn-ghost" data-d="continue">Maintenir l\'examen…</button>' : ''}
        ${st.state === 'restricted' ? '<button class="btn btn-ghost" data-d="lift">Lever la restriction</button>' : ''}
        ${st.state === 'suspended' || st.state === 'deleted' ? '<button class="btn btn-primary" data-d="restore">Restaurer le compte…</button>' : ''}
        ${st.state !== 'deleted' ? '<button class="btn btn-ghost" data-d="delete" style="color:var(--danger)">Supprimer le compte…</button>' : ''}
      </div></article>
    <article class="card req-card"><h3>État</h3><dl class="kv">
      ${row('État du compte', label)}${row('Depuis le', st.at ? fmtWhen(st.at) : '')}${row('Jusqu\'au', st.until ? fmtWhen(st.until) : '')}${row('Motif', st.reason)}
      ${row('Examen', ((mod && mod.examination) || {}).state)}${row('Dernier message de l\'équipe', ((mod && mod.examination) || {}).message)}</dl></article>
    <article class="card req-card"><h3>Identité et coordonnées</h3>${priv ? `<dl class="kv">
      ${priv.accountType === 'agence' ? row("Nom de l'agence", priv.agencyName) : ''}${row(priv.accountType === 'agence' ? "Responsable de l'agence" : 'Nom complet', fullNameOf(priv))}${row('Sexe', genderLabel(priv.gender))}
      ${row('Date de naissance', iso ? `${new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} (${ageOf(iso)} ans)` : '')}
      ${row('Téléphone', priv.phone)}${row('E-mail', priv.email)}${row('Identifiant de connexion', priv.loginId)}${row('Conditions acceptées', priv.consent && priv.consent.acceptedAt ? fmtDateTime(priv.consent.acceptedAt) : '')}</dl>` : '<p class="muted">Informations personnelles non renseignées (ancien compte).</p>'}</article>
    <article class="card req-card"><h3>Profil</h3><dl class="kv">${row('Abonnés', compact(user.followersCount || 0))}${row('Avis', user.ratingCount ? `${(user.ratingSum / user.ratingCount).toFixed(1).replace('.', ',')} (${user.ratingCount})` : 'Aucun')}${row('Badge', isBadgeActive(user) ? 'Actif' : 'Non')}${row('Présentation', user.bio)}</dl></article>
    <article class="card req-card"><h3>Annonces (${props.length})</h3>${props.length ? `<div class="adm-list">${props.map((p) => `<a class="adm-row" href="property.html?id=${encodeURIComponent(p.id)}"><span class="grow"><strong>${esc(p.title)}</strong><small>${esc(fmtDate(p.createdAt))}${p.status === 'hidden' ? ' · masquée' + (p.hiddenBy === 'account' ? ' (compte)' : '') : ''}</small></span></a>`).join('')}</div>` : '<p class="muted">Aucune annonce.</p>'}</article>
    <article class="card req-card"><h3>Signalements reçus (${reports.length})</h3>${reports.length ? `<div class="adm-list">${reports.map((r) => `<div class="adm-row"><span class="grow"><strong>${esc(r.reason)}</strong><small>${esc(fmtDate(r.createdAt))} · ${esc(r.status)}${r.details ? ' · ' + esc(r.details) : ''}</small></span></div>`).join('')}</div>` : '<p class="muted">Aucun signalement.</p>'}</article>
    ${vreq ? `<article class="card req-card"><h3>Dossier de vérification</h3>${dossierHtml(vreq, priv)}</article>` : ''}
    <article class="card req-card"><h3>Historique de l'examen</h3>${hist.length ? `<div class="adm-list">${hist.map((x) => `<div class="adm-row"><span class="grow"><strong>${esc(x.state)}</strong><small>${esc(fmtWhen(x.at))}${x.reason ? ' · ' + esc(x.reason) : ''}${x.message ? ' · ' + esc(x.message) : ''}</small></span></div>`).join('')}</div>` : '<p class="muted">Aucune décision.</p>'}</article>
    <article class="card req-card"><h3>Notes internes (invisibles pour la personne)</h3><div id="notes">${notes.length ? [...notes].reverse().map((n) => `<p><small class="muted">${esc(fmtWhen(n.at))} — ${esc(n.byName || 'équipe')}</small><br>${esc(n.text)}</p>`).join('') : '<p class="muted">Aucune note.</p>'}</div>
      <div class="field"><textarea class="input" id="noteText" rows="2" maxlength="600" style="padding:10px 14px" placeholder="Ajouter une note interne…"></textarea></div><button class="btn btn-ghost" id="noteAdd">Ajouter la note</button></article>`;
  hydrateIcons(main);
  const name = user.name || '';
  const done = (msg) => { toast(msg); openCase(uid); };
  main.querySelector('#back').onclick = () => { history.replaceState(null, '', 'admin-examinations.html'); renderShell(); };
  main.querySelector('#noteAdd').onclick = async () => { const t = main.querySelector('#noteText').value.trim(); if (!t) return; try { await addNote(uid, t); done('Note ajoutée'); } catch (e) { toast(explainError(e, 'ajouter une note')); } };
  main.querySelector('#decisions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    const t = { uid, name };
    ({
      restrict: () => decide({ title: `Restreindre ${name}`, text: 'Temporaire : le compte se connecte et répond aux messages, mais ne peut ni publier, noter, aimer, suivre, ouvrir de nouvelle discussion, demander le badge ni modifier ses informations.', confirmLabel: 'Restreindre', danger: true, reason: true, duration: true, message: true, onConfirm: async (x) => { await restrictAccount({ ...t, reason: x.reason, hours: x.hours, message: x.message }); done('Compte restreint, personne prévenue'); } }),
      suspend: () => decide({ title: `Suspendre ${name}`, text: "Le compte n'accède plus qu'à la page d'examen ; profil et annonces disparaissent de la plateforme.", confirmLabel: 'Suspendre', danger: true, reason: true, message: true, onConfirm: async (x) => { await suspendAccount({ ...t, reason: x.reason, message: x.message }); done('Compte suspendu, personne prévenue'); } }),
      continue: () => decide({ title: "Maintenir l'examen", text: 'La personne voit que l\'examen se poursuit, avec votre message.', confirmLabel: 'Envoyer', message: true, onConfirm: async (x) => { await continueExamination({ ...t, message: x.message }); done('Message envoyé'); } }),
      lift: () => decide({ title: 'Lever la restriction', confirmLabel: 'Lever', message: true, onConfirm: async (x) => { await liftRestriction({ ...t, message: x.message }); done('Restriction levée, personne prévenue'); } }),
      restore: () => decide({ title: `Restaurer ${name}`, text: 'Le compte, son profil et ses annonces redeviennent visibles.', confirmLabel: 'Restaurer', message: true, onConfirm: async (x) => { await restoreAccount({ ...t, message: x.message }); done('Compte restauré, personne prévenue'); } }),
      delete: () => decide({ title: `Supprimer ${name}`, text: 'Le compte disparaît de toute la plateforme (il reste consultable ici). La personne voit la date et la raison sur la page d\'examen.', confirmLabel: 'Supprimer le compte', danger: true, reason: true, message: true, onConfirm: async (x) => { await deleteAccountByStaff({ ...t, reason: x.reason, message: x.message }); done('Compte supprimé, personne prévenue'); } })
    })[b.dataset.d]();
  });
}

function renderShell() {
  main.innerHTML = `<div class="adm-title"><h1>Examens des comptes</h1></div>
    <p class="muted">Comptes restreints, suspendus ou supprimés : vérifiez les informations, décidez, et la personne est prévenue.</p>
    <div class="adm-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${esc(l)}</button>`).join('')}</div>
    <div id="list" style="display:grid;gap:12px"></div>`;
  loadList();
}

main.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; main.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === t))); loadList(); return; }
  const o = e.target.closest('[data-open]');
  if (o) openCase(o.dataset.open);
});

(async () => {
  ctx = await initAdmin({ minRank: 2, active: 'admin-examinations.html' });
  if (!ctx) return;
  if (param('uid')) openCase(param('uid')); else renderShell();
})();
