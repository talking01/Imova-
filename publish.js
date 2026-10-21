// Imova — publish.js : page publish.html (publier une annonce) et publish.html?edit=ID (la modifier)
// Parcours : formulaire → aperçu (Modifier / Supprimer / Publier) → envoi des médias vers Cloudinary → annonce enregistrée.
import { whenReady } from './auth.js';
import { loginUrl } from './guards.js';
import { getProperty, createProperty, updateProperty, deleteProperty } from './properties.js';
import { getUserDoc } from './users.js';
import { createPostCard } from './postcard.js';
import { uploadImage, uploadVideo, checkImageFile, checkVideoFile, cloudinaryReady, MAX_VIDEO_MB } from './cloudinary.js';
import { buildTokens } from './search.js';
import { openModal, openSheet } from './modal.js';
import { pageHeader, bindBack, emptyState, skeletonCard } from './components.js';
import { icon, hydrateIcons } from './icons.js';
import { optimized } from './viewer.js';
import { setFieldError, setFormError } from './validation.js';
import { esc, clean, toast, param, explainError, overlayRoot, flash } from './utils.js';
import { isConfigured } from './firebase.js';
import { getSettings } from './verification.js';

const MAX_IMAGES = 15;
const TITLE_MAX = 100;
const DESC_MAX = 2000;
const main = document.getElementById('main');

const state = { mode: 'create', id: null, me: null, author: {}, title: '', description: '', images: [], video: null, view: 'form', busy: false, dirty: false };
let seq = 0;

// ── Choix de fichiers
function pick(accept, multiple) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...input.files]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

async function addImages() {
  const files = await pick('image/jpeg,image/png,image/webp', true);
  if (!files.length) return;
  let skipped = 0;
  let bad = '';
  for (const f of files) {
    if (state.images.length >= MAX_IMAGES) { skipped++; continue; }
    const err = checkImageFile(f);
    if (err) { bad = err; continue; }
    state.images.push({ key: ++seq, file: f, preview: URL.createObjectURL(f) });
  }
  if (skipped) toast(`Maximum ${MAX_IMAGES} photos : ${skipped} photo${skipped > 1 ? 's' : ''} ignorée${skipped > 1 ? 's' : ''}.`);
  else if (bad) toast(bad);
  state.dirty = true;
  renderMedia();
}

async function addVideo() {
  const [file] = await pick('video/mp4,video/webm,video/quicktime', false);
  if (!file) return;
  const err = checkVideoFile(file);
  if (err) { toast(err); return; }
  const replaced = !!state.video;
  state.video = { key: ++seq, file, preview: URL.createObjectURL(file) };
  if (replaced) toast("Une seule vidéo par annonce : l'ancienne a été remplacée.");
  state.dirty = true;
  renderMedia();
}

// ── Zone des médias
function renderMedia() {
  const grid = document.getElementById('imgGrid');
  if (!grid) return;
  document.getElementById('imgCount').textContent = String(state.images.length);
  grid.innerHTML = state.images.map((it, i) => `
    <div class="thumb">
      <img src="${esc(it.file ? it.preview : optimized(it.preview, 300))}" alt="Photo ${i + 1}">
      <button type="button" class="tap" data-cover="${it.key}" aria-label="Options de la photo ${i + 1}"></button>
      ${i === 0 ? '<span class="cover-tag">Couverture</span>' : ''}
      <button type="button" class="rm" data-rm="${it.key}" aria-label="Retirer la photo ${i + 1}">${icon('close', 16)}</button>
    </div>`).join('') +
    (state.images.length < MAX_IMAGES ? `<button type="button" class="thumb add" id="addImg">${icon('plus', 24)}<span>Photo</span></button>` : '');
  document.getElementById('videoBox').innerHTML = state.video
    ? `<div class="thumb video-slot"><video src="${esc(state.video.preview)}" muted playsinline preload="metadata"></video>
         <button type="button" class="rm" data-rmvideo aria-label="Retirer la vidéo">${icon('close', 16)}</button></div>`
    : `<button type="button" class="thumb add video-slot" id="addVideo">${icon('video', 24)}<span>Vidéo</span></button>`;
}

// ── Formulaire
function renderForm() {
  state.view = 'form';
  document.getElementById('pageHeader').innerHTML = pageHeader(state.mode === 'edit' ? "Modifier l'annonce" : 'Publier une annonce');
  bindBack();
  main.innerHTML = `
    <form class="form card pub-form" id="pubForm" novalidate>
      <div class="field">
        <label for="pTitle">Titre</label>
        <input class="input" id="pTitle" maxlength="${TITLE_MAX}" autocomplete="off" placeholder="Ex. Maison en étage à Gombe">
        <p class="hint"><span id="tCount">0</span> / ${TITLE_MAX}</p>
      </div>
      <div class="field">
        <label for="pDesc">Description</label>
        <textarea class="input" id="pDesc" rows="7" maxlength="${DESC_MAX}" style="padding:10px 14px" placeholder="Décrivez le bien : pièces, quartier, prix, conditions..."></textarea>
        <p class="hint"><span id="dCount">0</span> / ${DESC_MAX}</p>
      </div>
      <div class="field">
        <label>Photos (<span id="imgCount">0</span> / ${MAX_IMAGES})</label>
        <div class="thumbs" id="imgGrid"></div>
        <p class="hint">JPG, PNG ou WebP. La première photo sert de couverture : touchez une photo pour la changer.</p>
      </div>
      <div class="field">
        <label>Vidéo (une seule)</label>
        <div id="videoBox"></div>
        <p class="hint">MP4, WebM ou MOV, ${MAX_VIDEO_MB} Mo maximum.</p>
      </div>
      <div class="form-error" id="formError" role="alert" hidden></div>
      <button type="submit" class="btn btn-primary btn-block">Aperçu</button>
    </form>`;
  const title = document.getElementById('pTitle');
  const desc = document.getElementById('pDesc');
  title.value = state.title;
  desc.value = state.description;
  const counts = () => {
    document.getElementById('tCount').textContent = String(title.value.length);
    document.getElementById('dCount').textContent = String(desc.value.length);
  };
  title.addEventListener('input', () => { state.title = title.value; state.dirty = true; counts(); });
  desc.addEventListener('input', () => { state.description = desc.value; state.dirty = true; counts(); });
  counts();
  renderMedia();
  hydrateIcons(main);

  document.getElementById('pubForm').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { state.images = state.images.filter((i) => String(i.key) !== rm.dataset.rm); state.dirty = true; renderMedia(); return; }
    const cover = e.target.closest('[data-cover]');
    if (cover) {
      const key = cover.dataset.cover;
      const items = [];
      if (state.images[0] && String(state.images[0].key) !== key) {
        items.push({ icon: 'image', label: 'Définir comme couverture', onClick: () => {
          const it = state.images.find((i) => String(i.key) === key);
          state.images = [it, ...state.images.filter((i) => i !== it)];
          state.dirty = true;
          renderMedia();
        } });
      }
      items.push({ icon: 'trash', label: 'Retirer cette photo', danger: true, onClick: () => { state.images = state.images.filter((i) => String(i.key) !== key); state.dirty = true; renderMedia(); } });
      openSheet(items);
      return;
    }
    if (e.target.closest('#addImg')) { addImages(); return; }
    if (e.target.closest('#addVideo')) { addVideo(); return; }
    if (e.target.closest('[data-rmvideo]')) { state.video = null; state.dirty = true; renderMedia(); }
  });

  document.getElementById('pubForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (validate()) renderPreview();
  });
}

function validate() {
  setFormError('');
  const title = clean(state.title, TITLE_MAX);
  const desc = clean(state.description, DESC_MAX);
  const errT = title.length < 3 ? 'Donnez un titre (3 caractères minimum).' : '';
  const errD = desc.length < 10 ? 'Décrivez votre annonce (10 caractères minimum).' : '';
  setFieldError(document.getElementById('pTitle'), errT);
  setFieldError(document.getElementById('pDesc'), errD);
  if (errT || errD) { (errT ? document.getElementById('pTitle') : document.getElementById('pDesc')).focus(); return false; }
  return true;
}

// ── Aperçu : Modifier / Supprimer / Publier
function currentMedia() {
  return [
    ...state.images.map((i) => ({ url: i.preview, type: 'image' })),
    ...(state.video ? [{ url: state.video.preview, type: 'video' }] : [])
  ];
}

function renderPreview() {
  state.view = 'preview';
  window.scrollTo(0, 0);
  const edit = state.mode === 'edit';
  main.innerHTML = `
    <div class="preview-note">Aperçu : voici comment votre annonce apparaîtra. Rien n'est encore ${edit ? 'modifié' : 'publié'}.</div>
    <div id="previewCard"></div>
    <div class="form-error" id="formError" role="alert" hidden style="margin-top:12px"></div>
    <div class="pub-bar glass">
      <button class="btn btn-ghost" id="bEdit">Modifier</button>
      <button class="btn btn-ghost" id="bDelete" style="color:var(--danger)">Supprimer</button>
      <button class="btn btn-primary" id="bPublish">${edit ? 'Enregistrer' : 'Publier'}</button>
    </div>`;
  const property = {
    id: 'preview', authorId: state.me.uid,
    title: clean(state.title, TITLE_MAX), description: clean(state.description, DESC_MAX),
    media: currentMedia(), likesCount: 0, createdAt: new Date(), pinned: false
  };
  document.getElementById('previewCard').appendChild(createPostCard(property, state.author, { preview: true }));
  hydrateIcons(main);

  document.getElementById('bEdit').onclick = () => { renderForm(); window.scrollTo(0, 0); };
  document.getElementById('bPublish').onclick = publish;
  document.getElementById('bDelete').onclick = () => {
    if (edit) {
      openModal({
        title: "Supprimer l'annonce ?",
        html: '<p class="muted">Cette annonce sera retirée définitivement. Cette action est irréversible.</p>',
        actions: [
          { label: 'Annuler' },
          {
            label: 'Supprimer', danger: true,
            onClick: async () => {
              try {
                await deleteProperty(state.id);
                state.dirty = false;
                flash('Annonce supprimée');
                location.replace('profile.html');
              } catch (e) { console.error(e); toast(explainError(e)); return false; }
            }
          }
        ]
      });
    } else {
      openModal({
        title: 'Abandonner cette annonce ?',
        html: '<p class="muted">Le texte et les médias choisis seront perdus.</p>',
        actions: [
          { label: 'Continuer' },
          { label: 'Abandonner', danger: true, onClick: () => { state.dirty = false; location.replace('profile.html'); } }
        ]
      });
    }
  };
}

// ── Publication : envoi des médias puis enregistrement
function showProgress(text) {
  const wrap = document.createElement('div');
  wrap.className = 'progress-overlay';
  wrap.innerHTML = `<div class="progress-card" role="status"><strong id="pgText"></strong><div class="progress-track"><div class="progress-fill" id="pgFill"></div></div><p class="muted">Ne fermez pas la page.</p></div>`;
  overlayRoot().appendChild(wrap);
  const set = (frac, t) => {
    wrap.querySelector('#pgFill').style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
    if (t) wrap.querySelector('#pgText').textContent = t;
  };
  set(0, text);
  return { set, close: () => wrap.remove() };
}

async function publish() {
  if (state.busy) return;
  setFormError('');
  const needsUpload = state.images.some((i) => i.file) || (state.video && state.video.file);
  if (needsUpload && !cloudinaryReady) {
    setFormError("Cloudinary n'est pas encore configuré : voir GUIDE-FIREBASE.md (partie Cloudinary), ou retirez les médias.");
    return;
  }
  state.busy = true;
  const btn = document.getElementById('bPublish');
  if (btn) btn.disabled = true;
  const progress = showProgress('Préparation...');
  try {
    // 1) Médias : seuls les nouveaux fichiers sont envoyés (ceux déjà envoyés gardent leur adresse)
    const todo = state.images.filter((i) => i.file);
    if (state.video && state.video.file) todo.push(state.video);
    const total = todo.length;
    let done = 0;
    for (const item of todo) {
      const isVideo = item === state.video;
      progress.set(done / total, `Envoi ${done + 1} / ${total} (${isVideo ? 'vidéo' : 'photo'})`);
      const onProgress = (f) => progress.set((done + f) / total);
      const res = isVideo ? await uploadVideo(item.file, { onProgress }) : await uploadImage(item.file, { maxSide: 1600, onProgress });
      item.url = res.url;
      item.publicId = res.publicId;
      if (!isVideo) { item.w = res.width; item.h = res.height; }
      delete item.file;
      done++;
    }
    // 2) Annonce
    progress.set(1, "Enregistrement de l'annonce...");
    const title = clean(state.title, TITLE_MAX);
    const description = clean(state.description, DESC_MAX);
    const payload = {
      title, description,
      images: state.images.map((i) => ({ url: i.url, publicId: i.publicId || '', ...(i.w && i.h ? { w: i.w, h: i.h } : {}) })),
      video: state.video ? { url: state.video.url, publicId: state.video.publicId || '' } : null,
      tokens: buildTokens(title, description)
    };
    if (state.mode === 'edit') await updateProperty(state.id, payload);
    else await createProperty({ authorId: state.me.uid, ...payload });
    state.dirty = false;
    flash(state.mode === 'edit' ? 'Annonce modifiée' : 'Annonce publiée');
    location.href = 'profile.html';
  } catch (e) {
    console.error(e);
    progress.close();
    state.busy = false;
    if (btn) btn.disabled = false;
    const msg = e && e.code ? explainError(e) : "L'envoi a échoué. Vérifiez votre connexion et la configuration Cloudinary, puis réessayez : les médias déjà envoyés ne seront pas renvoyés.";
    setFormError(msg);
  }
}

// ── Démarrage
async function run() {
  if (!isConfigured) {
    document.getElementById('pageHeader').innerHTML = pageHeader('Publier une annonce');
    bindBack();
    main.innerHTML = emptyState({ iconName: 'building', title: 'Firebase non configuré', text: 'Remplissez firebase-config.js pour publier.' });
    hydrateIcons();
    return;
  }
  document.getElementById('pageHeader').innerHTML = pageHeader('Publier une annonce');
  bindBack();
  main.innerHTML = skeletonCard();
  const me = await whenReady();
  if (!me) { location.replace(loginUrl()); return; }
  state.me = me;
  const settings = await getSettings();
  if (settings.publishingEnabled === false) {
    main.innerHTML = emptyState({ iconName: 'lock', title: 'Publications momentanément fermées', text: 'Les nouvelles annonces sont désactivées pour le moment. Réessayez plus tard.', actionLabel: "Retour à l'accueil", actionHref: 'index.html' });
    hydrateIcons();
    return;
  }
  try { state.author = (await getUserDoc(me.uid)) || {}; } catch (e) { state.author = {}; }

  const editId = param('edit');
  if (editId) {
    try {
      const p = await getProperty(editId);
      if (!p) { main.innerHTML = emptyState({ iconName: 'search', title: 'Annonce introuvable', actionLabel: 'Retour à mon profil', actionHref: 'profile.html' }); hydrateIcons(); return; }
      if (p.authorId !== me.uid) { main.innerHTML = emptyState({ iconName: 'lock', title: 'Modification impossible', text: 'Vous ne pouvez modifier que vos propres annonces.', actionLabel: "Retour à l'accueil", actionHref: 'index.html' }); hydrateIcons(); return; }
      state.mode = 'edit';
      state.id = p.id;
      state.title = p.title || '';
      state.description = p.description || '';
      p.media.filter((m) => m.type !== 'video').forEach((m) => state.images.push({ key: ++seq, url: m.url, publicId: m.publicId, w: m.w, h: m.h, preview: m.url }));
      const v = p.media.find((m) => m.type === 'video');
      if (v) state.video = { key: ++seq, url: v.url, publicId: v.publicId, preview: v.url };
    } catch (e) {
      console.error(e);
      main.innerHTML = emptyState({ iconName: 'building', title: 'Chargement impossible', text: explainError(e) });
      hydrateIcons();
      return;
    }
  }
  renderForm();
}

window.addEventListener('beforeunload', (e) => {
  if (state.dirty && !state.busy) { e.preventDefault(); e.returnValue = ''; }
});

run();
