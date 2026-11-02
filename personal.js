// Imova — personal.js : informations personnelles privées (userPrivate/UID) : lecture, création pour un ancien compte, modification.
// Visibles seulement du propriétaire et de l'administration. Le nom public (users.name) est mis à jour en même temps quand il change.
import { firestore } from './firebase.js';
import { birthToDate, dateToIso, publicNameOf, properName } from './identity.js';

async function need() {
  const fs = await firestore();
  if (!fs) throw new Error('Firebase non configuré');
  return fs;
}

export async function getPrivate(uid) {
  const { m, db } = await need();
  const s = await m.getDoc(m.doc(db, 'userPrivate', uid));
  return s.exists() ? { id: uid, ...s.data() } : null;
}

const keysOf = (p) => [...new Set([p.loginId, (p.email || '').toLowerCase(), p.phone].filter(Boolean))];

// Ancien compte (créé avant cette étape) : on complète le profil privé
export async function createPrivate(uid, userDoc, d, loginId = '') {
  const { m, db } = await need();
  const agency = userDoc.type === 'agence';
  const doc = {
    accountType: userDoc.type, firstName: d.firstName, lastName: d.lastName, postName: d.postName, gender: d.gender, birthDate: birthToDate(d.birthDate),
    loginType: loginId.includes('@') ? 'email' : 'phone', loginId, email: d.email || '', phone: d.phone || '', searchKeys: keysOf({ loginId, email: d.email, phone: d.phone }),
    consent: { acceptedAt: m.serverTimestamp(), version: '2026-10' }, createdAt: m.serverTimestamp(), updatedAt: m.serverTimestamp()
  };
  if (agency) doc.agencyName = d.agencyName || userDoc.name;
  await m.setDoc(m.doc(db, 'userPrivate', uid), doc);
  return doc;
}

// d : { firstName, lastName, postName, gender, birthDate (AAAA-MM-JJ), phone, email, agencyName }
export async function updatePrivate(uid, current, userDoc, d) {
  const { m, db } = await need();
  const agency = userDoc.type === 'agence';
  const upd = {
    firstName: d.firstName, lastName: d.lastName, postName: d.postName, gender: d.gender, birthDate: birthToDate(d.birthDate),
    email: d.email || '', phone: d.phone || '', updatedAt: m.serverTimestamp()
  };
  upd.searchKeys = keysOf({ loginId: current.loginId, email: upd.email, phone: upd.phone });
  if (agency) upd.agencyName = d.agencyName;
  const batch = m.writeBatch(db);
  batch.update(m.doc(db, 'userPrivate', uid), upd);
  const newName = publicNameOf({ accountType: userDoc.type, firstName: d.firstName, lastName: d.lastName, agencyName: d.agencyName });
  const nameChanged = newName && newName !== userDoc.name;
  if (nameChanged) batch.update(m.doc(db, 'users', uid), { name: newName, nameLower: newName.toLowerCase(), nameChangedAt: m.serverTimestamp() });
  await batch.commit();
  return { nameChanged, name: newName };
}

export const toForm = (p) => ({
  firstName: p.firstName || '', lastName: p.lastName || '', postName: p.postName || '', gender: p.gender || '', birthDate: p.birthDate ? dateToIso(p.birthDate) : '',
  phone: p.phone || '', email: p.email || '', agencyName: p.agencyName || ''
});
export { properName };
