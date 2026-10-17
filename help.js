// Imova — help.js : page help.html (Aide et assistance)
// L'utilisateur décrit son besoin ; le texte part directement dans une conversation avec le compte « Support Imova ».
import { whenReady } from './auth.js';
import { requireAuth } from './guards.js';
import { SUPPORT_UID, supportReady } from './app-config.js';
import { isConfigured } from './firebase.js';
import { pageHeader, bindBack } from './components.js';
import { icon, hydrateIcons } from './icons.js';
import { clean, toast, esc } from './utils.js';

const main = document.getElementById('main');
document.getElementById('pageHeader').innerHTML = pageHeader('Aide et assistance');
bindBack();

const FAQ = [
  ['Comment publier une annonce ?', "Ouvrez votre profil, touchez « Publier une annonce », saisissez un titre et une description, ajoutez jusqu'à 15 photos et/ou une vidéo, vérifiez l'aperçu, puis touchez « Publier »."],
  ['Comment contacter un annonceur ?', "Touchez « Discuter » sur une annonce, ou « Message » sur un profil. Un message de départ est proposé : vous pouvez le modifier avant de l'envoyer."],
  ['Comment modifier ou supprimer mon annonce ?', "Touchez les trois points de votre annonce : Modifier l'annonce, Épingler sur mon profil ou Supprimer l'annonce."],
  ['Comment fonctionnent les recommandations ?', "Imova retient, sur votre téléphone uniquement, les annonces que vous ouvrez, aimez ou enregistrez, et vous propose en premier celles qui y ressemblent. Une raison est affichée sous chaque annonce recommandée."],
  ['Comment bloquer ou signaler quelqu\'un ?', "Dans une conversation ou sur un profil, touchez les trois points puis « Bloquer » ou « Signaler ». Un contact bloqué ne peut plus vous écrire."],
  ['Mes messages sont-ils privés ?', "Oui. Seules les deux personnes de la conversation peuvent lire les messages. Les photos et messages vocaux sont stockés chez notre prestataire d'hébergement de médias."]
];

function render(user) {
  const isSupport = user && user.uid === SUPPORT_UID;
  main.innerHTML = `
    <section class="card" style="padding:18px;display:grid;gap:12px">
      <h2 style="font-size:1.15rem">Comment pouvons-nous vous aider ?</h2>
      <p class="muted">Décrivez votre question ou votre problème : votre message est envoyé directement à notre équipe, dans une conversation.</p>
      ${!supportReady ? `<div class="notice">Le support n'est pas encore configuré par l'administrateur (<code>app-config.js</code>).</div>` : ''}
      ${isSupport ? `<div class="notice">Vous êtes connecté avec le compte du support : retrouvez les demandes dans vos <a href="messages.html"><strong>messages</strong></a>.</div>` : ''}
      <div class="field"><textarea class="input" id="helpText" rows="5" maxlength="1000" placeholder="Ex. Je n'arrive pas à publier mon annonce..." style="padding:10px 14px" ${!supportReady || isSupport ? 'disabled' : ''}></textarea><p class="hint"><span id="hCount">0</span> / 1000</p></div>
      <button class="btn btn-primary btn-block" id="helpSend" ${!supportReady || isSupport ? 'disabled' : ''}>${icon('send', 20)} Envoyer au support</button>
    </section>
    <h3 class="section-title" style="margin-top:20px">Questions fréquentes</h3>
    <section class="card faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}${icon('chevron', 18)}</summary><p>${esc(a)}</p></details>`).join('')}</section>`;
  hydrateIcons(main);
  const ta = document.getElementById('helpText');
  ta.addEventListener('input', () => { document.getElementById('hCount').textContent = String(ta.value.length); });
  document.getElementById('helpSend').addEventListener('click', () => {
    const text = clean(ta.value, 1000);
    if (text.length < 5) { toast('Décrivez votre demande en quelques mots.'); ta.focus(); return; }
    if (!requireAuth('contacter le support')) return;
    try { sessionStorage.setItem('imova-handoff', JSON.stringify({ to: SUPPORT_UID, text })); } catch (e) { /* ignoré */ }
    location.href = `chat.html?with=${encodeURIComponent(SUPPORT_UID)}&support=1`;
  });
}

(async () => {
  render(null);
  if (isConfigured) render(await whenReady());
})();
