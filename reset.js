// Imova — reset.js : page reset.html (mot de passe oublié)
import { isConfigured } from './firebase.js';
import { resetPassword, authMessage } from './auth.js';
import { checkEmail, setFieldError, setFormError } from './validation.js';
import { clean } from './utils.js';

const form = document.getElementById('form');
const email = document.getElementById('email');
const submit = document.getElementById('submit');

if (!isConfigured) {
  setFormError("Firebase n'est pas encore configuré : ouvrez firebase-config.js.");
  submit.disabled = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setFormError('');
  const err = checkEmail(email.value);
  setFieldError(email, err);
  if (err) return;
  submit.disabled = true;
  submit.textContent = 'Envoi...';
  try {
    await resetPassword(clean(email.value, 200));
    // Message volontairement identique que le compte existe ou non (on ne révèle pas qui est inscrit)
    setFormError("Si un compte existe avec cette adresse, un e-mail vient d'être envoyé. Pensez à vérifier vos courriers indésirables.", 'success');
    submit.textContent = 'Lien envoyé';
  } catch (e2) {
    const code = (e2 && e2.code) || '';
    if (code === 'auth/user-not-found') {
      setFormError("Si un compte existe avec cette adresse, un e-mail vient d'être envoyé. Pensez à vérifier vos courriers indésirables.", 'success');
      submit.textContent = 'Lien envoyé';
    } else {
      setFormError(authMessage(e2));
      submit.disabled = false;
      submit.textContent = 'Envoyer le lien';
    }
  }
});
