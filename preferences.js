// Imova — preferences.js : page preferences.html (Mes préférences de recommandation)
// L'utilisateur choisit ce qui l'intéresse et voit ce qu'Imova a retenu à partir de ses actions.
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import { getProfile, setPreferences, startSync, pushRemote, personalizationOn, topConcepts, topTokens, topAuthors, resetInterests } from './interests.js';
import { ensureRecommendations, forgetRecommendations } from './recommend.js';
import { CONCEPT_LABEL } from './concepts.js';
import { loadAuthors } from './properties.js';
import { prefsHtml, bindPrefs } from './prefs-ui.js';
import { pageHeader, bindBack, emptyState, skeletonCard, verifiedMark } from './components.js';
import { isConfigured } from './firebase.js';
import { icon, hydrateIcons } from './icons.js';
import { openModal } from './modal.js';
import { esc, toast, explainError } from './utils.js';

const main = document.getElementById('main');
document.getElementById('pageHeader').innerHTML = pageHeader('Mes préférences');
bindBack();
let me;

function bars(entries, max) {
  return entries.map(([label, v]) => `<div class="rank-row" style="padding:8px 0;border:0"><span class="rank-text"><strong>${esc(label)}</strong></span><span style="width:45%;height:8px;border-radius:4px;background:var(--surface-2);overflow:hidden"><i style="display:block;height:100%;width:${Math.max(6, Math.round((v / max) * 100))}%;background:var(--accent)"></i></span></div>`).join('');
}

async function render() {
  const prof = getProfile();
  const on = personalizationOn();
  const concepts = topConcepts(prof, 5).map((c) => [CONCEPT_LABEL[c] || c, prof.concepts[c]]);
  const tokens = topTokens(prof, 8).map((t) => [t, prof.tokens[t]]);
  const authIds = topAuthors(prof, 5);
  const a = authIds.length ? await loadAuthors(authIds) : new Map();
  const auths = authIds.map((id) => [`${(a.get(id) || {}).name || 'Profil'}`, prof.authors[id], (a.get(id) || {}).verified]);
  const maxOf = (l) => Math.max(1, ...l.map((x) => x[1]));
  main.innerHTML = `
    ${on ? '' : `<div class="notice">La personnalisation est désactivée : Imova ne retient rien et vous montre les annonces récentes. Vous pouvez la réactiver dans Menu → Confidentialité → Recommandations.</div>`}
    <section class="set-section"><h2>Ce que vous recherchez</h2><div class="card" style="padding:16px;display:grid;gap:14px" id="prefs">${prefsHtml(prof.prefs)}</div></section>
    <section class="set-section"><h2>Ce qu'Imova a retenu</h2><div class="card" style="padding:12px 16px">
      ${concepts.length || tokens.length || auths.length ? `
        ${concepts.length ? `<div class="fieldset-title">Vos types d'intérêt</div>${bars(concepts, maxOf(concepts))}` : ''}
        ${tokens.length ? `<div class="fieldset-title" style="margin-top:10px">Mots qui reviennent</div>${bars(tokens, maxOf(tokens))}` : ''}
        ${auths.length ? `<div class="fieldset-title" style="margin-top:10px">Annonceurs qui vous intéressent</div>${auths.map(([n, , v]) => `<div class="rank-row" style="padding:8px 0;border:0"><span class="rank-text"><strong>${esc(n)}${verifiedMark(v, 14)}</strong></span></div>`).join('')}` : ''}`
        : '<p class="muted">Rien pour le moment. Ouvrez des annonces, aimez-en, enregistrez-en, suivez des profils : Imova apprend de vos actions.</p>'}
    </div></section>
    <div class="adm-actions" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" id="recompute">${icon('trending', 18)} Recalculer mes recommandations</button>
      <button class="btn btn-ghost" id="erase" style="color:var(--danger)">Tout effacer</button>
    </div>
    <p class="muted" style="font-size:.82rem;margin-top:10px">Les recommandations sont calculées à partir de vos actions (annonces ouvertes, aimées, enregistrées, recherches, profils suivis), de vos préférences et de ce que vous refusez (« Pas intéressé »). Elles sont privées.</p>`;
  hydrateIcons(main);
  bindPrefs(document.getElementById('prefs'), prof.prefs, (p) => { setPreferences(p); pushRemote(me.uid).catch(() => {}); });
  document.getElementById('recompute').onclick = async (e) => {
    e.currentTarget.disabled = true; e.currentTarget.innerHTML = '<span class="spinner"></span> Calcul…';
    try { await pushRemote(me.uid).catch(() => {}); const d = await ensureRecommendations(me, { force: true }); toast(d ? `${d.properties.length} annonces et ${d.profiles.length} profils recommandés` : 'Personnalisation désactivée'); } catch (x) { toast(explainError(x)); }
    render();
  };
  document.getElementById('erase').onclick = () => openModal({
    title: 'Tout effacer ?', html: '<p class="muted">Vos préférences, ce qu\'Imova a retenu et vos recommandations seront supprimés.</p>',
    actions: [{ label: 'Annuler' }, { label: 'Effacer', danger: true, onClick: async () => { try { await resetInterests(me.uid); forgetRecommendations(); toast('Données effacées'); render(); } catch (x) { toast(explainError(x)); return false; } } }]
  });
}

(async () => {
  if (!isConfigured) { main.innerHTML = emptyState({ iconName: 'trending', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js.' }); hydrateIcons(); return; }
  main.innerHTML = skeletonCard();
  me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  await startSync(me.uid);
  render();
})();
