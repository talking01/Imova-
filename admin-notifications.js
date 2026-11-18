// Imova — admin-notifications.js : notifications personnalisées (administrateurs et propriétaire)
// Destinataires : toute la plateforme, toutes les agences, tous les particuliers, ou un ou plusieurs comptes choisis.
import { initAdmin, audit, fmtDateTime, pill } from './admin.js';
import { notify } from './notifs.js';
import { normalizePhone } from './identity.js';
import { verifiedMark } from './components.js';
import { openModal } from './modal.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, explainError } from './utils.js';

const main = document.getElementById('main');
let ctx, audience = 'all', picked = new Map(), found = [], history = [];
const AUD = [['all', 'Toute la plateforme', 'users'], ['agence', 'Toutes les agences', 'home'], ['particulier', 'Tous les particuliers', 'user'], ['ids', 'Comptes choisis', 'search']];
const label = (a) => (AUD.find((x) => x[0] === a) || [])[1] || a;

async function loadHistory() {
  try {
    const { m, db } = ctx;
    const s = await m.getDocs(m.query(m.collection(db, 'sentNotifications'), m.orderBy('createdAt', 'desc'), m.limit(30)));
    history = s.docs.map((d) => d.data());
  } catch (e) { history = []; }
}

function preview() {
  const t = (document.getElementById('nTitle') || {}).value || 'Titre de la notification';
  const b = (document.getElementById('nBody') || {}).value || 'Votre message apparaîtra ici.';
  return `<div class="ntf unread" style="border-radius:14px;border:1px solid var(--border)"><span class="ntf-ic review">${icon('badge', 22)}</span><span class="ntf-body"><small class="muted">Imova ${verifiedMark(true, 13)} · message officiel</small><strong>${esc(t)}</strong><span>${esc(b)}</span></span><span class="ntf-dot"></span></div>`;
}

function render() {
  main.innerHTML = `
    <div class="adm-title"><h1>Notifications personnalisées</h1></div>
    <p class="muted">Envoyez une notification à toute la plateforme, à une catégorie ou à des comptes précis : elle arrive directement dans leurs notifications, signée « Imova » avec le badge officiel.</p>
    <section class="card form" style="margin:0">
      <div class="field"><label>Destinataires</label><div class="plan-grid" role="radiogroup" style="margin:0">${AUD.map(([k, l, ic]) => `<button type="button" class="plan-card" role="radio" aria-checked="${audience === k}" data-aud="${k}" style="padding:12px"><span class="plan-label">${icon(ic, 14)} ${esc(l)}</span></button>`).join('')}</div></div>
      <div id="idsBox" ${audience === 'ids' ? '' : 'hidden'}>
        <div class="field"><label for="nSearch">Rechercher un compte (nom, e-mail ou téléphone)</label><input class="input" id="nSearch" autocomplete="off" placeholder="Nom, e-mail ou 0812345678"></div>
        <div class="adm-list card" id="found" style="margin:6px 0"></div>
        <div class="chips-wrap" id="chosen" style="margin-top:6px"></div>
      </div>
      <div class="field"><label for="nTitle">Titre *</label><input class="input" id="nTitle" maxlength="120"></div>
      <div class="field"><label for="nBody">Message * <small class="muted">(500 caractères maximum)</small></label><textarea class="input" id="nBody" rows="4" maxlength="500" style="padding:10px 14px"></textarea></div>
      <div class="field"><label>Aperçu chez le destinataire</label><div id="prev">${preview()}</div></div>
      <p class="error" id="nErr" hidden></p>
      <button class="btn btn-primary btn-block" id="nSend">${icon('send', 18)} Envoyer</button>
    </section>
    <h3 class="section-title">Dernières notifications envoyées</h3>
    <section class="card adm-list">${history.length ? history.map((h) => `<div class="adm-row"><span class="grow"><strong>${esc(h.title)}</strong><small>${esc(h.body.slice(0, 120))}${h.body.length > 120 ? '…' : ''}</small><small>${esc(fmtDateTime(h.createdAt))} · ${esc(label(h.audience))}${h.audience === 'ids' && h.names ? ' : ' + esc((h.names || []).slice(0, 5).join(', ')) + ((h.names || []).length > 5 ? '…' : '') : ''}</small></span>${pill(h.count + ' destinataire' + (h.count > 1 ? 's' : ''), 'ok')}</div>`).join('') : '<p class="muted" style="padding:14px">Aucune notification envoyée.</p>'}</section>`;
  hydrateIcons(main);
  paintChosen(); paintFound();
}

const paintChosen = () => { const el = document.getElementById('chosen'); if (el) el.innerHTML = [...picked.values()].map((u) => `<button type="button" class="pchip" aria-pressed="true" data-rm="${esc(u.id)}">${esc(u.name)} ✕</button>`).join(''); };
const paintFound = () => { const el = document.getElementById('found'); if (!el) return; el.innerHTML = found.length ? found.map((u) => `<button type="button" class="adm-row" data-pick="${esc(u.id)}" style="text-align:left;width:100%"><span class="grow"><strong>${esc(u.name)}${verifiedMark(u.verified, 14)}</strong><small>${u.type === 'agence' ? 'Agence' : 'Particulier'}</small></span>${picked.has(u.id) ? pill('Choisi', 'ok') : '<span class="muted">Ajouter</span>'}</button>`).join('') : ''; };

async function search(text) {
  const { m, db } = ctx;
  const t = text.trim().toLowerCase();
  found = [];
  if (t.length < 2) { paintFound(); return; }
  try {
    let key = '';
    if (t.includes('@')) key = t; else if (/^[+\d][\d\s().-]{6,}$/.test(t)) key = normalizePhone(t);
    if (key) {
      const ps = await m.getDocs(m.query(m.collection(db, 'userPrivate'), m.where('searchKeys', 'array-contains', key), m.limit(5)));
      const us = await Promise.all(ps.docs.map((d) => m.getDoc(m.doc(db, 'users', d.id))));
      found = us.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }));
    } else {
      const s = await m.getDocs(m.query(m.collection(db, 'users'), m.where('nameLower', '>=', t), m.where('nameLower', '<=', t + '\uf8ff'), m.limit(8)));
      found = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (e) { console.error(e); }
  paintFound();
}

async function send() {
  const title = document.getElementById('nTitle').value.trim(); const body = document.getElementById('nBody').value.trim();
  const err = document.getElementById('nErr');
  const fail = (t) => { err.textContent = t; err.hidden = false; };
  err.hidden = true;
  if (title.length < 2) return fail('Le titre est obligatoire (2 caractères minimum).');
  if (body.length < 2) return fail('Le message est obligatoire.');
  if (audience === 'ids' && !picked.size) return fail('Choisissez au moins un compte.');
  if (audience === 'ids' && picked.size > 100) return fail('100 comptes au maximum par envoi : utilisez une catégorie pour écrire à plus de monde.');
  const who = audience === 'ids' ? `${picked.size} compte${picked.size > 1 ? 's' : ''}` : label(audience);
  openModal({
    title: 'Envoyer la notification ?', html: `<p class="muted">Destinataires : <strong>${esc(who)}</strong>. L'envoi est immédiat et ne peut pas être annulé.</p>${preview()}`,
    actions: [{ label: 'Annuler' }, { label: 'Envoyer', primary: true, onClick: async () => {
      try {
        const { m, db } = ctx;
        let count = 0;
        if (audience === 'ids') {
          for (const u of picked.values()) { if (await notify(u.id, { type: 'system', id: `custom_${Date.now()}_${count}`, title, body, link: 'notifications.html' })) count++; }
          if (!count) throw Object.assign(new Error('aucune'), { code: 'permission-denied' });
        } else {
          await m.setDoc(m.doc(m.collection(db, 'broadcasts')), { title, body, link: 'notifications.html', audience, createdAt: m.serverTimestamp(), createdBy: ctx.me.uid });
          count = (await m.getCountFromServer(audience === 'all' ? m.query(m.collection(db, 'users')) : m.query(m.collection(db, 'users'), m.where('type', '==', audience)))).data().count;
        }
        await m.setDoc(m.doc(m.collection(db, 'sentNotifications')), { title, body, audience, count, names: audience === 'ids' ? [...picked.values()].map((u) => u.name).slice(0, 20) : [], createdAt: m.serverTimestamp(), createdBy: ctx.me.uid });
        await audit(ctx, 'notification_sent', 'notification', audience, `${title} — ${who}`);
        toast(`Notification envoyée à ${who}`);
        picked = new Map(); found = []; await loadHistory(); render();
      } catch (e) { console.error(e); toast(explainError(e, 'envoyer des notifications')); return false; }
    } }]
  });
}

main.addEventListener('click', (e) => {
  const a = e.target.closest('[data-aud]'); if (a) { audience = a.dataset.aud; render(); return; }
  const p = e.target.closest('[data-pick]'); if (p) { const u = found.find((x) => x.id === p.dataset.pick); if (u) { if (picked.has(u.id)) picked.delete(u.id); else picked.set(u.id, u); paintChosen(); paintFound(); } return; }
  const r = e.target.closest('[data-rm]'); if (r) { picked.delete(r.dataset.rm); paintChosen(); paintFound(); return; }
  if (e.target.closest('#nSend')) send();
});
main.addEventListener('input', (e) => {
  if (e.target.id === 'nSearch') { clearTimeout(main._t); main._t = setTimeout(() => search(e.target.value), 350); }
  if (e.target.id === 'nTitle' || e.target.id === 'nBody') document.getElementById('prev').innerHTML = preview();
});

(async () => { ctx = await initAdmin({ minRank: 2, active: 'admin-notifications.html' }); if (!ctx) return; await loadHistory(); render(); })();
