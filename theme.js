/* Imova : applique le thème (clair ou sombre) AVANT l'affichage de la page, pour éviter un flash.
   À charger dans le <head> de chaque page, sans "type=module". */
(function () {
  try {
    var t = localStorage.getItem('imova-theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
