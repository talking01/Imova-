// Imova — cloudinary.js : envoi d'images vers Cloudinary (preset « non signé » : aucun secret dans le navigateur)
import { cloudinaryConfig } from './firebase-config.js';

export const cloudinaryReady = Object.values(cloudinaryConfig).every((v) => v && !String(v).startsWith('VOTRE_'));

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const MAX_VIDEO_MB = 50;
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export function checkVideoFile(file) {
  if (!file) return 'Aucun fichier choisi.';
  if (!VIDEO_TYPES.includes(file.type)) return 'Vidéo : formats acceptés MP4, WebM ou MOV.';
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) return `Cette vidéo dépasse ${MAX_VIDEO_MB} Mo.`;
  return '';
}

// Renvoie un message d'erreur, ou '' si le fichier est acceptable
export function checkImageFile(file, maxMB = 10) {
  if (!file) return 'Aucun fichier choisi.';
  if (!TYPES.includes(file.type)) return 'Formats acceptés : JPG, PNG ou WebP.';
  if (file.size > maxMB * 1024 * 1024) return `Cette image dépasse ${maxMB} Mo.`;
  return '';
}

// Réduit l'image (côté le plus long = maxSide) pour économiser les données mobiles
export async function compressImage(file, maxSide = 1600, quality = 0.85) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    throw new Error('image-unreadable');
  }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const webp = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
  if (webp && webp.type === 'image/webp') return webp;
  return new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
}

export function uploadToCloudinary(blob, { resource = 'image', onProgress = null } = {}) {
  return new Promise((resolve, reject) => {
    if (!cloudinaryReady) { reject(new Error('cloudinary-not-configured')); return; }
    const fd = new FormData();
    fd.append('file', blob);
    fd.append('upload_preset', cloudinaryConfig.uploadPreset);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinaryConfig.cloudName)}/${resource}/upload`);
    if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let json = {};
      try { json = JSON.parse(xhr.responseText); } catch (e) { /* réponse illisible */ }
      if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) resolve({ url: json.secure_url, publicId: json.public_id, width: json.width || 0, height: json.height || 0 });
      else reject(new Error((json.error && json.error.message) || 'upload-failed'));
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(fd);
  });
}

export async function uploadImage(file, { maxSide = 1600, onProgress = null } = {}) {
  const blob = await compressImage(file, maxSide);
  return uploadToCloudinary(blob, { resource: 'image', onProgress });
}

export function uploadVideo(file, { onProgress = null } = {}) {
  return uploadToCloudinary(file, { resource: 'video', onProgress });
}

// Message vocal : Cloudinary range l'audio dans le type « video »
export function uploadAudio(blob, { onProgress = null } = {}) {
  return uploadToCloudinary(blob, { resource: 'video', onProgress });
}

// ───────── Documents (messagerie) : PDF, Word, Excel, PowerPoint, texte...
export const DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'odt', 'ods', 'odp', 'rtf'];
export const MAX_DOC_MB = 10;
export const fileExt = (name) => (String(name || '').split('.').pop() || '').toLowerCase();

export function checkDocFile(file) {
  if (!file) return 'Aucun fichier choisi.';
  if (!DOC_EXTENSIONS.includes(fileExt(file.name))) return 'Type de fichier non accepté (PDF, Word, Excel, PowerPoint, texte...).';
  if (file.size === 0) return 'Ce fichier est vide.';
  if (file.size > MAX_DOC_MB * 1024 * 1024) return `Ce fichier dépasse ${MAX_DOC_MB} Mo.`;
  return '';
}

export function uploadDocument(file, { onProgress = null } = {}) {
  return uploadToCloudinary(file, { resource: 'raw', onProgress });
}

export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1048576) return (n / 1048576).toFixed(1).replace('.0', '').replace('.', ',') + ' Mo';
  if (n >= 1024) return Math.round(n / 1024) + ' Ko';
  return n + ' o';
}
