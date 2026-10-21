// Imova — admin-reports.js : admin-reports.html (signalements)
import { initAdmin, audit, names, nameOf, fmtDateTime, since, pill, statusPill, confirmAction, millis } from './admin.js';
import { getProperty } from './properties.js';
import { sendMessage } from './messaging.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, explainError } from './utils.js';
import { emptyState } from './components.js';

const REASONS = { spam: 'Spam ou publicité', arnaque: 'Arnaque ou fausse annonce', contenu_inapproprie: 'Contenu inapproprié', harcelement: 'Harcèlement ou insultes', faux_profil: 'Faux profil', autre: 'Autre raison' };
const TYPES = { profile: 'Profil', property: 'Annonce', conversation: 'Conversation' };
const TABS = [['open', 'Ouverts'], ['reviewing', 'En cours'], ['resolved', 'Résolus'], ['dismissed', 'Rejetés']];
const main = document.getElementById('main');
let ctx, tab = 'open', reports = [], authors = new Map(), titles = new Map();

async function load() {
  const box = main.querySelector('#list');
  box.innerHTML = '<div class="skeleton"><div class="sk sk-line"></div><div class="sk sk-img"></div></div>';
  try {
    const { m, db } = ctx;
    const snap = await m.getDocs(m.query(m.collection(db, 'reports'), m.where('status', '==', tab), m.limit(100)));
    reports = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(a.createdAt) - millis(b.createdAt) * (tab === 'open' ? 1 : 1)).sort((a, b) => (tab === 'open' ? 1 : -1) * (millis(a.createdAt) - millis(b.createdAt)));
    authors = await names(reports.flatMap((r) => [r.reporterId, r.targetUserId].filter(Boolean)));
    await Promise.all(reports.filter((r) => r.targetType === 'property').map(async (r) => { try { const p = await getProperty(r.targetId, { includeHidden: true }); if (p) titles.set(r.targetId, p.title); } catch (e) { /* ignoré */ } }));
  } catch (e) { console.error(e); box.innerHTML = emptyState({ iconName: 'flag', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(box); return; }
  render();
}

function render() {
  const box = main.querySelector('#list');
  if (!reports.length) { box.innerHTML = emptyState({ iconName: 'flag', title: 'Aucun signalement', text: tab === 'open' ? 'Rien à traiter pour le moment.' : '' }); hydrateIcons(box); return; }
  box.innerHTML = reports.map((r) => {
    const ev = Array.isArray(r.evidence) ? r.evidence : [];
    const targetName = r.targetType === 'property' ? (titles.get(r.targetId) || 'Annonce supprimée') : nameOf(authors, r.targetUserId);
    return `<article class="card req-card" data-id="${esc(r.id)}">
      <div class="req-head"><span class="status-ic ${r.status === 'open' ? 'pending' : 'ok'}" style="width:40px;height:40px">${icon('flag', 20)}</span>
        <div class="grow"><strong>${esc(TYPES[r.targetType] || r.targetType)} : ${esc(targetName)}</strong><small class="muted">${esc(REASONS[r.reason] || r.reason)} · signalé par ${esc(nameOf(authors, r.reporterId))} · ${esc(fmtDateTime(r.createdAt))}${r.status === 'open' ? ' · ' + esc(since(r.createdAt)) : ''}</small></div>${statusPill(r.status)}</div>
      ${r.details ? `<p>${esc(r.details)}</p>` : ''}
      ${ev.length ? `<details><summary style="cursor:pointer;font-weight:600">Derniers messages joints (${ev.length})</summary><div class="evidence">${ev.map((x) => `<p><b>${esc(x.from)}</b> : ${esc(x.text)}</p>`).join('')}</div></details>` : ''}
      ${r.resolution ? `<p class="muted"><strong>Résolution :</strong> ${esc(r.resolution)}</p>` : ''}
      <div class="adm-actions">
        ${r.targetType === 'property' ? `<a class="btn btn-ghost" href="property.html?id=${encodeURIComponent(r.targetId)}">${icon('eyeOpen', 16)} Voir l'annonce</a><button class="btn btn-ghost" data-act="hide" style="color:var(--danger)">${icon('eyeOff', 16)} Masquer l'annonce</button>` : ''}
        ${r.targetUserId ? `<a class="btn btn-ghost" href="profile.html?id=${encodeURIComponent(r.targetUserId)}">${icon('user', 16)} Profil visé</a><a class="btn btn-ghost" href="chat.html?with=${encodeURIComponent(r.targetUserId)}">${icon('message', 16)} Écrire</a>` : ''}
        ${r.status === 'open' ? '<button class="btn btn-ghost" data-act="reviewing">Prendre en charge</button>' : ''}
        ${r.status === 'open' || r.status === 'reviewing' ? '<button class="btn btn-primary" data-act="resolved">Marquer résolu</button><button class="btn btn-ghost" data-act="dismissed">Rejeter</button>' : ''}
      </div></article>`;
  }).join('');
  hydrateIcons(box);
}

async function setStatus(r, status, resolution) {
  const { m, db } = ctx;
  const upd = { status, handledBy: ctx.me.uid, handledAt: m.serverTimestamp() };
  if (resolution) upd.resolution = resolution;
  await m.updateDoc(m.doc(db, 'reports', r.id), upd);
  await audit(ctx, `report_${status}`, 'report', r.id, `${TYPES[r.targetType]} — ${REASONS[r.reason] || r.reason}`);
}

main.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; main.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === t))); load(); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const r = reports.find((x) => x.id === b.closest('[data-id]').dataset.id);
  const act = b.dataset.act;
  if (act === 'reviewing') setStatus(r, 'reviewing').then(() => { toast('Signalement pris en charge'); load(); }).catch((x) => toast(explainError(x)));
  if (act === 'resolved') confirmAction({ title: 'Marquer comme résolu', confirmLabel: 'Résolu', reason: { label: 'Ce qui a été fait (facultatif)' }, onConfirm: async (n) => { await setStatus(r, 'resolved', n); toast('Signalement résolu'); load(); } });
  if (act === 'dismissed') confirmAction({ title: 'Rejeter le signalement', text: "Aucune action ne sera prise.", confirmLabel: 'Rejeter', reason: { label: 'Raison (facultatif)' }, onConfirm: async (n) => { await setStatus(r, 'dismissed', n); toast('Signalement rejeté'); load(); } });
  if (act === 'hide') confirmAction({
    title: "Masquer l'annonce signalée ?", confirmLabel: 'Masquer', danger: true, reason: { label: "Motif (visible par l'auteur)" },
    onConfirm: async (n) => {
      const { m, db } = ctx;
      await m.updateDoc(m.doc(db, 'properties', r.targetId), { status: 'hidden', moderationNote: n || '' });
      await audit(ctx, 'property_hide', 'property', r.targetId, n || 'suite à un signalement');
      await setStatus(r, 'resolved', `Annonce masquée${n ? ' : ' + n : ''}`);
      toast('Annonce masquée, signalement résolu'); load();
    }
  });
});

(async () => {
  ctx = await initAdmin({ minRank: 1, active: 'admin-reports.html' });
  if (!ctx) return;
  main.innerHTML = `<div class="adm-title"><h1>Signalements</h1></div>
    <div class="adm-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${esc(l)}</button>`).join('')}</div>
    <div id="list" style="display:grid;gap:12px"></div>`;
  load();
})();
