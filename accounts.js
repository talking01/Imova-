// Imova — accounts.js : comptes enregistrés sur CET appareil.
// On ne garde JAMAIS de mot de passe : seulement le nom, l'e-mail, la photo et l'emplacement (« slot »)
// de la session Firebase correspondante. Chaque compte a sa propre session, gérée par Firebase.
import { SLOT_KEY } from './firebase.js';

const KEY = 'imova-accounts';

export function listAccounts() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* stockage indisponible */ }
}

// Ajoute ou met à jour un compte (les champs vides n'écrasent pas les anciens)
export function saveAccount(acc) {
  const list = listAccounts();
  const i = list.findIndex((a) => a.slot === acc.slot);
  const merged = { ...(i >= 0 ? list[i] : {}), ...Object.fromEntries(Object.entries(acc).filter(([, v]) => v !== undefined && v !== '')) };
  if (i >= 0) list[i] = merged; else list.push(merged);
  write(list);
}

export function getAccount(slot) {
  return listAccounts().find((a) => a.slot === slot) || null;
}

export function removeAccount(slot) {
  write(listAccounts().filter((a) => a.slot !== slot));
}

// Premier emplacement libre : acc1, acc2, acc3...
export function nextFreeSlot() {
  const used = new Set(listAccounts().map((a) => a.slot));
  let n = 1;
  while (used.has('acc' + n)) n++;
  return 'acc' + n;
}

export function setActive(slot) {
  try { localStorage.setItem(SLOT_KEY, slot); } catch (e) { /* stockage indisponible */ }
}

export function clearActive() {
  try { localStorage.removeItem(SLOT_KEY); } catch (e) { /* stockage indisponible */ }
}
