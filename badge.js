// Imova — badge.js : page badge.html (demande du badge de vérification)
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import { getUserDoc } from './users.js';
import { getMyRequest, submitRequest, cancelRequest, getSettings } from './verification.js';
import { SUPPORT_UID, supportReady } from './app-config.js';
import { isConfigured } from './firebase.js';
import { pageHeader, bindBack, emptyState, skeletonCard } from './components.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, clean, toast, explainError } from './utils.js';
import { openModal } from './modal.js';
import { setFieldError, setFormError } from './validation.js';

const main = document.getElementById('main');
document.getElementById('pageHeader').innerHTML = pageHeader('Vérification');
bindBack();

const ID_TYPES = ["Carte d'électeur", 'Passeport', 'Permis de conduire', 'Autre'];
const FORMS = {
  agence: [
    { k: 'legalName', label: "Nom légal de l'agence", req: true, max: 120 },
    { k: 'registrationNumber', label: 'N° RCCM / ID.NAT / NIF', req: true, max: 60, hint: "Numéro d'enregistrement de votre entreprise (information publique)." },
    { k: 'address', label: 'Adresse du siège', req: true, max: 200 },
    { k: 'phone', label: 'Téléphone professionnel', req: true, max: 30, type: 'tel' },
    { k: 'website', label: 'Site web ou page de réseau social', max: 200, hint: 'Facultatif, mais aide à vérifier votre activité.' },
    { k: 'activity', label: 'Votre activité', req: true, max: 400, area: true, hint: 'Vente, location, gestion, quartiers couverts...' },
    { k: 'notes', label: 'Remarques', max: 400, area: true }
  ],
  particulier: [
    { k: 'legalName', label: "Nom complet (comme sur votre pièce d'identité)", req: true, max: 120 },
    { k: 'idType', label: "Type de pièce d'identité que vous pourrez présenter", req: true, select: ID_TYPES },
    { k: 'address', label: 'Adresse', req: true, max: 200 },
    { k: 'phone', label: 'Téléphone', req: true, max: 30, type: 'tel' },
    { k: 'website', label: 'Lien de réseau social ou site', max: 200, hint: 'Facultatif.' },
    { k: 'activity', label: 'Pourquoi demandez-vous le badge ?', req: true, max: 400, area: true, hint: 'Vos annonces, votre activité...' },
    { k: 'notes', label: 'Remarques', max: 400, area: true }
  ]
};

const fmtDate = (t) => { const d = t && t.toDate ? t.toDate() : new Date(t); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); };
const normUrl = (v) => (v && !/^https?:\/\//i.test(v) ? 'https://' + v : v);
const urlOk = (v) => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes('.'); } catch (e) { return false; } };

const benefits = `
  <section class="card benefits" aria-label="Avantages du badge">
    <div class="benefit">${icon('badge', 24)}<div><strong>Un signe de confiance</strong><p>Le badge s'affiche sur votre profil, sur vos annonces et dans les messages et recherches.</p></div></div>
    <div class="benefit">${icon('shield', 24)}<div><strong>Ce que nous vérifions</strong><p>Que le profil correspond à une personne ou une agence réelle et que les informations fournies sont cohérentes. Ce n'est pas une garantie sur chaque annonce : restez prudent.</p></div></div>
    <div class="benefit">${icon('message', 24)}<div><strong>Le suivi se fait par message</strong><p>Votre demande est envoyée au Support Imova dans la messagerie ; l'équipe peut vous demander des justificatifs dans cette conversation.</p></div></div>
  </section>`;

function statusCard(req, user) {
  if (user && user.verified) {
    return `<div class="card status-card"><span class="status-ic ok">${icon('checkCircle', 26)}</span><div class="status-body"><strong>Votre profil est vérifié</strong><span class="muted">Le badge est visible sur votre profil et vos annonces.${req && req.reviewedAt ? ` Accordé le ${esc(fmtDate(req.reviewedAt))}.` : ''}</span></div></div>`;
  }
  if (!req) return '';
  if (req.status === 'pending') {
    return `<div class="card status-card"><span class="status-ic pending">${icon('hourglass', 26)}</span><div class="status-body"><strong>Demande en attente</strong>
      <span class="muted">Envoyée le ${esc(fmtDate(req.createdAt))}. Elle est dans la liste d'attente de l'équipe ; vous serez informé par message.</span>
      <div class="status-actions"><a class="btn btn-primary" href="chat.html?with=${encodeURIComponent(SUPPORT_UID)}">${icon('message', 18)} Voir la conversation avec le support</a><button class="btn btn-ghost" id="cancelReq">Annuler la demande</button></div></div></div>`;
  }
  const rejected = req.status === 'rejected';
  return `<div class="card status-card"><span class="status-ic ko">${icon('xCircle', 26)}</span><div class="status-body"><strong>${rejected ? 'Demande refusée' : 'Badge retiré'}</strong>
    ${req.reviewNote ? `<span>${esc(req.reviewNote)}</span>` : `<span class="muted">${rejected ? "Votre demande n'a pas pu être acceptée." : 'Le badge de ce profil a été retiré par l\'équipe.'}</span>`}
    <span class="muted">Vous pouvez faire une nouvelle demande avec des informations complètes.</span></div></div>`;
}

function formHtml(type, prefill = {}) {
  const fields = FORMS[type] || FORMS.particulier;
  return `
    <form class="form card" id="vForm" novalidate>
      <h2 style="font-size:1.1rem">Demander le badge</h2>
      ${fields.map((f) => `
        <div class="field">
          <label for="v_${f.k}">${esc(f.label)}${f.req ? ' *' : ''}</label>
          ${f.select
            ? `<select class="select" id="v_${f.k}"><option value="">Choisir…</option>${f.select.map((o) => `<option ${prefill[f.k] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
            : f.area
              ? `<textarea class="input" id="v_${f.k}" rows="3" maxlength="${f.max}" style="padding:10px 14px">${esc(prefill[f.k] || '')}</textarea>`
              : `<input class="input" id="v_${f.k}" type="${f.type || 'text'}" maxlength="${f.max}" value="${esc(prefill[f.k] || '')}" autocomplete="off">`}
          ${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}
        </div>`).join('')}
      <div class="caution">${icon('lock', 18)}<span><strong>Ne saisissez pas de numéro de pièce d'identité ici.</strong> Si l'équipe a besoin d'un justificatif, elle vous le demandera dans la conversation. Les fichiers envoyés dans la messagerie sont protégés par un lien difficile à deviner : masquez les informations inutiles.</span></div>
      <label class="check-row"><input type="checkbox" id="v_ok"><span>Je certifie que les informations fournies sont exactes. Une fausse déclaration peut entraîner le refus ou le retrait du badge.</span></label>
      <div class="form-error" id="formError" role="alert" hidden></div>
      <button class="btn btn-primary btn-block" id="vSubmit" type="submit">${icon('send', 18)} Envoyer ma demande</button>
    </form>`;
}

async function run() {
  if (!isConfigured) { main.innerHTML = emptyState({ iconName: 'badge', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js.' }); hydrateIcons(); return; }
  main.innerHTML = skeletonCard();
  const me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  let user, req, settings;
  try {
    [user, req, settings] = await Promise.all([getUserDoc(me.uid), getMyRequest(me.uid), getSettings()]);
  } catch (e) { console.error(e); main.innerHTML = emptyState({ iconName: 'badge', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(); return; }
  const type = (user && user.type) || 'particulier';
  const verified = !!(user && user.verified);
  const canRequest = !verified && (!req || req.status === 'rejected' || req.status === 'revoked');
  const closed = settings.verificationOpen === false;

  main.innerHTML = `
    <section class="card badge-hero"><span class="big-badge">${icon('badge', 46)}</span><h2>Badge de vérification</h2><p>Montrez que votre profil est authentique et gagnez la confiance des utilisateurs.</p></section>
    ${statusCard(req, user)}
    ${!supportReady && canRequest ? `<div class="notice">Le support n'est pas encore configuré par l'administrateur : la demande est momentanément indisponible.</div>` : ''}
    ${closed && canRequest ? `<div class="notice">Les nouvelles demandes de vérification sont momentanément fermées.</div>` : ''}
    ${canRequest && supportReady && !closed ? formHtml(type, (req && req.data) || {}) : ''}
    <h3 class="section-title" style="margin-top:20px">À propos du badge</h3>
    ${benefits}`;
  hydrateIcons(main);

  const cancel = document.getElementById('cancelReq');
  if (cancel) cancel.addEventListener('click', () => openModal({
    title: 'Annuler la demande ?',
    html: '<p class="muted">Votre demande sera retirée de la liste d\'attente. Vous pourrez en faire une nouvelle plus tard.</p>',
    actions: [{ label: 'Garder' }, { label: 'Annuler la demande', danger: true, onClick: async () => { try { await cancelRequest(me.uid); toast('Demande annulée'); run(); } catch (e) { toast(explainError(e)); return false; } } }]
  }));

  const form = document.getElementById('vForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('');
    const data = {};
    let bad = false;
    FORMS[type].forEach((f) => {
      const el = document.getElementById('v_' + f.k);
      let v = clean(el.value, f.max || 120);
      if (f.k === 'website') v = normUrl(v);
      let err = '';
      if (f.req && !v) err = 'Ce champ est obligatoire.';
      else if (f.k === 'phone' && v && !/^[+0-9 ().\-]{6,30}$/.test(v)) err = 'Numéro de téléphone invalide.';
      else if (f.k === 'website' && v && !urlOk(v)) err = 'Adresse invalide (exemple : www.monsite.cd).';
      setFieldError(el, err);
      if (err) bad = true;
      if (v) data[f.k] = v;
    });
    if (bad) { form.querySelector('[aria-invalid="true"]').focus(); return; }
    if (!document.getElementById('v_ok').checked) { setFormError('Cochez la case de certification pour envoyer votre demande.'); return; }
    const btn = document.getElementById('vSubmit');
    btn.disabled = true;
    btn.textContent = 'Envoi…';
    try {
      const res = await submitRequest({ me: me.uid, accountType: type, name: (user && user.name) || me.name || '', data, previous: req });
      toast(res.messageSent ? 'Demande envoyée au support' : "Demande enregistrée (le message au support n'a pas pu partir)");
      run();
    } catch (err) {
      console.error(err);
      setFormError(err && err.code === 'permission-denied' ? "Demande refusée : les vérifications sont peut-être fermées, ou les règles Firestore ne sont pas à jour." : explainError(err));
      btn.disabled = false;
      btn.innerHTML = `${icon('send', 18)} Envoyer ma demande`;
    }
  });
}
run();
