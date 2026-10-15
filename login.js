// Imova — login.js : page login.html
// Paramètres possibles : ?next=page.html (où aller après), ?add=1 (ajouter un compte),
// ?slot=accN&email=... (reconnecter un compte enregistré dont la session a expiré)
import { useSlot, isConfigured } from './firebase.js';
import { nextFreeSlot } from './accounts.js';
import { login, whenReady, getUser, authMessage } from './auth.js';
import { checkEmail, checkPassword, setFieldError, setFormError } from './validation.js';
import { hydrateIcons } from './icons.js';
import { param, clean } from './utils.js';

const add = param('add') === '1';
const slotParam = param('slot');
const next = (() => {
  const n = param('next') || '';
  return /^[a-z0-9-]+\.html(\?[^#\s]*)?$/i.test(n) ? n : 'index.html';
})();

// Emplacement de session : nouveau compte → emplacement libre ; session expirée → son emplacement
if (add) useSlot(nextFreeSlot());
else if (slotParam && /^acc\d{1,2}$/.test(slotParam)) useSlot(slotParam);

const form = document.getElementById('form');
const email = document.getElementById('email');
const password = document.getElementById('password');
const submit = document.getElementById('submit');
const keep = `${add ? 'add=1&' : ''}next=${encodeURIComponent(next)}`;
document.getElementById('registerLink').href = `register.html?${keep}`;
if (param('email')) email.value = clean(param('email'), 200);
if (slotParam && param('email')) setFormError('Votre session a expiré. Saisissez votre mot de passe pour vous reconnecter.', 'info');
if (add) document.getElementById('subtitle').textContent = 'Ajoutez un autre compte sur cet appareil.';

document.getElementById('eye').addEventListener('click', (e) => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  e.currentTarget.innerHTML = '';
  e.currentTarget.removeAttribute('data-icon-done');
  e.currentTarget.dataset.icon = show ? 'eyeOff' : 'eye';
  e.currentTarget.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  hydrateIcons();
});

if (!isConfigured) {
  setFormError("Firebase n'est pas encore configuré : ouvrez firebase-config.js.");
  submit.disabled = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setFormError('');
  const errE = checkEmail(email.value);
  const errP = password.value ? '' : 'Saisissez votre mot de passe.';
  setFieldError(email, errE);
  setFieldError(password, errP);
  if (errE || errP) return;
  submit.disabled = true;
  submit.textContent = 'Connexion...';
  try {
    await login({ email: clean(email.value, 200), password: password.value });
    location.replace(next);
  } catch (err) {
    setFormError(authMessage(err));
    submit.disabled = false;
    submit.textContent = 'Se connecter';
  }
});

hydrateIcons();

// Déjà connecté sur cet emplacement : inutile de rester ici
if (isConfigured && !add) {
  whenReady().then(() => { if (getUser()) location.replace(next); });
}
