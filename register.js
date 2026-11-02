// Imova — register.js : inscription en 4 étapes (type de compte, identité, connexion, récapitulatif).
import { createAccount, authMessage } from './auth.js';
import { whenReady, getUser } from './auth.js';
import { isConfigured } from './firebase.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, clean, toast, param } from './utils.js';
import { identifierToLogin, normalizePhone, COUNTRIES, GENDERS, birthDateLimits, ageOf, properName, fullNameOf, publicNameOf, genderLabel } from './identity.js';
import { checkPersonName, checkBirthDate, checkPhone, checkEmail, checkPassword, passwordStrength, setFieldError, setFormError } from './validation.js';
import { isReady } from './pages.js';

const form = document.getElementById('form');
const DRAFT = 'imova-reg-draft';
const STEPS = ['Type de compte', 'Identité', 'Connexion', 'Récapitulatif'];
const add = param('add') === '1';
const next = (() => { const n = param('next') || ''; return /^[a-z0-9-]+\.html(\?[^#\s]*)?$/i.test(n) ? n : ''; })();

const S = { step: 1, type: '', lastName: '', postName: '', firstName: '', gender: '', birthDate: '', agencyName: '', loginType: 'email', email: '', dial: '+243', phone: '', password: '', confirm: '', consent: false, busy: false };
try { const d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); if (d) Object.assign(S, d, { password: '', confirm: '', consent: false, busy: false }); } catch (e) { /* ignoré */ }
if (!S.type && ['particulier', 'agence'].includes(param('type'))) S.type = param('type');
// Le mot de passe n'est jamais gardé dans le brouillon : après un rechargement, on reprend à l'étape « Connexion »
if (S.step > 3) S.step = 3;
const saveDraft = () => { try { const { password, confirm, consent, busy, ...rest } = S; sessionStorage.setItem(DRAFT, JSON.stringify(rest)); } catch (e) { /* ignoré */ } };
const isAgency = () => S.type === 'agence';

// ───────── Étapes
const field = (id, label, inner, hint = '') => `<div class="field"><label for="${id}">${label}</label>${inner}${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
const input = (id, value, extra = '') => `<input class="input" id="${id}" value="${esc(value)}" ${extra}>`;

function stepType() {
  const card = (key, ic, title, text, bullets) => `
    <button type="button" class="type-card" role="radio" aria-checked="${S.type === key}" data-type="${key}">
      <span class="tc-head"><span class="tc-ic">${icon(ic, 24)}</span><strong>${title}</strong><span class="tc-check">${icon('check', 16)}</span></span>
      <p>${text}</p><ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
    </button>`;
  return `
    <h1>Quel compte voulez-vous créer ?</h1>
    <p class="lead">Ce choix est définitif : il ne pourra pas être modifié ensuite.</p>
    <div class="type-cards" role="radiogroup" aria-label="Type de compte">
      ${card('particulier', 'user', 'Compte particulier', "Pour chercher une maison, un appartement, un terrain ou un local, <strong>et aussi</strong> pour mettre en vente ou en location vos propres biens, sans être une agence immobilière.", ['Vous cherchez à acheter ou à louer', 'Vous avez un bien à vendre ou à louer', 'Vous êtes un propriétaire, un locataire ou un investisseur'])}
      ${card('agence', 'building', 'Compte agence', "Réservé aux <strong>agences immobilières, entreprises immobilières</strong> et autres professionnels du secteur. Le nom de l'agence est affiché sur le profil.", ['Agence ou entreprise immobilière', 'Promoteur, gestionnaire de biens, courtier', 'Un responsable est identifié pour l\'agence'])}
    </div>
    <p class="error" id="typeErr" hidden>Choisissez un type de compte pour continuer.</p>`;
}

function stepIdentity() {
  const { min, max } = birthDateLimits();
  const g = GENDERS.map(([v, l]) => `<label><input type="radio" name="gender" value="${v}" ${S.gender === v ? 'checked' : ''}><span>${l}</span></label>`).join('');
  return `
    <h1>${isAgency() ? "Informations de l'agence" : 'Votre identité'}</h1>
    <p class="lead">${isAgency() ? "Renseignez d'abord le responsable de l'agence, puis l'agence." : 'Renseignez vos informations personnelles.'}</p>
    <div class="info-box">${icon('lock', 18)}<span>Ces informations sont <strong>privées</strong> : seuls vous et l'équipe Imova les voient. Sur votre profil public, seul ${isAgency() ? "le nom de l'agence" : 'votre prénom et votre nom'} apparaît.</span></div>
    ${isAgency() ? '<div class="fieldset-title">Responsable de l\'agence</div>' : ''}
    <div class="form-grid two">
      ${field('lastName', 'Nom', input('lastName', S.lastName, 'autocomplete="family-name" maxlength="60"'))}
      ${field('postName', 'Post-nom', input('postName', S.postName, 'autocomplete="additional-name" maxlength="60"'))}
    </div>
    ${field('firstName', 'Prénom', input('firstName', S.firstName, 'autocomplete="given-name" maxlength="60"'))}
    <div class="field" role="radiogroup" aria-label="Sexe"><label>Sexe</label><div class="seg2" id="genderSeg">${g}</div></div>
    ${field('birthDate', 'Date de naissance', input('birthDate', S.birthDate, `type="date" min="${min}" max="${max}" autocomplete="bday"`), 'Il faut avoir au moins 18 ans.')}
    <div class="age-hint" id="ageHint"></div>
    ${isAgency() ? `<div class="fieldset-title" style="margin-top:8px">L'agence</div>
      ${field('agencyName', "Nom de l'agence", input('agencyName', S.agencyName, 'autocomplete="organization" maxlength="60"'), "C'est ce nom qui sera affiché sur le profil de l'agence.")}` : ''}`;
}

function stepLogin() {
  const countries = COUNTRIES.map(([d, n]) => `<option value="${d}" ${S.dial === d ? 'selected' : ''}>${esc(n)} (${d})</option>`).join('');
  return `
    <h1>Comment voulez-vous vous connecter ?</h1>
    <p class="lead">Choisissez votre identifiant de connexion.</p>
    <div class="seg2" id="loginSeg" role="radiogroup" aria-label="Identifiant de connexion">
      <label><input type="radio" name="loginType" value="email" ${S.loginType === 'email' ? 'checked' : ''}><span>${icon('mail', 18)} Adresse e-mail</span></label>
      <label><input type="radio" name="loginType" value="phone" ${S.loginType === 'phone' ? 'checked' : ''}><span>${icon('phone', 18)} Téléphone</span></label>
    </div>
    <div id="emailBox" ${S.loginType === 'email' ? '' : 'hidden'}>${field('email', 'Adresse e-mail', input('email', S.email, 'type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="200"'), 'Recommandé : permet de réinitialiser votre mot de passe.')}</div>
    <div id="phoneBox" ${S.loginType === 'phone' ? '' : 'hidden'}>
      <div class="field"><label for="phone">Numéro de téléphone</label>
        <div class="phone-row"><select class="select" id="dial" aria-label="Pays">${countries}</select>${input('phone', S.phone, 'type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" placeholder="81 234 5678"')}</div>
        <p class="hint">Le numéro sert d'identifiant. Il n'est pas vérifié par SMS, et sans e-mail nous ne pouvons pas réinitialiser un mot de passe oublié : notez-le bien.</p></div>
    </div>
    <div class="field"><label for="password">Mot de passe</label>
      <div class="input-wrap"><input class="input" id="password" type="password" autocomplete="new-password" maxlength="128"><button class="eye" type="button" id="eye" aria-label="Afficher le mot de passe" data-icon="eye"></button></div>
      <div class="strength" id="strength" data-s="0"><i></i><i></i><i></i><i></i></div><p class="hint" id="strengthTxt">8 caractères minimum. Mélangez majuscules, minuscules, chiffres et symboles.</p></div>
    ${field('confirm', 'Confirmer le mot de passe', '<input class="input" id="confirm" type="password" autocomplete="new-password" maxlength="128">')}`;
}

function summaryRows() {
  const login = identifierToLogin(S.loginType === 'email' ? S.email : S.phone, S.dial);
  const rows = (a) => a.map(([l, v]) => `<div class="sum-row"><span>${esc(l)}</span><span>${esc(v)}</span></div>`).join('');
  const block = (title, step, body) => `<div class="sum-block"><div class="sum-head"><h3>${esc(title)}</h3><button type="button" data-go="${step}">Modifier</button></div>${body}</div>`;
  return `<div class="card summary">
    ${block('Type de compte', 1, rows([['Compte', isAgency() ? 'Agence' : 'Particulier']]))}
    ${block(isAgency() ? "Responsable de l'agence" : 'Identité', 2, rows([['Nom complet', fullNameOf(S)], ['Sexe', genderLabel(S.gender)], ['Date de naissance', `${new Date(S.birthDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} (${ageOf(S.birthDate)} ans)`]]))}
    ${isAgency() ? block("Agence", 2, rows([["Nom de l'agence (affiché sur le profil)", S.agencyName]])) : ''}
    ${block('Connexion', 3, rows([[S.loginType === 'email' ? 'Adresse e-mail' : 'Téléphone', login ? (login.type === 'phone' ? login.phone : login.email) : '—'], ['Mot de passe', '••••••••']]))}
  </div>`;
}
function stepSummary() {
  return `
    <h1>Vérifiez vos informations</h1>
    <p class="lead">Tout est correct ? Vous pourrez modifier la plupart de ces informations plus tard, dans Confidentialité.</p>
    ${summaryRows()}
    <div class="info-box">${icon('info', 18)}<span><strong>D'autres informations pourront vous être demandées ultérieurement</strong> en cas de besoin (par exemple pour vérifier votre identité ou ${isAgency() ? "les documents de l'agence" : 'votre profil'}).</span></div>
    <label class="check-row"><input type="checkbox" id="consent"><span>En m'inscrivant, j'accepte les <a href="policy.html#conditions" target="_blank" rel="noopener">conditions d'utilisation</a> et la <a href="policy.html#confidentialite" target="_blank" rel="noopener">politique de confidentialité</a> d'Imova.</span></label>
    <p class="error" id="consentErr" hidden>Vous devez accepter les politiques pour créer votre compte.</p>
    <div class="form-error" id="formError" role="alert" hidden></div>`;
}

const BUILD = [null, stepType, stepIdentity, stepLogin, stepSummary];

// ───────── Lecture et validation
function collect() {
  const v = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
  if (S.step === 2) {
    ['lastName', 'postName', 'firstName'].forEach((k) => { S[k] = properName(v(k) || ''); });
    const g = form.querySelector('input[name="gender"]:checked'); S.gender = g ? g.value : '';
    S.birthDate = v('birthDate') || '';
    if (isAgency()) S.agencyName = clean(v('agencyName') || '', 60);
  }
  if (S.step === 3) {
    S.loginType = form.querySelector('input[name="loginType"]:checked').value;
    S.email = clean(v('email') || '', 200).toLowerCase();
    S.dial = v('dial') || S.dial;
    S.phone = clean(v('phone') || '', 20);
    S.password = v('password') || '';
    S.confirm = v('confirm') || '';
  }
  saveDraft();
}

function validate() {
  const set = (id, msg) => { const el = document.getElementById(id); if (el) setFieldError(el, msg); return !msg; };
  let ok = true;
  if (S.step === 1) { const e = document.getElementById('typeErr'); e.hidden = !!S.type; ok = !!S.type; }
  if (S.step === 2) {
    ok = set('lastName', checkPersonName(S.lastName, 'Nom')) && ok;
    ok = set('postName', checkPersonName(S.postName, 'Post-nom')) && ok;
    ok = set('firstName', checkPersonName(S.firstName, 'Prénom')) && ok;
    ok = set('birthDate', checkBirthDate(S.birthDate)) && ok;
    if (!S.gender) { toast('Indiquez votre sexe.'); ok = false; }
    if (isAgency()) ok = set('agencyName', S.agencyName.length < 2 ? "Indiquez le nom de l'agence (2 caractères minimum)." : '') && ok;
  }
  if (S.step === 3) {
    if (S.loginType === 'email') { ok = set('email', checkEmail(S.email)) && ok; } else { ok = set('phone', checkPhone(S.phone, S.dial)) && ok; }
    const pe = checkPassword(S.password);
    ok = set('password', pe) && ok;
    ok = set('confirm', !pe && S.password !== S.confirm ? 'Les deux mots de passe ne sont pas identiques.' : '') && ok;
  }
  if (!ok) { const bad = form.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); }
  return ok;
}

// ───────── Affichage
function render() {
  form.innerHTML = `<section class="step active" data-step="${S.step}">${BUILD[S.step]()}
    <div class="wiz-actions">
      <button class="btn btn-primary btn-block" id="nextBtn" type="submit">${S.step === 4 ? `${icon('check', 18)} Créer mon compte` : 'Continuer'}</button>
      ${S.step > 1 ? '<button class="btn btn-ghost btn-block" id="prevBtn" type="button">Retour</button>' : ''}
    </div></section>`;
  document.getElementById('bar').style.width = `${S.step * 25}%`;
  document.getElementById('stepName').textContent = STEPS[S.step - 1];
  document.getElementById('stepCount').textContent = `Étape ${S.step} sur 4`;
  document.getElementById('backBtn').hidden = S.step === 1;
  document.getElementById('loginLine').hidden = S.step > 1;
  hydrateIcons(document.getElementById('wiz'));
  bindStep();
  const first = form.querySelector('input:not([type=radio]):not([type=checkbox]), .type-card');
  // le curseur va au 1er champ, sauf si la personne a déjà commencé à saisir ailleurs
  if (first && S.step !== 1) setTimeout(() => { const a = document.activeElement; if (!a || a === document.body || !form.contains(a)) first.focus({ preventScroll: true }); }, 60);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindStep() {
  if (S.step === 1) {
    form.querySelectorAll('[data-type]').forEach((c) => c.addEventListener('click', () => {
      S.type = c.dataset.type; saveDraft();
      form.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-checked', String(x === c)));
      document.getElementById('typeErr').hidden = true;
    }));
  }
  if (S.step === 2) {
    const bd = document.getElementById('birthDate');
    const hint = document.getElementById('ageHint');
    const upd = () => { const age = ageOf(bd.value); hint.className = 'age-hint' + (age !== null && age >= 18 ? ' ok' : ''); hint.textContent = bd.value ? (age === null ? '' : `${age} ans`) : ''; };
    bd.addEventListener('input', upd); upd();
    ['lastName', 'postName', 'firstName', 'agencyName'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('blur', () => { if (id !== 'agencyName') el.value = properName(el.value); }); });
  }
  if (S.step === 3) {
    form.querySelectorAll('input[name="loginType"]').forEach((r) => r.addEventListener('change', () => {
      document.getElementById('emailBox').hidden = r.value !== 'email' || !r.checked;
      document.getElementById('phoneBox').hidden = r.value !== 'phone' || !r.checked;
    }));
    const pw = document.getElementById('password');
    const st = document.getElementById('strength');
    const names = ['Trop court', 'Faible', 'Moyen', 'Bon', 'Excellent'];
    pw.addEventListener('input', () => { const s = pw.value ? passwordStrength(pw.value) : 0; st.dataset.s = String(s); document.getElementById('strengthTxt').textContent = pw.value ? `Force du mot de passe : ${names[s]}` : '8 caractères minimum. Mélangez majuscules, minuscules, chiffres et symboles.'; });
    document.getElementById('eye').addEventListener('click', (e) => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password'; document.getElementById('confirm').type = pw.type;
      e.currentTarget.innerHTML = ''; e.currentTarget.removeAttribute('data-icon-done'); e.currentTarget.dataset.icon = show ? 'eyeOff' : 'eye';
      e.currentTarget.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'); hydrateIcons(form);
    });
  }
  if (S.step === 4) {
    form.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
  }
  const prev = document.getElementById('prevBtn');
  if (prev) prev.addEventListener('click', () => go(S.step - 1));
}

function go(n) { if (S.busy) return; collect(); S.step = Math.max(1, Math.min(4, n)); saveDraft(); render(); }

// ───────── Création du compte
function overlay() {
  const wrap = document.createElement('div');
  wrap.className = 'creating';
  wrap.innerHTML = `<div class="creating-card" role="status" aria-live="polite"><div class="big-spin"></div><strong>Création de votre compte…</strong>
    <div class="creating-steps"><div data-s="1">${icon('check', 16)} Création de votre accès</div><div data-s="2">${icon('check', 16)} Enregistrement de votre profil</div><div data-s="3">${icon('check', 16)} Finalisation</div></div>
    <small class="muted">Ne fermez pas la page.</small></div>`;
  document.getElementById('overlay-root').appendChild(wrap);
  hydrateIcons(wrap);
  const mark = (n) => wrap.querySelectorAll('[data-s]').forEach((d) => { const i = Number(d.dataset.s); d.className = i < n ? 'done' : i === n ? 'now' : ''; });
  mark(1);
  return { mark, close: () => wrap.remove() };
}

async function submit() {
  if (S.busy) return;
  const consent = document.getElementById('consent').checked;
  document.getElementById('consentErr').hidden = consent;
  if (!consent) { document.getElementById('consent').focus(); return; }
  setFormError('');
  const login = identifierToLogin(S.loginType === 'email' ? S.email : S.phone, S.dial);
  if (!login) { go(3); return; }
  S.busy = true;
  const btn = document.getElementById('nextBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Création en cours…';
  const ov = overlay();
  try {
    const res = await createAccount({
      type: S.type, firstName: S.firstName, lastName: S.lastName, postName: S.postName, gender: S.gender, birthDate: S.birthDate,
      agencyName: isAgency() ? S.agencyName : '', login, password: S.password, onStep: (n) => ov.mark(n)
    });
    ov.mark(4);
    const summary = {
      type: S.type, name: res.name, firstName: S.firstName, lastName: S.lastName, postName: S.postName, gender: S.gender, birthDate: S.birthDate,
      agencyName: isAgency() ? S.agencyName : '', loginType: login.type, loginId: login.type === 'phone' ? login.phone : login.email, createdAt: Date.now()
    };
    try { sessionStorage.setItem('imova-welcome', JSON.stringify(summary)); sessionStorage.removeItem(DRAFT); } catch (e) { /* ignoré */ }
    const q = [add ? 'add=1' : '', next ? `next=${encodeURIComponent(next)}` : ''].filter(Boolean).join('&');
    location.replace('welcome.html' + (q ? '?' + q : ''));
  } catch (err) {
    console.error(err);
    ov.close();
    S.busy = false;
    btn.disabled = false;
    btn.innerHTML = `${icon('check', 18)} Créer mon compte`;
    if (err && err.code === 'auth/email-already-in-use') {
      S.step = 3; render();
      const el = document.getElementById(S.loginType === 'phone' ? 'phone' : 'email');
      if (el) setFieldError(el, S.loginType === 'phone' ? 'Un compte existe déjà avec ce numéro. Connectez-vous.' : 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous.');
      return;
    }
    setFormError(authMessage(err));
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (S.busy) return;
  collect();
  if (!validate()) return;
  if (S.step < 4) { S.step++; saveDraft(); render(); } else submit();
});
document.getElementById('backBtn').addEventListener('click', () => go(S.step - 1));
document.getElementById('loginLink').href = `login.html${add || next ? '?' + [add ? 'add=1' : '', next ? 'next=' + encodeURIComponent(next) : ''].filter(Boolean).join('&') : ''}`;
hydrateIcons();

(async () => {
  if (!isConfigured) { render(); setFormError("Firebase n'est pas encore configuré : ouvrez firebase-config.js."); return; }
  if (!add) { await whenReady(); if (getUser()) { location.replace(next || 'index.html'); return; } }
  if (S.step < 1 || (S.step > 1 && !S.type)) S.step = 1;
  render();
})();
