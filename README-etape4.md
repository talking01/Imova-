# Imova — Phase 3, étape 4 (lot accéléré) : accueil corrigé, recommandations, recherche, J'aime, favoris, agences

Ce zip contient **les fichiers nouveaux ou modifiés**. Dépose-les à la racine de ton dépôt GitHub en **remplaçant** les anciens. Ne remplace pas `firebase-config.js`.

## 1. Le bug de l'accueil (seulement tes annonces)
**Cause la plus probable :** quand la connexion est lente ou coupée, Firebase se rabat **sans rien dire** sur la mémoire du téléphone, qui ne contient que ce qu'il a déjà vu : surtout **tes propres annonces**.
**Correction :** le fil interroge d'abord le **serveur** ; si le réseau ne répond pas, il utilise la mémoire **en l'indiquant** : un bandeau « Connexion lente ou absente : les annonces viennent de la mémoire de votre téléphone et peuvent être incomplètes » avec un bouton **Réessayer**. Un nouvel onglet **Récent** montre toujours toutes les annonces de tous, de la plus récente à la plus ancienne.
**Si le bug persiste sans que le bandeau apparaisse**, le problème est ailleurs : vérifie dans Firestore que les annonces des autres utilisateurs existent bien (collection `properties`, champ `createdAt` de type horodatage) et que les règles sont publiées, puis dis-moi ce que tu vois.

## 2. Accueil « Pour vous » et « Récent »
- **Pour vous** (par défaut) : annonces classées selon ce qui t'intéresse, avec la raison affichée sous l'annonce (« Selon vos centres d'intérêt (terrain) », « Vous suivez cet annonceur »...).
- **Récent** : toutes les annonces, ordre chronologique. Ton choix est mémorisé.
- **Profils à suivre** : une rangée glissante après la 4e annonce (annonceurs proches de tes intérêts, bien notés, vérifiés ou populaires, sans ceux que tu suis déjà), avec un bouton Suivre.

### Comment fonctionne la recommandation (transparent, sans boîte noire)
Chaque action ajoute du « poids » aux mots de l'annonce et à son annonceur : ouvrir une annonce, agrandir une photo, Voir plus (1 à 2), J'aime (3), Favori (4), Partager (2), Discuter (3), suivre un profil (4), visiter un profil (1), chercher des mots (1,5). Le poids **diminue de moitié en 14 jours**. Les annonces candidates reçoivent une note : fraîcheur + proximité avec tes intérêts + affinité avec l'annonceur + abonnement + popularité, moins une pénalité pour celles déjà ouvertes ou vues plusieurs fois, plus un peu de hasard pour varier ; le même annonceur ne peut pas occuper tout le haut du fil.
- **Tout reste sur ton appareil** (séparé pour chaque compte enregistré) : rien n'est envoyé à un serveur. Conséquence : les recommandations ne suivent pas d'un téléphone à l'autre.
- Ce n'est **pas** de l'intelligence artificielle : c'est un système de notes simple et expliqué. On pourra l'enrichir plus tard.

## 3. Recherche (`search.html`)
Annonces et profils. Pour les annonces : insensible aux accents et aux majuscules, singulier/pluriel (« maisons » trouve « maison »), **synonymes** (maison / villa / duplex ; appartement / studio ; terrain / parcelle ; location / louer ; vente / acheter ; bureau / commerce...), classement par nombre de mots trouvés puis fraîcheur. Pour les profils : le début du nom. Recherches récentes (effaçables) et puces « Pour vous » tirées de tes centres d'intérêt. Le champ « Vous cherchez ? » de l'accueil y mène.

## 4. J'aime et favoris
- **J'aime** : réel, compteur fiable (écrit en même temps que le « J'aime », vérifié par les règles).
- **Favoris** (marque-page) : privés ; page `favorites.html` (menu → Mes favoris).

## 5. Autres
- `agencies.html` : annuaire des agences (vérifiées d'abord), filtre par nom.
- `property.html` : **annonces similaires** sous l'annonce.

## Fichiers
**Nouveaux** : `search.html`, `search-page.js`, `favorites.html`, `favorites.js`, `agencies.html`, `agencies.js`, `likes.js`, `interests.js`, `recommend.js`
**Modifiés** : `firestore.rules`, `index.html`, `feed.js`, `postcard.js`, `property.js`, `profile.js`, `properties.js`, `follows.js`, `search.js`, `pages.js`, `components.css`

## À faire avant de tester
1. **Publier le nouveau `firestore.rules`** (Guide, A7) : il ajoute les règles des « J'aime » et des favoris.
2. Aucun nouvel index. L'index « authorId + createdAt » créé à l'étape 2 sert aussi aux recommandations.

## Tests à faire (comptes A et B, quelques annonces de plusieurs auteurs)
1. Accueil → onglet **Récent** : tu vois les annonces de **tous** les auteurs.
2. Mets ton téléphone en mode avion, recharge l'accueil : le **bandeau** apparaît. Réactive le réseau, touche **Réessayer** : toutes les annonces reviennent.
3. Ouvre 2 ou 3 annonces de terrains, aime-en une, mets-en une en favori. Reviens sur **Pour vous** : des terrains remontent, avec la raison affichée.
4. Dans « Profils à suivre », touche **Suivre** : le bouton devient « Abonné ».
5. **Recherche** : tape `maisons` (trouve aussi villas), `titre foncier`, puis l'onglet **Profils** : `ag`.
6. Menu → **Mes favoris** : ton annonce y est ; retire-la avec le marque-page.
7. Ouvre une annonce : **Annonces similaires** en dessous.
8. Déconnecté : le fil s'affiche ; J'aime propose de se connecter.

## À savoir honnêtement
- **Quota gratuit Firebase (50 000 lectures par jour)** : chaque ouverture de l'accueil en « Pour vous » lit environ 50 à 80 documents (annonces candidates, auteurs, J'aime, abonnements) ; les auteurs, abonnements et favoris sont gardés en mémoire pendant la session. Cela permet **environ 600 ouvertures d'accueil par jour pour tous tes utilisateurs ensemble**. Surveille l'onglet **Utilisation** de Firestore ; les réglages `POOL_*` en haut de `recommend.js` permettent de réduire la consommation, et l'onglet **Récent** coûte beaucoup moins.
- Les règles Firestore (J'aime, favoris) n'ont pas pu être exécutées sur un vrai projet. Si J'aime ou Favori affiche « Permission refusée », envoie-moi le message exact.
- **Pas encore** : Discuter (messagerie), notifications, tableau de bord, administration, magazine. C'est le prochain lot.
