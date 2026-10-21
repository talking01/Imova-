// Imova — admin-settings.js : réglages de la plateforme, équipe d'administration, journal d'activité (propriétaire)
import { initAdmin, audit, names, nameOf, fmtDateTime, pill, confirmAction, ROLE_LABEL } from './admin.js';
import { SUPPORT_UID, supportReady } from './app-config.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, clean, toast, explainError } from './utils.js';

const main = document.getElementById('main');
let ctx, settings = {}, team = [], logs = [], nm = new Map();
const DEFAULTS = { announcement: { enabled: false, text: '' }, publishingEnabled: true, verificationOpen: true };

async function load() {
  const { m, db } = ctx;
  try {
    const s = await m.getDoc(m.doc(db, 'platformSettings', 'main'));
    settings = { ...DEFAULTS, ...(s.exists() ? s.data() : {}) };
    team = (await m.getDocs(m.query(m.collection(db, 'admins'), m.limit(50)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    logs = (await m.getDocs(m.query(m.collection(db, 'auditLog'), m.orderBy('createdAt', 'desc'), m.limit(40)))).docs.map((d) => d.data());
    nm = await names([...team.map((t) => t.id), ...logs.map((l) => l.actorId), SUPPORT_UID].filter(Boolean));
  } catch (e) { console.error(e); main.innerHTML = `<div class="empty"><h2>Chargement impossible</h2><p>${esc(explainError(e))}</p></div>`; return; }
  render();
}

const sw = (id, on) => `<button type="button" class="switch ${on ? 'on' : ''}" id="${id}" role="switch" aria-checked="${on}"></button>`;

function render() {
  main.innerHTML = `
    <div class="adm-title"><h1>Paramètres</h1></div>
    <section class="card" style="padding:6px 16px">
      <div class="switch-line"><span><strong>Publications ouvertes</strong><br><small class="muted">Désactivé : plus personne ne peut publier de nouvelle annonce.</small></span>${sw('sPub', settings.publishingEnabled)}</div>
      <div class="switch-line"><span><strong>Demandes de badge ouvertes</strong><br><small class="muted">Désactivé : les nouvelles demandes de vérification sont fermées.</small></span>${sw('sVer', settings.verificationOpen)}</div>
      <div class="switch-line"><span><strong>Bandeau d'annonce</strong><br><small class="muted">Message affiché en haut de l'accueil.</small></span>${sw('sAnn', settings.announcement.enabled)}</div>
      <div class="field" style="padding:10px 0 14px"><label for="sText">Texte du bandeau (200 caractères maximum)</label><input class="input" id="sText" maxlength="200" value="${esc(settings.announcement.text)}"></div>
      <button class="btn btn-primary" id="sSave" style="margin-bottom:14px">${icon('check', 18)} Enregistrer les réglages</button>
    </section>
    <h3 class="section-title">Compte du support</h3>
    <section class="card" style="padding:14px 16px">${supportReady ? `<p><strong>${esc(nameOf(nm, SUPPORT_UID))}</strong> <small class="muted">(${esc(SUPPORT_UID)})</small></p><p class="muted">Les demandes d'aide et de badge arrivent dans les messages de ce compte (défini dans <code>app-config.js</code>).</p>` : '<p class="muted">Non configuré : renseignez <code>SUPPORT_UID</code> dans <code>app-config.js</code>.</p>'}</section>
    <h3 class="section-title">Équipe d'administration</h3>
    <section class="card adm-list">${team.map((t) => `<div class="adm-row" data-id="${esc(t.id)}"><span class="grow"><strong>${esc(nameOf(nm, t.id))}</strong><small>${esc(t.id)}</small></span>
      ${t.id === ctx.me.uid ? pill(ROLE_LABEL[t.role] + ' (vous)', 'ok') : `<select class="select" data-role style="width:auto;min-height:38px">${['owner', 'admin', 'moderator'].map((r) => `<option value="${r}" ${t.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" data-rm style="color:var(--danger)" aria-label="Retirer">${icon('trash', 16)}</button>`}</div>`).join('')}</section>
    <section class="card form" style="margin-top:0">
      <h3 style="font-size:1rem">Ajouter un membre</h3>
      <p class="muted" style="font-size:.88rem">La personne doit déjà avoir un compte Imova. Collez son identifiant (UID : console Firebase → Authentication → Utilisateurs).</p>
      <div class="field"><label for="aUid">Identifiant (UID)</label><input class="input" id="aUid" autocomplete="off"></div>
      <div class="field"><label for="aRole">Rôle</label><select class="select" id="aRole"><option value="moderator">Modérateur : signalements, annonces, avis</option><option value="admin">Administrateur : + utilisateurs, vérifications, statistiques</option><option value="owner">Propriétaire : + réglages et équipe</option></select></div>
      <button class="btn btn-primary" id="aAdd">${icon('plus', 18)} Ajouter</button>
    </section>
    <h3 class="section-title">Journal d'activité</h3>
    <section class="card">${logs.map((l) => `<div class="log-line"><strong>${esc(nameOf(nm, l.actorId))}</strong> · ${esc(l.action)}${l.details ? ` — ${esc(l.details)}` : ''}<small>${esc(fmtDateTime(l.createdAt))}</small></div>`).join('') || '<p class="muted" style="padding:14px">Aucune action enregistrée.</p>'}</section>`;
  hydrateIcons(main);
  main.querySelectorAll('.switch').forEach((b) => b.addEventListener('click', () => { const on = b.classList.toggle('on'); b.setAttribute('aria-checked', String(on)); }));
  const { m, db } = ctx;
  document.getElementById('sSave').onclick = async () => {
    const on = (id) => document.getElementById(id).classList.contains('on');
    const data = { publishingEnabled: on('sPub'), verificationOpen: on('sVer'), announcement: { enabled: on('sAnn'), text: clean(document.getElementById('sText').value, 200) }, updatedAt: m.serverTimestamp(), updatedBy: ctx.me.uid };
    try {
      await m.setDoc(m.doc(db, 'platformSettings', 'main'), data);
      await audit(ctx, 'settings_update', 'settings', 'main', `publications ${data.publishingEnabled ? 'ouvertes' : 'fermées'}, badges ${data.verificationOpen ? 'ouverts' : 'fermés'}, bandeau ${data.announcement.enabled ? 'actif' : 'inactif'}`);
      try { sessionStorage.removeItem('imova-settings'); } catch (e) { /* ignoré */ }
      toast('Réglages enregistrés'); load();
    } catch (e) { console.error(e); toast(explainError(e)); }
  };
  document.getElementById('aAdd').onclick = async () => {
    const uid = clean(document.getElementById('aUid').value, 128);
    if (uid.length < 6) { toast('Collez un identifiant valide.'); return; }
    const role = document.getElementById('aRole').value;
    try {
      const u = await m.getDoc(m.doc(db, 'users', uid));
      if (!u.exists()) { toast('Aucun compte Imova avec cet identifiant.'); return; }
      await m.setDoc(m.doc(db, 'admins', uid), { role, createdAt: m.serverTimestamp(), createdBy: ctx.me.uid });
      await audit(ctx, 'admin_add', 'admin', uid, `${u.data().name} — ${ROLE_LABEL[role]}`);
      toast('Membre ajouté'); load();
    } catch (e) { console.error(e); toast(explainError(e)); }
  };
  main.querySelectorAll('[data-role]').forEach((sel) => sel.addEventListener('change', async () => {
    const id = sel.closest('[data-id]').dataset.id;
    try { await m.updateDoc(m.doc(db, 'admins', id), { role: sel.value }); await audit(ctx, 'admin_role', 'admin', id, ROLE_LABEL[sel.value]); toast('Rôle modifié'); load(); } catch (e) { toast(explainError(e)); load(); }
  }));
  main.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    const id = b.closest('[data-id]').dataset.id;
    confirmAction({ title: 'Retirer ce membre ?', text: "Il n'aura plus accès à l'administration.", confirmLabel: 'Retirer', danger: true, onConfirm: async () => { await m.deleteDoc(m.doc(db, 'admins', id)); await audit(ctx, 'admin_remove', 'admin', id, nameOf(nm, id)); toast('Membre retiré'); load(); } });
  }));
}

(async () => { ctx = await initAdmin({ minRank: 3, active: 'admin-settings.html' }); if (ctx) load(); })();
