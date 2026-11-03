// Imova — verif-view.js : affichage d'un dossier de vérification pour l'administration (documents, adresse, offre, identité déclarée)
// et fenêtre d'attribution d'un badge avec sa durée.
import { esc, toast } from './utils.js';
import { icon } from './icons.js';
import { optimized } from './viewer.js';
import { openModal } from './modal.js';
import { idTypeLabel, planOf, pricedPlans, fmtMoney, PLANS } from './badge-config.js';
import { fullNameOf, genderLabel, ageOf, dateToIso } from './identity.js';
import { untilMs } from './badge-rules.js';

const fmtD = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function docCard(label, d) {
  if (!d || !d.url) return '';
  const body = d.kind === 'image'
    ? `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer" class="vdoc-img" aria-label="Ouvrir ${esc(label)}"><img src="${esc(optimized(d.url, 520))}" alt="${esc(label)}" loading="lazy"></a>`
    : `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer" class="vdoc-file">${icon('file', 28)}<span><strong>${esc(d.name || 'Document.pdf')}</strong><small>Ouvrir le PDF</small></span></a>`;
  return `<figure class="vdoc"><figcaption>${esc(label)}</figcaption>${body}</figure>`;
}

// req : demande de vérification ; priv : informations personnelles du compte (userPrivate) ou null
export function dossierHtml(req, priv, prices = {}) {
  const d = req.data || {};
  const agency = req.accountType === 'agence';
  const pl = planOf(req.plan);
  const row = (l, v) => (v ? `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>` : '');
  const iso = priv && priv.birthDate ? dateToIso(priv.birthDate) : '';
  return `
    <dl class="kv">
      ${row('Offre demandée', pl ? `${pl.label} — ${fmtMoney(req.price)}${req.renewal ? ' (renouvellement)' : ''}` : '')}
      ${row("Type de pièce d'identité", idTypeLabel(d.idType))}
      ${row(agency ? "Adresse de l'agence" : 'Adresse', d.address)}
      ${row('Site internet', d.website)}
      ${row('Justification (pas de document officiel)', d.orgJustification)}
      ${row('Remarques', d.notes)}
    </dl>
    <div class="vdocs">
      ${docCard(agency ? "Pièce d'identité du responsable" : "Pièce d'identité", { url: d.idUrl, kind: d.idKind, name: d.idName })}
      ${docCard("Document officiel de l'agence", { url: d.orgUrl, kind: d.orgKind, name: d.orgName })}
      ${(d.extraDocs || []).map((x, i) => docCard(`Autre document ${i + 1}`, x)).join('')}
    </div>
    ${priv ? `<h4 style="margin:12px 0 4px">Identité déclarée à l'inscription (à comparer avec la pièce)</h4><dl class="kv">
      ${row(agency ? "Responsable de l'agence" : 'Nom complet', fullNameOf(priv))}
      ${agency ? row("Nom de l'agence", priv.agencyName) : ''}
      ${row('Sexe', genderLabel(priv.gender))}
      ${row('Date de naissance', iso ? `${fmtD(iso)} (${ageOf(iso)} ans)` : '')}
      ${row('Téléphone', priv.phone)}${row('E-mail', priv.email)}</dl>` : '<p class="muted">Identité déclarée à l\'inscription : non renseignée (ancien compte).</p>'}`;
}

// Fenêtre « accorder le badge » : durée (1 mois / 3 mois / 1 an) + note. onConfirm({ plan, days, note })
export function grantModal({ title, text = '', plan = 'm1', currentUntil = 0, confirmLabel = 'Accorder le badge', onConfirm }) {
  const base = Math.max(Date.now(), currentUntil || 0);
  openModal({
    title,
    html: `${text ? `<p class="muted" style="margin-bottom:10px">${esc(text)}</p>` : ''}
      <div class="field" style="margin-bottom:10px"><label for="gPlan">Durée du badge</label>
        <select class="select" id="gPlan">${PLANS.map((p) => `<option value="${p.id}" ${p.id === plan ? 'selected' : ''}>${esc(p.label)} (${p.days} jours)</option>`).join('')}</select></div>
      <p class="hint" id="gEnd"></p>
      <div class="field" style="margin-top:10px"><label for="gNote">Note envoyée à la personne (facultatif)</label><textarea class="input" id="gNote" rows="2" maxlength="300" style="padding:10px 14px"></textarea></div>
      <p class="error" id="gErr" hidden></p>`,
    actions: [{ label: 'Annuler' }, { label: confirmLabel, primary: true, onClick: async (el) => {
      const p = PLANS.find((x) => x.id === el.querySelector('#gPlan').value);
      try { await onConfirm({ plan: p.id, days: p.days, until: base + p.days * 86400000, note: el.querySelector('#gNote').value.trim() }); } catch (e) { console.error(e); const g = el.querySelector('#gErr'); g.textContent = 'Échec : ' + (e && e.code === 'permission-denied' ? 'permission refusée (droits ou règles Firestore).' : (e && e.message) || 'erreur'); g.hidden = false; return false; }
    } }],
    onOpen: (el) => {
      const upd = () => { const p = PLANS.find((x) => x.id === el.querySelector('#gPlan').value); el.querySelector('#gEnd').textContent = `Le badge sera actif jusqu'au ${new Date(base + p.days * 86400000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}${currentUntil && currentUntil > Date.now() ? ' (ajouté à la durée restante)' : ''}, puis retiré automatiquement.`; };
      el.querySelector('#gPlan').addEventListener('change', upd); upd();
    }
  });
}

export const untilLabel = (u) => (untilMs(u) ? new Date(untilMs(u)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
