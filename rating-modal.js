// Imova — rating-modal.js : fenêtre « Noter ce profil » (5 étoiles + avis), comme sur ton croquis
import { openModal } from './modal.js';
import { icon } from './icons.js';
import { getReview, saveReview, deleteReview } from './reviews.js';
import { clean, toast, explainError } from './utils.js';

export async function openRatingModal({ targetId, reviewerId, onDone }) {
  let existing = null;
  try { existing = await getReview(targetId, reviewerId); } catch (e) { /* on ouvre quand même la fenêtre */ }
  let rating = existing ? existing.rating : 0;

  const paint = (el) => {
    el.querySelectorAll('.pick').forEach((b) => {
      const on = Number(b.dataset.v) <= rating;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };

  const actions = [{ label: 'Annuler' }];
  let closeMain = null;
  if (existing) {
    actions.push({
      label: 'Supprimer', danger: true,
      onClick: () => {
        openModal({
          title: 'Supprimer votre avis ?',
          html: '<p class="muted">Votre note et votre commentaire seront retirés de ce profil.</p>',
          actions: [
            { label: 'Annuler' },
            {
              label: 'Supprimer', danger: true,
              onClick: async () => {
                try {
                  await deleteReview({ target: targetId, reviewer: reviewerId });
                  toast('Avis supprimé');
                  if (closeMain) closeMain();
                  if (onDone) onDone();
                } catch (e) { toast(explainError(e)); return false; }
              }
            }
          ]
        });
        return false;
      }
    });
  }
  actions.push({
    label: existing ? 'Enregistrer' : 'Publier', primary: true,
    onClick: async (el) => {
      const err = el.querySelector('#rmError');
      if (rating < 1) { err.textContent = 'Choisissez une note de 1 à 5 étoiles.'; err.hidden = false; return false; }
      try {
        await saveReview({ target: targetId, reviewer: reviewerId, rating, comment: clean(el.querySelector('#rmComment').value, 500) });
        toast(existing ? 'Avis modifié' : 'Merci pour votre avis');
        if (onDone) onDone();
      } catch (e) {
        console.error(e);
        err.textContent = explainError(e);
        err.hidden = false;
        return false;
      }
    }
  });

  openModal({
    title: existing ? 'Modifier votre avis' : 'Noter ce profil',
    html: `
      <div class="stars big" id="rmStars" role="group" aria-label="Votre note">
        ${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="pick star" data-v="${i}" aria-label="${i} étoile${i > 1 ? 's' : ''}">${icon('star', 36)}</button>`).join('')}
      </div>
      <div class="field" style="margin-top:12px">
        <label for="rmComment">Donnez votre avis (facultatif)</label>
        <textarea class="input" id="rmComment" rows="4" maxlength="500" style="padding:10px 14px"></textarea>
        <p class="hint"><span id="rmCount">0</span> / 500</p>
      </div>
      <p class="error" id="rmError" hidden></p>`,
    actions,
    onOpen: (el, close) => {
      closeMain = close;
      const ta = el.querySelector('#rmComment');
      ta.value = existing ? existing.comment || '' : '';
      const count = el.querySelector('#rmCount');
      const upd = () => { count.textContent = String(ta.value.length); };
      ta.addEventListener('input', upd);
      upd();
      el.querySelectorAll('.pick').forEach((b) => b.addEventListener('click', () => { rating = Number(b.dataset.v); paint(el); }));
      paint(el);
    }
  });
}
