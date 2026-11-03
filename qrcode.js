// Imova — qrcode.js : générateur de QR code (norme ISO 18004), sans bibliothèque externe.
// Mode « octets » (UTF-8), niveau de correction d'erreur H (30 %) : un logo au centre reste lisible. Versions 1 à 14 (jusqu'à 197 octets).
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]; })();
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    poly.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= gfMul(c, GF_EXP[i]); });
    poly = next;
  }
  return poly; // coefficients, terme de plus haut degré d'abord
}
function rsRemainder(data, degree) {
  const gen = rsGenerator(degree);
  const rem = new Array(degree).fill(0);
  data.forEach((b) => {
    const factor = b ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  });
  return rem;
}

// Niveau H : [mots de correction par bloc, [nombre de blocs, mots de données par bloc], ...]
const EC_H = {
  1: [17, [1, 9]], 2: [28, [1, 16]], 3: [22, [2, 13]], 4: [16, [4, 9]], 5: [22, [2, 11], [2, 12]], 6: [28, [4, 15]], 7: [26, [4, 13], [1, 14]],
  8: [26, [4, 14], [2, 15]], 9: [24, [4, 12], [4, 13]], 10: [28, [6, 15], [2, 16]], 11: [24, [3, 12], [8, 13]], 12: [28, [7, 14], [4, 15]],
  13: [22, [12, 11], [4, 12]], 14: [24, [11, 12], [5, 13]]
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], 11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66] };

const dataCodewords = (v) => EC_H[v].slice(1).reduce((s, [n, k]) => s + n * k, 0);
const bit = (x, i) => ((x >>> i) & 1) === 1;

function makeBytes(text, version) {
  const bytes = Array.from(new TextEncoder().encode(text));
  const countBits = version <= 9 ? 8 : 16;
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0x4, 4); push(bytes.length, countBits); bytes.forEach((b) => push(b, 8));
  const cap = dataCodewords(version) * 8;
  push(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; out.length < dataCodewords(version); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

function interleave(data, version) {
  const [ecLen, ...groups] = EC_H[version];
  const blocks = [];
  let pos = 0;
  groups.forEach(([n, k]) => { for (let i = 0; i < n; i++) { blocks.push(data.slice(pos, pos + k)); pos += k; } });
  const ecs = blocks.map((b) => rsRemainder(b, ecLen));
  const out = [];
  const maxK = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxK; i++) blocks.forEach((b) => { if (i < b.length) out.push(b[i]); });
  for (let i = 0; i < ecLen; i++) ecs.forEach((e) => out.push(e[i]));
  return out;
}

export function qrMatrix(text) {
  const need = new TextEncoder().encode(text).length;
  let version = 0;
  for (let v = 1; v <= 14; v++) { const countBits = v <= 9 ? 8 : 16; if (4 + countBits + need * 8 <= dataCodewords(v) * 8) { version = v; break; } }
  if (!version) throw new Error('Texte trop long pour le QR code');
  const size = 17 + 4 * version;
  const codewords = interleave(makeBytes(text, version), version);
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, dark) => { if (x >= 0 && x < size && y >= 0 && y < size) { modules[y][x] = dark; isFn[y][x] = true; } };

  // motifs fixes : repères de position, synchronisation, alignement
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); setFn(cx + dx, cy + dy, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const pos = ALIGN[version];
  pos.forEach((cy, i) => pos.forEach((cx, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const formatBits = (mask) => {
    const data = (2 << 3) | mask; // niveau H = 10
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  };
  const drawFormat = (mask) => {
    const b = formatBits(mask);
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(b, i));
    setFn(8, 7, bit(b, 6)); setFn(8, 8, bit(b, 7)); setFn(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(b, i));
    setFn(8, size - 8, true);
  };
  drawFormat(0); // réserve les zones (réécrites après le choix du masque)
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3); const b = Math.floor(i / 3); setFn(a, b, bit(bits, i)); setFn(b, a, bit(bits, i)); }
  }

  // placement des données en zigzag
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y][x] && k < codewords.length * 8) { modules[y][x] = bit(codewords[k >>> 3], 7 - (k & 7)); k++; }
      }
    }
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  ];
  const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFn[y][x] && MASKS[m](x, y)) modules[y][x] = !modules[y][x]; };
  const penalty = () => {
    let p = 0;
    const lines = [];
    for (let i = 0; i < size; i++) { lines.push(modules[i]); lines.push(modules.map((r) => r[i])); }
    lines.forEach((line) => {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) run++; else { if (run >= 5) p += 3 + (run - 5); run = 1; }
      }
      const s = line.map((v) => (v ? 1 : 0)).join('');
      const re = /10111010000|00001011101/g; let mt;
      while ((mt = re.exec(s))) { p += 40; re.lastIndex = mt.index + 1; }
    });
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = modules[y][x]; if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) p += 3; }
    let dark = 0; modules.forEach((r) => r.forEach((v) => { if (v) dark++; }));
    p += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
    return p;
  };
  let best = 0; let bestP = Infinity;
  for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
  applyMask(best); drawFormat(best);
  return { size, version, modules, isFunction: isFn };
}
