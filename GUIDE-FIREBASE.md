# Imova — Guide complet : Firebase et Cloudinary, pas à pas

Les écrans de Google et de Cloudinary changent de temps en temps : si un libellé est légèrement différent, cherche le mot proche. Sur téléphone, ouvre la console dans Chrome et active **Version pour ordinateur** (menu ⋮) : c'est plus lisible.

Tout ce guide utilise des offres **gratuites**. Aucune carte bancaire n'est demandée.

---

## PARTIE A — Firebase

### A1. Créer ton compte et ton projet
1. Il te faut un **compte Google** (Gmail). Active la validation en deux étapes sur ce compte : c'est lui qui possédera tout le projet.
2. Va sur **console.firebase.google.com** et connecte-toi.
3. Touche **Créer un projet** (ou « Add project »).
4. **Nom du projet** : `imova`. Google génère un identifiant unique (ex. `imova-a1b2c`). Il **ne pourra plus être changé**, note-le.
5. Accepte les conditions → **Continuer**.
6. **Google Analytics** : désactive-le (inutile pour l'instant) → **Créer le projet** → attends → **Continuer**.

Tu es automatiquement sur le plan **Spark** (gratuit). **Ne passe jamais au plan Blaze** si tu veux rester sans facturation.

### A2. Enregistrer l'application Web et récupérer la configuration
1. Sur la page d'accueil du projet, touche l'icône **Web** `</>` (« Ajouter une application »).
2. **Surnom de l'application** : `imova-web`. **Ne coche pas** « Firebase Hosting » (on utilise Netlify). Touche **Enregistrer l'application**.
3. Un bloc de code s'affiche avec `const firebaseConfig = { ... }`. Garde-le ouvert (ou retrouve-le plus tard : **roue dentée → Paramètres du projet → Vos applications → imova-web → Configuration**).
4. Dans GitHub, ouvre `firebase-config.js` (crayon) et remplace :

| Dans `firebase-config.js` | Valeur à copier depuis la console |
|---|---|
| `apiKey` | `apiKey` |
| `authDomain` | `authDomain` |
| `projectId` | `projectId` |
| `appId` | `appId` |

5. **Commit changes**. Ces valeurs ne sont pas secrètes : la sécurité vient des règles Firestore (A6) et de la restriction de la clé (A9).

### A3. Activer la connexion par e-mail (Authentication)
1. Menu de gauche → **Build** (ou **Créer**) → **Authentication** → **Commencer**.
2. Onglet **Méthode de connexion** (Sign-in method) → **Adresse e-mail / Mot de passe**.
3. Active **uniquement le premier interrupteur** (« Adresse e-mail/Mot de passe »). Laisse « Lien envoyé par e-mail » désactivé.
4. **Enregistrer**.

### A4. Autoriser ton site (domaines autorisés)
1. Authentication → **Paramètres** → **Domaines autorisés** (Authorized domains).
2. **Ajouter un domaine** : l'adresse de ton site Netlify, sans `https://`, par exemple `imova.netlify.app`. Ajoute plus tard ton nom de domaine personnalisé.
3. `localhost` est déjà dans la liste.

Sans cela, la connexion échoue avec « unauthorized-domain ».

### A5. Mettre l'e-mail de réinitialisation en français
1. Authentication → **Modèles** (Templates) → **Réinitialisation du mot de passe** → icône crayon.
2. **Nom de l'expéditeur** : `Imova`. Touche **Langue du modèle** (en bas ou en haut du modèle) → **Français**.
3. **Enregistrer**.

### A6. Créer la base de données Firestore
1. **Build → Firestore Database → Créer une base de données**.
2. **Édition** : **Standard**.
3. **ID de la base** : laisse `(default)`.
4. **Emplacement** : choisis une région proche de tes utilisateurs. Si la liste propose **africa-south1 (Johannesburg)**, c'est la plus proche de la RDC ; sinon prends une région **europe-west**. **Ce choix est définitif.**
5. **Mode de démarrage** : choisis **Mode production**. **Jamais le mode test** : il laisse la base ouverte à tout le monde.
6. **Créer**.

### A7. Publier les règles de sécurité
1. Firestore Database → onglet **Règles**.
2. Efface tout le contenu, colle **tout** le contenu du fichier `firestore.rules` de ce zip.
3. Touche **Publier**.
4. Si un message rouge apparaît (erreur de syntaxe), copie-le exactement et envoie-le-moi.

À refaire à chaque nouvelle étape : je te fournirai un `firestore.rules` à jour.

### A8. Créer l'index des publications
La page profil (onglet Publication) affiche les annonces d'un auteur. Elle cherche « les annonces d'un auteur, les plus récentes d'abord ». Firestore exige un index pour cela.
1. Firestore Database → onglet **Index** → **Composite** → **Ajouter un index**.
2. **ID de la collection** : `properties`.
3. **Champs** : `authorId` en **Croissant**, puis `createdAt` en **Décroissant**.
4. **Portée de la requête** : **Collection**. → **Créer**.
5. Attends que l'état passe à **Activé** (quelques minutes).

### A8 bis. Créer l'index des statistiques (tableau de bord)
Le tableau de bord compte les vues, visites et conversations par période : Firestore demande un index.
1. Firestore Database → **Index** → **Composite** → **Ajouter un index**.
2. **ID de la collection** : `events`. **Champs** : `ownerId` Croissant, `type` Croissant, `createdAt` Croissant. **Portée** : Collection → **Créer**.
3. Attends l'état **Activé**. (Si tu l'oublies, le tableau de bord affiche un message et la console du navigateur donne un lien qui crée l'index en un clic.)

Astuce : si tu oublies, ouvre l'onglet Publication d'un profil : la console du navigateur affiche un lien qui crée l'index en un clic.

### A9. Protéger ta clé d'API (recommandé)
1. Va sur **console.cloud.google.com**, sélectionne le projet `imova` (en haut).
2. Menu → **API et services** → **Identifiants**.
3. Ouvre la clé nommée **Browser key (auto created by Firebase)** (clé de navigateur).
4. **Restrictions relatives aux applications** → **Sites Web** (référents HTTP) → **Ajouter** : `https://TON-SITE.netlify.app/*` (et plus tard `https://ton-domaine.com/*`).
5. **Enregistrer**. Ne touche pas aux restrictions d'API si tu n'es pas sûr.

Si l'application affiche « API key not valid » ou « referrer blocked », vérifie l'adresse saisie ici.

### A10. Surveiller l'usage (gratuit mais limité)
Firestore Database → onglet **Utilisation** (Usage). Plan gratuit Spark : **50 000 lectures, 20 000 écritures et 20 000 suppressions par jour, 1 Go de stockage**. Au-delà, les opérations sont refusées jusqu'au lendemain : consulte cet écran de temps en temps.

### A11. Créer le compte administrateur (propriétaire)
1. Crée un compte Imova pour l'administrateur (inscription normale dans l'application). Tu peux utiliser **ton propre compte**.
2. Console Firebase → **Authentication → Utilisateurs** : copie la colonne **UID utilisateur** de ce compte.
3. Firestore Database → **Démarrer une collection** → ID de la collection : `admins`.
4. **ID du document** : colle l'UID. Un seul champ : `role` (type **string**) = `owner`. **Enregistrer**.
5. Dans l'application : **Menu → Administration** apparaît pour ce compte.

**Les rôles** (`role`) :
- `owner` (propriétaire) : tout, plus les réglages de la plateforme et la gestion de l'équipe ;
- `admin` (administrateur) : signalements, annonces, modération, **vérifications de badge, utilisateurs, agences, statistiques** ;
- `moderator` (modérateur) : signalements, modération et annonces (masquer, supprimer, avis).
Ensuite, le propriétaire ajoute ou retire des membres lui-même dans **Administration → Paramètres → Équipe** (il suffit de l'UID du compte).

**Compte « Support Imova »** (aide et demandes de badge) : le plus simple est d'utiliser **le même compte que l'administrateur** : copie son UID dans `app-config.js` (`SUPPORT_UID`). Les demandes arrivent alors dans ses messages, et ses décisions (badge accordé ou refusé) partent depuis ce même compte.

### A12. Bonnes pratiques
- Ne passe **jamais** Firestore en mode test, ne publie jamais de clé secrète.
- Garde la validation en deux étapes sur le compte Google propriétaire.
- Ne partage pas l'accès à la console, sauf à une personne de confiance (Paramètres du projet → Utilisateurs et autorisations).

---

## PARTIE B — Cloudinary (photos de profil, bannières, photos et vidéos des annonces)

### B1. Créer le compte
1. Va sur **cloudinary.com** → **Sign up for free**. Utilise une adresse e-mail que tu consultes, confirme-la.
2. Choisis l'usage « développeur » si on te le demande.

### B2. Récupérer le « cloud name »
Tableau de bord (Dashboard) ou **Settings → API Keys / Product Environment Credentials** : note le **Cloud name** (ex. `dxyz123abc`).
**Ne copie jamais le « API secret »** dans le code.

### B3. Créer le « preset d'envoi non signé »
1. **Settings** (roue dentée) → **Upload** → **Upload presets** → **Add upload preset**.
2. **Signing mode** : **Unsigned**.
3. **Upload preset name** : `imova_unsigned` (ou autre).
4. **Folder** : `imova`.
5. Si l'option existe dans ton compte (onglet Upload control / Advanced) : limite les **formats autorisés** à `jpg, png, webp, mp4, webm, mov, m4a, ogg, mp3, wav` (les messages vocaux sont envoyés en `webm` ou `mp4`) (les **vidéos** doivent être acceptées, sinon la publication d'une annonce avec vidéo échoue) et active un nom de fichier unique. **Pour les documents (PDF, Word...) activez aussi « Use filename »** (utiliser le nom du fichier), afin que le document garde son nom et son extension ; autorisez les formats `pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv, odt, ods, odp, rtf`.
6. **Save**.

### B4. Remplir la configuration
Dans `firebase-config.js`, remplace :

| Champ | Valeur |
|---|---|
| `cloudName` | ton cloud name |
| `uploadPreset` | `imova_unsigned` (le nom exact du preset) |

### B5. Vérifier
Sur ton profil, touche l'icône appareil photo : après l'envoi, l'image apparaît, et elle est visible dans Cloudinary → **Media Library** → dossier `imova`.

---

## PARTIE C — Tester que tout est bien relié
1. Ouvre ton site : plus de bandeau jaune « Firebase non configuré ».
2. Crée un compte : Firebase → Authentication → **Utilisateurs** montre l'e-mail ; Firestore → `users` montre le profil.
3. Photo de profil : l'envoi réussit.
4. Avec un deuxième compte : suis le premier, donne un avis : les nombres changent sur le profil.

## PARTIE D — Messages d'erreur fréquents

| Message / symptôme | Cause | Solution |
|---|---|---|
| « La connexion par e-mail n'est pas activée » (`operation-not-allowed`) | A3 non fait | Activer Adresse e-mail/Mot de passe |
| `auth/unauthorized-domain` | Site absent des domaines autorisés | A4 |
| « Permission refusée… » (`permission-denied`) | Règles non publiées ou ancienne version | A7 |
| « Un index Firestore est nécessaire » (`failed-precondition`) | Index manquant | A8 |
| « Le profil n'a pas pu être créé » | Règles non publiées | A7 |
| « API key not valid » / referrer | Clé mal copiée ou mal restreinte | A2, A9 |
| Bandeau « Firebase n'est pas encore configuré » | Une valeur « VOTRE_... » reste dans `firebase-config.js` | A2 |
| « Cloudinary n'est pas encore configuré » | B4 non fait | B4 |
| L'envoi d'image échoue | Preset non « Unsigned », ou nom différent | B3, B4 |


---

## PARTIE E — Le compte « Support Imova » (Aide et assistance)
1. Crée un compte Imova pour le support (type **Agence**, nom « Support Imova »).
2. Console Firebase → **Authentication → Utilisateurs** : copie la colonne **UID utilisateur** de ce compte.
3. Dans GitHub, ouvre `app-config.js`, remplace `VOTRE_UID_SUPPORT` par cet UID → **Commit**.
4. Les demandes envoyées depuis **Menu → Aide et assistance** arrivent dans les **messages** de ce compte. Connecte-toi avec lui pour répondre.
