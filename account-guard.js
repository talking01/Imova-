// Imova — account-guard.js : applique l'état du compte à chaque page.
//   suspendu ou supprimé → la personne est envoyée vers la page d'examen (examination.html) tant que l'examen n'est pas terminé ;
//   restreint → bandeau en haut de page avec la date de fin.
import { firestore } from './firebase.js';
import { statusOf, setCurrent, fmtWhen } from './account-status.js';

const EXEMPT = ['examination.html', 'login.html', 'register.html', 'welcome.html', 'policy.html', 'reset.html', '404.html'];
const page = () => location.pathname.split('/').pop() || 'index.html';
const ms = (t) => (t && t.toDate ? t.toDate().getTime() : t ? new Date(t).getTime() : 0);

export async function readStatus(uid) {
  const key = 'imova-acc-' + uid;
  try { const c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c && Date.now() - c.t < 45 * 1000) return c.u; } catch (e) { /* ignoré */ }
  const fs = await firestore();
  if (!fs) return null;
  let u = null;
  try {
    const s = await fs.m.getDoc(fs.m.doc(fs.db, 'users', uid));
    if (s.exists()) { const d = s.data(); u = { status: d.status || '', suspended: d.suspended === true, suspendedReason: d.suspendedReason || '', restrictedUntil: ms(d.restrictedUntil), statusReason: d.statusReason || '', statusAt: ms(d.statusAt) }; }
  } catch (e) { return null; }
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), u })); } catch (e) { /* ignoré */ }
  return u;
}

export function forgetStatus(uid) { try { sessionStorage.removeItem('imova-acc-' + uid); } catch (e) { /* ignoré */ } }

function banner(st) {
  if (document.getElementById('restrictBanner')) return;
  const d = document.createElement('div');
  d.id = 'restrictBanner'; d.setAttribute('role', 'status');
  d.style.cssText = 'background:#7a5a14;color:#fff;padding:9px 14px;font:600 .82rem/1.4 system-ui,sans-serif;display:flex;gap:10px;align-items:center;justify-content:space-between;position:relative;z-index:70';
  d.innerHTML = `<span>Compte temporairement restreint jusqu'au ${fmtWhen(st.until)} : vous ne pouvez pas publier, noter, aimer ni ouvrir de nouvelle discussion.</span><a href="examination.html" style="color:#ffd27a;white-space:nowrap">Détails</a>`;
  const add = () => document.body.insertBefore(d, document.body.firstChild);
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
}

export async function guardAccount(user) {
  if (!user) return null;
  const u = await readStatus(user.uid);
  const st = statusOf(u);
  setCurrent(st);
  if ((st.state === 'suspended' || st.state === 'deleted') && !EXEMPT.includes(page())) { location.replace('examination.html'); return st; }
  if (st.state === 'restricted') banner(st);
  return st;
}
