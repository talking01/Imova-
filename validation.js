// Imova — validation.js : vérification des saisies et affichage des erreurs dans les formulaires
import { clean } from './utils.js';

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export function checkName(raw, label = 'Le nom') {
  const v = clean(raw, 60);
  if (v.length < 2) return `${label} doit contenir au moins 2 caractères.`;
  if (v.length > 60) return `${label} ne doit pas dépasser 60 caractères.`;
  return '';
}

export function checkEmail(raw) {
  const v = clean(raw, 200);
  if (!v) return "Saisissez votre adresse e-mail.";
  if (!isEmail(v)) return "Cette adresse e-mail n'est pas valide.";
  return '';
}

export function checkPassword(v) {
  if (!v) return 'Saisissez un mot de passe.';
  if (v.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (v.length > 128) return 'Le mot de passe est trop long.';
  return '';
}

// Affiche (ou efface) le message d'erreur sous un champ
export function setFieldError(input, message) {
  const field = input.closest('.field');
  let el = field.querySelector('.error');
  if (!message) {
    if (el) el.remove();
    input.removeAttribute('aria-invalid');
    return;
  }
  if (!el) {
    el = document.createElement('p');
    el.className = 'error';
    el.setAttribute('role', 'alert');
    field.appendChild(el);
  }
  el.textContent = message;
  input.setAttribute('aria-invalid', 'true');
}

// Message général du formulaire (erreur de connexion, de réseau...)
export function setFormError(message, type = 'error') {
  const el = document.getElementById('formError');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.dataset.type = type;
}
