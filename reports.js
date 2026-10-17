// Imova — reports.js : signaler un profil, une annonce ou une conversation (examiné ensuite par l'administration)
import { firestore } from './firebase.js';
import { openModal } from './modal.js';
import { esc, clean, toast, explainError } from './utils.js';
import { requireAuth } from './guards.js';
import { getUser } from './auth.js';

const REASONS = [
  ['spam', 'Spam ou publicité répétée'],
  ['arnaque', 'Arnaque ou fausse annonce'],
  ['contenu_inapproprie', 'Contenu inapproprié'],
  ['harcelement', 'Harcèlement ou insultes'],
  ['faux_profil', 'Faux profil'],
  ['autre', 'Autre raison']
];
const LABELS = { profile: 'ce profil', property: 'cette annonce', conversation: 'cette conversation' };

// targetType : profile | property | conversation ; targetUserId : la personne concernée
export function openReport({ targetType, targetId, targetUserId = '' }) {
  if (!requireAuth(`signaler ${LABELS[targetType] || 'ce contenu'}`)) return;
  openModal({
    title: `Signaler ${LABELS[targetType] || 'ce contenu'}`,
    html: `
      <div class="field" role="radiogroup" aria-label="Motif du signalement">
        ${REASONS.map(([v, l], i) => `<label class="radio-row"><input type="radio" name="reason" value="${v}" ${i === 0 ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}
      </div>
      <div class="field" style="margin-top:10px">
        <label for="repDetails">Précisions (facultatif)</label>
        <textarea class="input" id="repDetails" rows="3" maxlength="500" style="padding:10px 14px"></textarea>
      </div>
      <p class="error" id="repError" hidden></p>`,
    actions: [
      { label: 'Annuler' },
      {
        label: 'Envoyer', primary: true,
        onClick: async (el) => {
          const me = getUser();
          const err = el.querySelector('#repError');
          try {
            const fs = await firestore();
            if (!fs) throw new Error('Firebase non configuré');
            const data = {
              reporterId: me.uid, targetType, targetId: String(targetId).slice(0, 200),
              reason: el.querySelector('input[name="reason"]:checked').value,
              details: clean(el.querySelector('#repDetails').value, 500), status: 'open', createdAt: fs.m.serverTimestamp()
            };
            if (targetUserId) data.targetUserId = String(targetUserId).slice(0, 200);
            await fs.m.setDoc(fs.m.doc(fs.m.collection(fs.db, 'reports')), data);
            toast('Signalement envoyé. Merci : notre équipe va l\'examiner.');
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
