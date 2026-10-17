// Imova — app-config.js : réglages de l'application (à remplir une seule fois).
// SUPPORT_UID : identifiant (UID) du compte « Support Imova » qui répond aux demandes d'aide.
// Comment l'obtenir : crée un compte Imova pour le support (par exemple « Support Imova »), puis dans la console Firebase,
// Authentication → Utilisateurs, copie la colonne « UID utilisateur » de ce compte et colle-la ci-dessous.
export const SUPPORT_UID = 'MlnFm4TV1cRpqwWudK1KxhlP1nq1';

export const supportReady = !!SUPPORT_UID && !String(SUPPORT_UID).startsWith('VOTRE_');
