# Imova — Phase 3, étape 3 : publier une annonce

Ce zip contient **les fichiers nouveaux ou modifiés**. Dépose-les à la racine de ton dépôt GitHub en **remplaçant** les anciens. Ne remplace pas `firebase-config.js`.

## Nouveaux fichiers
| Fichier | Rôle |
|---|---|
| `publish.html` + `publish.js` | Publier une annonce (`publish.html`) ou la modifier (`publish.html?edit=ID`) |
| `publish.css` | Styles de la page de publication |
| `search.js` | Mots-clés de recherche enregistrés avec chaque annonce (la page de recherche arrive à l'étape 5) |

## Fichiers modifiés (à remplacer)
`firestore.rules` · `properties.js` · `postcard.js` · `profile.js` · `cloudinary.js` · `icons.js` · `pages.js` · `utils.js` · `components.css` · `GUIDE-FIREBASE.md`

## À faire avant de tester
1. **Publier le nouveau `firestore.rules`** (Guide, A7). Sans cela : « Permission refusée ».
2. **Cloudinary** : ton preset non signé doit accepter les **vidéos** (formats `mp4, webm, mov`), voir Guide B3.
3. Aucun nouvel index à créer.

## Ce que tu peux faire
- **Publier** : depuis ton profil, bouton « Publier une annonce » : **titre** (100 caractères), **description** (2 000 caractères), **15 photos au maximum et/ou une seule vidéo** (50 Mo). Touche une photo pour la définir comme couverture, ✕ pour la retirer.
- **Aperçu** : l'annonce s'affiche exactement comme dans le fil, avec trois boutons : **Modifier** (retour au formulaire, rien n'est perdu), **Supprimer** (abandonner l'annonce) et **Publier**.
- **Envoi** : une barre de progression montre l'envoi des médias ; si une photo échoue, un message s'affiche et un nouvel appui sur Publier **ne renvoie pas** les médias déjà envoyés.
- **Après publication** : l'annonce apparaît dans l'onglet Publication de ton profil et dans le fil de l'accueil ; le nombre d'annonces du profil est mis à jour (compté par Firestore).
- **Menu ⋮ de ta propre annonce** : Modifier l'annonce, Épingler sur mon profil / Désépingler (3 maximum, elles s'affichent en haut du profil avec l'étiquette « Épinglée »), Supprimer l'annonce (avec confirmation).
- **Modifier** : même formulaire prérempli ; bouton « Enregistrer » ; seuls les nouveaux médias sont envoyés.
- Sur l'annonce d'un autre, le menu ne propose jamais Modifier ni Supprimer.

## Tests à faire (compte A connecté)
1. Profil → **Publier une annonce** : valide le formulaire vide : deux messages d'erreur.
2. Saisis titre et description, ajoute 3 photos et 1 vidéo, touche une photo → « Définir comme couverture ».
3. Essaie d'ajouter plus de 15 photos : les photos en trop sont refusées avec un message.
4. **Aperçu** → vérifie la carte ; touche Modifier : tout est conservé ; reviens à l'aperçu → **Publier**.
5. Tu arrives sur ton profil avec « Annonce publiée » ; l'annonce est dans Publication, et le compteur « annonce » passe à 1. Vérifie qu'elle apparaît sur l'accueil.
6. Menu ⋮ → **Épingler** : elle passe sous « Publications épinglées ». Épingle-en 3 ; une 4e est refusée.
7. Menu ⋮ → **Modifier l'annonce** : change le titre, retire une photo → Enregistrer : la carte est mise à jour.
8. Avec un compte B, ouvre le profil de A : aucun bouton Modifier ni Supprimer dans le menu ⋮ des annonces de A.
9. Menu ⋮ → **Supprimer l'annonce** → confirme : elle disparaît, le compteur diminue.
10. Coupe Internet au moment de publier : un message clair apparaît, rien n'est publié à moitié.

## À savoir honnêtement
- **Les fichiers retirés restent chez Cloudinary.** Quand tu supprimes une annonce ou retires une photo, le fichier reste sur Cloudinary (le supprimer exige un serveur secret, voir le plan d'architecture). Tu peux faire le ménage dans leur Media Library si l'espace devient un problème.
- **Seules les adresses Cloudinary sont affichées.** Une annonce dont les images viennent d'ailleurs (par exemple les annonces de test créées à la main) s'affiche **sans** image : c'est voulu, pour protéger les lecteurs.
- **Les règles Firestore** vérifient le titre, la description, 15 photos maximum et la vidéo Cloudinary, mais ne peuvent pas vérifier chaque adresse dans la liste des photos ; l'affichage ignore de toute façon les adresses non Cloudinary.
- La limite de **3 annonces épinglées** est appliquée par l'application, pas par les règles.
- Pas de brouillon enregistré : si tu quittes la page, un avertissement s'affiche (les photos choisies ne peuvent pas être gardées par le navigateur).
- J'ai testé ce parcours avec un faux Firebase et un faux Cloudinary ; les règles Firestore de cette étape n'ont pas pu être exécutées sur un vrai projet : si **Publier**, **Épingler** ou **Supprimer** affiche « Permission refusée », envoie-moi le message exact.
