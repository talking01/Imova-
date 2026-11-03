// Imova — doc-upload.js : champ « joindre une photo ou un document » avec prévisualisation (photo ou PDF).
// Le fichier est contrôlé et prévisualisé tout de suite ; il n'est envoyé (Cloudinary) qu'à la validation du formulaire.
import { uploadImage, uploadDocument, checkImageFile, formatSize, cloudinaryReady } from './cloudinary.js';
import { icon, hydrateIcons } from './icons.js';
import { esc } from './utils.js';

export function docFieldHtml({ id, label, required = false, hint = '' }) {
  return `<div class="field doc-field" id="${id}Box">
    <label>${esc(label)}${required ? ' *' : ''}</label>
    <div class="doc-drop">
      <button type="button" class="doc-pick" id="${id}Pick">${icon('upload', 24)}<span><strong>Joindre une photo ou un PDF</strong><small>Photo nette, texte lisible, 10 Mo maximum</small></span></button>
      <div class="doc-preview" id="${id}Prev" hidden></div>
    </div>
    ${hint ? `<p class="hint">${hint}</p>` : ''}
    <input type="file" id="${id}File" accept="image/*,application/pdf" hidden>
  </div>`;
}

// Retourne un contrôleur : { get file(), upload(onProgress), clear(), setError(msg) }
export function bindDocField(id, root = document, onChange = () => {}) {
  const pick = root.querySelector('#' + id + 'Pick');
  const input = root.querySelector('#' + id + 'File');
  const prev = root.querySelector('#' + id + 'Prev');
  const box = root.querySelector('#' + id + 'Box');
  let file = null; let objUrl = '';
  const setError = (msg) => {
    let e = box.querySelector('.error');
    if (!msg) { if (e) e.remove(); box.classList.remove('has-error'); return; }
    if (!e) { e = document.createElement('p'); e.className = 'error'; e.setAttribute('role', 'alert'); box.appendChild(e); }
    e.textContent = msg; box.classList.add('has-error');
  };
  const clear = () => {
    file = null; if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = ''; }
    prev.hidden = true; prev.innerHTML = ''; pick.hidden = false; input.value = ''; onChange(null);
  };
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  function show(f) {
    if (objUrl) URL.revokeObjectURL(objUrl);
    pick.hidden = true; prev.hidden = false;
    if (isPdf(f)) {
      prev.innerHTML = `<div class="doc-file">${icon('file', 30)}<span class="doc-meta"><strong>${esc(f.name)}</strong><small>PDF · ${esc(formatSize(f.size))}</small></span></div>`;
    } else {
      objUrl = URL.createObjectURL(f);
      prev.innerHTML = `<img src="${objUrl}" alt="Aperçu du document" class="doc-img"><span class="doc-meta"><strong>${esc(f.name)}</strong><small>${esc(formatSize(f.size))}</small></span>`;
    }
    prev.insertAdjacentHTML('beforeend', `<div class="doc-actions"><button type="button" class="btn btn-ghost btn-sm" data-doc="replace">Remplacer</button><button type="button" class="btn btn-ghost btn-sm" data-doc="remove" style="color:var(--danger)">Retirer</button></div>`);
    hydrateIcons(prev);
  }
  pick.addEventListener('click', () => input.click());
  prev.addEventListener('click', (e) => { const b = e.target.closest('[data-doc]'); if (!b) return; if (b.dataset.doc === 'replace') input.click(); else clear(); });
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f) return;
    setError('');
    let err = '';
    if (isPdf(f)) { if (f.size > 10 * 1024 * 1024) err = 'Ce PDF dépasse 10 Mo.'; else if (f.size === 0) err = 'Ce fichier est vide.'; }
    else err = checkImageFile(f, 25);
    if (err) { setError(err); input.value = ''; return; }
    file = f; show(f); onChange(f);
  });
  return {
    get file() { return file; },
    clear, setError,
    // Envoie le fichier : photo (compressée, 2000 px) ou PDF. Retourne { url, kind, name, size }
    async upload(onProgress) {
      if (!file) return null;
      if (!cloudinaryReady) throw new Error('cloudinary-not-configured');
      if (isPdf(file)) { const r = await uploadDocument(file, { onProgress }); return { url: r.url, kind: 'raw', name: file.name, size: file.size }; }
      const r = await uploadImage(file, { maxSide: 2000, onProgress });
      return { url: r.url, kind: 'image', name: file.name, size: file.size };
    }
  };
}
