// Imova — examination.js : page d'examen du compte (examination.html).
// Un compte suspendu ou supprimé est toujours envoyé ici, jusqu'à la fin de l'examen. Un compte restreint peut aussi la consulter.
import { whenReady, logout } from './auth.js';
import { loginUrl } from './guards.js';
import { firestore, isConfigured } from './firebase.js';
import { statusOf, fmtWhen, fmtDay } from './account-status.js';
import { forgetStatus } from './account-guard.js';
import { icon, hydrateIcons } from './icons.js';
import { esc } from './utils.js';

const main = document.getElementById('main');
let me, u = null, mod = null, tick = null;

const STATE_LABEL = { restricted: 'Compte restreint', suspended: 'Compte suspendu', deleted: 'Compte supprimé', restored: 'Compte restauré', lifted: 'Restriction levée', continuing: "L'examen se poursuit" };
const brand = '<a class="auth-brand" href="index.html" style="margin:0"><img src="logo.svg" width="36" height="36" alt=""><span>Imova</span></a>';

function timeline() {
  const h = (mod && mod.history) || [];
  if (!h.length) return '';
  return `<section class="card" style="padding:6px 0"><h3 style="padding:12px 16px 0;font-size:1rem">Suivi de l'examen</h3>${[...h].reverse().map((x) => `
    <div class="sum-block"><div class="sum-head"><h3>${esc(STATE_LABEL[x.state] || x.state)}</h3><small class="muted">${esc(fmtWhen(x.at))}</small></div>
      ${x.reason ? `<div class="sum-row"><span>Motif</span><span>${esc(x.reason)}</span></div>` : ''}
      ${x.message ? `<div class="sum-row"><span>Message de l'équipe</span><span>${esc(x.message)}</span></div>` : ''}
      ${x.state === 'restricted' && x.until ? `<div class="sum-row"><span>Jusqu'au</span><span>${esc(fmtWhen(x.until))}</span></div>` : ''}</div>`).join('')}</section>`;
}

function render() {
  const st = statusOf(u);
  const ex = (mod && mod.examination) || {};
  let card = '';
  let actions = '<button class="btn btn-ghost btn-block" id="refreshBtn">Actualiser</button>';
  if (st.state === 'suspended') {
    card = `<section class="card welcome-hero" style="background:linear-gradient(160deg,#5a1f1f,#2a0d0d)"><span class="big" style="color:#ff9d9d;background:rgba(255,120,120,.16)">${icon('ban', 40)}</span>
      <h1>Votre compte est suspendu</h1>
      <p>Nous vérifions la conformité de vos activités avec nos politiques de confidentialité. Après examen, nous vous communiquerons notre décision.</p></section>
      <div class="card summary"><div class="sum-block">
        ${st.at ? `<div class="sum-row"><span>Suspendu le</span><span>${esc(fmtWhen(st.at))}</span></div>` : ''}
        ${st.reason ? `<div class="sum-row"><span>Motif</span><span>${esc(st.reason)}</span></div>` : ''}
        <div class="sum-row"><span>État de l'examen</span><span>${ex.state === 'continuing' ? "L'examen se poursuit" : 'Examen en cours'}</span></div>
        ${ex.message ? `<div class="sum-row"><span>Message de l'équipe</span><span>${esc(ex.message)}</span></div>` : ''}</div></div>
      <div class="info-box">${icon('info', 18)}<span>Pendant l'examen, votre compte et vos annonces ne sont pas visibles et vous ne pouvez pas utiliser Imova. Cette page se met à jour dès que la décision est prise.</span></div>`;
    actions += '<button class="btn btn-primary btn-block" id="logoutBtn">Se déconnecter</button>';
  } else if (st.state === 'deleted') {
    card = `<section class="card welcome-hero" style="background:linear-gradient(160deg,#3a1313,#150606)"><span class="big" style="color:#ff9d9d;background:rgba(255,120,120,.16)">${icon('xCircle', 40)}</span>
      <h1>Votre compte a été supprimé</h1>
      <p>Après examen, votre compte ne respecte pas nos politiques de confidentialité et d'utilisation. Il a été retiré de la plateforme.</p></section>
      <div class="card summary"><div class="sum-block">
        <div class="sum-row"><span>Supprimé le</span><span>${esc(st.at ? fmtDay(st.at) : '—')}</span></div>
        <div class="sum-row"><span>Raison</span><span>${esc(st.reason || 'Non-respect de nos politiques')}</span></div>
        ${ex.message ? `<div class="sum-row"><span>Message de l'équipe</span><span>${esc(ex.message)}</span></div>` : ''}</div></div>
      <div class="info-box">${icon('info', 18)}<span>Votre profil, vos informations et vos annonces ne sont plus visibles sur Imova.</span></div>`;
    actions += '<button class="btn btn-primary btn-block" id="logoutBtn">Se déconnecter</button>';
  } else if (st.state === 'restricted') {
    card = `<section class="card welcome-hero" style="background:linear-gradient(160deg,#6b4a0f,#2b1d04)"><span class="big" style="color:#ffd27a;background:rgba(255,210,122,.16)">${icon('hourglass', 40)}</span>
      <h1>Votre compte est temporairement restreint</h1>
      <p>Nous vérifions certaines informations de votre compte. Vous pouvez vous connecter normalement.</p></section>
      <div class="card summary"><div class="sum-block">
        <div class="sum-row"><span>Restriction jusqu'au</span><span>${esc(fmtWhen(st.until))}</span></div>
        <div class="sum-row"><span>Temps restant</span><span id="left">—</span></div>
        ${st.reason ? `<div class="sum-row"><span>Motif</span><span>${esc(st.reason)}</span></div>` : ''}
        ${ex.message ? `<div class="sum-row"><span>Message de l'équipe</span><span>${esc(ex.message)}</span></div>` : ''}</div></div>
      <div class="card summary"><div class="sum-block"><h3 style="font-size:.85rem;color:var(--text-muted);text-transform:uppercase">Pendant la restriction</h3>
        <div class="sum-row"><span>Vous pouvez</span><span>Parcourir, répondre aux messages, rechercher</span></div>
        <div class="sum-row"><span>Vous ne pouvez pas</span><span>Publier, noter, aimer, suivre, ouvrir une nouvelle discussion, demander le badge, modifier vos informations</span></div></div></div>`;
    actions += '<a class="btn btn-primary btn-block" href="index.html">Continuer vers Imova</a>';
  } else {
    const last = ((mod && mod.history) || []).slice(-1)[0];
    card = `<section class="card welcome-hero"><span class="big">${icon('checkCircle', 40)}</span>
      <h1>${last && (last.state === 'restored' || last.state === 'lifted') ? 'Votre compte a été restauré' : 'Votre compte est actif'}</h1>
      <p>${last && (last.state === 'restored' || last.state === 'lifted') ? (last.message || 'Après examen, votre compte fonctionne de nouveau normalement.') : "Aucun examen n'est en cours sur votre compte."}</p></section>`;
    actions += '<a class="btn btn-primary btn-block" href="index.html">Retourner sur Imova</a>';
  }
  main.innerHTML = `<div class="wiz-top">${brand}</div>${card}${timeline()}
    <a class="muted" style="text-align:center" href="policy.html#confidentialite" target="_blank" rel="noopener">Lire nos politiques de confidentialité et d'utilisation</a>
    <div class="wiz-actions">${actions}</div>`;
  hydrateIcons(main);
  const r = document.getElementById('refreshBtn'); if (r) r.onclick = () => { forgetStatus(me.uid); location.reload(); };
  const lo = document.getElementById('logoutBtn'); if (lo) lo.onclick = async () => { try { await logout(); } catch (e) { /* ignoré */ } forgetStatus(me.uid); location.replace('login.html'); };
  if (tick) clearInterval(tick);
  if (st.state === 'restricted') {
    const upd = () => {
      const ms = st.until - Date.now();
      if (ms <= 0) { forgetStatus(me.uid); location.reload(); return; }
      const h = Math.floor(ms / 3600000), mn = Math.floor((ms % 3600000) / 60000);
      const el = document.getElementById('left'); if (el) el.textContent = h >= 24 ? `${Math.floor(h / 24)} j ${h % 24} h` : `${h} h ${mn} min`;
    };
    upd(); tick = setInterval(upd, 30000);
  }
}

(async () => {
  if (!isConfigured) { main.innerHTML = '<p class="notice">Firebase non configuré.</p>'; return; }
  main.innerHTML = '<div class="skeleton"><div class="sk sk-line"></div><div class="sk sk-img"></div></div>';
  me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  const { m, db } = await firestore();
  // l'état se met à jour en direct dès que l'équipe prend une décision
  const refresh = () => { forgetStatus(me.uid); render(); };
  m.onSnapshot(m.doc(db, 'users', me.uid), (s) => { u = s.exists() ? s.data() : {}; refresh(); }, () => {});
  m.onSnapshot(m.doc(db, 'moderation', me.uid), (s) => { mod = s.exists() ? s.data() : null; if (u) refresh(); }, () => {});
})();
