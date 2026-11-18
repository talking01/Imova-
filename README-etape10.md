# Imova — Phase 3, étape 10 : examen des comptes, modération depuis les options, blocage réciproque, notifications personnalisées

Ce zip contient **les fichiers nouveaux ou modifiés**. Dépose-les à la racine de ton dépôt GitHub en **remplaçant** les anciens. Ne remplace pas `firebase-config.js` ni `app-config.js`. **Publie le nouveau `firestore.rules`.**

## Corrections demandées
- **Propriétaire moins puissant que l'administrateur** : la lecture du rôle est maintenant tolérante **dans les règles Firestore aussi** (« Owner », « owner » avec un espace, « propriétaire »). Si le problème persiste, un encadré en haut de l'administration affiche ce que contient réellement le champ `role` (voir `GUIDE-FIREBASE.md`, A11 quinquies). Le propriétaire a tous les droits de l'administrateur (suspendre, accorder le badge, journal d'activité…) plus les réglages.
- **Messages de refus clairs** : plus de « permission refusée, règles… ». Selon le cas : « Votre compte est suspendu : vous ne pouvez pas … », « Votre compte est temporairement restreint jusqu'au … : vous ne pouvez pas … », ou « Vous n'êtes pas autorisé à … ». Les actions interdites à un compte restreint affichent ce message **avant** même d'appeler le serveur.
- **Statistiques des comptes** : elles n'ont **plus besoin de l'index « events »** (comptage par jour). Les vues et visites déjà enregistrées avant cette étape ne sont plus comptées.

## Comptes : restriction, suspension, suppression
- **Restreint** (temporaire : 12 h, 24 h, 48 h, 72 h, 1, 2 ou 3 semaines) : le compte se connecte et peut **répondre** aux messages, mais ne peut pas **publier, noter, aimer, suivre, ouvrir une nouvelle discussion, demander le badge, modifier ses informations**. Un bandeau en haut de page indique la date de fin ; la restriction se termine toute seule.
- **Suspendu** : la personne est **toujours renvoyée vers la page d'examen** (`examination.html`) : « Votre compte est suspendu. Nous vérifions la conformité de vos activités avec nos politiques de confidentialité. Après examen, nous vous communiquerons notre décision. » avec le motif, la date et le suivi. Elle se met à jour **en direct** : *l'examen se poursuit* (avec message), *compte restauré* (avec message), ou *supprimé*. Le profil et les annonces disparaissent pendant l'examen et reviennent à la restauration.
- **Supprimé** : la personne qui se connecte voit la page indiquant **la date, la raison** et que son compte ne respecte pas nos politiques. Son profil, ses informations et ses annonces **n'apparaissent nulle part** (recherche, fil, abonnés, avis, notifications…), sauf **dans l'administration** (vrai nom) et dans la **messagerie** (« Utilisateur », sans photo). Ses annonces sont conservées pour l'équipe.
- **Notifications automatiques** à chaque décision (restriction, suspension, suppression, levée, restauration, examen qui continue) avec le **motif**.

## Examen des comptes (Administration → Examens)
Liste des comptes restreints / suspendus (puis supprimés, terminés) et **dossier complet** pour vérifier vraiment : identité et coordonnées, profil, annonces, signalements reçus, dossier de vérification, historique, **notes internes** (invisibles pour la personne). Décisions : restreindre, suspendre, maintenir l'examen (message), lever la restriction, **restaurer** (message), **supprimer** (raison + message).

## Modération depuis les options (administrateurs et propriétaire)
En parcourant le fil ou un profil, le menu ⋮ contient les **boutons de modération** (sans passer par l'administration) :
- **annonce** : masquer / réafficher, supprimer, + restreindre / suspendre / supprimer l'auteur, ouvrir l'examen ;
- **profil** : restreindre, suspendre, supprimer le compte, ouvrir l'examen.
Le modérateur n'a que masquer / réafficher / supprimer une annonce. Chaque action demande un **motif** et **prévient automatiquement** la personne (« votre annonce a été masquée / supprimée parce que… »).

## Blocage réciproque (comme Facebook)
Quand A bloque B : A ne voit plus B et **B ne voit plus A** (profil, annonces, recherche, abonnés, avis, notifications). Dans la messagerie, l'autre personne apparaît seulement comme « Utilisateur » et on ne peut plus lui écrire. Débloquer rend tout visible. (La liste « Contacts bloqués » montre les vrais noms pour pouvoir débloquer.)

## Notifications personnalisées (Administration → Notifications)
Champ titre + message (500 caractères), **destinataires** : toute la plateforme, toutes les agences, tous les particuliers, ou **un ou plusieurs comptes choisis** (recherche par nom, e-mail ou téléphone). Aperçu, confirmation, historique. Elles arrivent dans les notifications des destinataires, **signées « Imova » avec le badge officiel**.

## À savoir honnêtement
- L'état d'un compte est vérifié à chaque page avec une mémoire de **45 secondes** : une restriction ou suspension s'applique en moins d'une minute côté affichage ; **côté serveur, les règles Firestore bloquent immédiatement**.
- Les notifications à une catégorie sont copiées chez chaque personne **à sa prochaine ouverture** de l'application.
- Le blocage est appliqué par l'application (la base reste lisible) : la personne bloquée peut, techniquement, savoir qu'elle est bloquée en inspectant ses données.
- La fin automatique des restrictions se fait à l'ouverture du tableau de bord de l'administration ; l'affichage, lui, ignore une restriction dont la date est passée.
- Les règles Firestore de cette étape n'ont pas pu être exécutées sur un vrai projet (testées avec un faux Firebase : plus de 40 vérifications, dont le chargement de toutes les pages). Si une action affiche « Vous n'êtes pas autorisé… » alors que vous devriez pouvoir, regardez l'encadré d'avertissement en haut de l'administration puis `GUIDE-FIREBASE.md`.
