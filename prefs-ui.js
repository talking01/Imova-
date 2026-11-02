// Imova — prefs-ui.js : choix des préférences (types de biens, objectifs, quartiers, mots-clés), utilisé à l'inscription et dans « Mes préférences ».
import { PREF_GROUPS, emptyPrefs } from './concepts.js';
import { buildTokens } from './search.js';
import { esc } from './utils.js';

export function prefsHtml(prefs) {
  const p = { ...emptyPrefs(), ...prefs };
  const chip = (g, v, l) => `<button type="button" class="pchip" data-g="${g}" data-v="${esc(v)}" aria-pressed="${(p[g] || []).includes(v)}">${esc(l)}</button>`;
  return PREF_GROUPS.map((g) => `<div class="field"><label>${esc(g.label)}</label><div class="chips-wrap">${g.items.map((it) => (Array.isArray(it) ? chip(g.key, it[0], it[1]) : chip(g.key, it, it))).join('')}</div></div>`).join('') + `
    <div class="field"><label for="kwInput">Autres mots-clés</label>
      <div class="kw-row"><input class="input" id="kwInput" maxlength="30" placeholder="ex. piscine, titre foncier, Kinshasa"><button type="button" class="btn btn-ghost" id="kwAdd">Ajouter</button></div>
      <div class="chips-wrap" id="kwList" style="margin-top:8px">${(p.keywords || []).map((k) => `<button type="button" class="pchip" data-g="keywords" data-v="${esc(k)}" aria-pressed="true">${esc(k)} ✕</button>`).join('')}</div></div>`;
}

// Branche les boutons ; onChange(prefs) est appelé à chaque modification
export function bindPrefs(root, prefs, onChange) {
  const p = { ...emptyPrefs(), ...prefs };
  const emit = () => onChange({ types: [...p.types], goals: [...p.goals], places: [...p.places], keywords: [...p.keywords] });
  root.addEventListener('click', (e) => {
    const c = e.target.closest('.pchip');
    if (c) {
      const g = c.dataset.g, v = c.dataset.v;
      const on = !(p[g] || []).includes(v);
      p[g] = on ? [...(p[g] || []), v] : (p[g] || []).filter((x) => x !== v);
      if (g === 'keywords') { if (!on) c.remove(); } else c.setAttribute('aria-pressed', String(on));
      emit();
      return;
    }
    if (e.target.closest('#kwAdd')) addKw();
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'kwInput') { e.preventDefault(); addKw(); } });
  function addKw() {
    const input = root.querySelector('#kwInput');
    const words = buildTokens(input.value, '').slice(0, 3);
    words.forEach((w) => {
      if ((p.keywords || []).includes(w) || p.keywords.length >= 15) return;
      p.keywords.push(w);
      root.querySelector('#kwList').insertAdjacentHTML('beforeend', `<button type="button" class="pchip" data-g="keywords" data-v="${esc(w)}" aria-pressed="true">${esc(w)} ✕</button>`);
    });
    input.value = '';
    emit();
  }
}
