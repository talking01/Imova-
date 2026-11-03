// Imova — qr-card.js : QR code personnalisé d'un profil (couleurs Imova, formes arrondies, logo au centre),
// avec téléchargement en image, partage et copie du lien.
import { qrMatrix } from './qrcode.js';
import { openModal } from './modal.js';
import { icon, hydrateIcons } from './icons.js';
import { esc, toast } from './utils.js';

const NAVY = '#0B2545';
const NAVY_2 = '#13315C';
const GOLD = '#D4A24C';

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function loadLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'logo.svg';
  });
}

// Dessine la carte et retourne le canvas (1000 × 1300)
export async function renderQrCanvas({ url, name = '', subtitle = 'Scannez pour ouvrir le profil' }) {
  const qr = qrMatrix(url);
  const W = 1000; const H = 1300;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  // fond
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, NAVY); g.addColorStop(1, NAVY_2);
  ctx.fillStyle = g; roundRect(ctx, 0, 0, W, H, 56); ctx.fill();
  // en-tête
  const logo = await loadLogo();
  if (logo) ctx.drawImage(logo, 100, 62, 72, 72);
  ctx.fillStyle = '#fff'; ctx.font = '700 54px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText('Imova', 192, 100);
  ctx.fillStyle = GOLD; ctx.fillRect(100, 166, 90, 6);
  ctx.fillStyle = '#fff'; ctx.font = '700 58px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  let title = name || 'Profil Imova';
  while (ctx.measureText(title).width > 800 && title.length > 4) title = title.slice(0, -2);
  if (title !== (name || 'Profil Imova')) title += '…';
  ctx.fillText(title, 100, 232);
  // panneau blanc
  const px = 100; const py = 296; const pw = 800; const ph = 800;
  ctx.fillStyle = '#fff'; roundRect(ctx, px, py, pw, ph, 48); ctx.fill();
  const side = 680; const cell = side / qr.size; const ox = px + (pw - side) / 2; const oy = py + (ph - side) / 2;
  ctx.fillStyle = NAVY;
  const inFinder = (x, y) => (x < 8 && y < 8) || (x >= qr.size - 8 && y < 8) || (x < 8 && y >= qr.size - 8);
  // modules : petits carrés arrondis
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (!qr.modules[y][x] || inFinder(x, y)) continue;
    roundRect(ctx, ox + x * cell + cell * 0.02, oy + y * cell + cell * 0.02, cell * 0.96, cell * 0.96, cell * 0.22); ctx.fill();
  }
  // repères de position : coins arrondis (la structure 1:1:3:1:1 est conservée)
  const finder = (fx, fy) => {
    const x0 = ox + fx * cell; const y0 = oy + fy * cell;
    ctx.fillStyle = NAVY; roundRect(ctx, x0, y0, 7 * cell, 7 * cell, cell * 1.1); ctx.fill();
    ctx.fillStyle = '#fff'; roundRect(ctx, x0 + cell, y0 + cell, 5 * cell, 5 * cell, cell * 0.7); ctx.fill();
    ctx.fillStyle = NAVY; roundRect(ctx, x0 + 2 * cell, y0 + 2 * cell, 3 * cell, 3 * cell, cell * 0.6); ctx.fill();
  };
  finder(0, 0); finder(qr.size - 7, 0); finder(0, qr.size - 7);
  // logo au centre (le niveau de correction H tolère jusqu'à 30 % de modules cachés ; ici ≈ 5 %)
  const plate = side * 0.22; const cx = ox + side / 2; const cy = oy + side / 2;
  ctx.fillStyle = '#fff'; roundRect(ctx, cx - plate / 2, cy - plate / 2, plate, plate, plate * 0.26); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = GOLD; roundRect(ctx, cx - plate / 2 + 3, cy - plate / 2 + 3, plate - 6, plate - 6, plate * 0.24); ctx.stroke();
  if (logo) { const s = plate * 0.68; ctx.drawImage(logo, cx - s / 2, cy - s / 2, s, s); }
  // pied
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '600 42px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(subtitle, W / 2, 1160);
  ctx.fillStyle = GOLD; ctx.font = '500 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  let host = ''; try { host = new URL(url).host; } catch (e) { host = ''; }
  ctx.fillText(host, W / 2, 1218);
  return canvas;
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
const slug = (s) => String(s || 'profil').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'profil';

export async function downloadQr(canvas, name) {
  const blob = await toBlob(canvas);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `imova-qr-${slug(name)}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function shareQr(canvas, { name, url }) {
  const blob = await toBlob(canvas);
  const file = new File([blob], `imova-qr-${slug(name)}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name, text: `Profil Imova : ${name}`, url }); return 'image'; }
    if (navigator.share) { await navigator.share({ title: name, text: `Profil Imova : ${name}`, url }); return 'lien'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'annulé'; }
  try { await navigator.clipboard.writeText(url); return 'copié'; } catch (e) { return 'impossible'; }
}

// Petite fenêtre : aperçu du QR code + Télécharger / Partager / Copier le lien
export async function openQrCard({ url, name }) {
  let canvas = null;
  openModal({
    title: 'QR code du profil',
    html: `<div class="qr-box"><div class="qr-loading"><span class="spinner" style="border-color:rgba(127,127,127,.35);border-top-color:var(--accent)"></span></div><div id="qrHost"></div>
      <p class="muted" style="text-align:center;margin:8px 0 12px">Scannez ce code avec l'appareil photo : il ouvre directement le profil de <strong>${esc(name || 'ce compte')}</strong>.</p>
      <div class="qr-actions"><button class="btn btn-primary" data-qr="download" disabled>${icon('download', 18)} Télécharger</button><button class="btn btn-ghost" data-qr="share" disabled>${icon('share', 18)} Partager</button><button class="btn btn-ghost" data-qr="copy">${icon('link', 18)} Copier le lien</button></div></div>`,
    actions: [{ label: 'Fermer' }],
    onOpen: async (el) => {
      hydrateIcons(el);
      try {
        canvas = await renderQrCanvas({ url, name });
        canvas.className = 'qr-canvas'; canvas.setAttribute('aria-label', `QR code du profil ${name}`);
        el.querySelector('#qrHost').appendChild(canvas);
        el.querySelector('.qr-loading').remove();
        el.querySelectorAll('[data-qr=download],[data-qr=share]').forEach((b) => { b.disabled = false; });
      } catch (e) { console.error(e); el.querySelector('.qr-loading').outerHTML = '<p class="error">Impossible de créer le QR code.</p>'; }
      el.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-qr]');
        if (!b || !canvas) { if (b && b.dataset.qr === 'copy') { try { await navigator.clipboard.writeText(url); toast('Lien copié'); } catch (e) { toast('Copie impossible'); } } return; }
        if (b.dataset.qr === 'download') { await downloadQr(canvas, name); toast('Image enregistrée'); }
        if (b.dataset.qr === 'share') { const r = await shareQr(canvas, { name, url }); if (r === 'copié') toast('Lien copié'); else if (r === 'impossible') toast('Partage impossible'); }
        if (b.dataset.qr === 'copy') { try { await navigator.clipboard.writeText(url); toast('Lien copié'); } catch (e) { toast('Copie impossible'); } }
      });
    }
  });
}
