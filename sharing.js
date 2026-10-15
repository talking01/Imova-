// Imova — sharing.js : lien d'une annonce, copier, partager, enregistrer les images.
import { toast } from './utils.js';

export function propertyUrl(id) {
  const u = new URL('property.html', document.baseURI);
  u.searchParams.set('id', id);
  return u.href;
}

export function profileUrl(id) {
  const u = new URL('profile.html', document.baseURI);
  u.searchParams.set('id', id);
  return u.href;
}

export async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Lien copié');
  } catch (e) {
    toast("Impossible de copier le lien.");
  }
}

export async function shareLink(title, url) {
  if (navigator.share) {
    try { await navigator.share({ title, url }); } catch (e) { /* partage annulé */ }
  } else {
    copyLink(url);
  }
}

// Télécharge les images d'une annonce (la vidéo est ignorée)
export async function downloadImages(media, baseName = 'imova') {
  const images = (media || []).filter((m) => m && m.url && m.type !== 'video');
  if (!images.length) { toast("Cette annonce n'a pas d'image."); return; }
  toast(images.length > 1 ? 'Téléchargement des images...' : "Téléchargement de l'image...");
  let done = 0;
  for (let i = 0; i < images.length; i++) {
    try {
      const res = await fetch(images[i].url);
      if (!res.ok) throw new Error('http ' + res.status);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${baseName}-${i + 1}.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      done++;
    } catch (e) {
      window.open(images[i].url, '_blank', 'noopener');
    }
  }
  if (done) toast(done > 1 ? `${done} images enregistrées.` : 'Image enregistrée.');
}
