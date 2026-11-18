// Imova — visibility.js : qui voit quoi.
//   · Blocage réciproque (comme sur Facebook) : si A bloque B, A ne voit plus B (profil, annonces, recherche, avis, abonnés...) et B ne voit plus A.
//     Dans la messagerie, l'autre personne apparaît seulement sous le nom « Utilisateur ».
//   · Les comptes suspendus ou supprimés disparaissent de la plateforme (sauf pour l'équipe, et sous « Utilisateur » dans la messagerie).
//   · L'équipe d'administration voit tout (il faut pouvoir modérer).
import { firestore } from './firebase.js';
import { whenReady } from './auth.js';
import { rankOf } from './roles.js';

const state = { me: '', staff: false, role: '', hidden: new Set(), blocked: new Set(), blockers: new Set(), loaded: null };
const KEY = (uid) => 'imova-vis-' + uid;

async function load() {
  const me = await whenReady();
  if (!me) return;
  state.me = me.uid;
  let c = null;
  try { c = JSON.parse(sessionStorage.getItem(KEY(me.uid)) || 'null'); } catch (e) { /* ignoré */ }
  if (c && Date.now() - c.t < 2 * 60 * 1000) {
    state.staff = c.staff; state.role = c.role || ''; state.blocked = new Set(c.blocked); state.blockers = new Set(c.blockers);
  } else {
    const fs = await firestore();
    if (fs) {
      const { m, db } = fs;
      const get = async (field) => { try { const s = await m.getDocs(m.query(m.collection(db, 'blocks'), m.where(field, '==', me.uid), m.limit(200))); return s.docs.map((d) => d.data()); } catch (e) { return []; } };
      const [mine, theirs] = await Promise.all([get('blockerId'), get('blockedId')]);
      state.blocked = new Set(mine.map((b) => b.blockedId));
      state.blockers = new Set(theirs.map((b) => b.blockerId));
      try { const s = await m.getDoc(m.doc(db, 'admins', me.uid)); state.staff = s.exists(); state.role = s.exists() ? String(s.data().role || '') : ''; } catch (e) { state.staff = false; }
      try { sessionStorage.setItem(KEY(me.uid), JSON.stringify({ t: Date.now(), staff: state.staff, role: state.role, blocked: [...state.blocked], blockers: [...state.blockers] })); } catch (e) { /* ignoré */ }
    }
  }
  // l'équipe voit tout ; les autres ne voient ni les personnes qu'ils bloquent ni celles qui les bloquent
  state.hidden = state.staff ? new Set() : new Set([...state.blocked, ...state.blockers]);
}

export function ready() { if (!state.loaded) state.loaded = load().catch(() => {}); return state.loaded; }
export const hiddenAuthors = () => state.hidden;
export const isStaffViewer = () => state.staff;
export const staffRank = () => (state.staff ? rankOf(state.role) || 1 : 0);
export const viewerId = () => state.me;
export const isBlockedEither = (id) => state.blocked.has(id) || state.blockers.has(id);
export const iBlocked = (id) => state.blocked.has(id);

// À appeler après avoir bloqué ou débloqué quelqu'un
export async function refreshVisibility() {
  try { if (state.me) sessionStorage.removeItem(KEY(state.me)); } catch (e) { /* ignoré */ }
  state.loaded = null;
  await ready();
}
