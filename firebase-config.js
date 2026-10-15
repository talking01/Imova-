// Imova — firebase-config.js : à remplir UNE SEULE FOIS avec les valeurs de ton projet Firebase.
// Console Firebase → Paramètres du projet (roue dentée) → Vos applications → application Web → Configuration.
// Ces valeurs ne sont pas secrètes : la sécurité repose sur les règles Firestore (firestore.rules).
// Ne mets JAMAIS ici une clé secrète ou le « API secret » de Cloudinary.
export const firebaseConfig = {
  apiKey: "AIzaSyAim3vquOjl1O9O45SsNRuVC7CYFleUYdk",
  authDomain: "imova-8e285.firebaseapp.com",
  projectId: "imova-8e285",
  appId: "1:105753954633:web:ec5906a7011cff7f34b298"
};

// Cloudinary (utilisé à partir de la Phase 3, pour publier des images et vidéos)
export const cloudinaryConfig = {
  cloudName: "dshx7kahj",
  uploadPreset: "Imova001"
};

export const isConfigured = Object.values(firebaseConfig).every(
  (v) => v && !String(v).startsWith('VOTRE_')
);
