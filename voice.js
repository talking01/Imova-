// Imova — voice.js : enregistrer et lire des messages vocaux.
import { icon } from './icons.js';
import { mmss, toast } from './utils.js';

// ───────── Enregistrement (micro du navigateur ; nécessite HTTPS, fourni par Netlify)
export const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
export const MAX_VOICE_SECONDS = 300;

export async function startRecorder({ onTick, onLimit } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = TYPES.find((t) => window.MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const t0 = Date.now();
  rec.start(250);
  let limitHit = false;
  const timer = setInterval(() => {
    const s = (Date.now() - t0) / 1000;
    if (onTick) onTick(s);
    if (s >= MAX_VOICE_SECONDS && !limitHit) { limitHit = true; if (onLimit) onLimit(); }
  }, 200);
  const release = () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); };
  return {
    stop() {
      return new Promise((resolve) => {
        rec.onstop = () => {
          release();
          resolve({ blob: new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }), duration: (Date.now() - t0) / 1000 });
        };
        rec.stop();
      });
    },
    cancel() {
      rec.onstop = release;
      try { rec.stop(); } catch (e) { release(); }
    }
  };
}

// ───────── Lecture (un seul message vocal à la fois ; la lecture continue même si la bulle est redessinée)
const players = new Map();
const RATES = [1, 1.5, 2];

export function voiceHtml(duration) {
  return `<div class="voice">
    <button type="button" class="vp-btn" aria-label="Lire le message vocal">${icon('play', 20)}</button>
    <div class="vp-bar" role="slider" aria-label="Position dans le message vocal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><div class="vp-fill"></div></div>
    <span class="vp-time">${mmss(duration || 0)}</span>
    <button type="button" class="vp-speed" aria-label="Vitesse de lecture">1×</button>
  </div>`;
}

function paint(p) {
  const ui = p.ui;
  if (!ui) return;
  const playing = !p.audio.paused;
  ui.btn.innerHTML = icon(playing ? 'pause' : 'play', 20);
  ui.btn.setAttribute('aria-label', playing ? 'Mettre en pause' : 'Lire le message vocal');
  const total = p.duration || (isFinite(p.audio.duration) ? p.audio.duration : 0);
  const cur = p.audio.currentTime || 0;
  const pct = total ? Math.min(100, (cur / total) * 100) : 0;
  ui.fill.style.width = `${pct}%`;
  ui.bar.setAttribute('aria-valuenow', String(Math.round(pct)));
  ui.time.textContent = mmss(playing || cur > 0 ? cur : total);
  ui.speed.textContent = `${p.audio.playbackRate}×`;
}

export function bindVoice(root, id, url, duration) {
  let p = players.get(id);
  if (!p) {
    const audio = new Audio();
    audio.preload = 'none';
    audio.src = url;
    p = { audio, ui: null, duration };
    ['timeupdate', 'play', 'pause', 'ratechange'].forEach((ev) => audio.addEventListener(ev, () => paint(p)));
    audio.addEventListener('ended', () => { audio.currentTime = 0; paint(p); });
    audio.addEventListener('error', () => toast('Ce message vocal ne peut pas être lu.'));
    players.set(id, p);
  }
  p.duration = duration;
  p.ui = { btn: root.querySelector('.vp-btn'), bar: root.querySelector('.vp-bar'), fill: root.querySelector('.vp-fill'), time: root.querySelector('.vp-time'), speed: root.querySelector('.vp-speed') };
  p.ui.btn.onclick = () => {
    if (p.audio.paused) {
      players.forEach((q) => { if (q !== p) q.audio.pause(); });
      p.audio.play().catch(() => toast('Lecture impossible.'));
    } else p.audio.pause();
  };
  p.ui.bar.onclick = (e) => {
    const r = p.ui.bar.getBoundingClientRect();
    const total = p.duration || (isFinite(p.audio.duration) ? p.audio.duration : 0);
    if (total) { p.audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total; paint(p); }
  };
  p.ui.speed.onclick = () => { p.audio.playbackRate = RATES[(RATES.indexOf(p.audio.playbackRate) + 1) % RATES.length]; };
  paint(p);
}

export function stopAllVoices() { players.forEach((p) => p.audio.pause()); }
