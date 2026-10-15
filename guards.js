// Imova — guards.js : protège les actions et les pages qui demandent un compte.
import { getUser, isSettled, whenReady, expiredAccount } from './auth.js';
import { openModal } from './modal.js';
import { toast, esc } from './utils.js';

// Démarre la restauration de la session dès que la page se charge
whenReady();

export const currentUser = () => getUser();

function currentPage() {
  return (location.pathname.split('/').pop() || 'index.html') + location.search;
}

export function loginUrl() {
  const exp = expiredAccount();
  let url = 'login.html?next=' + encodeURIComponent(currentPage());
  if (exp) url += `&slot=${encodeURIComponent(exp.slot)}&email=${encodeURIComponent(exp.email || '')}`;
  return url;
}

// Pour une action (J'aime, Discuter...) : renvoie true si connecté, sinon invite à se connecter
export function requireAuth(action = 'effectuer cette action') {
  if (!isSettled()) { toast('Vérification de la connexion...'); return false; }
  if (getUser()) return true;
  openModal({
    title: 'Connexion requise',
    html: `<p class="muted">Connectez-vous pour ${esc(action)}.</p>`,
    actions: [
      { label: 'Plus tard' },
      { label: 'Se connecter', primary: true, onClick: () => { location.href = loginUrl(); } }
    ]
  });
  return false;
}

// Pour une page entière : attend la session, sinon renvoie vers la connexion
export async function requireLoginPage() {
  const u = await whenReady();
  if (!u) { location.replace(loginUrl()); return null; }
  return u;
}
