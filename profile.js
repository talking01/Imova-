// Imova — profile.js : page profile.html (mon profil sans id ; le profil d'un autre avec ?id=...)
import { whenReady } from './auth.js';
import { setMyPhoto } from './auth.js';
import { requireAuth, loginUrl } from './guards.js';
import { getUserDoc, updateMyProfile } from './users.js';
import { fetchPinned, fetchByAuthor, forgetAuthor, countByAuthor } from './properties.js';
import { createPostCard } from './postcard.js';
import { follow, unfollow, isFollowing } from './follows.js';
import { openRatingModal } from './rating-modal.js';
import { uploadImage, checkImageFile, cloudinaryReady } from './cloudinary.js';
import { sanitizeRich, openRichEditor } from './richtext.js';
import { openModal, openSheet } from './modal.js';
import { openViewer, optimized } from './viewer.js';
import { copyLink, shareLink, profileUrl } from './sharing.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, clean, toast, compact, param, explainError, showFlash } from './utils.js';
import { isEmail } from './validation.js';
import { pageHeader, bindBack, emptyState, skeletonCard, stars, average, formatAverage } from './components.js';
import { setActiveTab } from './navbar.js';

const main = document.getElementById('main');
const TYPES = { particulier: 'Particulier', agence: 'Agence' };
const state = { id: '', own: false, me: null, u: null, following: false, tab: 'posts', posts: null, postsTotal: null };

// ── Champs modifiables (fenêtres de saisie)
const normalizeUrl = (v) => (v && !/^https?:\/\//i.test(v) ? 'https://' + v : v);
const urlOk = (v) => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes('.'); } catch (e) { return false; } };
const FIELD_SETS = {
  bio: { title: 'Modifier la bio', fields: [{ key: 'bio', label: 'Bio', max: 105, area: true, rows: 3 }] },
  contact: {
    title: 'Contact',
    fields: [
      { key: 'phone', label: 'Téléphone', max: 30, type: 'tel', check: (v) => (!v || /^[+0-9 ().\-]{3,30}$/.test(v) ? '' : 'Numéro de téléphone invalide.') },
      { key: 'contactEmail', label: 'E-mail de contact', max: 120, type: 'email', check: (v) => (!v || isEmail(v) ? '' : "Adresse e-mail invalide.") }
    ]
  },
  address: { title: 'Adresse', fields: [{ key: 'address', label: 'Adresse', max: 200, area: true, rows: 3 }] },
  website: { title: 'Site web', fields: [{ key: 'website', label: 'Adresse du site', max: 200, type: 'url', normalize: normalizeUrl, check: (v) => (!v || urlOk(v) ? '' : "Adresse de site invalide (exemple : www.monsite.cd).") }] },
  hours: { title: "Horaires d'ouverture", fields: [{ key: 'hours', label: 'Horaires', max: 300, area: true, rows: 4 }] }
};

function openFields(setKey) {
  const set = FIELD_SETS[setKey];
  const u = state.u;
  openModal({
    title: set.title,
    html: set.fields.map((f) => `
      <div class="field" style="margin-bottom:12px">
        <label for="f_${f.key}">${esc(f.label)}</label>
        ${f.area
          ? `<textarea class="input" id="f_${f.key}" rows="${f.rows || 3}" maxlength="${f.max}" style="padding:10px 14px"></textarea>`
          : `<input class="input" id="f_${f.key}" type="${f.type || 'text'}" maxlength="${f.max}" autocomplete="off">`}
        <p class="hint"><span data-count="${f.key}">0</span> / ${f.max}</p>
      </div>`).join('') + '<p class="error" id="fieldsError" hidden></p>',
    onOpen: (el) => {
      set.fields.forEach((f) => {
        const input = el.querySelector('#f_' + f.key);
        input.value = u[f.key] || '';
        const cnt = el.querySelector(`[data-count="${f.key}"]`);
        const upd = () => { cnt.textContent = String(input.value.length); };
        input.addEventListener('input', upd);
        upd();
      });
    },
    actions: [
      { label: 'Annuler' },
      {
        label: 'Enregistrer', primary: true,
        onClick: async (el) => {
          const err = el.querySelector('#fieldsError');
          const changes = {};
          for (const f of set.fields) {
            let v = clean(el.querySelector('#f_' + f.key).value, f.max);
            if (f.normalize) v = f.normalize(v);
            const problem = f.check ? f.check(v) : '';
            if (problem) { err.textContent = problem; err.hidden = false; return false; }
            changes[f.key] = v;
          }
          try {
            await updateMyProfile(state.id, changes);
            Object.assign(state.u, changes);
            forgetAuthor(state.id);
            renderTop();
            renderTabContent();
            toast('Modification enregistrée');
          } catch (e) {
            console.error(e);
            err.textContent = explainError(e);
            err.hidden = false;
            return false;
          }
        }
      }
    ]
  });
}

// ── Photo de profil et bannière
function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => resolve(input.files[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function changeImage(kind) {
  if (!cloudinaryReady) { toast("Cloudinary n'est pas encore configuré (voir GUIDE-FIREBASE.md, partie Cloudinary)."); return; }
  const file = await pickImage();
  if (!file) return;
  const problem = checkImageFile(file);
  if (problem) { toast(problem); return; }
  toast('Envoi de la photo...');
  try {
    const { url } = await uploadImage(file, { maxSide: kind === 'cover' ? 1600 : 512 });
    const field = kind === 'cover' ? 'coverUrl' : 'photoUrl';
    await updateMyProfile(state.id, { [field]: url });
    if (kind === 'avatar') await setMyPhoto(url);
    state.u[field] = url;
    forgetAuthor(state.id);
    renderTop();
    toast(kind === 'cover' ? 'Bannière enregistrée' : 'Photo enregistrée');
  } catch (e) {
    console.error(e);
    if (e && e.message === 'image-unreadable') toast("Cette image n'a pas pu être lue. Choisissez un autre fichier.");
    else toast(e && e.code ? explainError(e) : "L'envoi de l'image a échoué. Vérifiez votre connexion et le preset Cloudinary.");
  }
}

// ── Haut du profil : bannière, photo, nombres, bio, boutons
function renderTop() {
  const u = state.u;
  const own = state.own;
  const name = u.name || 'Utilisateur';
  const avg = average(u);
  const followers = Number(u.followersCount) || 0;
  const posts = state.postsTotal !== null ? state.postsTotal : Number(u.postsCount) || 0;
  const editBtn = (act, label, ic = 'pencil') => `<button class="edit-btn" data-act="${act}" aria-label="${label}">${icon(ic, 18)}</button>`;

  document.getElementById('top').innerHTML = `
    <div class="cover">
      ${u.coverUrl ? `<img src="${esc(optimized(u.coverUrl, 1200))}" alt="">` : ''}
      ${own ? editBtn('edit-cover', 'Changer la bannière', 'camera') : ''}
    </div>
    <div class="profile-head">
      <div class="avatar-xl">
        <button class="pic" ${u.photoUrl ? 'data-act="view-avatar"' : 'tabindex="-1"'} aria-label="${u.photoUrl ? 'Agrandir la photo de profil' : 'Photo de profil'}">
          ${u.photoUrl ? `<img src="${esc(optimized(u.photoUrl, 300))}" alt="">` : esc(name.trim().charAt(0).toUpperCase() || '?')}
        </button>
        ${own ? editBtn('edit-avatar', 'Changer la photo de profil', 'camera') : ''}
      </div>
      <div class="profile-id">
        <h2 class="profile-name">${esc(name)}${u.verified ? `<span class="verified" title="Profil vérifié">${icon('badge', 20)}</span>` : ''}</h2>
        <p class="muted">${esc(TYPES[u.type] || '')}</p>
        <p class="profile-stats"><a href="followers.html?id=${encodeURIComponent(state.id)}"><strong id="followersCount">${compact(followers)}</strong> abonné${followers > 1 ? 's' : ''}</a> · <strong>${compact(posts)}</strong> annonce${posts > 1 ? 's' : ''}</p>
        <div class="profile-rating">
          ${stars(avg)}
          <span>${u.ratingCount ? `${formatAverage(avg)} (${compact(u.ratingCount)})` : "Aucun avis"}</span>
          <a class="btn btn-ghost btn-sm" href="reviews.html?id=${encodeURIComponent(state.id)}">Voir</a>
        </div>
      </div>
    </div>
    <div class="bio-row">
      <p class="bio ${u.bio ? '' : 'placeholder'}">${u.bio ? esc(u.bio) : (own ? 'Ajoutez une courte bio (105 caractères maximum).' : '')}</p>
      ${own ? `<button class="edit-btn edit-inline" data-act="edit-bio" aria-label="Modifier la bio">${icon('pencil', 16)}</button>` : ''}
    </div>
    ${own ? `<a class="btn btn-primary btn-block" href="publish.html">${icon('plus', 20)} Publier une annonce</a>` : `
    <div class="profile-actions">
      <button class="btn ${state.following ? 'btn-following' : 'btn-primary'}" data-act="follow">${state.following ? 'Abonné' : 'Suivre'}</button>
      <button class="btn btn-ghost" data-act="message">Message</button>
      <button class="btn btn-ghost btn-icon" data-act="rate" aria-label="Noter ce profil">${icon('star', 22)}</button>
    </div>`}
    <div class="ptabs" role="tablist">
      <button role="tab" data-tab="posts" aria-selected="${state.tab === 'posts'}">Publication</button>
      <button role="tab" data-tab="info" aria-selected="${state.tab === 'info'}">Information</button>
    </div>`;
  hydrateIcons(document.getElementById('top'));
}

// ── Onglet Publication
async function renderPosts() {
  const box = document.getElementById('tabContent');
  box.innerHTML = '<div class="feed" id="postsFeed"></div><div class="more-wrap" id="postsMore"></div>';
  const feed = box.querySelector('#postsFeed');
  const more = box.querySelector('#postsMore');
  const author = { name: state.u.name, photoUrl: state.u.photoUrl, verified: !!state.u.verified, type: state.u.type };
  const seen = new Set();
  let cursor = null;
  let first = true;

  async function load() {
    more.innerHTML = '';
    const holder = document.createElement('div');
    holder.innerHTML = skeletonCard();
    feed.appendChild(holder);
    try {
      let pinned = [];
      if (first) pinned = await fetchPinned(state.id);
      const res = await fetchByAuthor(state.id, { after: cursor });
      holder.remove();
      if (first && pinned.length) {
        feed.insertAdjacentHTML('beforeend', '<h3 class="section-title">Publications épinglées</h3>');
        pinned.forEach((p) => { seen.add(p.id); feed.appendChild(createPostCard(p, author)); });
        feed.insertAdjacentHTML('beforeend', '<h3 class="section-title">Publications</h3>');
      }
      res.items.filter((p) => !seen.has(p.id)).forEach((p) => { seen.add(p.id); feed.appendChild(createPostCard(p, author)); });
      cursor = res.cursor;
      if (first && !pinned.length && !res.items.length) {
        feed.innerHTML = emptyState({
          iconName: 'building',
          title: state.own ? "Vous n'avez rien publié" : 'Aucune publication',
          text: state.own ? 'Vos annonces apparaîtront ici dès leur publication.' : "Ce profil n'a pas encore publié d'annonce."
        });
      }
      first = false;
      if (!res.done) {
        more.innerHTML = '<button class="btn btn-ghost" id="loadMore">Voir plus de publications</button>';
        more.querySelector('#loadMore').onclick = load;
      }
      hydrateIcons(box);
    } catch (e) {
      console.error(e);
      holder.remove();
      feed.insertAdjacentHTML('beforeend', emptyState({ iconName: 'building', title: 'Chargement impossible', text: explainError(e) }));
    }
  }
  load();
}

// ── Onglet Information
function renderInfo() {
  const u = state.u;
  const own = state.own;
  const pencil = (act, label) => (own ? `<button class="edit-btn edit-inline" data-act="${act}" aria-label="${label}">${icon('pencil', 16)}</button>` : '');
  const ph = (t) => `<span class="placeholder">${esc(t)}</span>`;
  const desc = u.description ? sanitizeRich(u.description) : '';
  const blocks = [];

  // Description
  if (desc || own) {
    blocks.push(`<div class="info-block">${icon('file')}<div class="info-main"><small>Description</small>${desc ? `<div class="rich">${desc}</div>` : ph('Présentez-vous (1 024 caractères maximum, gras, italique, alignement).')}</div>${pencil('edit-desc', 'Modifier la description')}</div>`);
  }
  // Contact
  if (u.phone || u.contactEmail || own) {
    const lines = [];
    if (u.phone) lines.push(`<a href="tel:${esc(u.phone.replace(/[^+0-9]/g, ''))}">${esc(u.phone)}</a>`);
    if (u.contactEmail) lines.push(`<a href="mailto:${esc(u.contactEmail)}">${esc(u.contactEmail)}</a>`);
    blocks.push(`<div class="info-block">${icon('phone')}<div class="info-main"><small>Contact</small>${lines.length ? lines.join('<br>') : ph('Téléphone, e-mail')}</div>${pencil('edit-contact', 'Modifier le contact')}</div>`);
  }
  // Adresse
  if (u.address || own) {
    blocks.push(`<div class="info-block">${icon('pin')}<div class="info-main"><small>Adresse</small>${u.address ? esc(u.address).replace(/\n/g, '<br>') : ph('Votre adresse')}</div>${pencil('edit-address', "Modifier l'adresse")}</div>`);
  }
  // Site web
  if (u.website || own) {
    const ok = u.website && urlOk(u.website);
    blocks.push(`<div class="info-block">${icon('globe')}<div class="info-main"><small>Site web</small>${u.website ? (ok ? `<a href="${esc(u.website)}" target="_blank" rel="noopener noreferrer">${esc(u.website.replace(/^https?:\/\//i, ''))}</a>` : esc(u.website)) : ph('Adresse de votre site')}</div>${pencil('edit-website', 'Modifier le site web')}</div>`);
  }
  // Horaires
  if (u.hours || own) {
    blocks.push(`<div class="info-block">${icon('clock')}<div class="info-main"><small>Horaires</small>${u.hours ? esc(u.hours).replace(/\n/g, '<br>') : ph("Horaires d'ouverture")}</div>${pencil('edit-hours', 'Modifier les horaires')}</div>`);
  }

  document.getElementById('tabContent').innerHTML = blocks.length
    ? `<section class="card info-card"><h2>À propos de ${esc(u.name || 'ce profil')}</h2>${blocks.join('')}</section>`
    : emptyState({ iconName: 'user', title: 'Aucune information', text: "Ce profil n'a pas encore renseigné ses informations." });
  hydrateIcons(document.getElementById('tabContent'));
}

function renderTabContent() {
  if (state.tab === 'info') renderInfo();
  else renderPosts();
}

// ── Actions
async function toggleFollow(btn) {
  if (!requireAuth('suivre ce profil')) return;
  btn.disabled = true;
  try {
    if (state.following) {
      await unfollow(state.me.uid, state.id);
      state.following = false;
      state.u.followersCount = Math.max(0, (Number(state.u.followersCount) || 0) - 1);
    } else {
      await follow(state.me.uid, state.id);
      state.following = true;
      state.u.followersCount = (Number(state.u.followersCount) || 0) + 1;
    }
    renderTop();
  } catch (e) {
    console.error(e);
    toast(explainError(e));
    btn.disabled = false;
  }
}

async function refreshUser() {
  try {
    const fresh = await getUserDoc(state.id);
    if (fresh) { state.u = fresh; renderTop(); }
  } catch (e) { /* on garde l'affichage actuel */ }
}

function showMenu() {
  const url = profileUrl(state.id);
  const items = [];
  if (!state.own) {
    items.push({ icon: 'message', label: 'Message', onClick: () => { if (requireAuth('écrire à ce profil')) toast('Cette fonction arrive bientôt.'); } });
    items.push({ icon: 'flag', label: 'Signaler le profil', danger: true, onClick: () => { if (requireAuth('signaler ce profil')) toast('Cette fonction arrive bientôt.'); } });
    items.push({ icon: 'close', label: 'Bloquer', danger: true, onClick: () => { if (requireAuth('bloquer ce profil')) toast('Cette fonction arrive bientôt.'); } });
  }
  items.push({ icon: 'link', label: 'Copier le lien', onClick: () => copyLink(url) });
  items.push({ icon: 'share', label: 'Partager', onClick: () => shareLink(state.u.name || 'Profil Imova', url) });
  openSheet(items);
}

main.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; renderTop(); renderTabContent(); return; }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  switch (btn.dataset.act) {
    case 'follow': toggleFollow(btn); break;
    case 'message': if (requireAuth('écrire à ce profil')) toast('Cette fonction arrive bientôt.'); break;
    case 'rate':
      if (requireAuth('noter ce profil')) openRatingModal({ targetId: state.id, reviewerId: state.me.uid, onDone: refreshUser });
      break;
    case 'view-avatar': openViewer([{ url: state.u.photoUrl, type: 'image' }]); break;
    case 'edit-avatar': changeImage('avatar'); break;
    case 'edit-cover': changeImage('cover'); break;
    case 'edit-bio': openFields('bio'); break;
    case 'edit-contact': openFields('contact'); break;
    case 'edit-address': openFields('address'); break;
    case 'edit-website': openFields('website'); break;
    case 'edit-hours': openFields('hours'); break;
    case 'edit-desc':
      openRichEditor({
        title: 'Description',
        initialHtml: state.u.description || '',
        onSave: async (html) => {
          await updateMyProfile(state.id, { description: html });
          state.u.description = html;
          forgetAuthor(state.id);
          renderTabContent();
          toast('Description enregistrée');
        }
      });
      break;
  }
});

async function run() {
  main.innerHTML = '<div id="top" class="profile"></div><div id="tabContent"></div>';
  document.getElementById('top').innerHTML = skeletonCard();
  const me = await whenReady();
  let id = param('id');
  if (!id) {
    if (!me) { location.replace(loginUrl()); return; }
    id = me.uid;
  }
  state.id = id;
  state.me = me;
  state.own = !!me && me.uid === id;
  if (state.own) setActiveTab('profile'); else setActiveTab('');

  let u;
  try {
    u = await getUserDoc(id);
  } catch (e) {
    console.error(e);
    main.innerHTML = emptyState({ iconName: 'user', title: 'Chargement impossible', text: explainError(e) });
    document.getElementById('pageHeader').innerHTML = pageHeader('Profil', '', 'static');
    bindBack();
    hydrateIcons();
    return;
  }
  document.getElementById('pageHeader').innerHTML = pageHeader(u ? (state.own ? 'Mon profil' : u.name || 'Profil') : 'Profil',
    u ? `<button class="icon-btn" id="moreBtn" aria-label="Plus d'options">${icon('more')}</button>` : '', 'static');
  bindBack();
  if (!u) {
    main.innerHTML = emptyState({ iconName: 'user', title: 'Profil introuvable', text: "Ce profil n'existe pas ou a été supprimé.", actionLabel: "Retour à l'accueil", actionHref: 'index.html' });
    hydrateIcons();
    return;
  }
  state.u = u;
  try { state.postsTotal = await countByAuthor(id); } catch (e) { state.postsTotal = null; }
  document.title = `${u.name || 'Profil'} — Imova`;
  if (me && !state.own) {
    try { state.following = await isFollowing(me.uid, id); } catch (e) { state.following = false; }
  }
  document.getElementById('moreBtn').addEventListener('click', showMenu);
  main.innerHTML = '<div id="top" class="profile"></div><div id="tabContent"></div>';
  renderTop();
  renderTabContent();
  hydrateIcons();
  showFlash();
}

// Une annonce a été épinglée, désépinglée ou supprimée : on met à jour le compteur et la liste
window.addEventListener('imova:posts-changed', async () => {
  if (!state.u) return;
  try { state.postsTotal = await countByAuthor(state.id); } catch (e) { /* on garde l'ancien nombre */ }
  renderTop();
  if (state.tab === 'posts') renderTabContent();
});

run();
