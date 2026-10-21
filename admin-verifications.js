// Imova — admin-verifications.js : liste d'attente des demandes de badge (administrateurs)
import { initAdmin, audit, names, nameOf, fmtDate, fmtDateTime, since, pill, statusPill, confirmAction, millis } from './admin.js';
import { sendMessage } from './messaging.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, explainError } from './utils.js';
import { emptyState } from './components.js';

const LABELS = { legalName: 'Nom légal', registrationNumber: "N° d'enregistrement", idType: "Pièce d'identité (type)", address: 'Adresse', phone: 'Téléphone', website: 'Site / réseaux', activity: 'Activité', notes: 'Remarques' };
const TABS = [['pending', "Liste d'attente"], ['approved', 'Approuvées'], ['rejected', 'Refusées'], ['revoked', 'Retirées']];
let ctx, tab = 'pending', reqs = [], authors = new Map();
const main = document.getElementById('main');

async function load() {
  main.querySelector('#list').innerHTML = '<div class="skeleton"><div class="sk sk-line"></div><div class="sk sk-img"></div></div>';
  try {
    const { m, db } = ctx;
    const snap = await m.getDocs(m.query(m.collection(db, 'verificationRequests'), m.where('status', '==', tab), m.limit(100)));
    reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // la liste d'attente : les plus anciennes d'abord ; les autres : les plus récentes d'abord
    reqs.sort((a, b) => (tab === 'pending' ? 1 : -1) * (millis(a.createdAt) - millis(b.createdAt)));
    authors = await names(reqs.map((r) => r.userId));
  } catch (e) { console.error(e); main.querySelector('#list').innerHTML = emptyState({ iconName: 'badge', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(main); return; }
  render();
}

function render() {
  const box = main.querySelector('#list');
  if (!reqs.length) { box.innerHTML = emptyState({ iconName: 'badge', title: tab === 'pending' ? "Aucune demande en attente" : 'Aucune demande', text: tab === 'pending' ? 'La liste d\'attente est vide.' : '' }); hydrateIcons(box); return; }
  box.innerHTML = reqs.map((r, i) => {
    const a = authors.get(r.userId) || {};
    const data = r.data || {};
    return `<article class="card req-card" data-id="${esc(r.id)}">
      <div class="req-head">
        <span class="avatar">${esc((a.name || '?').trim().charAt(0).toUpperCase())}</span>
        <div class="grow"><strong>${esc(nameOf(authors, r.userId))}</strong><small class="muted">${r.accountType === 'agence' ? 'Agence' : 'Particulier'} · demande du ${esc(fmtDate(r.createdAt))}${tab === 'pending' ? ' · ' + esc(since(r.createdAt)) : ''}</small></div>
        ${tab === 'pending' ? pill('N° ' + (i + 1), 'warn') : statusPill(r.status)}
      </div>
      <dl class="kv">${Object.keys(LABELS).filter((k) => data[k]).map((k) => `<dt>${esc(LABELS[k])}</dt><dd>${esc(data[k])}</dd>`).join('')}</dl>
      ${r.reviewNote ? `<p class="muted"><strong>Note de l'équipe :</strong> ${esc(r.reviewNote)}</p>` : ''}
      ${r.reviewedAt ? `<small class="muted">Décision le ${esc(fmtDateTime(r.reviewedAt))}</small>` : ''}
      <div class="adm-actions">
        <a class="btn btn-ghost" href="profile.html?id=${encodeURIComponent(r.userId)}">${icon('user', 16)} Voir le profil</a>
        <a class="btn btn-ghost" href="chat.html?with=${encodeURIComponent(r.userId)}">${icon('message', 16)} Écrire</a>
        ${r.status === 'pending' ? `<button class="btn btn-primary" data-act="approve">${icon('check', 16)} Approuver</button><button class="btn btn-ghost" data-act="reject" style="color:var(--danger)">${icon('close', 16)} Refuser</button>` : ''}
        ${r.status === 'approved' ? `<button class="btn btn-ghost" data-act="revoke" style="color:var(--danger)">Retirer le badge</button>` : ''}
      </div>
    </article>`;
  }).join('');
  hydrateIcons(box);
}

// Décision : demande + profil modifiés ensemble, puis message à l'utilisateur
async function decide(r, status, note) {
  const { m, db } = ctx;
  const batch = m.writeBatch(db);
  const upd = { status, reviewedBy: ctx.me.uid, reviewedAt: m.serverTimestamp() };
  if (note) upd.reviewNote = note;
  batch.update(m.doc(db, 'verificationRequests', r.id), upd);
  if (status === 'approved') batch.update(m.doc(db, 'users', r.userId), { verified: true });
  if (status === 'revoked') batch.update(m.doc(db, 'users', r.userId), { verified: false });
  await batch.commit();
  await audit(ctx, `verification_${status}`, 'user', r.userId, note || '');
  const msg = {
    approved: `Bonne nouvelle : votre demande de badge de vérification a été approuvée. Le badge est maintenant visible sur votre profil.${note ? '\n' + note : ''}`,
    rejected: `Votre demande de badge de vérification n'a pas pu être acceptée.${note ? '\nMotif : ' + note : ''}\nVous pouvez refaire une demande depuis Menu → Vérification.`,
    revoked: `Le badge de vérification de votre profil a été retiré.${note ? '\nMotif : ' + note : ''}`
  }[status];
  try { await sendMessage({ me: ctx.me.uid, other: r.userId, type: 'text', text: msg }); } catch (e) { toast("Décision enregistrée, mais le message n'a pas pu être envoyé."); }
}

main.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; main.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === t))); load(); return; }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const r = reqs.find((x) => x.id === btn.closest('[data-id]').dataset.id);
  const who = nameOf(authors, r.userId);
  const act = btn.dataset.act;
  if (act === 'approve') confirmAction({ title: `Approuver ${who} ?`, text: 'Le badge sera affiché sur son profil et ses annonces. Un message l\'informera.', confirmLabel: 'Approuver', reason: { label: 'Note (facultatif)' }, onConfirm: async (n) => { await decide(r, 'approved', n); toast('Badge accordé'); load(); } });
  if (act === 'reject') confirmAction({ title: `Refuser la demande de ${who} ?`, confirmLabel: 'Refuser', danger: true, reason: { label: 'Motif (envoyé à la personne)', required: true }, onConfirm: async (n) => { await decide(r, 'rejected', n); toast('Demande refusée'); load(); } });
  if (act === 'revoke') confirmAction({ title: `Retirer le badge de ${who} ?`, confirmLabel: 'Retirer', danger: true, reason: { label: 'Motif (envoyé à la personne)', required: true }, onConfirm: async (n) => { await decide(r, 'revoked', n); toast('Badge retiré'); load(); } });
});

(async () => {
  ctx = await initAdmin({ minRank: 2, active: 'admin-verifications.html' });
  if (!ctx) return;
  main.innerHTML = `<div class="adm-title"><h1>Vérifications</h1></div>
    <div class="adm-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${esc(l)}</button>`).join('')}</div>
    <div id="list" style="display:grid;gap:12px"></div>`;
  load();
})();
