// Imova — welcome.js : page de bienvenue après la création du compte (résumé, préférences, puis connexion).
import { icon, hydrateIcons } from './icons.js';
import { esc, param } from './utils.js';
import { fullNameOf, genderLabel, ageOf } from './identity.js';
import { prefsHtml, bindPrefs } from './prefs-ui.js';
import { emptyPrefs } from './concepts.js';

const main = document.getElementById('main');
let s = null;
try { s = JSON.parse(sessionStorage.getItem('imova-welcome') || 'null'); } catch (e) { /* ignoré */ }
if (!s) { location.replace('login.html'); } else {
  const agency = s.type === 'agence';
  const q = [param('add') === '1' ? 'add=1' : '', param('next') ? `next=${encodeURIComponent(param('next'))}` : '', `id=${encodeURIComponent(s.loginId)}`].filter(Boolean).join('&');
  const row = (l, v) => `<div class="sum-row"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
  main.innerHTML = `
    <section class="welcome-hero"><span class="big">${icon('check', 40)}</span><h1>Bienvenue sur Imova, ${esc(agency ? s.agencyName : s.firstName)} !</h1><p>Votre compte ${agency ? 'agence' : 'particulier'} a bien été créé.</p></section>
    <div class="card summary">
      <div class="sum-block"><div class="sum-head"><h3>Votre compte</h3></div>
        ${row('Type de compte', agency ? 'Agence' : 'Particulier')}
        ${row(agency ? "Nom de l'agence (profil public)" : 'Nom affiché sur votre profil', s.name)}
        ${row('Identifiant de connexion', s.loginId)}
      </div>
      <div class="sum-block"><div class="sum-head"><h3>${agency ? "Responsable de l'agence" : 'Votre identité'}</h3></div>
        ${row('Nom complet', fullNameOf(s))}
        ${row('Sexe', genderLabel(s.gender))}
        ${row('Date de naissance', `${new Date(s.birthDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} (${ageOf(s.birthDate)} ans)`)}
      </div>
    </div>
    <div class="info-box">${icon('info', 18)}<span><strong>D'autres informations pourront vous être demandées ultérieurement</strong> en cas de besoin, par exemple pour obtenir le badge de vérification. Vous pouvez modifier vos informations dans <strong>Menu → Confidentialité</strong>.</span></div>
    <section class="card" style="padding:16px;display:grid;gap:12px">
      <div><h2 style="font-size:1.1rem">Que recherchez-vous ?</h2><p class="muted">Facultatif : Imova s'en servira pour vous proposer des annonces et des profils adaptés. Vous pourrez le changer à tout moment dans Mes préférences.</p></div>
      <div id="prefs">${prefsHtml(emptyPrefs())}</div>
    </section>
    <div class="wiz-actions"><a class="btn btn-primary btn-block" id="loginBtn" href="login.html?${q}">${icon('lock', 18)} Me connecter</a></div>`;
  hydrateIcons(main);
  let current = emptyPrefs();
  bindPrefs(document.getElementById('prefs'), current, (p) => { current = p; try { localStorage.setItem('imova-pending-prefs', JSON.stringify(p)); } catch (e) { /* ignoré */ } });
}
