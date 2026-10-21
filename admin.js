// Imova — admin.js : base commune des pages d'administration (accès, menu, journal d'activité, outils).
// Les droits sont vérifiés PAR LES RÈGLES FIRESTORE : ce fichier ne fait que masquer ce qu'on n'a pas le droit de faire.
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import { firestore, isConfigured } from './firebase.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, explainError } from './utils.js';
import { openModal } from './modal.js';
import { loadAuthors } from './properties.js';

export const RANK = { moderator: 1, admin: 2, owner: 3 };
export const ROLE_LABEL = { owner: 'Propriétaire', admin: 'Administrateur', moderator: 'Modérateur' };

// [fichier, titre, icône, rang minimal]
const NAV = [
  ['admin.html', 'Tableau de bord', 'chart', 1],
  ['admin-reports.html', 'Signalements', 'flag', 1],
  ['admin-verifications.html', 'Vérifications', 'badge', 2],
  ['admin-moderation.html', 'Modération', 'shield', 1],
  ['admin-properties.html', 'Annonces', 'building', 1],
  ['admin-users.html', 'Utilisateurs', 'users', 2],
  ['admin-agencies.html', 'Agences', 'home', 2],
  ['admin-stats.html', 'Statistiques', 'trending', 2],
  ['admin-settings.html', 'Paramètres', 'settings2', 3]
];

const $main = () => document.getElementById('main');

function denied(title, text) {
  document.getElementById('adminHead').innerHTML = '';
  $main().innerHTML = `<div class="empty"><div class="empty-ic">${icon('lock', 30)}</div><h2>${esc(title)}</h2><p>${esc(text)}</p><a class="btn btn-primary" href="index.html">Retour à l'application</a></div>`;
  hydrateIcons();
}

// Ouvre la page : vérifie la connexion et le rôle, dessine l'en-tête. Retourne { me, role, rank, m, db } ou null.
export async function initAdmin({ minRank = 1, active = '' } = {}) {
  if (!isConfigured) { denied('Firebase non configuré', 'Remplissez firebase-config.js.'); return null; }
  const me = await whenReady();
  if (!me) { location.replace(loginUrl()); return null; }
  const fs = await firestore();
  let role = '';
  try {
    const s = await fs.m.getDoc(fs.m.doc(fs.db, 'admins', me.uid));
    role = s.exists() ? s.data().role : '';
  } catch (e) { role = ''; }
  const rank = RANK[role] || 0;
  if (!rank) { denied('Accès réservé', "Cette page est réservée à l'équipe d'administration d'Imova."); return null; }
  if (rank < minRank) { denied('Droits insuffisants', `Votre rôle (${ROLE_LABEL[role]}) ne permet pas d'ouvrir cette page.`); return null; }
  const items = NAV.filter((n) => n[3] <= rank);
  document.getElementById('adminHead').innerHTML = `
    <header class="adm-head glass">
      <div class="adm-top">
        <a class="adm-brand" href="admin.html"><img src="logo.svg" width="28" height="28" alt=""><span>Imova Admin</span></a>
        <span class="adm-role">${esc(ROLE_LABEL[role])}</span>
        <span class="grow"></span>
        <a class="btn btn-ghost btn-sm" href="index.html">${icon('home', 16)} Application</a>
      </div>
      <nav class="adm-nav" aria-label="Administration">${items.map((n) => `<a href="${n[0]}" ${n[0] === active ? 'aria-current="page"' : ''}>${icon(n[2], 16)}<span>${esc(n[1])}</span><span class="count" data-count="${n[0]}" hidden></span></a>`).join('')}</nav>
    </header>`;
  hydrateIcons(document.getElementById('adminHead'));
  paintCounts(fs, rank);
  return { me, role, rank, m: fs.m, db: fs.db };
}

// Pastilles : signalements ouverts, vérifications en attente
async function paintCounts(fs, rank) {
  const { m, db } = fs;
  const set = (file, n) => { const el = document.querySelector(`[data-count="${file}"]`); if (el && n > 0) { el.hidden = false; el.textContent = n > 99 ? '99+' : String(n); } };
  try { set('admin-reports.html', (await m.getCountFromServer(m.query(m.collection(db, 'reports'), m.where('status', '==', 'open')))).data().count); } catch (e) { /* ignoré */ }
  if (rank >= 2) { try { set('admin-verifications.html', (await m.getCountFromServer(m.query(m.collection(db, 'verificationRequests'), m.where('status', '==', 'pending')))).data().count); } catch (e) { /* ignoré */ } }
}

// Journal d'activité : chaque action de l'équipe est enregistrée
export async function audit(ctx, action, targetType, targetId, details = '') {
  try {
    await ctx.m.setDoc(ctx.m.doc(ctx.m.collection(ctx.db, 'auditLog')), {
      actorId: ctx.me.uid, action, targetType, targetId: String(targetId), details: String(details).slice(0, 500), createdAt: ctx.m.serverTimestamp()
    });
  } catch (e) { console.error('Journal non écrit', e); }
}

export const millis = (t) => (t && t.toDate ? t.toDate().getTime() : t ? new Date(t).getTime() : 0);
export const fmtDate = (t) => { const ms = millis(t); return ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
export const fmtDateTime = (t) => { const ms = millis(t); return ms ? new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; };
export const since = (t) => {
  const d = Math.floor((Date.now() - millis(t)) / 86400000);
  return d <= 0 ? "aujourd'hui" : d === 1 ? 'depuis 1 jour' : `depuis ${d} jours`;
};
export const pill = (text, kind = '') => `<span class="pill ${kind}">${esc(text)}</span>`;

// Noms des utilisateurs (mémoire de session) : Map id → { name, photoUrl, verified, type }
export async function names(ids) { return loadAuthors(ids); }
export const nameOf = (map, id) => (map.get(id) && map.get(id).name) || 'Utilisateur';

// Fenêtre de confirmation avec saisie facultative ou obligatoire d'un motif
export function confirmAction({ title, text = '', confirmLabel = 'Confirmer', danger = false, reason = null, onConfirm }) {
  openModal({
    title,
    html: `${text ? `<p class="muted">${esc(text)}</p>` : ''}${reason ? `<div class="field" style="margin-top:10px"><label for="cfReason">${esc(reason.label)}${reason.required ? ' *' : ''}</label><textarea class="input" id="cfReason" rows="3" maxlength="${reason.max || 300}" style="padding:10px 14px"></textarea></div><p class="error" id="cfError" hidden></p>` : ''}`,
    actions: [{ label: 'Annuler' }, {
      label: confirmLabel, danger, primary: !danger,
      onClick: async (el) => {
        const val = reason ? el.querySelector('#cfReason').value.trim() : '';
        if (reason && reason.required && val.length < 3) { const e = el.querySelector('#cfError'); e.textContent = 'Ce champ est obligatoire.'; e.hidden = false; return false; }
        try { await onConfirm(val); } catch (e) { console.error(e); toast(explainError(e)); return false; }
      }
    }]
  });
}

export const statusPill = (s) => ({ pending: pill('En attente', 'warn'), approved: pill('Approuvée', 'ok'), rejected: pill('Refusée', 'bad'), revoked: pill('Retirée', 'bad'), open: pill('Ouvert', 'warn'), reviewing: pill('En cours', ''), resolved: pill('Résolu', 'ok'), dismissed: pill('Rejeté', '') }[s] || pill(s));

// Nombre de documents d'une collection avec des filtres : count(ctx, 'users', ['type', '==', 'agence'])
export async function count(ctx, col, ...filters) {
  const { m, db } = ctx;
  const snap = await m.getCountFromServer(m.query(m.collection(db, col), ...filters.map(([f, op, v]) => m.where(f, op, v))));
  return snap.data().count;
}
