// Imova — register.js : page register.html
import { useSlot, isConfigured } from './firebase.js';
import { nextFreeSlot } from './accounts.js';
import { register, whenReady, getUser, authMessage } from './auth.js';
import { checkName, checkEmail, checkPassword, setFieldError, setFormError } from './validation.js';
import { hydrateIcons } from './icons.js';
import { param, clean } from './utils.js';

const add = param('add') === '1';
const next = (() => {
  const n = param('next') || '';
  return /^[a-z0-9-]+\.html(\?[^#\s]*)?$/i.test(n) ? n : 'index.html';
})();
if (add) useSlot(nextFreeSlot());

const form = document.getElementById('form');
const nameInput = document.getElementById('name');
const email = document.getElementById('email');
const password = document.getElementById('password');
const confirm = document.getElementById('confirm');
const submit = document.getElementById('submit');
document.getElementById('loginLink').href = `login.html?${add ? 'add=1&' : ''}next=${encodeURIComponent(next)}`;

const typeValue = () => form.querySelector('input[name="type"]:checked').value;

// Le libellé du nom change selon le type de compte
function updateLabel() {
  const agence = typeValue() === 'agence';
  document.getElementById('nameLabel').textContent = agence ? "Nom de l'agence" : 'Nom complet';
  nameInput.autocomplete = agence ? 'organization' : 'name';
}
form.querySelectorAll('input[name="type"]').forEach((r) => r.addEventListener('change', updateLabel));

document.getElementById('eye').addEventListener('click', (e) => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  confirm.type = password.type;
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
  const agence = typeValue() === 'agence';
  const errN = checkName(nameInput.value, agence ? "Le nom de l'agence" : 'Le nom');
  const errE = checkEmail(email.value);
  const errP = checkPassword(password.value);
  const errC = !errP && password.value !== confirm.value ? 'Les deux mots de passe ne sont pas identiques.' : '';
  setFieldError(nameInput, errN);
  setFieldError(email, errE);
  setFieldError(password, errP);
  setFieldError(confirm, errC);
  if (errN || errE || errP || errC) return;
  submit.disabled = true;
  submit.textContent = 'Création du compte...';
  try {
    await register({
      type: typeValue(),
      name: clean(nameInput.value, 60),
      email: clean(email.value, 200),
      password: password.value
    });
    location.replace(next);
  } catch (err) {
    console.error(err);
    setFormError(authMessage(err));
    submit.disabled = false;
    submit.textContent = 'Créer mon compte';
  }
});

updateLabel();
hydrateIcons();

if (isConfigured && !add) {
  whenReady().then(() => { if (getUser()) location.replace(next); });
}
