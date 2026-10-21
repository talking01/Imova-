// Imova — admin-moderation.js : annonces masquées, comptes suspendus, avis récents
import { initAdmin, audit, names, nameOf, fmtDate, pill, confirmAction } from './admin.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast, explainError } from './utils.js';
import { stars } from './components.js';

const main = document.getElementById('main');
let ctx, hidden = [], suspended = [], reviews = [], authors = new Map();

async function load() {
  const { m, db, rank } = ctx;
  try {
    const [h, s, r] = await Promise.all([
      m.getDocs(m.query(m.collection(db, 'properties'), m.where('status', '==', 'hidden'), m.limit(50))),
      rank >= 2 ? m.getDocs(m.query(m.collection(db, 'users'), m.where('suspended', '==', true), m.limit(50))) : Promise.resolve({ docs: [] }),
      m.getDocs(m.query(m.collection(db, 'reviews'), m.orderBy('createdAt', 'desc'), m.limit(20)))
    ]);
    hidden = h.docs.map((d) => ({ id: d.id, ...d.data() }));
    suspended = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    reviews = r.docs.map((d) => ({ id: d.id, ...d.data() }));
    authors = await names([...hidden.map((p) => p.authorId), ...reviews.flatMap((x) => [x.reviewerId, x.targetId])]);
  } catch (e) { console.error(e); main.innerHTML = `<div class="empty"><h2>Chargement impossible</h2><p>${esc(explainError(e))}</p></div>`; return; }
  render();
}

function render() {
  const none = (t) => `<p class="muted" style="padding:14px">${t}</p>`;
  main.innerHTML = `
    <div class="adm-title"><h1>Modération</h1></div>
    <h3 class="section-title">Annonces masquées (${hidden.length})</h3>
    <div class="card adm-list">${hidden.map((p) => `<div class="adm-row" data-kind="prop" data-id="${esc(p.id)}"><span class="grow"><strong>${esc(p.title)}</strong><small>${esc(nameOf(authors, p.authorId))}${p.moderationNote ? ' · ' + esc(p.moderationNote) : ''}</small></span><button class="btn btn-ghost btn-sm" data-act="show">Réactiver</button></div>`).join('') || none('Aucune annonce masquée.')}</div>
    ${ctx.rank >= 2 ? `<h3 class="section-title">Comptes suspendus (${suspended.length})</h3>
    <div class="card adm-list">${suspended.map((u) => `<div class="adm-row" data-kind="user" data-id="${esc(u.id)}"><span class="grow"><strong>${esc(u.name || 'Utilisateur')}</strong><small>${esc(u.suspendedReason || 'Sans motif')}</small></span><button class="btn btn-ghost btn-sm" data-act="unsuspend">Réactiver</button></div>`).join('') || none('Aucun compte suspendu.')}</div>` : ''}
    <h3 class="section-title">Avis récents</h3>
    <div class="card adm-list">${reviews.map((r) => `<div class="adm-row" data-kind="review" data-id="${esc(r.id)}"><span class="grow"><strong>${stars(r.rating, 14)} ${esc(nameOf(authors, r.reviewerId))} → ${esc(nameOf(authors, r.targetId))}</strong><small>${esc(r.comment || 'Sans commentaire')} · ${esc(fmtDate(r.createdAt))}</small></span><button class="btn btn-ghost btn-sm" data-act="del" style="color:var(--danger)" aria-label="Supprimer l'avis">${icon('trash', 16)}</button></div>`).join('') || none('Aucun avis.')}</div>`;
  hydrateIcons(main);
}

main.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const row = b.closest('[data-id]');
  const id = row.dataset.id;
  const { m, db } = ctx;
  if (b.dataset.act === 'show') confirmAction({ title: 'Réactiver cette annonce ?', confirmLabel: 'Réactiver', onConfirm: async () => { await m.updateDoc(m.doc(db, 'properties', id), { status: 'active', moderationNote: '' }); await audit(ctx, 'property_show', 'property', id); toast('Annonce réactivée'); load(); } });
  if (b.dataset.act === 'unsuspend') confirmAction({ title: 'Réactiver ce compte ?', confirmLabel: 'Réactiver', onConfirm: async () => { await m.updateDoc(m.doc(db, 'users', id), { suspended: false, suspendedReason: '' }); await audit(ctx, 'user_unsuspend', 'user', id); toast('Compte réactivé'); load(); } });
  if (b.dataset.act === 'del') {
    const r = reviews.find((x) => x.id === id);
    confirmAction({
      title: 'Supprimer cet avis ?', text: "La note sera retirée de la moyenne du profil.", confirmLabel: 'Supprimer', danger: true,
      onConfirm: async () => {
        const batch = m.writeBatch(db);
        batch.delete(m.doc(db, 'reviews', id));
        batch.update(m.doc(db, 'users', r.targetId), { ratingSum: m.increment(-r.rating), ratingCount: m.increment(-1) });
        await batch.commit();
        await audit(ctx, 'review_delete', 'review', id, r.comment || '');
        toast('Avis supprimé'); load();
      }
    });
  }
});

(async () => { ctx = await initAdmin({ minRank: 1, active: 'admin-moderation.html' }); if (ctx) load(); })();
