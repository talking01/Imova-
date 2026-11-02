# Imova — Phase 3, étape 8 : nouvelle inscription, informations personnelles, recommandations intelligentes

Ce zip contient **les fichiers nouveaux ou modifiés** (et seulement ceux-là). Dépose-les à la racine de ton dépôt GitHub en **remplaçant** les anciens. Ne remplace pas `firebase-config.js` ni `app-config.js`. Pense à **publier le nouveau `firestore.rules`**.

## 1. Nouvelle inscription (`register.html`) en 4 étapes
1. **Type de compte** : *particulier* (chercher un bien **et** mettre en vente ou en location ses propres biens, sans être une agence) ou *agence* (agences, entreprises immobilières et autres professionnels). Le choix est expliqué sur chaque carte.
2. **Identité** : nom, post-nom, prénom, sexe, date de naissance (**18 ans minimum**, âge affiché en direct, contrôlé aussi par la base). Pour une agence : *Responsable de l'agence* puis **nom de l'agence** (c'est lui qui s'affiche sur le profil).
3. **Connexion** : au choix **adresse e-mail** ou **numéro de téléphone** (avec indicatif de pays), mot de passe avec indicateur de force.
4. **Récapitulatif** : toutes les informations (avec « Modifier » pour chaque bloc), mention que **d'autres informations pourront être demandées ultérieurement**, et la case « **En m'inscrivant, j'accepte** les conditions d'utilisation et la politique de confidentialité ».
Barre de progression, écran de chargement avec les étapes de création, validations en direct, brouillon conservé si on recharge la page (jamais le mot de passe), messages d'erreur clairs (adresse déjà utilisée, etc.).
Après la création : page **Bienvenue** (`welcome.html`) avec le résumé du compte et un choix facultatif de préférences, puis **Me connecter** (l'identifiant est prérempli).
**Connexion** : un seul champ « adresse e-mail ou numéro de téléphone » (le numéro peut être saisi en `0812345678` ou `+243…`).

## 2. Informations personnelles
- Enregistrées **à part, en privé** (`userPrivate`) : seuls le propriétaire du compte et les **administrateurs** les lisent (ni les modérateurs, ni les autres utilisateurs). Le profil public ne montre que le nom affiché.
- **Modifiables par l'utilisateur** : Menu → Confidentialité → *Informations personnelles* (nom, post-nom, prénom, sexe, date de naissance, téléphone, e-mail de contact, nom de l'agence). Le nom affiché change une fois tous les 30 jours au plus ; il est **verrouillé pour un profil vérifié** (passage par le support).
- **Anciens comptes** : invitation à compléter leurs informations (avec acceptation des politiques).

## 3. Administration
- **Utilisateurs / Agences** : chaque compte avec son nom complet et son contact ; pour une agence, son **responsable**. Fiche complète (identité, sexe, date de naissance et âge, téléphone, e-mail, identifiant de connexion, date d'acceptation des conditions). **Recherche par nom, e-mail ou téléphone**. **Export CSV**.
- **Statistiques** : section « Profil des utilisateurs » : répartition par **sexe**, **tranches d'âge**, **mode de connexion** (e-mail / téléphone), particuliers / agences, comptes sans informations.

## 4. Recommandations intelligentes, enregistrées dans la base
Collections créées pour **chaque compte** : `userInterests` (ce qu'il aime, retient et refuse) et `recommendations` (les recommandations calculées).
- **Ce qui est collecté** : annonces ouvertes, aimées, enregistrées, partagées ou discutées ; profils suivis et visités ; recherches ; avis donnés ; **préférences** déclarées (types de biens, objectif, quartiers, mots-clés) ; refus (« **Pas intéressé** »).
- **Intelligence** : concepts immobiliers (un « studio » aimé fait remonter les « appartements », une « villa » les « maisons »), poids qui diminuent avec le temps, préférences, affinité avec l'annonceur, annonceurs suivis, **annonceurs suivis par vos abonnements**, popularité, qualité (photos), pénalité pour ce qui est refusé ou déjà vu, **diversité** (pas dix annonces du même annonceur) et exploration des annonces toutes neuves. Chaque annonce affiche **la raison** de la recommandation.
- Mêmes bases pour les **profils à suivre** (avec raison) et les **recherches suggérées**.
- **Page « Mes préférences »** (`preferences.html`, depuis Confidentialité) : choix, « ce qu'Imova a retenu », recalcul, tout effacer.
- **Contrôle** : Confidentialité → Recommandations : désactiver la personnalisation (plus rien n'est retenu) et **effacer les données** de recommandation.
- **Autre appareil** : le profil est retrouvé dans la base.

## À faire (détails dans `GUIDE-FIREBASE.md`, A11 ter)
1. **Publier `firestore.rules`**. 2. Rien à changer dans Authentication. 3. Aucun nouvel index.

## Tests à faire
1. Crée un compte **particulier** par e-mail, un autre par **téléphone**, une **agence** ; vérifie la page de bienvenue puis la connexion.
2. Menu → Confidentialité : modifie tes informations personnelles ; essaie de changer deux fois ton prénom (le 2e est bloqué).
3. En administrateur : Administration → Utilisateurs (recherche par e-mail et par téléphone, fiche, export CSV), Agences, Statistiques.
4. Préférences : choisis « Appartement », « Location », « Gombe », ouvre l'accueil ; aime et enregistre quelques annonces, suis une agence, utilise « Pas intéressé » (menu ⋮ d'une annonce) et regarde l'évolution.

## À savoir honnêtement
- **Téléphone sans SMS** : le numéro sert d'identifiant mais n'est pas vérifié, et un mot de passe oublié ne peut pas être réinitialisé pour ces comptes (pas d'e-mail). L'inscription par e-mail est recommandée.
- **Les recommandations sont calculées par l'application elle-même** (pas par un serveur : cela demanderait des fonctions payantes), puis enregistrées dans le compte. Elles ne tiennent pas compte des goûts des **autres** utilisateurs (leurs J'aime et favoris sont privés).
- Après la création du compte, la personne est **déconnectée** (page de bienvenue puis connexion, comme demandé).
- Le texte de `policy.html` est **provisoire** : à valider juridiquement.
- Les règles Firestore de cette étape n'ont pas pu être exécutées sur un vrai projet (testées avec un faux Firebase : 89 vérifications sur cette étape, plus un chargement de toutes les pages sans erreur). Si une action affiche « Permission refusée », envoie-moi le message exact. Mes anciens scripts de test ont été perdus lors d'une réinitialisation de mon environnement : les étapes précédentes n'ont été revérifiées que par ce chargement de toutes les pages et le parcours messagerie, notifications, tableau de bord, badge et administration.
