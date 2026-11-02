// Imova — identity.js : identité d'un compte (nom, post-nom, prénom, sexe, date de naissance, téléphone / e-mail).
// Le téléphone sert d'IDENTIFIANT de connexion, sans SMS (gratuit) : le numéro est converti en une adresse technique
// (ex. 243812345678@tel.imova.app) qui n'existe pas comme boîte mail. Conséquence honnête : pas de réinitialisation par e-mail
// pour ces comptes, et le numéro n'est pas vérifié par SMS (cela demanderait l'offre payante de Firebase).
export const MIN_AGE = 18;
export const GENDERS = [['F', 'Féminin'], ['M', 'Masculin']];
export const COUNTRIES = [
  ['+243', 'RD Congo'], ['+242', 'Congo-Brazzaville'], ['+244', 'Angola'], ['+250', 'Rwanda'], ['+257', 'Burundi'], ['+256', 'Ouganda'],
  ['+255', 'Tanzanie'], ['+260', 'Zambie'], ['+27', 'Afrique du Sud'], ['+212', 'Maroc'], ['+221', 'Sénégal'], ['+225', "Côte d'Ivoire"],
  ['+33', 'France'], ['+32', 'Belgique'], ['+41', 'Suisse'], ['+44', 'Royaume-Uni'], ['+1', 'États-Unis / Canada']
];
export const PHONE_DOMAIN = 'tel.imova.app';

// « 081 234 5678 », « 0812345678 », « +243 81 234 5678 » → « +243812345678 » (vide si invalide)
export function normalizePhone(raw, dial = '+243') {
  let s = String(raw || '').trim().replace(/[\s().\-]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) s = dial + s.replace(/^0+/, '');
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}
export const phoneToEmail = (e164) => `${e164.slice(1)}@${PHONE_DOMAIN}`;
export const isPhoneEmail = (email) => String(email || '').toLowerCase().endsWith('@' + PHONE_DOMAIN);
export const emailToPhone = (email) => (isPhoneEmail(email) ? '+' + String(email).split('@')[0] : '');

// Ce que l'utilisateur saisit pour se connecter : e-mail OU numéro. Retourne null si ce n'est ni l'un ni l'autre.
export function identifierToLogin(raw, dial = '+243') {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (t.includes('@')) {
    const mail = t.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail) ? { type: 'email', email: mail, key: mail } : null;
  }
  const phone = normalizePhone(t, dial);
  return phone ? { type: 'phone', email: phoneToEmail(phone), key: phone, phone } : null;
}

export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function birthDateLimits() {
  const t = new Date();
  return { max: isoDate(new Date(t.getFullYear() - MIN_AGE, t.getMonth(), t.getDate())), min: isoDate(new Date(t.getFullYear() - 110, 0, 1)) };
}
// Date saisie « AAAA-MM-JJ » → âge en années (null si la date n'existe pas)
export function ageOf(iso, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
  return age;
}
export const birthToDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export function dateToIso(v) { // Timestamp / Date / ISO → « AAAA-MM-JJ » (UTC)
  const d = v && v.toDate ? v.toDate() : new Date(v);
  return isNaN(d) ? '' : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Nom public : le particulier s'affiche « Prénom Nom », l'agence par le nom de l'agence
export const publicNameOf = (p) => (p.accountType === 'agence' ? String(p.agencyName || '').trim() : `${p.firstName} ${p.lastName}`.trim());
// Identité complète (administration) : Nom Post-nom Prénom
export const fullNameOf = (p) => [p.lastName, p.postName, p.firstName].filter(Boolean).join(' ');
export const genderLabel = (g) => (g === 'F' ? 'Féminin' : g === 'M' ? 'Masculin' : '—');

// Majuscule à chaque mot (« mbuyi kalala » → « Mbuyi Kalala »), tirets et apostrophes conservés
export const properName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
