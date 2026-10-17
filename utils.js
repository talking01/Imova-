// Imova — utils.js : petits outils partagés (texte sûr, dates, thème, messages)

// Protection XSS : tout texte venant d'un utilisateur passe par esc() avant d'entrer dans du HTML.
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAP[c]);

// Nettoie un texte saisi (caractères de contrôle, espaces autour, longueur maximale)
export const clean = (v, max = 5000) =>
  String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

// Lit un paramètre d'adresse : param('id') pour profile.html?id=abc
export const param = (name) => new URLSearchParams(location.search).get(name);

export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

export function timeAgo(v) {
  const d = toDate(v);
  if (!d) return '';
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + ' k';
  return String(n);
}

// Thème clair / sombre
export const getTheme = () => document.documentElement.getAttribute('data-theme') || 'light';
export function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('imova-theme', t); } catch (e) { /* stockage indisponible */ }
}
export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

// Petite bulle d'information en bas de l'écran
export function toast(message, ms = 2800) {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = 'toast glass';
  el.setAttribute('role', 'status');
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

// Zone où s'affichent les fenêtres (créée automatiquement si la page n'en a pas)
export function overlayRoot() {
  let root = document.getElementById('overlay-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }
  return root;
}

// Explique une erreur Firebase en français, pour afficher une bulle claire
export function explainError(e) {
  const code = (e && e.code) || '';
  if (code === 'permission-denied') return "Permission refusée : publiez les règles Firestore de cette étape (firestore.rules).";
  if (code === 'unavailable' || code === 'auth/network-request-failed') return 'Pas de connexion Internet.';
  if (code === 'failed-precondition') return "Un index Firestore est nécessaire (voir GUIDE-FIREBASE.md, étape « Index »).";
  return 'Action impossible pour le moment. Réessayez dans un instant.';
}

// Message à afficher sur la page suivante (ex. « Annonce publiée » après être revenu sur le profil)
export function flash(message) {
  try { sessionStorage.setItem('imova-flash', message); } catch (e) { /* ignoré */ }
}
export function showFlash() {
  try {
    const m = sessionStorage.getItem('imova-flash');
    if (m) { sessionStorage.removeItem('imova-flash'); toast(m); }
  } catch (e) { /* ignoré */ }
}

// ───────── Dates et heures pour la messagerie
const pad = (n) => String(n).padStart(2, '0');
export const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Séparateur de jour dans une conversation : Aujourd'hui, Hier, ou « lundi 12 octobre »
export function dayLabel(date) {
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString('fr-FR', opts);
}

// Heure dans la liste des conversations : 14:32, Hier, lun., 12/10/2026
export function listTime(date) {
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diff === 0) return clock(date);
  if (diff === 1) return 'Hier';
  if (diff < 7) return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// « vu aujourd'hui à 14:32 », « vu hier à 09:10 », « vu le 12 octobre »
export function lastSeenLabel(date) {
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diff === 0) return `vu aujourd'hui à ${clock(date)}`;
  if (diff === 1) return `vu hier à ${clock(date)}`;
  return `vu le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

// Secondes → « 1:05 »
export const mmss = (s) => `${Math.floor(s / 60)}:${pad(Math.round(s % 60))}`;
