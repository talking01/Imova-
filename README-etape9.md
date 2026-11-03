# Imova — Phase 3, étape 9 : badge payant avec documents et durée, nouveau badge bleu, QR code du profil

Ce zip contient **les fichiers nouveaux ou modifiés** (et seulement ceux-là). Dépose-les à la racine de ton dépôt GitHub en **remplaçant** les anciens. Ne remplace pas `firebase-config.js` ni `app-config.js`. Pense à **publier le nouveau `firestore.rules`**.

## 1. Nouveau badge (SVG bleu)
Ton dessin (bords festonnés + coche blanche) remplace l'ancien badge **partout** : annonces, recherche, messages, profils, avis, notifications, menu, administration. Taille ajustée au texte, **bleu façon Facebook (#1877F2)**.

## 2. Page du badge (`badge.html`) en deux sections
**Section 1 — Le badge** : message du badge, **offres et prix** (1 mois **4 $**, 3 mois **12 $**, 1 an **45 $**) à choisir en touchant la carte, avec le **prix par mois** et l'**économie** par rapport au tarif mensuel, avantages, et la mention que **le paiement se discute avec le support** dans la conversation (pas de paiement en ligne pour l'instant). Elle affiche aussi l'état du badge : actif (date de fin, jours restants, barre de durée), en attente, expiré, refusé.
**Section 2 — La demande** (formulaire) :
- **Particulier** : type de pièce d'identité (carte d'électeur, carte d'identité, passeport, permis, autre) + **photo ou PDF avec prévisualisation** (Remplacer / Retirer) + **adresse complète**.
- **Agence** : type de pièce d'identité du **responsable ou de la personne chargée** + sa photo ; **document prouvant l'existence officielle de l'agence** (RCCM ou autre) avec prévisualisation ; **adresse physique ou site internet** (l'un des deux). Si l'agence **n'a pas encore de document officiel** : case à cocher → justification écrite + jusqu'à 2 autres documents.
- Écran de progression à l'envoi (envoi des documents, enregistrement, envoi au support).
**Après l'envoi** : la demande entre dans la liste d'attente et **la discussion avec le support s'ouvre** avec le résumé (offre, prix, pièce, adresse…) **puis les documents** (photos et PDF) comme messages.
**Renouvellement** : un badge actif ou expiré se renouvelle en choisissant seulement l'offre (les documents restent au dossier).

## 3. Administration
- **Vérifications** : pour chaque demande, l'offre et le prix, le type de pièce, l'adresse, le site, les **documents (photos et PDF, ouvrables en grand)**, la justification éventuelle et, à côté, **l'identité déclarée à l'inscription** pour comparer. Les documents restent au dossier (preuve en cas de problème).
- **Accorder le badge avec une durée** (1 mois = 30 jours, 3 mois = 90 jours, 1 an = 365 jours ; la durée demandée est proposée ; un renouvellement s'ajoute à la durée restante). La personne reçoit une notification et un message avec la date de fin.
- **Fiche utilisateur** : badge actif jusqu'au… / expiré, **Prolonger**, **Retirer le badge** (retrait manuel immédiat), **Dossier de vérification**, octroi manuel avec durée.
- **Tableau de bord** : retrait automatique des badges expirés, liste des badges qui expirent sous 7 jours (rappel envoyé), message de confirmation.
- **Paramètres** (propriétaire) : prix du badge modifiables (les économies se recalculent).

## 4. Fin automatique des badges et rappels
- Un badge **n'est plus affiché dès que sa date de fin est passée**, partout et immédiatement.
- **7 jours avant la fin** : notification « Votre badge expire bientôt » (envoyée au titulaire à l'ouverture de l'application, ou par l'administration à l'ouverture de son tableau de bord).
- **À la fin** : le badge est retiré dans la base (à l'ouverture de l'application par le titulaire, ou par le balayage de l'administration), avec une notification « Votre badge a expiré ». Retrait **manuel** possible à tout moment.
- **Limite honnête** : sans serveur, ce retrait dans la base se fait quand quelqu'un ouvre l'application ou l'administration ; l'affichage, lui, est exact à la seconde près. Ouvre le tableau de bord de l'administration chaque jour.

## 5. QR code du profil
Dans le menu ⋮ d'un profil : **Message, Signaler, Bloquer, Copier le lien, Partager, QR code**. Le QR code affiche une carte personnalisée (couleurs Imova, formes arrondies, **logo Imova au centre**, nom du profil) qui contient l'adresse du profil : scanné, il ouvre directement le profil. Boutons **Télécharger (image PNG)**, **Partager** (l'image, ou le lien si le téléphone ne partage pas les images) et **Copier le lien**.

## À faire (détails dans `GUIDE-FIREBASE.md`, A11 quater)
1. **Publier `firestore.rules`**. 2. Vérifier que le preset Cloudinary accepte **images et PDF**. 3. Aucun index nouveau.

## Tests à faire
1. Compte particulier : Menu → Vérification : choisis une offre, joins une photo de pièce, indique l'adresse, envoie ; ouvre la conversation avec le support (résumé + photo).
2. Compte agence : joins la pièce du responsable et le document de l'agence ; essaie aussi « pas encore de document officiel ».
3. En administrateur : Vérifications → ouvre les documents → **Accorder le badge** pour 1 mois ; vérifie le badge bleu partout et la date de fin sur la page du titulaire.
4. Pour tester la fin : dans la fiche utilisateur, accorde un badge puis, dans la console Firebase, mets `verifiedUntil` dans le passé : le badge disparaît tout de suite de l'affichage.
5. Profil d'un compte : ⋮ → QR code → télécharge, scanne avec un autre téléphone.

## À savoir honnêtement
- **12 $ pour 3 mois = 3 × 4 $** : aucune économie sur l'offre 3 mois (la carte indique « 3 mois sans renouvellement ») ; l'offre 1 an économise 3 $ (6 %). Pour avoir une économie sur 3 mois, baisse son prix dans Paramètres (ex. 10 $).
- **Documents d'identité** : stockés chez Cloudinary derrière un lien difficile à deviner (pas vraiment privés : c'est la limite de l'offre gratuite sans serveur). Voir `policy.html` (version provisoire, à faire valider) : conservation pour preuve en cas de problème.
- Pas de paiement en ligne : l'équipe accorde le badge après avoir convenu du paiement dans la conversation.
- QR code : testé avec un décodeur de QR code robuste (celui d'OpenCV/WeChat, proche des scanners de téléphone) ; certains lecteurs très stricts peuvent être moins tolérants aux formes arrondies. Si un lecteur échoue, le lien reste copiable.
- Les règles Firestore de cette étape n'ont pas pu être exécutées sur un vrai projet (testées avec un faux Firebase : 53 vérifications sur cette étape + 98 de non-régression + chargement de toutes les pages). Si une action affiche « Permission refusée », envoie-moi le message exact.
