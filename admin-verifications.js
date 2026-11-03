// Imova — admin-verifications.js : liste d'attente des demandes de badge (administrateurs) : dossier complet et durée du badge
import { initAdmin, audit, names, nameOf, fmtDate, fmtDateTime, since, pill, statusPill, confirmAction, millis } from './admin.js';
import { sendMessage } from './messaging.js';
import { notify } from './notifs.js';
import { dossierHtml, grantModal } from './verif-view.js';
import { planOf, fmtMoney } from './badge-config.js';
import { untilMs, isBadgeActive } from './badge-rules.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, explainError } from './utils.js';
import { emptyState } from './components.js';
import { verifiedMark } from './components.js';

const TABS = [['pending', "Liste d'attente"], ['approved', 'Approuvées'], ['rejected', 'Refusées'], ['revoked', 'Retirées']];
let ctx, tab = 'pending', reqs = [], authors = new Map(), privs = new Map();
const main = document.getElementById('main');
const fmtLong = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

async function load() {
  main.querySelector('#list').innerHTML = '<div class="skeleton"><div class="sk sk-line"></div><div class="sk sk-img"></div></div>';
  try {
    const { m, db } = ctx;
    const snap = await m.getDocs(m.query(m.collection(db, 'verificationRequests'), m.where('status', '==', tab), m.limit(100)));
    reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // la liste d'attente : les plus anciennes d'abord ; les autres : les plus récentes d'abord
    reqs.sort((a, b) => (tab === 'pending' ? 1 : -1) * (millis(a.createdAt) - millis(b.createdAt)));
    authors = await names(reqs.map((r) => r.userId));
    await Promise.all(reqs.map(async (r) => { try { const s = await m.getDoc(m.doc(db, 'userPrivate', r.userId)); privs.set(r.userId, s.exists() ? s.data() : null); } catch (e) { privs.set(r.userId, null); } }));
  } catch (e) { console.error(e); main.querySelector('#list').innerHTML = emptyState({ iconName: 'badge', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(main); return; }
  render();
}

function render() {
  const box = main.querySelector('#list');
  if (!reqs.length) { box.innerHTML = emptyState({ iconName: 'badge', title: tab === 'pending' ? "Aucune demande en attente" : 'Aucune demande', text: tab === 'pending' ? "La liste d'attente est vide." : '' }); hydrateIcons(main); return; }
  box.innerHTML = reqs.map((r, i) => {
    const a = authors.get(r.userId) || {};
    return `<article class="card req-card" data-id="${esc(r.id)}">
      <div class="req-head">
        <span class="avatar">${esc((a.name || '?').trim().charAt(0).toUpperCase())}</span>
        <div class="grow"><strong>${esc(nameOf(authors, r.userId))}${verifiedMark(a.verified, 15)}</strong><small class="muted">${r.accountType === 'agence' ? 'Agence' : 'Particulier'} · demande du ${esc(fmtDate(r.createdAt))}${tab === 'pending' ? ' · ' + esc(since(r.createdAt)) : ''}</small></div>
        ${tab === 'pending' ? pill((r.renewal ? 'Renouvellement · ' : '') + 'N° ' + (i + 1), 'warn') : statusPill(r.status)}
      </div>
      ${dossierHtml(r, privs.get(r.userId))}
      ${r.grantedUntil ? `<p class="muted"><strong>Badge accordé</strong> (${esc((planOf(r.grantedPlan) || {}).label || '')}) jusqu'au ${esc(fmtLong(millis(r.grantedUntil)))}.</p>` : ''}
      ${r.reviewNote ? `<p class="muted"><strong>Note de l'équipe :</strong> ${esc(r.reviewNote)}</p>` : ''}
      ${r.reviewedAt ? `<small class="muted">Décision le ${esc(fmtDateTime(r.reviewedAt))}</small>` : ''}
      <div class="adm-actions">
        <a class="btn btn-ghost" href="profile.html?id=${encodeURIComponent(r.userId)}">${icon('user', 16)} Voir le profil</a>
        <a class="btn btn-ghost" href="chat.html?with=${encodeURIComponent(r.userId)}">${icon('message', 16)} Écrire</a>
        ${r.status === 'pending' ? `<button class="btn btn-primary" data-act="approve">${icon('check', 16)} Accorder le badge…</button><button class="btn btn-ghost" data-act="reject" style="color:var(--danger)">${icon('close', 16)} Refuser</button>` : ''}
        ${r.status === 'approved' ? `<button class="btn btn-ghost" data-act="extend">Prolonger…</button><button class="btn btn-ghost" data-act="revoke" style="color:var(--danger)">Retirer le badge</button>` : ''}
      </div>
    </article>`;
  }).join('');
  hydrateIcons(box);
}

// Décision : demande + profil modifiés ensemble, puis notification et message à l'utilisateur
async function grant(r, { plan, until, note }) {
  const { m, db } = ctx;
  const batch = m.writeBatch(db);
  const upd = { status: 'approved', reviewedBy: ctx.me.uid, reviewedAt: m.serverTimestamp(), grantedPlan: plan, grantedUntil: new Date(until), renewal: false };
  if (note) upd.reviewNote = note;
  batch.update(m.doc(db, 'verificationRequests', r.id), upd);
  batch.update(m.doc(db, 'users', r.userId), { verified: true, verifiedUntil: new Date(until), verifiedPlan: plan });
  await batch.commit();
  await audit(ctx, 'verification_approved', 'user', r.userId, `${(planOf(plan) || {}).label} jusqu'au ${fmtLong(until)}${note ? ' — ' + note : ''}`);
  notify(r.userId, { type: 'verification', id: `verification_${Date.now()}`, title: 'Badge de vérification accordé', body: `Actif jusqu'au ${fmtLong(until)}.`, link: 'badge.html' });
  try { await sendMessage({ me: ctx.me.uid, other: r.userId, type: 'text', text: `Bonne nouvelle : votre badge de vérification est accordé (${(planOf(plan) || {}).label}). Il est actif jusqu'au ${fmtLong(until)} et sera retiré automatiquement à cette date ; vous serez prévenu quelques jours avant pour pouvoir le renouveler.${note ? '\n' + note : ''}` }); } catch (e) { toast("Badge accordé, mais le message n'a pas pu être envoyé."); }
}

async function refuse(r, status, note) {
  const { m, db } = ctx;
  const batch = m.writeBatch(db);
  const upd = { status, reviewedBy: ctx.me.uid, reviewedAt: m.serverTimestamp() };
  if (note) upd.reviewNote = note;
  batch.update(m.doc(db, 'verificationRequests', r.id), upd);
  if (status === 'revoked') batch.update(m.doc(db, 'users', r.userId), { verified: false, verifiedUntil: m.deleteField(), verifiedPlan: m.deleteField() });
  await batch.commit();
  await audit(ctx, `verification_${status}`, 'user', r.userId, note || '');
  notify(r.userId, { type: 'verification', id: `verification_${Date.now()}`, title: status === 'rejected' ? 'Demande de badge refusée' : 'Badge de vérification retiré', body: note || '', link: 'badge.html' });
  const msg = status === 'rejected'
    ? `Votre demande de badge de vérification n'a pas pu être acceptée.${note ? '\nMotif : ' + note : ''}\nVous pouvez refaire une demande depuis Menu → Vérification.`
    : `Le badge de vérification de votre profil a été retiré.${note ? '\nMotif : ' + note : ''}`;
  try { await sendMessage({ me: ctx.me.uid, other: r.userId, type: 'text', text: msg }); } catch (e) { toast("Décision enregistrée, mais le message n'a pas pu être envoyé."); }
}

main.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; main.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === t))); load(); return; }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const r = reqs.find((x) => x.id === btn.closest('[data-id]').dataset.id);
  const who = nameOf(authors, r.userId);
  const act = btn.dataset.act;
  if (act === 'approve' || act === 'extend') {
    let cur = 0;
    try { const s = await ctx.m.getDoc(ctx.m.doc(ctx.db, 'users', r.userId)); cur = isBadgeActive(s.data()) ? untilMs(s.data()) : 0; } catch (x) { /* ignoré */ }
    grantModal({
      title: act === 'extend' ? `Prolonger le badge de ${who}` : `Accorder le badge à ${who}`, plan: r.plan || 'm1', currentUntil: cur,
      text: r.plan ? `Offre demandée : ${(planOf(r.plan) || {}).label} (${fmtMoney(r.price)}). Vérifiez les documents et le paiement convenu avec la personne.` : '',
      confirmLabel: act === 'extend' ? 'Prolonger' : 'Accorder le badge',
      onConfirm: async (g) => { await grant(r, g); toast('Badge accordé'); load(); }
    });
  }
  if (act === 'reject') confirmAction({ title: `Refuser la demande de ${who} ?`, confirmLabel: 'Refuser', danger: true, reason: { label: 'Motif (envoyé à la personne)', required: true }, onConfirm: async (n) => { await refuse(r, 'rejected', n); toast('Demande refusée'); load(); } });
  if (act === 'revoke') confirmAction({ title: `Retirer le badge de ${who} ?`, text: 'Le badge est retiré tout de suite, avant sa date de fin.', confirmLabel: 'Retirer', danger: true, reason: { label: 'Motif (envoyé à la personne)', required: true }, onConfirm: async (n) => { await refuse(r, 'revoked', n); toast('Badge retiré'); load(); } });
});

(async () => {
  ctx = await initAdmin({ minRank: 2, active: 'admin-verifications.html' });
  if (!ctx) return;
  main.innerHTML = `<div class="adm-title"><h1>Vérifications</h1></div>
    <div class="adm-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${esc(l)}</button>`).join('')}</div>
    <div id="list" style="display:grid;gap:12px"></div>`;
  load();
})();
