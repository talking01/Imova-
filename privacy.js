// Imova — privacy.js : page privacy.html (Confidentialité) : compte, visibilité, messagerie, notifications, appareil, données.
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import { getUserDoc } from './users.js';
import { getPrefs, savePrefs, savePublic } from './settings.js';
import { changePassword, changeEmail, nameChangeInfo, exportMyData, downloadJson, deleteMyAccount } from './account.js';
import { getPrivate, createPrivate, updatePrivate, toForm } from './personal.js';
import { GENDERS, COUNTRIES, normalizePhone, birthDateLimits, ageOf, properName, fullNameOf, genderLabel, dateToIso, emailToPhone, isPhoneEmail, publicNameOf } from './identity.js';
import { checkPersonName, checkBirthDate, checkEmail as checkMail } from './validation.js';
import { setPersonalization, resetInterests } from './interests.js';
import { forgetRecommendations } from './recommend.js';
import { getBlockedIds, unblockUser } from './messaging.js';
import { loadAuthors } from './properties.js';
import { listAccounts, removeAccount, getAccount } from './accounts.js';
import { activeSlot, signOutSlot, isConfigured } from './firebase.js';
import { logout, authMessage } from './auth.js';
import { supported, permission, requestPermission, registerSW, showBrowserNotification } from './notify.js';
import { SUPPORT_UID, supportReady } from './app-config.js';
import { openModal } from './modal.js';
import { pageHeader, bindBack, emptyState, skeletonCard, verifiedMark } from './components.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, clean, toast, explainError, getTheme, toggleTheme } from './utils.js';
import { isReady, notReadyMessage } from './pages.js';

const main = document.getElementById('main');
document.getElementById('pageHeader').innerHTML = pageHeader('Confidentialité');
bindBack();

let me, u, prefs, blocked = [], priv = null;
const fmt = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const sw = (attr, on, label) => `<button type="button" class="switch ${on ? 'on' : ''}" ${attr} role="switch" aria-checked="${on}" aria-label="${esc(label)}"></button>`;
const row = (title, sub, control, cls = '') => `<div class="set-row ${cls}"><span class="txt"><strong>${title}</strong>${sub ? `<small>${sub}</small>` : ''}</span>${control}</div>`;
const section = (id, title, body, cls = '') => `<section class="set-section" id="${id}"><h2>${esc(title)}</h2><div class="card set-card ${cls}">${body}</div></section>`;

function browserBlock() {
  const p = permission();
  if (!supported()) return row('Notifications du navigateur', "Votre navigateur ne les prend pas en charge. Sur iPhone, installez d'abord Imova sur l'écran d'accueil.", '', 'disabled');
  if (p === 'denied') return row('Notifications du navigateur', 'Elles sont bloquées dans les réglages de votre navigateur (cadenas de la barre d\'adresse → Notifications → Autoriser).', '<span class="status-line ko">Bloquées</span>');
  if (p === 'default' || !prefs.browser.enabled) return row('Notifications du navigateur', 'Soyez prévenu des nouveaux messages et de l\'activité, même quand Imova est en arrière-plan.', '<button class="btn btn-primary" data-act="enable-browser">Activer</button>');
  return `${row('Notifications du navigateur', 'Activées sur cet appareil.', sw('data-pref="browser.enabled"', true, 'Notifications du navigateur'))}
    <div class="set-sub">
      ${row('Nouveaux messages', '', sw('data-pref="browser.messages"', prefs.browser.messages, 'Messages dans le navigateur'))}
      ${row('Activité', 'Abonnés, J\'aime, avis, décisions de l\'équipe', sw('data-pref="browser.activity"', prefs.browser.activity, 'Activité dans le navigateur'))}
      ${row('Tester', '', '<button class="btn btn-ghost" data-act="test-browser">Envoyer un test</button>')}
    </div>`;
}

function personalBlock() {
  if (!priv) {
    return `<div class="set-row"><span class="txt"><strong>Informations à compléter</strong><small>Votre compte a été créé avant l'ajout de ces informations (nom complet, sexe, date de naissance, contact). Complétez-les : elles restent privées.</small></span><button class="btn btn-primary" data-act="personal">Compléter</button></div>`;
  }
  const agency = priv.accountType === 'agence';
  const age = ageOf(dateToIso(priv.birthDate));
  return `
    ${agency ? row("Nom de l'agence", esc(priv.agencyName || u.name || ''), '') : ''}
    ${row(agency ? "Responsable de l'agence" : 'Nom complet', esc(fullNameOf(priv)), '')}
    ${row('Sexe', esc(genderLabel(priv.gender)), '')}
    ${row('Date de naissance', `${esc(new Date(dateToIso(priv.birthDate) + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))}${age !== null ? ` (${age} ans)` : ''}`, '')}
    ${row('Téléphone', esc(priv.phone || '—'), '')}
    ${row('E-mail de contact', esc(priv.email || '—'), '')}
    <div class="set-row"><span class="txt"><small>Ces informations sont privées : seuls vous et l'équipe Imova les voient.</small></span><button class="btn btn-primary" data-act="personal">Modifier</button></div>`;
}

function render() {
  const nc = nameChangeInfo(u);
  const accounts = listAccounts();
  const active = activeSlot();
  const email = (getAccount(active) || {}).email || me.email || '';
  const loginLabel = isPhoneEmail(email) ? emailToPhone(email) : email;
  main.innerHTML = `
    ${section('personnel', 'Informations personnelles', personalBlock())}
    ${section('compte', 'Compte', `
      ${row('Nom affiché sur votre profil', esc(u.name || '') + (nc.allowed ? '' : nc.reason === 'verified' ? ' · profil vérifié : changement via le support' : ` · prochain changement possible le ${fmt(nc.next)}`), '')}
      ${row('Identifiant de connexion', esc(loginLabel), '')}
      ${isPhoneEmail(email) ? '' : row('Adresse e-mail de connexion', esc(email), '<button class="btn btn-ghost" data-act="email">Modifier</button>')}
      ${row('Mot de passe', 'Choisissez un mot de passe long et unique.', '<button class="btn btn-ghost" data-act="password">Modifier</button>')}`)}
    ${section('visibilite', 'Visibilité', `
      ${row('Afficher mon statut', "« en ligne » et « vu à 14:32 » dans les conversations.", sw('data-pub="showStatus"', u.showStatus !== false, 'Afficher mon statut'))}
      ${row('Apparaître dans la recherche', 'Sinon, votre profil n\'apparaît plus dans la recherche, les suggestions et l\'annuaire des agences (il reste accessible par son lien).', sw('data-pub="discoverable"', u.discoverable !== false, 'Apparaître dans la recherche'))}
      ${row('Qui peut me contacter', 'Pour démarrer une nouvelle conversation.', `<select class="select" data-pub-select="messagesFrom" aria-label="Qui peut me contacter"><option value="everyone" ${u.messagesFrom !== 'following' ? 'selected' : ''}>Tout le monde</option><option value="following" ${u.messagesFrom === 'following' ? 'selected' : ''}>Les personnes que je suis</option></select>`)}`)}
    ${section('messagerie', 'Messagerie', `
      ${row('Accusés de lecture', 'Les coches bleues. Si vous les désactivez, vous ne voyez plus non plus celles des autres.', sw('data-pref="readReceipts"', prefs.readReceipts, 'Accusés de lecture'))}
      ${row('Indicateur « écrit… »', '', sw('data-pref="typingIndicator"', prefs.typingIndicator, 'Indicateur écrit'))}
      <div class="set-row"><span class="txt"><strong>Contacts bloqués</strong><small>${blocked.length ? `${blocked.length} contact${blocked.length > 1 ? 's' : ''}` : 'Aucun'}</small></span></div>
      ${blocked.map((b) => `<div class="set-row" data-uid="${esc(b.id)}"><span class="txt"><strong>${esc(b.name)}</strong></span><button class="btn btn-ghost" data-act="unblock">Débloquer</button></div>`).join('')}`)}
    ${section('notifications', 'Notifications', `
      ${row('Nouveaux messages', 'Pastille et notifications.', sw('data-pref="notif.messages"', prefs.notif.messages, 'Messages'))}
      ${row('Nouveaux abonnés', '', sw('data-pref="notif.follows"', prefs.notif.follows, 'Abonnés'))}
      ${row("J'aime sur mes annonces", '', sw('data-pref="notif.likes"', prefs.notif.likes, "J'aime"))}
      ${row('Avis reçus', '', sw('data-pref="notif.reviews"', prefs.notif.reviews, 'Avis'))}
      ${row('Annonces des profils suivis', '', sw('data-pref="notif.followedPosts"', prefs.notif.followedPosts, 'Annonces des profils suivis'))}
      <p class="muted" style="font-size:.82rem;padding:10px 0">Les décisions de l'équipe (badge, modération) s'affichent toujours.</p>
      ${browserBlock()}`)}
    ${section('recommandations', 'Recommandations', `
      ${row('Personnaliser mes recommandations', "Imova retient ce que vous aimez, suivez et recherchez pour vous proposer des annonces et des profils adaptés. Ces données sont privées.", sw('data-pref="personalization"', prefs.personalization !== false, 'Personnalisation'))}
      ${row('Mes préférences', 'Types de biens, quartiers, mots-clés, et ce qu\'Imova a retenu.', '<a class="btn btn-ghost" href="preferences.html">Ouvrir</a>')}
      ${row('Effacer mes données de recommandation', 'Supprime le profil d\'intérêts et les recommandations enregistrés.', '<button class="btn btn-ghost" data-act="erase-reco" style="color:var(--danger)">Effacer</button>')}`)}
    ${section('appareil', 'Cet appareil', `
      ${row('Mode sombre', '', sw('data-act="theme"', getTheme() === 'dark', 'Mode sombre'))}
      ${accounts.map((a) => `<div class="set-row" data-slot="${esc(a.slot)}"><span class="txt"><strong>${esc(a.name || a.email || 'Compte')}${verifiedMark(a.verified, 14)}</strong><small>${esc(a.loginLabel || a.email || '')}${a.slot === active ? ' · compte actif' : ''}</small></span>${a.slot === active ? '<button class="btn btn-ghost" data-act="logout">Se déconnecter</button>' : '<button class="btn btn-ghost" data-act="forget">Oublier</button>'}</div>`).join('')}
      ${row('Effacer mes recommandations', 'Oublier ce qui m\'intéresse (stocké sur cet appareil).', '<button class="btn btn-ghost" data-act="reset-reco">Effacer</button>')}
      ${row('Effacer l\'historique de recherche', '', '<button class="btn btn-ghost" data-act="reset-search">Effacer</button>')}
      ${row('Effacer les brouillons de messages', '', '<button class="btn btn-ghost" data-act="reset-drafts">Effacer</button>')}`)}
    ${section('donnees', 'Mes données', `
      ${row('Télécharger mes données', 'Profil, annonces, favoris, abonnements, avis et réglages, dans un fichier.', '<button class="btn btn-ghost" data-act="export">Télécharger</button>')}
      ${row('Politique de confidentialité', 'Comment Imova traite vos informations.', '<a class="btn btn-ghost" href="policy.html" id="policyLink">Lire</a>')}`)}
    ${section('danger', 'Zone sensible', row('Supprimer mon compte', 'Supprime votre profil, vos annonces, favoris, abonnements et avis laissés. Irréversible.', '<button class="btn btn-ghost" data-act="delete" style="color:var(--danger)">Supprimer</button>'), 'danger-zone')}`;
  hydrateIcons(main);
  const pl = document.getElementById('policyLink');
  if (pl && !isReady('policy.html')) pl.addEventListener('click', (e) => { e.preventDefault(); notReadyMessage(); });
}

// ───── enregistrement immédiat des réglages
const setPath = (o, path, v) => { const [a, b] = path.split('.'); if (b) o[a][b] = v; else o[a] = v; };
async function savePref(path, val) {
  const before = JSON.parse(JSON.stringify(prefs));
  setPath(prefs, path, val);
  try { prefs = await savePrefs(me.uid, prefs); if (path === 'personalization') setPersonalization(prefs.personalization !== false); toast('Réglage enregistré'); } catch (e) { console.error(e); prefs = before; toast(explainError(e)); }
  render();
}
async function savePub(field, val) {
  const before = u[field];
  u[field] = val;
  try { await savePublic(me.uid, { [field]: val }); toast('Réglage enregistré'); } catch (e) { console.error(e); u[field] = before; toast(explainError(e)); }
  render();
}

// ───── fenêtres
const err = (el, msg) => { const e = el.querySelector('#fErr'); e.textContent = msg; e.hidden = false; return false; };
const errHtml = '<p class="error" id="fErr" hidden></p>';
const field = (id, label, type = 'text', extra = '') => `<div class="field" style="margin-bottom:12px"><label for="${id}">${label}</label><input class="input" id="${id}" type="${type}" ${extra}></div>`;

function modalPersonal() {
  const create = !priv;
  const agency = u.type === 'agence';
  const f = create ? { firstName: '', lastName: '', postName: '', gender: '', birthDate: '', phone: '', email: '', agencyName: u.name || '' } : toForm(priv);
  if (create && !agency) { const parts = String(u.name || '').split(/\s+/); f.firstName = parts[0] || ''; f.lastName = parts.slice(1).join(' '); }
  const locked = u.verified === true;
  const nc = nameChangeInfo(u);
  const nameLocked = !create && !nc.allowed;
  const { min, max } = birthDateLimits();
  const dis = (b) => (b ? 'disabled' : '');
  const g = GENDERS.map(([v, l]) => `<label><input type="radio" name="pgender" value="${v}" ${f.gender === v ? 'checked' : ''}><span>${l}</span></label>`).join('');
  const countries = COUNTRIES.map(([d, n]) => `<option value="${d}">${esc(n)} (${d})</option>`).join('');
  openModal({
    title: create ? 'Compléter mes informations' : 'Modifier mes informations',
    html: `${locked ? '<p class="muted" style="margin-bottom:10px">Votre profil est vérifié : le nom ne peut être modifié que par le support.</p>' : nameLocked ? `<p class="muted" style="margin-bottom:10px">Le nom affiché ne peut être modifié qu'une fois tous les 30 jours (prochain changement : ${esc(nc.next ? fmt(nc.next) : '')}).</p>` : ''}
      ${agency ? field('pAgency', "Nom de l'agence (affiché sur le profil)", 'text', `maxlength="60" value="${esc(f.agencyName)}" ${dis(locked || nameLocked)}`) : ''}
      <div class="form-grid two" style="margin-bottom:12px">${field('pLast', 'Nom', 'text', `maxlength="60" value="${esc(f.lastName)}" ${dis(locked || (!agency && nameLocked))}`)}${field('pPost', 'Post-nom', 'text', `maxlength="60" value="${esc(f.postName)}" ${dis(locked)}`)}</div>
      ${field('pFirst', 'Prénom', 'text', `maxlength="60" value="${esc(f.firstName)}" ${dis(locked || (!agency && nameLocked))}`)}
      <div class="field" style="margin-bottom:12px"><label>Sexe</label><div class="seg2">${g}</div></div>
      ${field('pBirth', 'Date de naissance', 'date', `min="${min}" max="${max}" value="${esc(f.birthDate)}"`)}
      <div class="field" style="margin-bottom:12px"><label for="pPhone">Téléphone</label><div class="phone-row"><select class="select" id="pDial" aria-label="Pays">${countries}</select><input class="input" id="pPhone" type="tel" inputmode="tel" maxlength="20" value="${esc(f.phone)}"></div></div>
      ${field('pMail', 'E-mail de contact', 'email', `maxlength="200" value="${esc(f.email)}" autocapitalize="none"`)}
      ${create ? '<label class="check-row" style="margin-bottom:10px"><input type="checkbox" id="pConsent"><span>J\'accepte les <a href="policy.html#conditions" target="_blank" rel="noopener">conditions d\'utilisation</a> et la <a href="policy.html#confidentialite" target="_blank" rel="noopener">politique de confidentialité</a>.</span></label>' : ''}
      ${errHtml}`,
    actions: [{ label: 'Annuler' }, { label: 'Enregistrer', primary: true, onClick: async (el) => {
      const val = (id) => el.querySelector('#' + id).value;
      const d = { lastName: properName(val('pLast')), postName: properName(val('pPost')), firstName: properName(val('pFirst')), gender: (el.querySelector('input[name=pgender]:checked') || {}).value || '', birthDate: val('pBirth'), email: clean(val('pMail'), 200).toLowerCase(), phone: '', agencyName: agency ? clean(val('pAgency'), 60) : '' };
      const phoneRaw = val('pPhone').trim();
      if (phoneRaw) { d.phone = normalizePhone(phoneRaw, val('pDial')); if (!d.phone) return err(el, 'Numéro de téléphone invalide.'); }
      const bad = checkPersonName(d.lastName, 'Nom') || checkPersonName(d.postName, 'Post-nom') || checkPersonName(d.firstName, 'Prénom') || checkBirthDate(d.birthDate) || (!d.gender ? 'Indiquez votre sexe.' : '') || (d.email ? checkMail(d.email) : '') || (agency && d.agencyName.length < 2 ? "Indiquez le nom de l'agence." : '') || (!d.phone && !d.email ? 'Indiquez au moins un téléphone ou un e-mail de contact.' : '');
      if (bad) return err(el, bad);
      if (create && !el.querySelector('#pConsent').checked) return err(el, 'Acceptez les politiques pour continuer.');
      try {
        if (create) { await createPrivate(me.uid, u, d, loginLabel0()); } else { await updatePrivate(me.uid, priv, u, d); }
        priv = await getPrivate(me.uid); u = await getUserDoc(me.uid);
        toast('Informations enregistrées'); render();
      } catch (e) { console.error(e); return err(el, e.code === 'permission-denied' ? "Enregistrement refusé : profil vérifié (nom verrouillé), changement de nom trop récent, ou règles Firestore pas à jour." : explainError(e)); }
    } }]
  });
}
const loginLabel0 = () => { const e = (getAccount(activeSlot()) || {}).email || me.email || ''; return e; };

function modalPassword() {
  openModal({
    title: 'Changer le mot de passe',
    html: `${field('pCur', 'Mot de passe actuel', 'password', 'autocomplete="current-password"')}${field('pNew', 'Nouveau mot de passe (8 caractères minimum)', 'password', 'autocomplete="new-password"')}${field('pNew2', 'Confirmer le nouveau mot de passe', 'password', 'autocomplete="new-password"')}${errHtml}`,
    actions: [{ label: 'Annuler' }, { label: 'Modifier', primary: true, onClick: async (el) => {
      const cur = el.querySelector('#pCur').value, n1 = el.querySelector('#pNew').value, n2 = el.querySelector('#pNew2').value;
      if (!cur) return err(el, 'Saisissez votre mot de passe actuel.');
      if (n1.length < 8) return err(el, 'Le nouveau mot de passe doit contenir au moins 8 caractères.');
      if (n1 !== n2) return err(el, 'Les deux mots de passe ne sont pas identiques.');
      if (n1 === cur) return err(el, "Choisissez un mot de passe différent de l'ancien.");
      try { await changePassword(cur, n1); toast('Mot de passe modifié'); } catch (e) { console.error(e); return err(el, authMessage(e)); }
    } }]
  });
}
function modalEmail() {
  openModal({
    title: "Changer l'adresse e-mail",
    html: `<p class="muted" style="margin-bottom:10px">Un lien de confirmation sera envoyé à la nouvelle adresse ; l'adresse ne change qu'après avoir cliqué dessus.</p>${field('eNew', 'Nouvelle adresse e-mail', 'email', 'autocomplete="email" inputmode="email"')}${field('eCur', 'Mot de passe actuel', 'password', 'autocomplete="current-password"')}${errHtml}`,
    actions: [{ label: 'Annuler' }, { label: 'Envoyer le lien', primary: true, onClick: async (el) => {
      const mail = clean(el.querySelector('#eNew').value, 200), pw = el.querySelector('#eCur').value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return err(el, "Cette adresse e-mail n'est pas valide.");
      if (!pw) return err(el, 'Saisissez votre mot de passe actuel.');
      try { await changeEmail(pw, mail); toast('Lien envoyé à la nouvelle adresse'); } catch (e) { console.error(e); return err(el, authMessage(e)); }
    } }]
  });
}
function modalDelete() {
  openModal({
    title: 'Supprimer mon compte',
    html: `<p class="muted">Cette action est <strong>définitive</strong>. Seront supprimés : votre profil, vos annonces, vos favoris, vos abonnements et les avis que vous avez laissés. Les messages déjà reçus par vos interlocuteurs et les avis reçus restent visibles sous le nom « Utilisateur ».</p>
      <p class="muted" style="margin:10px 0">Conseil : téléchargez d'abord vos données.</p>${field('dTxt', 'Tapez SUPPRIMER pour confirmer', 'text', 'autocomplete="off" autocapitalize="characters"')}${field('dPw', 'Mot de passe', 'password', 'autocomplete="current-password"')}${errHtml}`,
    actions: [{ label: 'Annuler' }, { label: 'Supprimer définitivement', danger: true, onClick: async (el) => {
      if (el.querySelector('#dTxt').value.trim().toUpperCase() !== 'SUPPRIMER') return err(el, 'Tapez le mot SUPPRIMER pour confirmer.');
      const pw = el.querySelector('#dPw').value;
      if (!pw) return err(el, 'Saisissez votre mot de passe.');
      try { await deleteMyAccount(me.uid, pw); sessionStorage.setItem('imova-flash', 'Votre compte a été supprimé.'); location.href = 'index.html'; } catch (e) { console.error(e); return err(el, e.code && e.code.startsWith('auth/') ? authMessage(e) : explainError(e)); }
    } }]
  });
}

main.addEventListener('click', async (e) => {
  const s = e.target.closest('[data-pref],[data-pub]');
  if (s) {
    const on = !s.classList.contains('on');
    if (s.dataset.pref) savePref(s.dataset.pref, on); else savePub(s.dataset.pub, on);
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  switch (b.dataset.act) {
    case 'personal': modalPersonal(); break;
    case 'erase-reco': openModal({ title: 'Effacer mes données de recommandation ?', html: '<p class="muted">Le profil d\'intérêts et les recommandations enregistrés seront supprimés. Imova recommencera à apprendre à partir de vos prochaines actions.</p>', actions: [{ label: 'Annuler' }, { label: 'Effacer', danger: true, onClick: async () => { try { await resetInterests(me.uid); forgetRecommendations(); toast('Données de recommandation effacées'); } catch (x) { toast(explainError(x)); return false; } } }] }); break;
    case 'password': modalPassword(); break;
    case 'email': modalEmail(); break;
    case 'delete': modalDelete(); break;
    case 'theme': toggleTheme(); render(); break;
    case 'enable-browser': {
      const r = await requestPermission();
      if (r === 'granted') { prefs.browser.enabled = true; await registerSW(); try { prefs = await savePrefs(me.uid, prefs); } catch (x) { /* ignoré */ } showBrowserNotification({ title: 'Notifications activées', body: "Vous serez prévenu des nouveaux messages et de l'activité.", tag: 'imova-test', url: 'notifications.html' }); toast('Notifications du navigateur activées'); }
      else if (r === 'denied') toast('Notifications refusées : modifiez-les dans les réglages du navigateur.');
      render();
      break;
    }
    case 'test-browser': {
      const ok = await showBrowserNotification({ title: 'Imova', body: 'Ceci est une notification de test.', tag: 'imova-test', url: 'notifications.html' });
      toast(ok ? 'Notification envoyée (mettez Imova en arrière-plan pour la voir)' : "Impossible d'afficher la notification.");
      break;
    }
    case 'unblock': {
      const id = b.closest('[data-uid]').dataset.uid;
      try { await unblockUser(me.uid, id); blocked = blocked.filter((x) => x.id !== id); toast('Contact débloqué'); render(); } catch (x) { toast(explainError(x)); }
      break;
    }
    case 'logout': openModal({ title: 'Se déconnecter ?', html: '<p class="muted">Ce compte sera retiré de cet appareil.</p>', actions: [{ label: 'Annuler' }, { label: 'Se déconnecter', primary: true, onClick: async () => { await logout(); location.href = 'index.html'; } }] }); break;
    case 'forget': {
      const slot = b.closest('[data-slot]').dataset.slot;
      try { await signOutSlot(slot); } catch (x) { /* la session sera ignorée de toute façon */ }
      removeAccount(slot); toast('Compte retiré de cet appareil'); render();
      break;
    }
    case 'reset-reco': resetInterests(); toast('Recommandations réinitialisées'); break;
    case 'reset-search': localStorage.removeItem('imova-recent-searches'); toast('Historique effacé'); break;
    case 'reset-drafts': Object.keys(localStorage).filter((k) => k.startsWith('imova-draft-')).forEach((k) => localStorage.removeItem(k)); toast('Brouillons effacés'); break;
    case 'export':
      b.disabled = true;
      try { downloadJson(await exportMyData(me.uid), `imova-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`); toast('Fichier téléchargé'); } catch (x) { console.error(x); toast(explainError(x)); }
      b.disabled = false;
      break;
  }
});
main.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-pub-select]');
  if (sel) savePub(sel.dataset.pubSelect, sel.value);
});

(async () => {
  if (!isConfigured) { main.innerHTML = emptyState({ iconName: 'lock', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js.' }); hydrateIcons(); return; }
  main.innerHTML = skeletonCard();
  me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  try {
    [u, prefs] = await Promise.all([getUserDoc(me.uid), getPrefs(me.uid, { force: true })]);
    try { priv = await getPrivate(me.uid); } catch (e) { priv = null; }
    const ids = [...(await getBlockedIds(me.uid, { force: true }))];
    const a = ids.length ? await loadAuthors(ids) : new Map();
    blocked = ids.map((id) => ({ id, name: (a.get(id) || {}).name || 'Utilisateur' }));
  } catch (e) { console.error(e); main.innerHTML = emptyState({ iconName: 'lock', title: 'Chargement impossible', text: explainError(e) }); hydrateIcons(); return; }
  if (!u) { main.innerHTML = emptyState({ iconName: 'user', title: 'Profil introuvable' }); hydrateIcons(); return; }
  render();
  if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
})();
