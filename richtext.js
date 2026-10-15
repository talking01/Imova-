// Imova — richtext.js : texte enrichi sûr (gras, italique, souligné, alignement, sauts de ligne).
// Le HTML saisi est TOUJOURS nettoyé : seules quelques balises sont autorisées, aucun attribut, aucun script.
import { icon } from './icons.js';
import { openModal } from './modal.js';

export const RICH_MAX = 1024; // caractères de texte (hors balises)

const INLINE = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u' };
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META']);

function alignOf(el) {
  // Notre propre classe (texte déjà nettoyé puis relu), sinon l'alignement venant de l'éditeur
  const own = (el.getAttribute('class') || '').match(/^al-(left|center|right)$/);
  if (own) return own[1];
  const v = ((el.style && el.style.textAlign) || el.getAttribute('align') || '').toLowerCase();
  return ['left', 'center', 'right'].includes(v) ? v : '';
}

// Nettoie un HTML : renvoie uniquement <b> <i> <u> <br> et <p class="al-left|al-center|al-right">
export function sanitizeRich(html) {
  const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html'); // document inerte : rien ne s'exécute
  const out = document.createElement('div');
  (function walk(node, target) {
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { target.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (DROP.has(tag)) return;
      if (INLINE[tag]) {
        const el = document.createElement(INLINE[tag]);
        walk(n, el);
        target.appendChild(el);
      } else if (tag === 'BR') {
        target.appendChild(document.createElement('br'));
      } else if (tag === 'DIV' || tag === 'P') {
        const el = document.createElement('p');
        const al = alignOf(n);
        if (al) el.className = 'al-' + al;
        walk(n, el);
        target.appendChild(el);
      } else {
        walk(n, target); // balise inconnue : on garde son texte seulement
      }
    });
  })(doc.body, out);
  return out.innerHTML;
}

export function richTextLength(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = sanitizeRich(html);
  return (tmp.textContent || '').length;
}

// Fenêtre d'édition ; onSave(htmlNettoyé) renvoie une promesse
export function openRichEditor({ title, initialHtml = '', onSave }) {
  const tools = [
    ['bold', 'bold', 'Gras'], ['italic', 'italic', 'Italique'], ['underline', 'underline', 'Souligné'],
    ['justifyLeft', 'alignLeft', 'Aligner à gauche'], ['justifyCenter', 'alignCenter', 'Centrer'], ['justifyRight', 'alignRight', 'Aligner à droite']
  ];
  openModal({
    title,
    html: `
      <div class="rich-tools" role="toolbar" aria-label="Mise en forme">
        ${tools.map(([cmd, ic, label]) => `<button type="button" class="icon-btn" data-cmd="${cmd}" aria-label="${label}">${icon(ic, 20)}</button>`).join('')}
      </div>
      <div class="input rich-editor" id="richEditor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Description"></div>
      <p class="hint"><span id="richCount">0</span> / ${RICH_MAX} caractères</p>
      <p class="error" id="richError" hidden></p>`,
    onOpen: (el) => {
      const ed = el.querySelector('#richEditor');
      const count = el.querySelector('#richCount');
      ed.innerHTML = sanitizeRich(initialHtml);
      const update = () => {
        const n = richTextLength(ed.innerHTML);
        count.textContent = String(n);
        count.style.color = n > RICH_MAX ? 'var(--danger)' : '';
      };
      ed.addEventListener('input', update);
      el.querySelectorAll('[data-cmd]').forEach((b) => {
        b.addEventListener('mousedown', (e) => e.preventDefault()); // garde la sélection du texte
        b.addEventListener('click', () => { ed.focus(); document.execCommand(b.dataset.cmd, false, null); update(); });
      });
      ed.addEventListener('drop', (e) => {
        e.preventDefault();
        const text = e.dataTransfer && e.dataTransfer.getData('text');
        if (text) document.execCommand('insertText', false, text);
      });
      ed.addEventListener('paste', (e) => { // on colle uniquement du texte brut
        e.preventDefault();
        document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text'));
      });
      update();
    },
    actions: [
      { label: 'Annuler' },
      {
        label: 'Enregistrer', primary: true,
        onClick: async (el) => {
          const ed = el.querySelector('#richEditor');
          const err = el.querySelector('#richError');
          const clean = sanitizeRich(ed.innerHTML);
          if (richTextLength(clean) > RICH_MAX) {
            err.textContent = `La description ne doit pas dépasser ${RICH_MAX} caractères.`;
            err.hidden = false;
            return false;
          }
          try { await onSave(clean); } catch (e) { err.textContent = "Enregistrement impossible. Réessayez."; err.hidden = false; return false; }
          return true;
        }
      }
    ]
  });
}
