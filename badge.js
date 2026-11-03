// Imova — badge.js : page badge.html — Section 1 : le badge (message, offres et prix, avantages) ; Section 2 : la demande.
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import { getUserDoc } from './users.js';
import { getMyRequest, submitRequest, renewRequest, cancelRequest, getSettings } from './verification.js';
import { PLANS, pricedPlans, fmtMoney, ID_TYPES, idTypeLabel, BENEFITS, planOf } from './badge-config.js';
import { docFieldHtml, bindDocField } from './doc-upload.js';
import { daysLeft, untilMs } from './badge-rules.js';
import { SUPPORT_UID, supportReady } from './app-config.js';
import { cloudinaryReady } from './cloudinary.js';
import { isConfigured } from './firebase.js';
import { pageHeader, bindBack, emptyState, skeletonCard } from './components.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, clean, toast, explainError } from './utils.js';
import { openModal } from './modal.js';
import { setFieldError, setFormError } from './validation.js';

const main = document.getElementById('main');
document.getElementById('pageHeader').innerHTML = pageHeader('Vérification');
bindBack();

const fmtDate = (t) => { const d = t && t.toDate ? t.toDate() : new Date(t); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); };
const normUrl = (v) => (v && !/^https?:\/\//i.test(v) ? 'https://' + v : v);
const urlOk = (v) => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes('.'); } catch (e) { return false; } };

let me, user, req, settings, plans, selected = 'm1', docs = {}, noOrg = false;

// ───────── Section 1 : le badge
const hero = () => `
  <section class="card badge-hero"><span class="big-badge">${icon('badge', 64)}</span><h2>Le badge de vérification</h2>
    <p>Le badge bleu montre que votre identité — ou l'existence de votre agence — a été vérifiée par l'équipe Imova. Gagnez la confiance des acheteurs et des locataires.</p></section>`;

function statusCard() {
  const active = user.verified === true;
  const left = daysLeft(user);
  if (active) {
    const until = untilMs(user);
    const renewing = req && req.status === 'pending' && req.renewal;
    const pct = until ? Math.max(4, Math.min(100, Math.round(((left || 0) / (planOf(req && req.grantedPlan) ? planOf(req.grantedPlan).days : 30)) * 100))) : 100;
    return `<div class="card status-card"><span class="status-ic ok">${icon('checkCircle', 26)}</span><div class="status-body">
      <strong>Votre badge est actif</strong>
      <span class="muted">${until ? `Valable jusqu'au ${esc(fmtDate(user.verifiedUntil))} — ${left <= 0 ? "dernier jour" : `encore ${left} jour${left > 1 ? 's' : ''}`}.` : 'Badge sans date de fin.'}</span>
      ${until ? `<div class="expiry-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>` : ''}
      ${left !== null && left <= 7 ? `<span class="muted" style="color:var(--danger)">Il sera retiré automatiquement à la date de fin : renouvelez-le avant pour ne pas le perdre.</span>` : ''}
      ${renewing ? `<span class="muted">Renouvellement demandé le ${esc(fmtDate(req.updatedAt))} : en attente de l'équipe.</span>` : ''}</div></div>`;
  }
  if (user.badgeExpired) {
    return `<div class="card status-card"><span class="status-ic ko">${icon('hourglass', 26)}</span><div class="status-body"><strong>Votre badge a expiré</strong>
      <span class="muted">Il a pris fin le ${esc(fmtDate(user.verifiedUntil))} et a été retiré. Renouvelez-le pour le retrouver.</span></div></div>`;
  }
  if (!req) return '';
  if (req.status === 'pending') {
    const pl = planOf(req.plan);
    return `<div class="card status-card"><span class="status-ic pending">${icon('hourglass', 26)}</span><div class="status-body"><strong>Demande en attente</strong>
      <span class="muted">Envoyée le ${esc(fmtDate(req.createdAt))}${pl ? ` — offre ${esc(pl.label)} (${esc(fmtMoney(req.price))})` : ''}. Elle est dans la liste d'attente de l'équipe ; le paiement se discute avec le support dans la conversation.</span>
      <div class="status-actions"><a class="btn btn-primary" href="chat.html?with=${encodeURIComponent(SUPPORT_UID)}">${icon('message', 18)} Voir la conversation avec le support</a>${req.renewal ? '' : '<button class="btn btn-ghost" id="cancelReq">Annuler la demande</button>'}</div></div></div>`;
  }
  if (req.status === 'rejected' || req.status === 'revoked') {
    const rejected = req.status === 'rejected';
    return `<div class="card status-card"><span class="status-ic ko">${icon('xCircle', 26)}</span><div class="status-body"><strong>${rejected ? 'Demande refusée' : 'Badge retiré'}</strong>
      ${req.reviewNote ? `<span>${esc(req.reviewNote)}</span>` : `<span class="muted">${rejected ? "Votre demande n'a pas pu être acceptée." : "Le badge de ce profil a été retiré par l'équipe."}</span>`}
      <span class="muted">Vous pouvez faire une nouvelle demande avec des informations complètes.</span></div></div>`;
  }
  return '';
}

function plansHtml() {
  return `<div class="plan-grid" role="radiogroup" aria-label="Offre du badge">${plans.map((p) => `
    <button type="button" class="plan-card" role="radio" aria-checked="${selected === p.id}" data-plan="${p.id}">
      ${p.id === 'y1' ? '<span class="plan-flag">Meilleur prix</span>' : ''}
      <span class="plan-label">${esc(p.label)}</span>
      <span class="plan-price">${esc(fmtMoney(p.price))}</span>
      <span class="plan-sub">soit ${esc(fmtMoney(p.perMonth))} / mois</span>
      ${p.saving > 0 ? `<span class="plan-save">Économisez ${esc(fmtMoney(p.saving))} (${p.savingPct} %)</span>` : `<span class="plan-save plain">${p.months > 1 ? `${p.months} mois sans renouvellement` : 'Sans engagement'}</span>`}
      <span class="plan-check">${icon('check', 16)}</span>
    </button>`).join('')}</div>`;
}

const benefits = () => `<section class="card benefits" aria-label="Avantages du badge">${BENEFITS.map(([ic, t, p]) => `<div class="benefit">${icon(ic, 24)}<div><strong>${esc(t)}</strong><p>${esc(p)}</p></div></div>`).join('')}</section>`;

// ───────── Section 2 : la demande
const sectionHead = (n, title, sub = '') => `<div class="sec-head"><span class="sec-num">${n}</span><div><h2>${esc(title)}</h2>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div></div>`;
const sel = (id, label, options, value = '') => `<div class="field"><label for="${id}">${label}</label><select class="select" id="${id}"><option value="">Choisir…</option>${options.map(([v, l]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
const txt = (id, label, extra = '', hint = '') => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" ${extra}>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;

function planSummary() {
  const p = plans.find((x) => x.id === selected);
  return `<div class="plan-summary">${icon('badge', 22)}<span><strong>Offre choisie : ${esc(p.label)} — ${esc(fmtMoney(p.price))}</strong><small>Vous pouvez la changer dans la section « Le badge » ci-dessus. Le paiement se convient avec le support dans la conversation : il n'est pas demandé ici.</small></span></div>`;
}

function formHtml() {
  const agency = user.type === 'agence';
  return `
    <form class="form card" id="vForm" novalidate>
      ${planSummary()}
      <div class="fieldset-title">${agency ? "Pièce d'identité du responsable ou de la personne chargée" : "Votre pièce d'identité"}</div>
      ${sel('v_idType', agency ? "Type de pièce d'identité" : "Type de pièce d'identité", ID_TYPES)}
      ${docFieldHtml({ id: 'docId', label: agency ? "Photo de la pièce d'identité (responsable ou chargé)" : "Photo de votre pièce d'identité", required: true, hint: "Carte d'électeur, carte d'identité, passeport ou autre document personnel : recto lisible, sans reflet." })}
      ${agency ? `
      <div class="fieldset-title">L'agence</div>
      <div id="orgBlock">${docFieldHtml({ id: 'docOrg', label: "Document prouvant l'existence officielle de l'agence", required: true, hint: 'RCCM, ID. NAT., NIF, patente ou tout autre document officiel.' })}</div>
      <label class="check-row"><input type="checkbox" id="noOrg"><span>Mon agence n'a pas encore de document officiel</span></label>
      <div id="altBlock" hidden>
        <div class="field"><label for="v_just">Expliquez pourquoi et ce que vous pouvez fournir à la place *</label><textarea class="input" id="v_just" rows="3" maxlength="600" style="padding:10px 14px" placeholder="Ex. : agence en cours d'enregistrement, voici ma convention de bail et mes cartes de visite…"></textarea></div>
        ${docFieldHtml({ id: 'docAlt1', label: 'Autre document (facultatif)' })}
        ${docFieldHtml({ id: 'docAlt2', label: 'Autre document (facultatif)' })}
      </div>
      ${txt('v_address', "Adresse complète de l'agence (bureau physique)", 'maxlength="250" autocomplete="street-address"', 'Avenue, numéro, quartier, commune, ville.')}
      ${txt('v_website', "Ou site internet de l'agence", 'maxlength="200" inputmode="url" autocapitalize="none"', "Indiquez au moins l'adresse physique ou le site internet.")}` : `
      <div class="fieldset-title">Votre adresse</div>
      ${txt('v_address', 'Adresse complète', 'maxlength="250" autocomplete="street-address"', 'Avenue, numéro, quartier, commune, ville.')}`}
      <div class="field"><label for="v_notes">Remarques (facultatif)</label><textarea class="input" id="v_notes" rows="2" maxlength="400" style="padding:10px 14px"></textarea></div>
      <div class="caution">${icon('lock', 18)}<span><strong>Vos documents restent confidentiels.</strong> Ils sont vus uniquement par l'équipe Imova, pour vérifier votre profil, et conservés pour pouvoir prouver l'existence du compte en cas de problème (arnaque, litige…). Envoyez des photos nettes et complètes. Les fichiers sont stockés derrière un lien difficile à deviner.</span></div>
      <label class="check-row"><input type="checkbox" id="v_ok"><span>Je certifie que les informations et documents fournis sont authentiques. Une fausse déclaration peut entraîner le refus ou le retrait du badge.</span></label>
      <div class="form-error" id="formError" role="alert" hidden></div>
      <button class="btn btn-primary btn-block" id="vSubmit" type="submit">${icon('send', 18)} Envoyer ma demande</button>
    </form>`;
}

function renewHtml() {
  return `<form class="form card" id="rForm" novalidate>${planSummary()}
    <p class="muted">Vos documents sont déjà au dossier : choisissez simplement l'offre ci-dessus. Le support vous répond dans la conversation pour le paiement.</p>
    <div class="form-error" id="formError" role="alert" hidden></div>
    <button class="btn btn-primary btn-block" id="rSubmit" type="submit">${icon('send', 18)} Demander le renouvellement</button></form>`;
}

// ───────── Envoi
function overlay(steps) {
  const wrap = document.createElement('div');
  wrap.className = 'creating';
  wrap.innerHTML = `<div class="creating-card" role="status" aria-live="polite"><div class="big-spin"></div><strong>Envoi de votre demande…</strong>
    <div class="creating-steps">${steps.map((s, i) => `<div data-s="${i + 1}">${icon('check', 16)} ${esc(s)}</div>`).join('')}</div><small class="muted">Ne fermez pas la page.</small></div>`;
  document.getElementById('overlay-root').appendChild(wrap);
  hydrateIcons(wrap);
  const mark = (n, extra = '') => wrap.querySelectorAll('[data-s]').forEach((d) => { const i = Number(d.dataset.s); d.className = i < n ? 'done' : i === n ? 'now' : ''; if (i === n && extra) d.querySelector('.extra')?.remove(); });
  mark(1);
  return { mark, close: () => wrap.remove() };
}

async function run() {
  if (!isConfigured) { main.innerHTML = emptyState({ iconName: 'badge', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js.' }); hydrateIcons(); return; }
  main.innerHTML = skeletonCard();
  me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  try { [user, req, settings] = await Promise.all([getUserDoc(me.uid), getMyRequest(me.uid), getSettings()]); } catch (e) { console.error(e); main.innerHTML = emptyState({ iconName: 'badge', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(); return; }
  plans = pricedPlans(settings.badgePrices);
  if (!plans.find((p) => p.id === selected)) selected = plans[0].id;
  const active = user.verified === true;
  const renewable = (active || user.badgeExpired) && req && req.status === 'approved';
  const pendingNew = req && req.status === 'pending' && !req.renewal;
  const canFull = !active && !user.badgeExpired && (!req || req.status === 'rejected' || req.status === 'revoked');
  const canFullAfterExpiry = user.badgeExpired && (!req || req.status !== 'approved'); // badge expiré sans dossier approuvé
  const closed = settings.verificationOpen === false;
  const showForm = (canFull || canFullAfterExpiry) && !closed && supportReady;
  const showRenew = renewable && !(req.status === 'pending') && !closed && supportReady && !(req && req.renewal && req.status === 'pending');
  main.innerHTML = `
    ${sectionHead(1, 'Le badge de vérification', 'Ce que c\'est, ce que ça coûte et ce que ça apporte.')}
    ${hero()}
    ${statusCard()}
    <h3 class="section-title">Pourquoi se faire vérifier ?</h3>
    ${benefits()}
    <h3 class="section-title">${showForm || showRenew ? 'Choisissez votre offre' : 'Les offres'}</h3>
    ${plansHtml()}
    <p class="muted pay-note">${icon('info', 16)} Le paiement en ligne n'est pas encore disponible : après l'envoi de votre demande, les modalités de paiement sont convenues avec le support dans la conversation.</p>
    ${!supportReady ? `<div class="notice">Le support n'est pas encore configuré par l'administrateur : la demande est momentanément indisponible.</div>` : ''}
    ${closed ? `<div class="notice">Les nouvelles demandes de vérification sont momentanément fermées.</div>` : ''}
    ${showForm || showRenew ? `<div id="requestSection">${sectionHead(2, showRenew ? 'Renouveler mon badge' : 'Votre demande', showRenew ? '' : 'Les informations et documents à fournir pour vérifier votre profil.')}
      ${!cloudinaryReady && showForm ? '<div class="notice">Le stockage des documents (Cloudinary) n\'est pas encore configuré : voir GUIDE-FIREBASE.md.</div>' : ''}
      ${showRenew ? renewHtml() : formHtml()}</div>` : ''}`;
  hydrateIcons(main);
  bindPage({ showForm, showRenew });
}

function bindPage({ showForm, showRenew }) {
  main.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => {
    selected = b.dataset.plan;
    main.querySelectorAll('[data-plan]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    const sum = main.querySelector('.plan-summary');
    if (sum) sum.outerHTML = planSummary(), hydrateIcons(main);
  }));
  const cancel = document.getElementById('cancelReq');
  if (cancel) cancel.addEventListener('click', () => openModal({
    title: 'Annuler la demande ?', html: "<p class=\"muted\">Votre demande sera retirée de la liste d'attente. Vous pourrez en faire une nouvelle plus tard.</p>",
    actions: [{ label: 'Garder' }, { label: 'Annuler la demande', danger: true, onClick: async () => { try { await cancelRequest(me.uid); toast('Demande annulée'); run(); } catch (e) { toast(explainError(e)); return false; } } }]
  }));
  if (showRenew) {
    document.getElementById('rForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('rSubmit'); btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        const p = plans.find((x) => x.id === selected);
        const res = await renewRequest({ me: me.uid, accountType: user.type, name: user.name || '', plan: selected, price: p.price, previous: req });
        toast(res.messageSent ? 'Demande de renouvellement envoyée' : "Demande enregistrée (le message n'a pas pu partir)"); run();
      } catch (err) { console.error(err); setFormError(err && err.code === 'permission-denied' ? 'Demande refusée : les vérifications sont peut-être fermées, ou les règles Firestore ne sont pas à jour.' : explainError(err)); btn.disabled = false; btn.innerHTML = `${icon('send', 18)} Demander le renouvellement`; }
    });
    return;
  }
  if (!showForm) return;
  const agency = user.type === 'agence';
  docs = { id: bindDocField('docId', main) };
  if (agency) {
    docs.org = bindDocField('docOrg', main); docs.alt1 = bindDocField('docAlt1', main); docs.alt2 = bindDocField('docAlt2', main);
    document.getElementById('noOrg').addEventListener('change', (e) => {
      noOrg = e.target.checked;
      document.getElementById('orgBlock').hidden = noOrg; document.getElementById('altBlock').hidden = !noOrg;
    });
  }
  document.getElementById('vForm').addEventListener('submit', onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  setFormError('');
  const agency = user.type === 'agence';
  const val = (id) => clean((document.getElementById(id) || {}).value || '', 600);
  let bad = false;
  const fail = (el, msg) => { if (el) setFieldError(el, msg); if (msg) bad = true; };
  const idType = val('v_idType');
  fail(document.getElementById('v_idType'), idType ? '' : "Choisissez le type de pièce d'identité.");
  if (!docs.id.file) { docs.id.setError("Joignez la photo de la pièce d'identité."); bad = true; } else docs.id.setError('');
  const address = val('v_address');
  let website = normUrl(val('v_website'));
  if (agency) {
    if (!noOrg) { if (!docs.org.file) { docs.org.setError("Joignez le document officiel de l'agence, ou cochez « pas encore de document officiel »."); bad = true; } else docs.org.setError(''); }
    else { const j = val('v_just'); fail(document.getElementById('v_just'), j.length < 10 ? 'Expliquez en quelques mots (10 caractères minimum).' : ''); }
    if (address.length < 5 && !website) { fail(document.getElementById('v_address'), "Indiquez l'adresse physique ou le site internet de l'agence."); }
    else fail(document.getElementById('v_address'), '');
    if (website && !urlOk(website)) fail(document.getElementById('v_website'), 'Adresse de site invalide (exemple : www.monsite.cd).');
  } else {
    fail(document.getElementById('v_address'), address.length < 5 ? 'Indiquez votre adresse complète.' : '');
  }
  if (bad) { const first = main.querySelector('[aria-invalid="true"], .has-error'); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (!document.getElementById('v_ok').checked) { setFormError('Cochez la case de certification pour envoyer votre demande.'); return; }
  if (!cloudinaryReady) { setFormError("Le stockage des documents n'est pas encore configuré (Cloudinary)."); return; }
  const btn = document.getElementById('vSubmit'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Envoi…';
  const todo = [['id', "Envoi de la pièce d'identité"], ...(agency && !noOrg ? [['org', "Envoi du document de l'agence"]] : []), ...(agency && noOrg ? [['alt1', 'Envoi du document 1'], ['alt2', 'Envoi du document 2']].filter(([k]) => docs[k].file) : [])];
  const steps = [...todo.map((t) => t[1]), 'Enregistrement de la demande', 'Envoi au support'];
  const ov = overlay(steps);
  try {
    const up = {};
    for (let i = 0; i < todo.length; i++) { ov.mark(i + 1); up[todo[i][0]] = await docs[todo[i][0]].upload(); }
    ov.mark(todo.length + 1);
    const data = { idType, idUrl: up.id.url, idKind: up.id.kind, idName: up.id.name, address: address || '', website: website || '', notes: val('v_notes') };
    if (!data.address) delete data.address;
    if (!data.website) delete data.website;
    if (!data.notes) delete data.notes;
    if (agency) {
      if (up.org) { data.orgUrl = up.org.url; data.orgKind = up.org.kind; data.orgName = up.org.name; }
      if (noOrg) { data.orgJustification = val('v_just'); data.extraDocs = ['alt1', 'alt2'].map((k) => up[k]).filter(Boolean).map((d) => ({ url: d.url, kind: d.kind, name: d.name })); }
    }
    const p = plans.find((x) => x.id === selected);
    ov.mark(todo.length + 2);
    const res = await submitRequest({ me: me.uid, accountType: user.type, name: user.name || '', data, plan: selected, price: p.price, previous: req });
    ov.mark(todo.length + 3); ov.close();
    toast(res.messageSent ? 'Demande envoyée au support' : "Demande enregistrée (le message au support n'a pas pu partir)");
    run();
  } catch (err) {
    console.error(err); ov.close();
    setFormError(err && err.message === 'cloudinary-not-configured' ? "Le stockage des documents n'est pas configuré." : err && err.code === 'permission-denied' ? 'Demande refusée : les vérifications sont peut-être fermées, ou les règles Firestore ne sont pas à jour.' : /upload|network|Invalid|format/i.test(String((err && err.message) || '')) ? "L'envoi d'un document a échoué : vérifiez votre connexion et le preset Cloudinary (formats image et PDF autorisés)." : explainError(err));
    btn.disabled = false; btn.innerHTML = `${icon('send', 18)} Envoyer ma demande`;
  }
}
run();
