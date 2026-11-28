"use strict";
/* Mon Meal Prep - interface.
   Le site ne decide rien : il affiche l'etat envoye par l'appli (/api/etat) et lui
   transmet tes actions. L'adresse (#/semaine, #/cuisine/<plat>…) dit ou tu es :
   le bouton Retour du telephone fonctionne et une page se partage ou se recharge. */

const ONGLETS = [
  { id: "semaine", nom: "Semaine", icone: "calendar-blank" },
  { id: "catalogue", nom: "Catalogue", icone: "star" },
  { id: "avancement", nom: "Avancement", icone: "chart-bar" },
  { id: "suivi", nom: "Suivi", icone: "chart-line" },
  { id: "plus", nom: "Plus", icone: "dots-three-outline" },
];
const DANS_PLUS = ["plus", "courses", "cuisine", "historique", "budget", "vitamines", "profil", "profils", "nouveau", "stock", "journal", "reglages", "conso", "famille"];
// Mode flemmard : plus d'onglet « Plus » ; les vitamines ont leur onglet, « Profil » ouvre sa page (Taha, 19/11/2026).
const ONGLETS_FLEMMARD = [
  { id: "semaine", nom: "Jour", icone: "calendar-blank" },
  { id: "catalogue", nom: "Catalogue", icone: "couverts" },
  { id: "stock", nom: "Stock", icone: "package" },
  { id: "avancement", nom: "Avancement", icone: "chart-bar" },
  { id: "vitamines", nom: "Vitamines", icone: "orange" },
  { id: "suivi", nom: "Suivi", icone: "chart-line" },
];
const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const ORDRE = { plat: 0, petitdej: 1, collation: 2, fruit: 3 };
const QUAND = { matin: "Matin", midi: "Midi", soir: "Soir", collation: "Collation", fruit: "Fruit" };

// Sur le telephone (iPhone…), une mise en page compacte : l'ecran du jour en liste (Taha, 19/11/2026).
const PETIT = matchMedia("(max-width: 899px)");
let E = null;            // etat envoye par l'appli
let BASE = null;         // recettes (prix, vitamines, photo) : demandees a part, une fois par version
let journalPlus = [];    // entrees du journal chargees avec « Voir la suite »
let journalSuite = null; // reste-t-il des entrees plus anciennes ?
let minuteur = null;     // suivi du panier en cours
let apresRendu = [];     // graphiques a tracer une fois la vue posee dans la page
let filtreStock = "";
let filtreCatalogue = "";
const filtresCat = { cats: new Set(), avis: "", regimes: new Set(), atouts: new Set(), proteines: new Set(), origines: new Set(), prix: 0, temps: 0,
                     stock: false, ings: new Set(), tri: "nom", sens: 1, debut: 0, groupe: "cat", ouvert: matchMedia("(min-width: 900px)").matches };   // filtres du catalogue

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nombre = (n, d = 0) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const euros = n => new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" }).format(n);
const dateLongue = iso => new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const dateHeure = iso => new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const recette = id => E.recettes.find(r => r.id === id);
const propre = s => String(s).replace(/\s[\u2014\u2013]\s/g, " : ");     // anciens textes du journal
const dose = q => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: q < 10 ? 2 : 0 }).format(q);   // vitamines
const estRepas = r => r && r.cat !== "fruit" && r.cat !== "rien";                             // les fruits s'ajoutent, ils ne se choisissent pas
// Une semaine commence le jour `debut` (le lendemain du jour ou elle est composee) ; les anciennes, sans date, un lundi.
const debutDe = s => s && s.debut ? new Date(s.debut + "T00:00:00") : null;
const rangDuJour = (s = E && E.semaine) => { const d = debutDe(s); return d ? Math.round((new Date().setHours(0, 0, 0, 0) - d) / 864e5) : (new Date().getDay() + 6) % 7; };
const aujourdhui = () => Math.min(6, Math.max(0, rangDuJour()));           // le jour a montrer : jamais hors de la semaine
const court = j => j.jour.slice(0, 3);
const periode = s => { const d = debutDe(s); if (!d) return ""; const f = new Date(+d + 6 * 864e5), jj = x => x.getDate() + (x.getDate() === 1 ? "er" : "");
  const mois = x => new Intl.DateTimeFormat(LOCALE, { month: "short" }).format(x);
  return `du ${jj(d)}${d.getMonth() === f.getMonth() ? "" : " " + mois(d)} au ${jj(f)} ${mois(f)}`; };
const fait = (s, jour, id) => (s.prepares || {})[`${jour}|${id}`];       // cette recette, ce jour-la, est cuisinee
const TACTILE = matchMedia("(pointer: coarse)");           // téléphone : pas de focus posé par le code
// showModal() active le premier champ d'une fenêtre : sur téléphone on le relâche, le clavier s'ouvrira au toucher.
if (TACTILE.matches && window.HTMLDialogElement) {
  const montrer = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () {
    montrer.call(this);
    const a = document.activeElement;
    if (a && this.contains(a) && a.matches("input, textarea, select")) a.blur();
  };
}
const icone = nom => `<span class="ic" data-i="${nom}" aria-hidden="true">${ICONES[nom] || ""}</span>`;
/* ------------------------------------------------------------ langues (Taha, 23/11/2026) */
// La page est écrite en français. Dans une autre langue, chaque texte affiché (et placeholder, aria-label, title, alt)
// est remplacé par sa traduction, prise dans i18n/<langue>.json (fait par outils/i18n_traduire.py) ; un texte avec
// des valeurs se reconnaît par motif (« {0} plats avec ça »), et ses valeurs se traduisent aussi (un nom de plat).
// La langue : celle choisie (Réglages, ou l'écran de connexion), sinon celle du téléphone ; l'arabe se lit de droite à gauche.
const LANGUES = [["fr", "Français"], ["en", "English"], ["ar", "العربية"], ["es", "Español"]];
const LANGUE = (() => {
  try { const l = localStorage.getItem("mp-langue"); if (LANGUES.some(x => x[0] === l)) return l; } catch (e) {}
  const n = String(navigator.language || "fr").slice(0, 2).toLowerCase();
  return LANGUES.some(x => x[0] === n) ? n : "en";
})();
const LOCALE = { fr: "fr-FR", en: "en-GB", ar: "ar-MA", es: "es-ES" }[LANGUE];
// Le choix de la langue : les noms des langues restent dans leur langue (pas traduits).
const choixLangue = (libelle = "") => `<label class="langue-choix" data-sans-trad>${icone("globe")}${libelle ? `<span>${libelle}</span>` : ""}
  <select data-langue aria-label="Langue · Language · اللغة · Idioma">${LANGUES.map(([c, n]) => `<option value="${c}"${c === LANGUE ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
document.addEventListener("change", ev => { if (ev.target.matches && ev.target.matches("[data-langue]")) changerLangue(ev.target.value); });
function changerLangue(l) {
  try { localStorage.setItem("mp-langue", l); } catch (e) {}
  location.reload();
}
const I18N = { exact: new Map(), motifs: new Map(), pret: LANGUE === "fr" };
document.documentElement.lang = LANGUE;
document.documentElement.dir = LANGUE === "ar" ? "rtl" : "ltr";
const i18nPropre = t => t.replace(/\s+/g, " ").trim();
function i18nTexte(t, profondeur = 0) {
  const v = I18N.exact.get(t);
  if (v != null) return v;
  const mots = (t.toLowerCase().match(/[a-zà-ÿœ']{3,}/g) || []);
  let mieux = null;
  for (const m of new Set(mots)) for (const x of I18N.motifs.get(m) || []) {
    if (mieux && x.poids <= mieux.x.poids) continue;
    const r = x.re.exec(t);
    if (r) mieux = { x, r };
  }
  if (!mieux) return i18nMorceaux(t);
  // Un modèle trop large (« {0} soir », « kcal {0} ») avalerait une phrase entière et la laisserait en français
  // (Taha, 27/11/2026 : « Lunch, cuisiné une fois pour midi et evening ») : on traduit alors morceau par morceau.
  if (mieux.r.slice(1).some(g => g && g.length > 14 && /[a-zà-ÿœ]{3,}/i.test(g) && !I18N.exact.has(i18nPropre(g)))) {
    const m = i18nMorceaux(t);
    if (m != null) return m;
  }
  // Une valeur elle-même traduisible (« 15 aliments » dans « {0} sans vitamines ») se traduit à son tour (27/11/2026).
  return mieux.x.v.replace(/\{(\d+)\}/g, (_, i) => {
    const g = mieux.r[Number(i) + 1] ?? "", tg = i18nPropre(g);
    if (!tg) return g;
    if (I18N.exact.has(tg)) return g.replace(tg, I18N.exact.get(tg));
    const sous = profondeur < 2 && tg.length < 80 && /[a-zà-ÿœ]{3,}/i.test(tg) ? i18nTexte(tg, profondeur + 1) : null;
    return sous != null && sous !== tg ? g.replace(tg, sous) : g;
  });
}
// Un libellé fait de plusieurs morceaux (« Midi, cuisiné une fois pour midi et soir », « Collation · fixe ») : chaque
// morceau se traduit s'il est connu ; null si aucun ne l'est.
function i18nMorceaux(t) {
  const parts = t.split(/( · |, | : | — | \/ )/);
  if (parts.length < 3) return null;
  let un = false;
  const out = parts.map((x, i) => {
    if (i % 2) return x;
    const v = I18N.exact.get(x) ?? I18N.exact.get(x.charAt(0).toUpperCase() + x.slice(1));
    if (v != null) { un = true; return i ? v.charAt(0).toLowerCase() + v.slice(1) : v; }
    return x;
  });
  return un ? out.join("") : null;
}
const I18N_ATTRS = ["placeholder", "aria-label", "title", "alt"];
function i18nNoeud(n) {
  if (n.nodeType === 3) {
    const brut = n.nodeValue;
    if (!brut || !/[A-Za-zÀ-ÿ]/.test(brut)) return;
    const p = n.parentNode;
    if (!p || p.nodeName === "SCRIPT" || p.nodeName === "STYLE" || p.nodeName === "TEXTAREA" || (p.closest && p.closest("[data-sans-trad]"))) return;
    const t = i18nPropre(brut), v = i18nTexte(t);
    if (v != null && v !== t) { const m = brut.match(/^\s*/)[0], f = brut.match(/\s*$/)[0]; n.nodeValue = m + v + f; }
    return;
  }
  if (n.nodeType !== 1 || n.closest("[data-sans-trad]")) return;
  for (const a of I18N_ATTRS) if (n.hasAttribute(a)) {
    const t = i18nPropre(n.getAttribute(a)), v = t && i18nTexte(t);
    if (v != null && v !== t) n.setAttribute(a, v);
  }
}
function i18nTout(racine) {
  if (I18N.pret !== true || LANGUE === "fr" || !racine) return;
  if (racine.nodeType === 3) return i18nNoeud(racine);
  if (racine.nodeType !== 1) return;
  i18nNoeud(racine);
  const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) i18nNoeud(n);
}
(async () => {
  if (LANGUE === "fr") return;
  try {
    const r = await fetch(`i18n/${LANGUE}.json`, { cache: "no-cache" });
    if (!r.ok) throw 0;
    const d = await r.json();
    for (const [k, v] of Object.entries(d)) {
      if (!/\{\d+\}/.test(k)) { I18N.exact.set(k, v); continue; }
      const statiques = k.split(/\{\d+\}/), ordre = [...k.matchAll(/\{(\d+)\}/g)].map(m => Number(m[1]));
      // Les groupes dans l'ordre des marques du texte : on les renumérote dans l'ordre {0}, {1}…
      let src = "^" + statiques.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("([\\s\\S]*?)") + "$";
      const vv = v.replace(/\{(\d+)\}/g, (_, i) => `{${ordre.indexOf(Number(i))}}`);
      const poids = statiques.join("").length;
      const long = (statiques.join(" ").toLowerCase().match(/[a-zà-ÿœ']{3,}/g) || []).sort((a, b) => b.length - a.length)[0];
      if (!long || poids < 3) continue;
      const m = { re: new RegExp(src), v: vv, poids };
      I18N.motifs.set(long, [...(I18N.motifs.get(long) || []), m]);
    }
  } catch (e) { I18N.pret = true; return; }
  I18N.pret = true;
  i18nTout(document.body);
  document.title = i18nTexte(document.title) || document.title;
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === "characterData") i18nNoeud(m.target);
      else if (m.type === "attributes") i18nNoeud(m.target);
      else m.addedNodes.forEach(i18nTout);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
})();
// Ce que fait l'IA (Claude) se voit dans les champs (Taha, 20/11/2026 : « on n'a pas l'impression que c'est de l'IA »).
const BADGE_IA = `<span class="badge-ia">${icone("sparkle")}IA</span>`;

function quantite(q, u) {
  if (u === "qs") return "au goût";
  // On ne pese pas au demi-gramme : grammes et millilitres entiers, cuilleres au demi.
  if (u === "g" || u === "ml") q = q >= 10 ? Math.round(q) : Math.round(q * 10) / 10;
  else if (u.startsWith("c.à")) q = Math.max(0.5, Math.round(q * 2) / 2);
  const n = nombre(q, Number.isInteger(q) ? 0 : (q < 10 ? 2 : 1)).replace(/,00$/, "").replace(/(,\d)0$/, "$1");
  return `${n} ${u}${(u === "pièce" || u === "gousse") && q > 1 ? "s" : ""}`;
}
function photo(r, largeur, classe = "", alt = "") {
  if (!r.photo) return `<div class="photo vide ${classe}">${icone("image")}<span>Photo à venir</span></div>`;
  const h = classe.includes("carre") ? largeur : Math.round(largeur * (classe.includes("grande") ? 10 / 16 : 3 / 4));
  return `<div class="photo ${classe}"><img src="${urlPhoto(r, largeur)}" alt="${esc(alt)}" width="${largeur}" height="${h}"
    ${classe.includes("grande") ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>`;
}

// Les ingrédients d'un plat : en quelques mots sous son nom, ou en liste avec les quantités d'une assiette
// (Taha, 21/11/2026 : « quand je choisis un plat, voir les ingrédients »).
const ingredientsCourts = r => (r && r.ing ? r.ing.filter(i => i.u !== "qs").map(i => i.n) : []).join(", ");
function listeIngredients(r, t = 1) {
  const ing = (r && r.ing) || [];
  if (!ing.length) return `<p class="petit discret">Ingrédients inconnus.</p>`;
  return `<ul class="lignes ing-assiette">${ing.map(i => `<li><span>${esc(i.n)}</span><span class="q chiffres">${i.u === "qs" ? "au goût" : quantite(Math.round(i.q * t * 10) / 10, i.u)}</span></li>`).join("")}</ul>`;
}

/* ------------------------------------------------------------ messages, confirmation */
function dire(texte) {
  const t = $("toast");
  t.textContent = texte;
  t.classList.add("visible");
  clearTimeout(dire.t);
  dire.t = setTimeout(() => t.classList.remove("visible"), 3200);
}
function confirmer({ titre, texte, oui, non = "Annuler" }) {
  return new Promise(resoudre => {
    const d = $("dialogue");
    d.innerHTML = `<h2 id="dialogueTitre">${esc(titre)}</h2><p>${esc(texte)}</p>
      <div class="actions"><button class="bouton second" value="non">${esc(non)}</button>
      <button class="bouton" value="oui">${esc(oui)}</button></div>`;
    d.querySelectorAll("button").forEach(b => b.addEventListener("click", () => d.close(b.value)));
    // La fermeture de la fenêtre d'avant (un aperçu qu'on vient de valider) arrive parfois APRÈS cette ouverture : elle
    // ne doit pas répondre à la place de la personne (27/11/2026 : « Toute la famille » était pris pour « Seulement moi »).
    const fin = () => { if (d.open) return; d.removeEventListener("close", fin); resoudre(d.returnValue === "oui"); };
    d.addEventListener("close", fin);
    d.returnValue = "non";
    if (!d.open) d.showModal();
  });
}

// Mode famille (Taha, 23/11/2026) : un plat changé, ajouté ou retiré vaut pour soi seul, ou pour toute la famille
// (chacun à ses quantités). Rien à demander hors famille. → {} ou { famille: { date, moments } } à joindre à la requête.
const enFamille = () => typeof M !== "undefined" && !!M.famille;
// Quelqu'un demande à entrer dans la famille (Taha, 27/11/2026 : le créateur ne le voyait jamais) : une alerte en haut
// du jour avec Accepter / Refuser, un point sur Profil, et « N demandes » sur la ligne Ma famille.
const demandesFamille = () => {
  const f = typeof M !== "undefined" && M.familleEtat;
  return f && f.statut === "membre" && f.famille && f.famille.createur ? (f.membres || []).filter(m => m.statut === "attente") : [];
};
// L'objectif qui s'ajuste chaque semaine (Taha, 28/11/2026) : la phrase de la décision, écrite ici (et donc traduite)
// d'après son code et ses chiffres (moteur : decision_hebdo, reglages_site.json « ajustement_auto »).
const signeKg = v => `${v > 0 ? "+" : v < 0 ? "−" : ""}${virgule(Math.abs(Math.round((v || 0) * 10) / 10))}`;
function texteObjectifSemaine(a) {
  const c = a.chiffres || {}, p = signeKg(c.pente), t = virgule(Math.abs(Math.round((c.taille || 0) * 10) / 10));
  const d = `${(c.delta || 0) > 0 ? "+" : (c.delta || 0) < 0 ? "−" : ""}${nombre(Math.abs(c.delta || 0))}`;
  return ({
    debut: "Les 3 premières semaines, l'appli observe : au début, le poids bouge surtout avec l'eau.",
    attente: "Ton objectif a changé il y a moins de 3 semaines : l'appli attend d'en voir l'effet.",
    pesees: "Pèse-toi au moins 2 fois par semaine : sans ça, l'appli ne peut pas régler tes calories.",
    journees: "Coche ce que tu manges au moins 10 jours sur 3 semaines : l'appli règle tes calories d'après ça.",
    trop_mange: `Tu as mangé en moyenne ${nombre(c.ecart || 0)} kcal de plus que prévu par jour : l'appli ne baisse pas l'objectif, essaie d'abord de le tenir.`,
    recompo: `Ton poids ne bouge pas (${p} kg par semaine) mais ton tour de taille a baissé de ${t} cm : tu perds du gras et tu prends du muscle. L'appli garde tes calories.`,
    baisse: `Ton poids n'a presque pas bougé en 3 semaines (${p} kg par semaine) alors que tu as mangé comme prévu : 100 kcal de moins par jour.`,
    trop_vite: `Tu perds plus de 1 % de ton poids par semaine (${p} kg par semaine) : 100 kcal de plus par jour, pour garder tes muscles.`,
    prise_lente: `Ton poids ne monte pas (${p} kg par semaine) : 100 kcal de plus par jour pour prendre du muscle.`,
    prise_rapide: `Tu prends plus de 0,5 % de ton poids par semaine (${p} kg par semaine) : 100 kcal de moins par jour, pour limiter le gras.`,
    monte: `Ton poids monte (${p} kg par semaine) : 100 kcal de moins par jour pour le garder.`,
    descend: `Ton poids baisse (${p} kg par semaine) : 100 kcal de plus par jour pour le garder.`,
    bien: `Ça avance comme prévu (${p} kg par semaine) : l'appli garde tes calories.`,
    borne: `L'appli a déjà ajusté tes calories de ${d} kcal par jour : au-delà, revois ton objectif dans Mes objectifs.`,
    annule: "Annulé : tes calories restent comme avant cette semaine.",
  })[a.code] || a.raison || "";
}
// La carte du lundi sur l'écran du jour (une fois ; « Annuler » si les calories ont bougé). Pas pour « debut » / « attente ».
function carteObjectifSemaine() {
  const a = E.reglages && E.reglages.ajustement_auto;
  if (!a || a.lu || !a.code || autreProfil() || E.reglages.auto_objectif === false || ["debut", "attente", "annule"].includes(a.code)) return "";
  const titre = a.pas < 0 ? "Objectif : 100 kcal de moins par jour" : a.pas > 0 ? "Objectif : 100 kcal de plus par jour" : "Ton objectif de la semaine";
  return `<div class="accueil-carte objectif-semaine" role="status"><p class="accueil-titre">${icone("chart-line")}<b>${titre}</b></p>
    <p class="petit">${texteObjectifSemaine(a)}</p>
    <div class="ligne-boutons">${a.pas ? `<button type="button" class="bouton second" data-action="objectifAnnuler">Annuler</button>` : ""}<button type="button" class="bouton" data-action="objectifLu">Compris</button></div></div>`;
}
function blocObjectifAuto() {
  if (!E.reglages || !enSuivi() || autreProfil()) return "";
  const r = E.reglages, a = r.ajustement_auto || {}, actif = r.auto_objectif !== false;
  return `<div class="objectif-auto"><label class="option"><input type="checkbox" data-action="objectifAuto"${actif ? " checked" : ""}>
      <span><b>Ajuster mes calories chaque semaine</b><small>D'après la tendance de ton poids sur 3 semaines et ce que tu as mangé : 100 kcal à la fois, 300 au plus.</small></span></label>
    ${actif && a.delta ? `<p class="petit">Ajustement en cours : <b>${a.delta > 0 ? "+" : "−"}${nombre(Math.abs(a.delta))} kcal par jour</b></p>` : ""}
    ${actif && a.code ? `<p class="petit discret">${texteObjectifSemaine(a)}</p>` : ""}</div>`;
}
// Premier jour d'un nouveau compte (Taha, 28/11/2026) : une carte, une seule fois, pour savoir quoi toucher.
// « accueil » est posé par la création du profil (web.creer_profil) ; « Compris » l'efface (/api/reglages).
function carteAccueil() {
  if (!E.reglages || !E.reglages.accueil || autreProfil()) return "";
  return `<div class="accueil-carte" role="status"><p class="accueil-titre">${icone("couverts")}<b>Bienvenue${E.profil && E.profil.nom ? ` ${esc(E.profil.nom)}` : ""} !</b></p>
    <ul><li>Touche un plat pour le voir, le changer ou le cocher quand tu l'as mangé.</li>
      <li>La case + ajoute ce que tu as mangé en plus.</li>
      <li>Suivi : ton poids et tes mesures.</li></ul>
    <button type="button" class="bouton" data-action="accueilVu">Compris</button></div>`;
}
function alerteFamille() {
  const a = demandesFamille();
  if (!a.length) return "";
  return `<div class="fam-alerte" role="status">${icone("users")}<span class="fam-alerte-txt">${a.length === 1
    ? `<b>${esc(a[0].identifiant)}</b> veut rejoindre ta famille` : `<b>${a.length} personnes</b> veulent rejoindre ta famille`}</span>
    ${a.length === 1 ? `<span class="fam-alerte-choix"><button type="button" class="bouton sobre" data-fam-alerte="${a[0].id}" data-oui="0">Refuser</button>
      <button type="button" class="bouton" data-fam-alerte="${a[0].id}" data-oui="1">Accepter</button></span>` : `<a class="bouton" href="#/famille">Voir</a>`}</div>`;
}
document.addEventListener("click", ev => {
  const b = ev.target.closest && ev.target.closest("[data-fam-alerte]");
  if (!b) return;
  b.disabled = true;
  famille("famille_repondre", { p_user: b.dataset.famAlerte, p_accepter: b.dataset.oui === "1" }, b.dataset.oui === "1" ? "Accepté dans la famille." : "Demande refusée.");
});
// Le statut de la famille a changé ailleurs (demande reçue, acceptée…) : l'écran suit, sauf pendant une saisie.
function familleChange() {
  const d = $("dialogue");
  if ((d && d.open) || document.body.classList.contains("clavier") || !E) return;
  rendre();
}

// ---------- Les profils de la famille sur ce téléphone (Taha, 27/11/2026 : « on peut changer de profil facilement
// sur un téléphone, ça donne les doses de tous les membres dans un seul téléphone ») ----------
// En haut du jour : « Tous » (les doses de chacun, plat par plat) puis un bouton par membre (ouvrir son profil).
const autreProfil = () => typeof M !== "undefined" && !!M.moi && M.uid !== M.moi.uid;
// Un autre membre qui a son propre téléphone : son poids, sa taille, son numéro restent à lui (27/11/2026). Ceux d'un
// membre sans téléphone se voient et se règlent : la famille les tient à jour pour ses doses.
const autreAvecTelephone = () => autreProfil() && !((membresDeLaFamille().find(m => m.id === M.uid) || {}).sans_telephone);
const membresDeLaFamille = () => typeof membresFamille === "function" ? membresFamille() : [];
const NOMS_FAMILLE = {};                                   // uid -> prénom, vu dans son profil
const nomMembre = m => {
  const nom = NOMS_FAMILLE[m.id] || (m.identifiant.charAt(0).toUpperCase() + m.identifiant.slice(1));
  const pareil = membresDeLaFamille().some(x => x.id !== m.id && NOMS_FAMILLE[x.id] === nom);
  return pareil && !m.moi ? `${nom} (${m.identifiant})` : nom;
};
let VUE_TOUS = false;
function choixProfils() {
  const membres = membresDeLaFamille();
  if (membres.length < 2) return "";
  if (E && E.profil) NOMS_FAMILLE[M.uid] = E.profil.nom;
  return `<nav class="fam-profils" aria-label="Profils de la famille">
    <button type="button" data-fam-tous${VUE_TOUS ? ' aria-current="true"' : ""}>${icone("users")}<span>Tous</span></button>
    ${membres.map(m => `<button type="button" data-fam-profil="${m.id}"${!VUE_TOUS && m.id === M.uid ? ' aria-current="true"' : ""}>
      <i class="av" aria-hidden="true">${esc(nomMembre(m).charAt(0))}</i><span>${esc(nomMembre(m))}</span></button>`).join("")}</nav>`;
}
document.addEventListener("click", async ev => {
  const t = ev.target.closest && ev.target.closest("[data-fam-profil], [data-fam-tous], [data-moi]");
  if (!t || typeof afficherProfil !== "function") return;
  if (t.hasAttribute("data-fam-tous")) { VUE_TOUS = true; if (route().vue !== "semaine") location.hash = "#/semaine"; return rendre(); }
  const uid = t.dataset.famProfil || (M.moi && M.moi.uid);
  VUE_TOUS = false;
  if (!uid || uid === M.uid) return rendre();
  t.classList.add("charge"); t.disabled = true;
  try {
    await afficherProfil(uid);
    if (t.dataset.famProfil && route().vue !== "semaine") location.hash = "#/semaine";
    dire(uid === M.moi.uid ? "Ton profil." : `Profil de ${E.profil.nom}.`);
  } catch (e) { dire(e.message || "Profil impossible à ouvrir."); rendre(); }
});

// Les doses de toute la famille pour un jour : chaque plat, la part de chacun (en grammes), le total à cuisiner et le
// détail des ingrédients. Calculées par le moteur de chaque membre, à ses quantités.
/* ------------------------------------------------------------ les courses de la famille */
// Taha, 28/11/2026 : depuis « Tous » (ou Courses, en famille), la liste pour TOUS les membres sur 3 ou 7 jours : ce qui
// n'est pas encore mangé (doses de chacun, `dosesFamille`), quantités additionnées, moins le stock commun, rangée par
// rayon ; « Mettre sur ma liste » l'envoie dans Ma liste (personnelle), pour cocher au magasin comme d'habitude.
const CF = { jours: 3, jeton: null };
const coursesFamillePossible = () => typeof dosesFamille === "function" && enFamille() && membresDeLaFamille().length > 1;
const isoDans = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const aAcheter = (q, u) => u === "g" || u === "ml" ? Math.max(10, Math.ceil(q / 10) * 10) : u === "pièce" ? Math.max(1, Math.ceil(q - 0.1)) : Math.max(0.5, Math.ceil(q * 2) / 2);
async function coursesFamille(jours = CF.jours) {
  const d = $("dialogue"), jeton = CF.jeton = {};
  CF.jours = jours;
  d.innerHTML = `<div class="feuille rp cf">
    <div class="rp-tete"><div><p class="rp-sur">Famille</p><h2 id="dialogueTitre">Les courses de la famille</h2></div>
      <button type="button" class="rp-fermer" data-cf="fermer" aria-label="Fermer">${icone("x")}</button></div>
    <div class="gouts cf-jours" role="group" aria-label="Pour combien de jours">${[3, 7].map(n =>
      `<button type="button" data-cf-jours="${n}" aria-pressed="${n === jours}">${n} jours</button>`).join("")}</div>
    <div id="cfCorps"><p class="petit discret" id="cfEtat" role="status">Je fais les comptes…</p></div></div>`;
  d.querySelector("[data-cf=fermer]").addEventListener("click", () => d.close("non"));
  d.querySelectorAll("[data-cf-jours]").forEach(b => b.addEventListener("click", () => coursesFamille(Number(b.dataset.cfJours))));
  if (!d.open) d.showModal();
  const besoins = new Map();
  for (let k = 0; k < jours; k++) {
    if (CF.jeton !== jeton || !d.open) return;
    if ($("cfEtat")) $("cfEtat").textContent = `Je fais les comptes : jour ${k + 1} sur ${jours}…`;
    let liste;
    try { liste = await dosesFamille(isoDans(k)); } catch (e) { liste = []; }
    for (const x of liste) for (const r of x.repas || []) {
      if (r.mange || (r.reste && k === 0)) continue;       // déjà mangé ; la part d'hier soir est déjà cuisinée
      for (const i of r.ing || []) {
        const cle = i.n + "|" + i.u, b = besoins.get(cle) || { nom: i.n, unite: i.u, q: 0, qui: new Set() };
        b.q += i.q; b.qui.add(nomMembre({ id: x.uid, identifiant: x.identifiant, moi: x.moi })); besoins.set(cle, b);
      }
    }
  }
  if (CF.jeton !== jeton || !d.open) return;
  const stock = new Map((E.stock || []).map(l => [l.nom + "|" + l.unite, l.quantite]));
  const rayonDe = {};
  E.recettes.forEach(r => (r.ing || []).forEach(i => { if (i.a != null) rayonDe[i.n] = i.a; }));
  Object.entries(E.ingredients_perso || {}).forEach(([n, v]) => { if (v && v.a != null && rayonDe[n] == null) rayonDe[n] = v.a; });
  const lignes = [...besoins.values()].map(b => ({ ...b, stock: stock.get(b.nom + "|" + b.unite) || 0 }))
    .map(b => ({ ...b, achat: b.q - b.stock > 0.05 ? aAcheter(b.q - b.stock, b.unite) : 0 })).filter(b => b.achat > 0);
  const parRayon = new Map();
  for (const l of lignes.sort((a, b) => a.nom.localeCompare(b.nom, "fr"))) {
    const g = (E.rayons || [])[rayonDe[l.nom] ?? 2] || "Autres";
    parRayon.set(g, [...(parRayon.get(g) || []), l]);
  }
  CF.lignes = lignes;
  $("cfCorps").innerHTML = !lignes.length ? `<p class="dujour" style="margin-top:12px"><strong>Rien à acheter.</strong> Le stock commun couvre les ${jours} prochains jours de tout le monde.</p>`
    : `<p class="petit discret cf-aide">Pour ${membresDeLaFamille().length} personnes, ce qui reste à manger, moins votre stock commun.</p>
    ${[...parRayon.entries()].map(([g, xs]) => `<section class="cf-rayon"><h3>${esc(g)}<small>${xs.length}</small></h3><ul>${xs.map(l => {
      const k = lignes.indexOf(l);
      return `<li><label><input type="checkbox" data-cf-ligne="${k}" checked><span class="cf-nom">${esc(l.nom)}<small class="discret">${esc([...l.qui].slice(0, 3).join(", "))}${l.stock > 0 ? ` · ${quantite(l.stock, l.unite)} en stock` : ""}</small></span>
        <b class="chiffres">${quantite(l.achat, l.unite)}</b></label></li>`; }).join("")}</ul></section>`).join("")}
    <button type="button" class="bouton large" data-cf="liste">${icone("shopping-cart-simple")}Mettre sur ma liste</button>`;
  const bouton = d.querySelector("[data-cf=liste]");
  if (bouton) bouton.addEventListener("click", async () => {
    const choisis = [...d.querySelectorAll("[data-cf-ligne]:checked")].map(i => CF.lignes[Number(i.dataset.cfLigne)]).slice(0, 100);
    if (!choisis.length) return dire("Coche au moins un produit.");
    bouton.disabled = true;
    const ok = await appel("/api/liste_courses/lot", { items: choisis.map(l => ({ nom: l.nom, quantite: l.achat, unite: l.unite, raison: `famille, ${jours} jours` })) });
    if (ok !== true) { bouton.disabled = false; return dire((ok && ok.erreur) || "Pas ajouté, réessaie."); }
    d.close("oui");
    location.hash = "#/stock?v=courses";
    dire(choisis.length > 1 ? `${choisis.length} produits sur ta liste de courses.` : "1 produit sur ta liste de courses.");
  });
}
const DOSES = {};                                          // date -> { etat, liste } ; refait quand l'état change
function chargerDoses(date) {
  if (DOSES[date] && DOSES[date].etat === E) return;
  const etat = E;
  DOSES[date] = { etat, liste: null };
  dosesFamille(date).then(liste => {
    if (DOSES[date] && DOSES[date].etat === etat) DOSES[date].liste = liste;
    if (VUE_TOUS && route().vue === "semaine") rendre();
  }).catch(e => { DOSES[date] = null; dire(e.message || "Doses impossibles à calculer."); });
}
function vueDoses(date) {
  const D = DOSES[date];
  if (!D || D.etat !== E || !D.liste) { chargerDoses(date); return `<div class="os doses-attente" aria-label="Calcul des doses"><i class="t"></i><i class="l"></i><i class="l"></i></div>`; }
  const liste = D.liste;
  liste.forEach(x => { if (x.nom && x.uid) NOMS_FAMILLE[x.uid] = x.nom; });
  const qui = x => nomMembre({ id: x.uid, identifiant: x.identifiant, moi: x.moi });
  const g = v => v >= 1000 ? `${virgule(Math.round(v / 100) / 10)} kg` : `${nombre(Math.round(v))} g`;
  const quantite = (q, u) => u === "g" ? g(q) : u === "ml" ? `${nombre(Math.round(q))} ml` : `${virgule(Math.round(q * 10) / 10)} ${u}`;
  const tete = `<div class="doses-qui">${liste.map(x => `<button type="button" class="dose-membre" data-fam-profil="${x.uid}">
      <b>${esc(qui(x))}</b>${x.erreur ? `<small class="discret">illisible</small>`
        : `<small class="chiffres">${nombre(x.total ? x.total.kcal : 0)}${x.objectif ? ` / ${nombre(x.objectif.kcal)}` : ""} kcal · ${nombre(x.total ? x.total.prot : 0)} g prot.</small>`}</button>`).join("")}</div>`;
  const MOMENTS_DOSES = [["pdj", "Matin"], ["dej", "Midi"], ["din", "Soir"], ["col", "Collations"]];
  const blocs = MOMENTS_DOSES.map(([m, titre]) => {
    const plats = new Map();
    for (const x of liste) for (const r of x.repas || []) if (r.moment === m) {
      if (!plats.has(r.id)) plats.set(r.id, { r, parts: [] });
      plats.get(r.id).parts.push({ x, r });
    }
    if (!plats.size) return "";
    return `<section class="doses-moment"><h2>${titre}</h2>${[...plats.values()].map(({ r, parts }) => {
      const total = parts.reduce((t, p) => t + (p.r.g || 0), 0);
      const ings = new Map();
      for (const p of parts) for (const i of p.r.ing) {
        const cle = i.n + "|" + i.u;
        if (!ings.has(cle)) ings.set(cle, { n: i.n, u: i.u, parts: [] });
        ings.get(cle).parts.push(i.q);
      }
      const connu = recette(r.id);
      const photoR = connu && connu.photo ? connu : { id: r.id, nom: r.nom, photo: r.photo, photo_uid: r.photo_uid || (r.id.startsWith("perso-") ? parts[0].x.uid : undefined) };
      return `<article class="dose-plat">${photo(photoR, 160, "carre")}
        <div class="dose-corps"><b class="dose-nom">${esc(r.nom)}</b>
          <ul class="dose-parts">${parts.map(p => `<li${p.r.mange ? ' class="mange"' : ""}><span>${esc(qui(p.x))}</span>
            <b class="chiffres">${p.r.g ? g(p.r.g) : `× ${virgule(p.r.taille)}`}</b>${p.r.mange ? icone("check") : ""}</li>`).join("")}</ul>
          ${parts.length > 1 && total ? `<p class="dose-total">À cuisiner <b class="chiffres">${g(total)}</b></p>` : ""}
          ${ings.size ? `<details class="dose-ing"><summary>Ingrédients${icone("caret-right")}</summary><ul>${[...ings.values()].map(i => {
            const t = i.parts.reduce((a, b) => a + b, 0);
            return `<li><span>${esc(i.n)}</span><b class="chiffres">${quantite(t, i.u)}</b>${i.parts.length > 1 ? `<small class="chiffres">${i.parts.map(q => quantite(q, i.u)).join(" + ")}</small>` : ""}</li>`;
          }).join("")}</ul></details>` : ""}</div></article>`;
    }).join("")}</section>`;
  }).join("");
  const courses = coursesFamillePossible() ? `<p class="doses-courses"><button type="button" class="bouton second" data-action="coursesFamille">${icone("shopping-cart-simple")}Les courses de la famille</button></p>` : "";
  return `${tete}${courses}${blocs || `<p class="discret" style="margin-top:14px">Pas de menu ce jour-là.</p>`}`;
}
const dateFamille = (k, n) => { const s = k === (E.mois ? E.mois.rang : 0) ? E.semaine : planDe(k);
  return s && s.debut ? new Date(new Date(s.debut + "T12:00").getTime() + n * 864e5).toISOString().slice(0, 10) : ""; };
// « Pour qui ? » dans la même fenêtre (Taha, 28/11/2026) : en famille, « Seulement moi » et « Toute la famille »
// remplacent le bouton qui valide, au lieu d'une seconde fenêtre. Le premier (touche Entrée) reste « Seulement moi ».
const quiIci = date => enFamille() && !!date;
const QUI_AIDE = `<p class="petit discret ap-qui">Pour qui ? Chacun garde ses quantités.</p>`;
const boutonsQui = () => `<button class="bouton second" type="submit" data-qui="moi">Seulement moi</button><button class="bouton" type="submit" data-qui="tous">Toute la famille</button>`;
function quiChoisi(bouton, date, moments) {
  return quiIci(date) && bouton && bouton.dataset && bouton.dataset.qui === "tous" ? { famille: { date, moments: [...new Set(moments)] } } : {};
}
function momentsTouches(op) {
  const m = String(op.moment || "");
  if (op.type === "ajouter") return ["col", ...(["pdj", "dej", "din"].includes(m) ? [m] : [])];
  if (m.startsWith("col")) return ["col"];
  return op.ensemble !== false && ["dej", "din"].includes(m) ? ["dej", "din"] : [m];
}

/* ------------------------------------------------------------ dialogue avec l'appli */
async function appel(chemin, corps) {
  let r, donnees;
  try {
    r = await fetch(chemin, corps === undefined ? {} :
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    donnees = await r.json();
  } catch (e) {
    if (!E) vuePanne();
    else dire("L'appli ne répond pas. Vérifie que le site tourne sur le PC.");
    return false;
  }
  const formulaire = ["/api/connexion", "/api/profil/creer", "/api/profil/modifier"].includes(chemin);   // l'erreur s'affiche dans le formulaire
  if (r.status === 401 && !formulaire) { E = null; vueConnexion(); return false; }
  if (!r.ok) { if (!formulaire) dire(donnees.erreur || "L'appli a refusé."); return donnees; }
  if (chemin === "/api/deconnexion") { E = null; oublierHorsLigne(); return true; }
  try {
    await completer(donnees);
  } catch (e) {
    dire("L'appli ne répond pas. Vérifie que le site tourne sur le PC.");
    return false;
  }
  E = donnees;
  journalPlus = []; journalSuite = null;
  return true;
}
async function completer(etat) {
  // L'etat ne porte que la note et l'avis de chaque recette : le reste vient de /api/recettes.
  if (!BASE || BASE.version !== etat.recettes_version) {
    const r = await fetch("/api/recettes");
    if (!r.ok) throw new Error("recettes");
    BASE = await r.json();
  }
  etat.recettes = BASE.recettes.map(r => ({ ...r, note: null, nb_notes: 0, gout: null, ...(etat.avis[r.id] || {}) }));
  etat.rayons = BASE.rayons;
}
function oublierHorsLigne() {
  BASE = null;
  if (window.caches) caches.keys().then(noms => noms.forEach(n => caches.delete(n)));
}
async function agir(chemin, corps, message) {
  const ok = await appel(chemin, corps);
  if (ok === true) { rendre(); if (message) dire(message); }
  return ok === true;
}

/* ------------------------------------------------------------ adresse */
function route() {
  if (/access_token=|error_description=/.test(location.hash)) return { vue: "semaine", arg: "", params: new URLSearchParams() };
  const [chemin, requete = ""] = (location.hash.replace(/^#\/?/, "") || "semaine").split("?");
  const [vue, arg] = chemin.split("/");
  return { vue, arg: arg ? decodeURIComponent(arg) : "", params: new URLSearchParams(requete) };
}
function ongletDe(vue) {
  if (vue === "plat") return "semaine";
  if (enSuivi()) return vue === "historique" ? "semaine" : ["plus", "profil", "profils", "nouveau", "reglages", "journal", "conso", "famille"].includes(vue) ? "profil" : vue;
  return DANS_PLUS.includes(vue) ? "plus" : vue;
}

/* ------------------------------------------------------------ navigation */
const enSuivi = () => !!(E && E.journal_repas && E.journal_repas.actif);   // mode flemmard : on note ce qu'on mange
// Un plat fixé par la personne (bouton « Fixer ce plat ») : il revient chaque jour, toujours une portion (Taha, 19/11/2026).
const estFixe = (id, moment) => !!(E && E.fixes && ({ pdj: E.fixes.petit_dej, dej: E.fixes.dejeuner, din: E.fixes.diner }[moment] === id
  || String(moment).startsWith("col") && (E.fixes.collations || []).includes(id)));
function comptesNav() {
  // Produits a acheter et repas a cuisiner aujourd'hui : les pastilles de Courses et Cuisine.
  const s = E && E.semaine;
  if (!s) return {};
  const jour = aujourdhui();
  const aFaire = s.jours[jour].cuisine.filter(c => c.quand !== "fruit" && !fait(s, jour, c.id)).length;
  const aAcheter = E.courses && s.etat !== "commandee" && s.etat !== "terminee" ? E.courses.a_acheter.length : 0;
  return { courses: enSuivi() ? 0 : aAcheter, cuisine: s.etat !== "terminee" && (s.etat === "commandee" || Object.keys(s.prepares || {}).length) ? aFaire : 0 };
}
const BUDGET_POUR = ["taha"];
const ADMIN_CONSO = ["taha"];     // la page « Suivi de conso » (Taha, 23/11/2026) ; le serveur vérifie aussi
const estAdminConso = () => typeof sb !== "undefined" && ADMIN_CONSO.includes(String((typeof M !== "undefined" && (M.moi || M).ident) || "").toLowerCase());
function rendreNavigation(actif) {
  const comptes = comptesNav();
  const lien = (o, bas) => {
    const ici = o.id === actif, n = comptes[o.id] || 0;
    return `<a href="#/${o.id}"${ici ? ' aria-current="page"' : ""}>${icone(ici && ICONES[o.icone + "-fill"] ? o.icone + "-fill" : o.icone)}<span>${o.nom}</span>${
      n ? `<span class="compte" aria-label="${n} ${o.id === "courses" ? "à acheter" : "à cuisiner"}">${n}</span>` : ""}</a>`;
  };
  if (!E) { $("fil").innerHTML = ""; $("pucePhase").hidden = true; }
  const onglets = E && enSuivi() ? ONGLETS_FLEMMARD : ONGLETS;
  $("navBas").innerHTML = E ? onglets.map(o => lien(o, true)).join("") : "";
  // Le profil, en haut à droite, en face du nom de l'appli (Taha, 19/11/2026) : la barre du bas respire.
  let profil = $("enteteProfil");
  if (!profil) {
    profil = document.createElement("a");
    profil.id = "enteteProfil"; profil.className = "entete-profil"; profil.href = "#/profil";
    document.querySelector(".entete-in").appendChild(profil);
  }
  profil.hidden = !(E && enSuivi());
  // Le profil d'un autre membre de la famille est ouvert (Taha, 27/11/2026) : on le voit, on revient à soi d'un geste.
  let bandeau = $("bandeauProfil");
  if (!bandeau) {
    bandeau = document.createElement("div");
    bandeau.id = "bandeauProfil"; bandeau.className = "bandeau-profil";
    document.querySelector(".entete").after(bandeau);
  }
  bandeau.hidden = !(E && autreProfil());
  bandeau.innerHTML = E && autreProfil() ? `<div class="cadre">${icone("user-circle")}<span>Profil de <b>${esc(E.profil.nom)}</b></span>
    <button type="button" class="lien" data-moi>Revenir à moi</button></div>` : "";
  // Budget : une icône en haut, à côté du profil, pour Taha seulement pour l'instant (Taha, 22/11/2026).
  let budget = $("enteteBudget");
  if (!budget) {
    budget = document.createElement("a");
    budget.id = "enteteBudget"; budget.className = "entete-profil entete-icone"; budget.href = "#/budget";
    budget.setAttribute("aria-label", "Budget"); budget.title = "Budget";
    document.querySelector(".entete-in").insertBefore(budget, profil);
  }
  budget.hidden = !(E && enSuivi() && BUDGET_POUR.includes(String((typeof M !== "undefined" && (M.moi || M).ident) || E.utilisateur.id || "").toLowerCase()));
  budget.innerHTML = icone("wallet");
  if (actif === "budget") budget.setAttribute("aria-current", "page"); else budget.removeAttribute("aria-current");
  const nDemandes = demandesFamille().length;
  profil.innerHTML = `${icone("user-circle")}<span>Profil</span>${nDemandes ? '<i class="point-alerte" aria-hidden="true"></i>' : ""}`;
  profil.setAttribute("aria-label", (E ? `Profil de ${E.profil.nom}` : "Profil") + (nDemandes ? ` (${nDemandes > 1 ? `${nDemandes} demandes` : `${nDemandes} demande`} pour ta famille)` : ""));
  if (actif === "profil") profil.setAttribute("aria-current", "page"); else profil.removeAttribute("aria-current");
  $("navHaut").innerHTML = E ? onglets.map(o => lien(o, false)).join("") : "";
}
function barre(html) {
  const b = $("barre");
  b.hidden = !html;
  b.innerHTML = html ? `<div class="barre-in">${html}</div>` : "";
}

/* ------------------------------------------------------------ paiement */
function demanderPaiement(correction, quoi = "") {
  const c = E.couts || {}, p = c.paye || {}, cm = E.courses_mois;
  if (quoi === "mois") return demanderPaiementDuMois();
  const propose = correction ? p.supermarche : (c.panier ? c.panier.total : null);
  const estimeBoucher = correction ? p.boucher_estime : (c.a_payer ? c.a_payer.boucher : 0);
  const d = $("dialogue");
  d.innerHTML = `<form method="dialog" id="fPaiement" novalidate>
    <h2 id="dialogueTitre">${correction ? "Corriger les montants payés" : (E.mois ? "Le marché est fait ?" : "La commande est payée ?")}</h2>
    <p style="margin-bottom:18px">${correction ? "Ces montants servent au suivi de ton budget." : (E.mois ? "Les fruits et légumes de la liste entrent dans ton stock." : "Les produits achetés entrent dans ton stock. Confirme seulement une fois le paiement fait.")}</p>
    <div class="champ"><label for="pSuper">${E.mois ? "Payé pour les fruits et légumes" : "Payé au supermarché"}, en euros</label>
      <input id="pSuper" name="supermarche" type="number" inputmode="decimal" min="0" max="5000" step="0.01" autocomplete="off" value="${propose ?? ""}" placeholder="Par exemple 62,40…">
      <small>${!correction && c.panier ? "Total du panier rempli par l'appli. Corrige-le s'il a changé." : "Laisse vide si tu ne le connais pas."}</small></div>
    <div class="champ"><label for="pBoucher">${E.mois ? "Payé pour la viande" : "Payé chez le boucher"}, en euros</label>
      <input id="pBoucher" name="boucher" type="number" inputmode="decimal" min="0" max="5000" step="0.01" autocomplete="off" value="${correction && p.boucher != null ? p.boucher : ""}" placeholder="${nombre(estimeBoucher || 0, 2)}…">
      <small>Laisse vide pour garder l'estimation de ${euros(estimeBoucher || 0)}.</small></div>
    <small id="ePaiement" class="erreur" role="alert" style="color:var(--accent-texte)"></small>
    <div class="actions"><button class="bouton second" type="button" value="non">${correction ? "Annuler" : "Pas encore"}</button>
      <button class="bouton" type="submit" value="oui">${correction ? "Enregistrer" : (E.mois ? "Oui, c'est fait" : "Oui, c'est payé")}</button></div></form>`;
  d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
  d.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault(); ev.stopPropagation();
    const lire = id => $(id).value.trim() === "" ? null : Number($(id).value.replace(",", "."));
    const supermarche = lire("pSuper"), boucher = lire("pBoucher");
    if ([supermarche, boucher].some(v => v !== null && !(v >= 0 && v <= 5000))) {
      $("ePaiement").textContent = "Indique des montants entre 0 et 5 000 euros.";
      return;
    }
    d.close("oui");
    agir(correction ? "/api/paye" : "/api/commande", { supermarche, boucher, quoi: "semaine" }, correction ? "Montants enregistrés." : "Stock mis à jour.");
  });
  d.showModal();
}

function demanderPaiementDuMois() {
  const cm = E.courses_mois, d = $("dialogue");
  d.innerHTML = `<form method="dialog" novalidate>
    <h2 id="dialogueTitre">Le panier ${esc(E.magasin.principale)} est payé ?</h2>
    <p style="margin-bottom:18px">${cm.panier ? "Le panier rempli par l'appli" : "Tous les produits de la liste"} entre${cm.panier ? "" : "nt"} dans ton stock. Confirme seulement une fois le paiement fait.</p>
    <div class="champ"><label for="pMois">Payé, en euros</label>
      <input id="pMois" name="montant" type="number" inputmode="decimal" min="0" max="5000" step="0.01" autocomplete="off" value="${cm.panier ? cm.panier.total : ""}" placeholder="${nombre(cm.estimation, 2)}…">
      <small>${cm.panier ? "Total du panier, hors livraison. Corrige-le avec le vrai montant." : "Laisse vide si tu ne le connais pas."}</small></div>
    <div class="actions"><button class="bouton second" type="button" value="non">Pas encore</button>
      <button class="bouton" type="submit" value="oui">Oui, c'est payé</button></div></form>`;
  d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
  d.querySelector("form").addEventListener("submit", ev => {
    ev.preventDefault(); ev.stopPropagation();
    const v = $("pMois").value.trim() === "" ? null : Number($("pMois").value.replace(",", "."));
    if (v !== null && !(v >= 0 && v <= 5000)) return $("pMois").focus();
    d.close("oui");
    agir("/api/commande", { quoi: "mois", supermarche: v }, "Stock mis à jour.");
  });
  d.showModal();
}

/* ------------------------------------------------------------ composer : les options */
const AIDE_MODES = {
  moins_cher: "Le prix et les promotions comptent trois fois plus.",
  plus_varie: "Plus de recettes différentes, et des plats que tu n'as jamais goûtés.",
  flemmard: "Tes repas fixes (smoothie, œufs, shake, yaourt…) et UN plat par jour, cuisiné une fois et mangé midi et soir. L'appli choisit chaque plat pour tomber sur tes calories et tes protéines.",
  fodmap: "Seulement les recettes pauvres en FODMAP : sans oignon, ail, blé ni lactose, et sans légumes crus (salade, concombre, carottes râpées).",
};
function demanderComposition(recomposer) {
  const s = E.semaine, pref = E.profil.preferences;
  const coches = new Set(s ? s.modes || [] : pref.modes);
  const engagee = s && s.etat !== "proposee";
  const option = (nom, valeur, titre, aide, coche) => `<label class="option">
      <input type="checkbox" name="${nom}" value="${valeur}"${coche ? " checked" : ""}>
      <span><b>${esc(titre)}</b><small>${esc(aide)}</small></span></label>`;
  const d = $("dialogue");
  d.innerHTML = `<form method="dialog" id="fComposer">
    <h2 id="dialogueTitre">${recomposer ? "Recomposer la semaine" : "Composer ma semaine"}</h2>
    <p>${recomposer ? (engagee ? "La semaine en cours reste dans ton historique." : "La semaine proposée sera remplacée.") + " " : ""}Coche ou décoche ce qui compte cette fois-ci. Sans rien cocher, l'appli équilibre tout.</p>
    <div class="options" role="group" aria-label="Priorités de la semaine">
      ${E.modes.filter(m => !m.a_venir && !m.impose).map(m => option("mode", m.id, m.nom.charAt(0).toUpperCase() + m.nom.slice(1), AIDE_MODES[m.id] || "", coches.has(m.id))).join("")}
    </div>
    ${E.modes.some(m => m.impose) ? `<p class="petit discret" style="margin-top:10px">Mode flemmard : ${esc(AIDE_MODES.flemmard)} Les modes « moins cher » et « plus varié » arrivent bientôt.</p>` : ""}
    <div class="options" style="margin-top:10px">${option("fruits_secs", "1", "Une poignée de fruits secs par jour",
      "30 g par jour, achetés une fois par mois. Décoche pour ne plus en avoir.", E.reglages.fruits_secs ?? pref.fruits_secs ?? true)}</div>
    ${recomposer ? "" : `<h3 style="margin:18px 0 8px">Combien de semaines ?</h3>
      <div class="segments" role="radiogroup" aria-label="Nombre de semaines à composer">${[1, 2, 3, 4].map(v => `<label class="segment"><input type="radio" name="semaines" value="${v}"${(E.nb_semaines || 1) === v ? " checked" : ""}><span>${v > 1 ? `${v} semaines` : `${v} semaine`}</span></label>`).join("")}</div>
      <p class="petit discret" style="margin-top:8px">Plusieurs semaines d'un coup : un seul panier ${esc(E.magasin.principale)} pour toutes, les produits frais chaque semaine. Elles commencent demain.</p>`}
    ${recomposer && E.mois ? `<div class="options" style="margin-top:10px">${option("mois", "1", "Recomposer aussi la semaine suivante", "Sinon seule la semaine en cours change. Le panier est recalculé dans les deux cas.", false)}</div>` : ""}
    <div class="actions"><button class="bouton second" type="button" value="non">Annuler</button>
      <button class="bouton" type="submit" value="oui">${recomposer ? "Recomposer" : "Composer"}</button></div></form>`;
  d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
  d.querySelector("form").addEventListener("submit", ev => {
    ev.preventDefault(); ev.stopPropagation();
    const modes = [...d.querySelectorAll("[name=mode]:checked")].map(i => i.value);
    const mois = !!(d.querySelector("[name=mois]") || {}).checked, choix = d.querySelector("[name=semaines]:checked");
    const fruits_secs = !!d.querySelector("[name=fruits_secs]").checked;
    d.close("oui");
    agir("/api/semaine/generer", choix ? { modes, fruits_secs, semaines: Number(choix.value), mois: true } : { modes, fruits_secs, mois },
         recomposer ? "Nouvelle semaine composée." : choix && choix.value > 1 ? `${choix.value} semaines composées.` : "Semaine composée.");
  });
  d.showModal();
}

/* ------------------------------------------------------------ semaine */
function selecteurDeJour(s, n, vue) {
  return `<nav class="jours" aria-label="Jour de la semaine">
    ${s.jours.map((x, i) => `<a href="#/${vue}?jour=${i}"${i === n ? ' aria-current="true"' : ""} aria-label="${x.jour}">${court(x)}</a>`).join("")}
  </nav>`;
}
function jourDemande(params) {
  return Math.min(6, Math.max(0, parseInt(params.get("jour") ?? aujourdhui(), 10) || 0));
}
function fruitsDuJour(j) {
  const noms = j.fruits.map(id => recette(id).nom.toLowerCase());
  if (j.fruits_secs) noms.push(`${j.fruits_secs.g} g ${recette(j.fruits_secs.id).sec && recette(j.fruits_secs.id).fodmap ? "d'oléagineux (noix, cacahuètes, pécan)" : "de fruits secs"}`);
  return noms;
}
const MOMENTS = { pdj: "petit-déjeuner", dej: "déjeuner", din: "dîner" };
const nomMoment = m => MOMENTS[m] || "collation";
// La taille d'une assiette de ce plat ce jour-la, comme le serveur la compte (planification.taille) :
// 1 pour un repas fixe du profil ou un plat « tel quel », sinon le facteur du jour.
// Un plat dont tu as tapé les quantités ce jour-là garde la taille d'alors (jour.figees).
const tailleDe = (j, id) => (j && j.figees && j.figees[id]) ? j.figees[id]
  : (j && ((j.perso || []).includes(id) || (recette(id) || {}).tel_quel)) ? 1 : ((j && j.facteur) || 1);
// Un repas tel que le serveur l'a compte (jour.repas : taille, kcal et proteines de CETTE assiette).
const repasCompte = (j, moment, id) => (j.repas || []).find(x => x.moment === moment && x.id === id);
// « Pour 2 repas » plutot que « 1,3 portion » : ce qui se compte, c'est le nombre de repas cuisines.
function pourCombien(c, j) {
  if (c.quand === "fruit") return "";
  const repas = c.repas ?? Math.max(1, Math.round(c.portions / tailleDe(j, c.id)));
  return `pour ${repas} repas`;
}
const P_MOMENTS = j => [j.pdj, j.dej, j.din, ...(j.collations || [])].filter(x => x && x !== "rien");
// Un plat tel qu'il se cuisine un jour donne : avec les quantites ajustees pour ce jour seulement.
// Le dejeuner « reste » suit le diner de la veille.
function platDuJour(s, n, id, moment = "") {
  const r = recette(id), j = s.jours[moment === "dej" && s.jours[n].dej_reste && n > 0 ? n - 1 : n];
  const q = (j.ajustes || {})[id];
  return q ? avecAjustes(r, q, (j.ajustes_chiffres || {})[id], (j.noms || {})[id]) : r;
}
// La recette avec les quantités réglées un jour (q = jour.ajustes[id], d'une portion), comme planification.avec_quantites :
// 0 retire un ingredient, {q, u, a} en ajoute un qui n'y etait pas. `changements` : « sans miel », « avec kaki ».
// `nom` : le nom de ce jour-là quand les changements rendent celui du plat faux (planification.nom_du_jour, Taha,
// 28/11/2026 : « pourquoi miel ») ; `nomBase` garde celui du plat.
function avecAjustes(r, q, chiffres, nom) {
  const noms = new Set(r.ing.map(i => i.n)), sans = [];
  const ing = r.ing.flatMap(i => i.u === "qs" || typeof q[i.n] !== "number" ? [i] : q[i.n] <= 0 ? (sans.push(i.n), []) : [{ ...i, q: q[i.n] }]);
  const plus = Object.entries(q).filter(([n, v]) => !noms.has(n) && v && typeof v === "object" && v.q > 0).map(([n, v]) => ({ n, q: v.q, u: v.u, a: v.a }));
  const dit = [sans.length ? `sans ${sans.map(x => x.toLowerCase()).join(", ")}` : "", plus.length ? `avec ${plus.map(x => x.n.toLowerCase()).join(", ")}` : ""].filter(Boolean);
  return { ...r, ...(chiffres || {}), ...(nom && nom !== r.nom ? { nom, nomBase: r.nom } : {}), ajusteeCeJour: true, ing: [...ing, ...plus], changements: dit,
           etapes: dit.length ? [`Tes changements : ${dit.join(" ; ")}. Cuis-les comme ce qu'ils remplacent.`, ...(r.etapes || [])] : r.etapes };
}
// Un plat d'un jour passé, tel que le moteur l'envoie dans l'historique (journal_des_jours) : ses chiffres, la taille de
// l'assiette et les quantités réglées ce jour-là (ajustes), pour revoir ce qu'il y avait vraiment dans l'assiette.
function repasDuJournal(date, id, moment = "") {
  const j = ((E.journal_repas || {}).jours || []).find(x => x.date === date), tous = j ? j.repas || [] : [];
  return tous.find(x => x.id === id && x.moment === moment) || tous.find(x => x.id === id) || null;
}
// La recette d'un plat de l'historique : celle de ce jour-là, et le facteur qui donne les quantités de l'assiette
// (la taille d'alors ; sans quantités réglées, d'après les calories notées, comme avant).
function recetteDuJournal(r, x) {
  const rv = x && x.ajustes ? avecAjustes(r, x.ajustes, null, x.nom) : r;
  return { r: rv, facteur: x && x.ajustes ? x.taille || 1 : x && rv.kcal ? x.kcal / rv.kcal : 1 };
}
// Un compte rendu en PDF, fabrique par le site : « semaine » (menu), « courses », « cuisine ».
const boutonPdf = () => "";
function carteSansRepas(quand, k, n, moment) {
  return `<div class="exo repas-ligne sans-repas"><div class="exo-texte"><div class="quand">${quand}</div><h3>Rien de prévu</h3>
    <div class="chiffres">Mets-y un plat quand tu as décidé.</div>
    <button class="bouton second" data-action="changer" data-semaine="${k}" data-jour="${n}" data-moment="${moment}">${icone("swap")}Mettre un plat</button></div></div>`;
}
// Les chiffres d'un plat en une ligne, comme dans « Remplacer par un autre plat » (Taha, 22/11/2026).
const macrosLigne = (kcal, prot) => `<span class="rp-macros chiffres"><span><strong>${nombre(Math.round(kcal))}</strong> kcal</span><span><strong>${nombre(Math.round(prot))} g</strong> prot.</span></span>`;
function repasDuJour(s, k, n, compact = false, sansCollation = false, avecCuire = false, sansIcones = false, fin = "") {
  // Les repas d'un jour (semaine k), en cartes, chacun avec son bouton « Changer » tant qu'il n'est pas cuisine.
  const j = s.jours[n], courante = !E.mois || k === E.mois.rang;
  const double = j.cuisine.some(c => c.id === j.din && c.pour_demain);
  // Un plat ajouté à un repas (jour.au_repas : un pancake à midi, en plus du plat) se range à ce repas.
  const avec = m => j.collations.map((c, i) => [c, i]).filter(([c]) => ((j.au_repas || {})[c] || "") === m).map(([c, i]) => [m ? QUAND[{ pdj: "matin", dej: "midi", din: "soir" }[m]] : "Collation", c, "", "col" + i]);
  const lignes = [["Matin", j.pdj, "", "pdj"], ...avec("pdj"), ["Midi", j.dej, j.dej_reste ? "la part gardée d'hier soir" : j.din === j.dej ? "cuisiné une fois pour midi et soir" : "à cuisiner à midi", "dej"], ...avec("dej"),
    ...avec(""), ["Soir", j.din, double ? "cuisiné en double, pour demain midi" : j.din === j.dej && !j.dej_reste ? "la part gardée de midi" : "", "din"], ...avec("din")]
    .filter(([, id, , moment], _, tous) => !(sansIcones && id === "rien" && tous.some(([, , , m2], k) => m2.startsWith("col") && (j.au_repas || {})[j.collations[Number(m2.slice(3))]] === moment)));
  const fruits = fruitsDuJour(j);
  const libre = (id, moment) => !(courante && fait(s, n, id)) && !(moment === "dej" && j.dej_reste && courante && n > 0 && fait(s, n - 1, id));
  const cuisineLeJour = courante && j.cuisine.some(c => fait(s, n, c.id));
  return `${j.retire ? `<p class="dujour" style="margin-bottom:14px"><strong>Jour mis de côté.</strong> Rien n'est prévu ni acheté pour ${j.jour.toLowerCase()} pour l'instant. Mets-y tes plats quand tu as décidé, ici ou dans Cuisine, ou copie un autre jour.</p>` : ""}
    <div class="exos">${lignes.map(([quand, id, detail, moment]) => { const r = recette(id);
      if (id === "rien") return carteSansRepas(quand, k, n, moment);
      const v = platDuJour(s, n, id, moment), compte = repasCompte(j, moment, id), t = tailleDe(j, id);
      // Déjà cuisiné ce jour-là : grisé, pour ne pas le confondre avec ce qui reste à faire (Taha, 19/11/2026).
      const cuit = courante && !!fait(s, n, id);
      return `<div class="exo repas-ligne${cuit ? " cuisine-fait" : ""}"><a class="repas" href="#/plat/${id}" data-semaine="${k}" data-jour="${n}" data-moment="${moment}">
        ${photo(r, 480)}
        <div class="exo-texte"><div class="quand">${quand}${cuit ? (enSuivi() ? " · mangé" : " · cuisiné") : estFixe(id, moment) ? " · fixe" : detail ? `, ${detail}` : ""}</div><h3>${esc(v.nom)}</h3>
        <div class="chiffres">${nombre(compte ? compte.kcal : v.kcal * t)} kcal, ${nombre(compte ? compte.prot : v.prot * t)} g de protéines${v.ajusteeCeJour ? " · quantités ajustées ce jour" : ""}</div></div></a>
      ${sansIcones ? "" : `${libre(id, moment) ? `<button class="changer" data-action="changer" data-semaine="${k}" data-jour="${n}" data-moment="${moment}" aria-label="Changer le ${nomMoment(moment)} de ${j.jour.toLowerCase()}" title="Changer">${icone("swap")}</button>` : ""}
      ${avecCuire ? `<a class="changer cuire${reglable(s, k, n, id, moment) ? "" : " haut"}" href="${courante ? `#/cuisine/${id}?jour=${n}` : `#/plat/${id}`}" aria-label="Cuisiner ${esc(r.nom)}" title="Cuisiner">${icone("cooking-pot")}</a>` : ""}
      ${reglable(s, k, n, id, moment) ? `<button class="changer regler" data-action="reequilibrer" data-semaine="${k}" data-jour="${n}" data-moment="${moment}" data-plat="${id}" aria-label="Rééquilibrer ${esc(r.nom)} pour viser l'objectif" title="Rééquilibrer ce plat">${icone("sliders-horizontal")}</button>` : ""}`}</div>`; }).join("")}${fin}</div>
    ${compact && !j.retire && !sansCollation ? `<button class="ajout-ligne" data-action="changer" data-semaine="${k}" data-jour="${n}" data-moment="col${j.collations.length}">${icone("cooking-pot")}Ajouter une collation</button>` : ""}
    ${fruits.length ? `<p class="dujour"><strong>Fruits du jour.</strong> ${esc(fruits.join(", ").replace(/^./, c => c.toUpperCase()))}.</p>` : ""}
    ${compact ? "" : `<p class="actions" style="margin-top:14px">
      ${courante && !j.retire && n <= rangDuJour(s) && j.cuisine.some(c => !fait(s, n, c.id)) ? `<button class="bouton" data-action="journee" data-jour="${n}">${icone("check")}J'ai tout mangé comme prévu</button>` : ""}
      <button class="bouton sobre" data-action="changer" data-semaine="${k}" data-jour="${n}" data-moment="col${j.collations.length}">${icone("cooking-pot")}Ajouter une collation</button>
      <button class="bouton sobre" data-action="clonerJour" data-semaine="${k}" data-jour="${n}">${icone("copy")}Copier un autre jour ici</button>
      ${j.retire || cuisineLeJour ? "" : `<button class="bouton sobre" data-action="retirerJour" data-semaine="${k}" data-jour="${n}">${icone("x")}Retirer ce jour</button>`}</p>
    <p class="petit muet" style="margin-top:8px">Le bouton ${icone("swap")} d'un repas permet de le changer, de le retirer ou d'y mettre ton propre plat. Le bouton ${icone("sliders-horizontal")} rééquilibre ce plat : l'appli règle ses grammes, et seulement les siens, pour viser ton objectif du jour.</p>`}`;
}
function reglable(s, k, n, id, moment) {
  // Bouton « Rééquilibrer » : le serveur dit quels plats se règlent (valeurs connues, pas encore cuisinés) ;
  // ni la part gardée d'hier soir, ni un jour déjà passé de la semaine en cours.
  const j = s.jours[n], courante = !E.mois || k === E.mois.rang;
  if (moment === "dej" && j.dej_reste) return false;
  if (courante && n < rangDuJour(s)) return false;
  return (j.reglables_seul || []).includes(id);
}
function cartesDeLaSemaine(s) {
  const plats = Object.values(s.choix).filter(c => estRepas(recette(c.id)))
    .sort((a, b) => ORDRE[recette(a.id).cat] - ORDRE[recette(b.id).cat] || b.score - a.score);
  return `<section class="bloc large" aria-labelledby="tPlats">
      <h2 id="tPlats">Les ${plats.length} recettes de la semaine</h2>
      <div class="exos">
        ${plats.map(c => { const r = recette(c.id); return `<a class="exo carte" href="#/plat/${c.id}">
          ${photo(r, 480)}<div class="exo-texte"><h3>${esc(r.nom)}</h3>
          <p class="chiffres">${euros(c.cout)} le repas</p></div></a>`; }).join("")}
      </div>
    </section>`;
}
function barreDesPhases() {
  // Les phases du programme, en segments proportionnels a leur duree.
  const phases = E.phases || [];
  if (phases.length < 2) return "";
  const mois = t => { const [a, m] = String(t).split("-").map(Number); return a * 12 + (m || 1); };
  const maintenant = new Date().getFullYear() * 12 + new Date().getMonth() + 1;
  let debut = Math.min(maintenant, mois(phases[0].jusqu_a) - 1);
  const durees = phases.map(p => { const d = Math.max(1, mois(p.jusqu_a) - debut); debut = mois(p.jusqu_a); return d; });
  const colonnes = durees.map(d => `${d}fr`).join(" ");
  return `<div class="phases" style="grid-template-columns:${colonnes}">${phases.map(p => `<i class="${p.n < E.phase.n ? "faite" : p.n === E.phase.n ? "encours" : ""}" title="${esc(p.nom)}"></i>`).join("")}</div>
    <div class="phases-noms" style="grid-template-columns:${colonnes}">${phases.map(p => `<span class="${p.n === E.phase.n ? "encours" : ""}">${p.n}</span>`).join("")}</div>`;
}
function tableauDeLaSemaine(s, k, n) {
  if (PETIT.matches) return semaineCompacte(s, k, n);
  // Le tableau de bord d'une semaine : le jour choisi, l'objectif, Jarvis, les graphiques, les repas.
  const m = E.mois, rang = m ? m.rang : 0, courante = k === rang, passee = k < rang;
  const j = s.jours[n], phase = E.phase, o = s.objectif;
  const vedette = [["din", "le dîner"], ["dej", "le déjeuner"], ["pdj", "le petit-déjeuner"]].find(([m]) => j[m] !== "rien");
  const din = recette(vedette ? j[vedette[0]] : "rien");
  const gardes = s.jours.filter(x => !x.retire);
  const moy = c => Math.round(gardes.reduce((t, x) => t + (x[c] || 0), 0) / Math.max(1, gardes.length));
  const lien = i => `#/semaine?${m ? `s=${k}&` : ""}jour=${i}`;
  const double = j.cuisine.some(c => c.id === j.din && c.pour_demain);
  const modes = (s.modes || []).map(x => (E.modes.find(y => y.id === x) || { nom: x }).nom);
  const fin = (phase.jusqu_a || "").split("-");
  const jusqu = fin.length === 2 ? new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" }).format(new Date(+fin[0], +fin[1] - 1, 1)) : "";
  const depasse = s.dans_le_budget === false;
  // Le plat le plus cher de la semaine : celui a ouvrir pour l'ecarter quand le budget est depasse (R-12).
  const cher = depasse ? Object.values(s.choix).filter(c => (recette(c.id) || {}).cat === "plat").sort((a, b) => b.cout - a.cout)[0] : null;
  const donnees = (cle, d = 0) => s.jours.map((x, i) => ({ etiquette: court(x), valeur: x[cle] || 0, detail: x.jour, choisi: i === n,
                                                          couleur: i === n ? "var(--accent)" : "var(--s1)" }));
  apresRendu.push(() => {
    Graph.barres($("gKcal"), { donnees: donnees("kcal"), unite: "kcal", cible: o.kcal, hauteur: 210, titre: "Calories prévues chaque jour, comparées à l'objectif" });
    Graph.barres($("gProt"), { donnees: donnees("prot"), unite: "g", cible: o.prot, hauteur: 210, titre: "Protéines prévues chaque jour, comparées à l'objectif" });
    Graph.barres($("gCout"), { donnees: donnees("cout"), unite: "€", decimales: 2, cible: Math.round(s.budget_semaine / 7 * 100) / 100, nomCible: "budget", hauteur: 210,
                               titre: "Coût des repas chaque jour, comparé au budget" });
  });
  const pasCommencee = courante && rangDuJour(s) < 0;
  const titre = courante && !pasCommencee ? dateLongue(new Date().toISOString()).replace(/^./, c => c.toUpperCase()) : `Semaine ${k + 1}${periode(s) ? `, ${periode(s)}` : ""}`;
  return `
  <div class="tete">
    <div><h1 tabindex="-1">${esc(titre)}</h1>
      <p class="doux">${pasCommencee ? `Elle commence ${rangDuJour(s) === -1 ? "demain" : "le " + dateLongue(s.debut)}. ` : ""}${courante ? `Phase ${phase.n}, ${esc(phase.nom).toLowerCase()}. ${nombre(o.kcal)} kcal et ${o.prot} g de protéines par jour.`
        : passee ? "Semaine passée." : `Déjà composée : ses produits sont dans le panier ${esc(E.magasin.principale)}. Tu peux encore y changer des plats.`}</p></div>
    <div class="ligne">
      ${depasse ? `<span class="puce alerte" role="status">Budget dépassé de ${euros(s.cout - s.budget_semaine)}${cher ? ` · le plus cher : <a href="#/plat/${cher.id}">${esc(recette(cher.id).nom)}</a>` : ""}</span>` : ""}
      ${modes.map(x => `<span class="puce">${esc(x.charAt(0).toUpperCase() + x.slice(1))}</span>`).join("")}
      ${(() => { const paye = (E.courses_mois && E.courses_mois.commande) || E.semaine.etat === "commandee" || E.semaine.etat === "terminee";
        if (paye || passee) return "";
        if (E.tache.etat === "en cours") return `<a class="puce accent" href="#/courses">L'appli remplit le panier…</a>`;
        return E.valide ? `<a class="puce accent" href="#/courses">${icone("check")}Menu validé : voir les courses</a>`
          : `<button class="bouton" data-action="valider">${icone("check")}C'est bon, je valide le menu</button>`; })()}
      ${passee ? "" : boutonPdf("semaine")}
      ${courante ? `<button class="bouton sobre" data-action="recomposer">${icone("arrows-clockwise")}Recomposer</button>` : `<a class="bouton sobre" href="#/semaine">Semaine en cours</a>`}
      ${courante && (E.nb_semaines || 1) < 4 && s.etat === "proposee" ? `<button class="bouton second" data-action="ajouterSemaine">Ajouter une ${m ? `${m.semaines.length + 1}e` : "2e"} semaine</button>` : ""}
      ${m && courante ? `<button class="bouton sobre" data-action="suivante">${rang + 1 < m.nb ? "Passer à la semaine suivante" : `Composer les ${m.nb} suivantes`}</button>` : ""}
    </div>
  </div>
  ${selecteurDeSemaine(k)}
  <div class="grille accueil">
    <section class="bloc jour" aria-labelledby="tJour">
      <div class="jour-texte">
        <nav class="jours" aria-label="Jour de la semaine">
          ${s.jours.map((x, i) => `<a href="${lien(i)}"${i === n ? ' aria-current="true"' : ""} aria-label="${x.jour}">${court(x)}</a>`).join("")}</nav>
        <div><p class="petit muet">${j.jour}${courante && n === rangDuJour(s) ? ", aujourd'hui" : ""}${vedette ? ` · ${vedette[1]}` : ""}</p>
          <h2 class="grand" id="tJour">${vedette ? esc(din.nom) : "Jour mis de côté"}</h2>
          <p class="doux">${!vedette ? "Rien de prévu pour l'instant : mets-y tes plats plus bas quand tu as décidé." : `${double && vedette[0] === "din" ? "Cuisiné en double : la seconde part est ton déjeuner de demain. " : ""}${din.temps} min de cuisine.`}</p></div>
        <div class="faits du-jour" aria-label="Chiffres de ${j.jour}">
          <div class="fait"><b>${nombre(j.kcal)}</b><span>kcal ${j.jour.toLowerCase()}</span></div>
          <div class="fait"><b>${j.prot} g</b><span>de protéines</span></div>
          <div class="fait"><b>${euros(j.cout)}</b><span>de repas ce jour</span></div>
        </div>
        ${glucidesLipides(j)}
        ${j.facteur !== 1 ? `<p class="petit muet chiffres">Portions à ${nombre(j.facteur * 100)} % pour tomber sur ton objectif.</p>` : ""}
        <div class="actions">
          ${courante ? `<a class="bouton grand" href="#/cuisine?jour=${n}">Cuisiner ce jour</a>` : ""}
          ${vedette ? `<a class="bouton second" href="#/plat/${din.id}">Voir le plat</a>` : ""}
        </div>
      </div>
      ${vedette ? `<a class="illus" href="#/plat/${din.id}" aria-label="${esc(din.nom)}">${photo(din, 960)}</a>` : `<div class="illus">${photo(din, 960)}</div>`}
    </section>
    <section class="bloc" aria-labelledby="tObjectif">
      <h2 id="tObjectif">Mon objectif</h2>
      <p class="doux">${esc(E.profil.programme || `Phase ${phase.n} : ${phase.nom}`)}</p>
      <div class="faits objectif-chiffres">
        <div class="fait"><b>${nombre(moy("kcal"))}</b><span>kcal par jour, pour ${nombre(o.kcal)}</span></div>
        <div class="fait"><b>${moy("prot")} g</b><span>de protéines, pour ${o.prot} g</span></div>
        <div class="fait"><b>${euros(s.cout)}</b><span>sur ${euros(s.budget_semaine)} de budget</span></div>
      </div>
      ${barreDesPhases()}
      <p class="petit doux" style="margin-top:8px">Phase ${phase.n}${(E.phases || []).length > 1 ? ` sur ${E.phases.length}` : ""} : ${esc(phase.nom)}${jusqu ? `, jusqu'en ${jusqu}` : ""}.</p>
      ${s.jours[0].gluc != null ? `<div class="rythme-ligne" style="margin-top:14px">
        <span>Glucides <b>${moy("gluc")} g</b>${phase.glucides ? ` sur ${phase.glucides}` : ""}</span>
        <span>Lipides <b>${moy("lip")} g</b>${phase.lipides ? ` sur ${phase.lipides}` : ""}</span>
        ${s.jours[0].fib != null ? `<span>Fibres <b>${moy("fib")} g</b> sur 30</span>` : ""}</div>` : ""}
    </section>
    <section class="bloc" aria-labelledby="tKcal">
      <h2 id="tKcal">Calories par jour</h2>
      <div class="legende"><span><i style="background:var(--s1)"></i>Prévu</span><span><i style="background:var(--accent)"></i>${j.jour}</span><span><i class="trait-cible"></i>Objectif</span></div>
      <div id="gKcal"></div>
    </section>
    <section class="bloc" aria-labelledby="tProt"><h2 id="tProt">Protéines par jour</h2><div id="gProt"></div></section>
    <section class="bloc" aria-labelledby="tCout"><h2 id="tCout">Coût des repas par jour</h2><div id="gCout"></div></section>
    <section class="bloc large" aria-labelledby="tRepas">
      <h2 id="tRepas">Les repas de ${j.jour.toLowerCase()}</h2>
      ${passee ? `<p class="doux">Semaine passée : rien à changer.</p>` : repasDuJour(s, k, n)}
    </section>
    ${cartesDeLaSemaine(s)}
  </div>`;
}
function vueSemaine({ params }) {
  if (enSuivi()) return vueJourSuivi(params);
  const s = E.semaine, phase = E.phase;
  const objectif = phase.kcal + (E.reglages.ajustement || 0);
  if (!s) {
    barre("");
    return `<div class="tete"><div><h1 tabindex="-1">${esc(dateLongue(new Date().toISOString()).replace(/^./, c => c.toUpperCase()))}</h1>
        <p class="doux">Phase ${phase.n}, ${esc(phase.nom).toLowerCase()}. ${nombre(objectif)} kcal et ${phase.prot} g de protéines par jour.</p></div></div>
      <div class="grille accueil">
        <section class="bloc jour vide-jour"><div class="jour-texte">
          <div><h2 class="grand">Aucune semaine pour l'instant</h2>
          <p class="doux">L'appli choisit tes repas d'après tes notes, tes avis, ton stock, les promotions, les vitamines, ton budget et ton objectif. Tu cuisines chaque jour.</p></div>
          <div class="actions"><button class="bouton grand" data-action="composer">Composer ma semaine</button>
            <a class="bouton second" href="#/catalogue">Parcourir le catalogue</a></div></div></section>
        <section class="bloc"><h2>Mon objectif</h2>
          <p class="doux">${esc(E.profil.programme || `Phase ${phase.n} : ${phase.nom}`)}</p>
          <div class="faits objectif-chiffres">
            <div class="fait"><b>${nombre(objectif)}</b><span>kcal par jour</span></div>
            <div class="fait"><b>${phase.prot} g</b><span>de protéines</span></div>
            <div class="fait"><b>${euros(E.reglages.budget_mois * 7 / 30)}</b><span>de budget par semaine</span></div>
          </div>${barreDesPhases()}</section>
      </div>`;
  }
  const m = E.mois, rang = m ? m.rang : 0;
  const vue = m ? Math.min(m.nb - 1, Math.max(0, parseInt(params.get("s") ?? rang, 10) || 0)) : 0;
  barre(barreDeValidation());
  return tableauDeLaSemaine(m ? m.semaines[vue] && (vue === rang ? s : m.semaines[vue]) : s, vue, jourDemande(params));
}
function barreDeValidation() {
  // Tant que le menu n'est pas valide, Jarvis ne remplit aucun panier.
  const s = E.semaine, m = E.mois, paye = (E.courses_mois && E.courses_mois.commande) || s.etat === "commandee" || s.etat === "terminee";
  if (E.valide || paye || E.tache.etat === "en cours") return "";
  const quoi = m && m.nb - m.rang > 1 ? `${m.nb - m.rang} semaines` : "ta semaine";
  return `<div><b>Le menu te convient&nbsp;?</b><span class="aide">Change des plats tant que tu veux, puis valide</span></div>
    <button class="bouton" data-action="valider">Valider ${quoi}</button>`;
}
function semaineCompacte(s, k, n) {
  // Le telephone : le jour d'abord (chiffres en une ligne, puis les repas en liste), le reste replie plus bas.
  const m = E.mois, rang = m ? m.rang : 0, courante = k === rang, passee = k < rang;
  const j = s.jours[n], o = s.objectif;
  const lien = i => `#/semaine?${m ? `s=${k}&` : ""}jour=${i}`;
  const aujourd = courante && n === rangDuJour(s);
  const jauge = (nom, val, but, unite) => { const pct = Math.min(100, Math.round(100 * val / but));
    return `<div class="jauge"><div><span>${nom}</span><b class="chiffres">${nombre(val)}<small> / ${nombre(but)} ${unite}</small></b></div>
      <span class="piste" role="img" aria-label="${pct} % de l'objectif"><i style="width:${pct}%"></i></span></div>`; };
  const date = s.debut ? new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long" }).format(new Date(new Date(s.debut + "T12:00").getTime() + n * 864e5)) : "";
  const depasse = s.dans_le_budget === false;
  apresRendu.push(() => {
    const plus = $("mPlus");
    if (!plus) return;
    const donnees = cle => s.jours.map((x, i) => ({ etiquette: court(x), valeur: x[cle] || 0, detail: x.jour, choisi: i === n,
                                                    couleur: i === n ? "var(--accent)" : "var(--s1)" }));
    const tracer = () => { if (!plus.open || plus.dataset.trace) return; plus.dataset.trace = "1";
      Graph.barres($("gKcal"), { donnees: donnees("kcal"), unite: "kcal", cible: o.kcal, hauteur: 190, titre: "Calories prévues chaque jour", nom: "Calories prévues" });
      Graph.barres($("gProt"), { donnees: donnees("prot"), unite: "g", cible: o.prot, hauteur: 190, titre: "Protéines prévues chaque jour", nom: "Protéines prévues" }); };
    plus.addEventListener("toggle", tracer);
    tracer();
  });
  return `<div class="m-tete">
      <div><h1 tabindex="-1">${aujourd ? "Aujourd'hui" : esc(j.jour)}</h1>
        <p class="petit discret">${[aujourd ? esc(j.jour) : "", date, m && m.nb > 1 ? `semaine ${k + 1}` : ""].filter(Boolean).join(" · ")}</p></div>
      <button class="bouton sobre rond" data-action="actionsJour" data-semaine="${k}" data-jour="${n}" aria-label="Autres actions">${icone("dots-three-outline")}</button>
    </div>
    ${m && m.nb > 1 ? `<nav class="m-semaines" aria-label="Semaines">${m.semaines.map((x, i) => `<a href="#/semaine?s=${i}"${i === k ? ' aria-current="true"' : ""}>S${i + 1}${i === rang ? " · en cours" : ""}</a>`).join("")}</nav>` : ""}
    <nav class="jours" aria-label="Jour de la semaine">
      ${s.jours.map((x, i) => `<a href="${lien(i)}"${i === n ? ' aria-current="true"' : ""} aria-label="${x.jour}">${court(x)}</a>`).join("")}</nav>
    ${j.retire ? "" : `<div class="m-resume">${jauge("Calories", j.kcal, o.kcal, "kcal")}${jauge("Protéines", j.prot, o.prot, "g")}</div>`}
    ${depasse ? `<p class="puce alerte" style="margin:0 0 10px">Budget dépassé de ${euros(s.cout - s.budget_semaine)}</p>` : ""}
    <section class="m-repas" aria-label="Les repas de ${j.jour.toLowerCase()}">
      ${passee ? `<p class="doux">Semaine passée : rien à changer.</p>` : repasDuJour(s, k, n, true)}
    </section>
    ${!passee && !j.retire ? `<div class="m-actions">
      ${courante ? `<a class="bouton" href="#/cuisine?jour=${n}">Cuisiner ce jour</a>` : ""}
      ${courante && n <= rangDuJour(s) && j.cuisine.some(c => !fait(s, n, c.id)) ? `<button class="bouton second" data-action="journee" data-jour="${n}">${icone("check")}Tout mangé</button>` : ""}
    </div>` : ""}
    <details class="m-plus" id="mPlus"><summary>La semaine : objectif, graphiques, recettes${icone("caret-right")}</summary>
      <div class="faits">
        <div class="fait"><b>${nombre(Math.round(s.jours.filter(x => !x.retire).reduce((t, x) => t + x.kcal, 0) / Math.max(1, s.jours.filter(x => !x.retire).length)))}</b><span>kcal par jour en moyenne</span></div>
        <div class="fait"><b>${Math.round(s.jours.filter(x => !x.retire).reduce((t, x) => t + x.prot, 0) / Math.max(1, s.jours.filter(x => !x.retire).length))} g</b><span>de protéines</span></div>
        <div class="fait"><b>${euros(s.cout)}</b><span>sur ${euros(s.budget_semaine)}</span></div>
      </div>
      <h3>Calories par jour</h3><div id="gKcal"></div>
      <h3>Protéines par jour</h3><div id="gProt"></div>
      ${cartesDeLaSemaine(s)}
    </details>`;
}
function actionsDuJour(k, n) {
  // Le menu « … » du telephone : ce qui etait en boutons autour du jour et de la semaine.
  const s = planDe(k), j = s.jours[n], m = E.mois, rang = m ? m.rang : 0, courante = k === rang;
  const cuisineLeJour = courante && j.cuisine.some(c => fait(s, n, c.id));
  const paye = (E.courses_mois && E.courses_mois.commande) || E.semaine.etat === "commandee" || E.semaine.etat === "terminee";
  const b = (action, ic, texte, extra = "") => `<li><button type="button" data-action="${action}" data-semaine="${k}" data-jour="${n}" ${extra}>${icone(ic)}<span>${texte}</span></button></li>`;
  const d = $("dialogue");
  d.innerHTML = `<div class="feuille"><h2 id="dialogueTitre">${esc(j.jour)}${m && m.nb > 1 ? `, semaine ${k + 1}` : ""}</h2>
    <ul class="menu feuille-menu">
      ${courante && !paye && !E.valide && E.tache.etat !== "en cours" && !enSuivi() ? b("valider", "check", "C'est bon, je valide le menu") : ""}
      ${enSuivi() ? "" : b("clonerJour", "copy", "Copier un autre jour ici")}
      ${j.retire || cuisineLeJour || enSuivi() ? "" : b("retirerJour", "x", "Retirer ce jour")}
      ${enSuivi() && courante && n <= rangDuJour(s) && j.cuisine.some(c => !fait(s, n, c.id)) ? b("journee", "check", "J'ai tout mangé ce jour-là") : ""}
      ${courante ? b("recomposer", "arrows-clockwise", "Recomposer la semaine") : ""}
      ${courante && (E.nb_semaines || 1) < 4 && s.etat === "proposee" && !enSuivi() ? b("ajouterSemaine", "calendar-blank", `Ajouter une ${m ? `${m.semaines.length + 1}e` : "2e"} semaine`) : ""}
      ${m && courante && !enSuivi() ? b("suivante", "caret-right", rang + 1 < m.nb ? "Passer à la semaine suivante" : `Composer les ${m.nb} suivantes`) : ""}
      ${enSuivi() ? "" : `<li><a href="/export/semaine.pdf" download>${icone("notebook")}<span>Exporter la semaine en PDF</span></a></li>`}
    </ul>
    <div class="actions pied"><button class="bouton second" type="button" value="non">Fermer</button></div></div>`;
  d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
  d.querySelectorAll("[data-action]").forEach(x => x.addEventListener("click", () => d.close("non")));   // l'action rouvre sa propre feuille
  d.showModal();
}
function selecteurDeSemaine(vue) {
  const m = E.mois;
  if (!m) return "";
  return `<nav class="semaines" aria-label="Semaines composées">
    ${m.semaines.map((x, i) => `<a href="#/semaine?s=${i}"${i === vue ? ' aria-current="true"' : ""}><b>Semaine ${i + 1}</b>
      <span>${[periode(x), i === m.rang ? "en cours" : i < m.rang ? "passée" : "à venir"].filter(Boolean).join(" · ")}</span></a>`).join("")}
  </nav>`;
}
/* ------------------------------------------------------------ changer un plat, copier un jour */
function planDe(k) { return E.mois ? E.mois.semaines[k] : E.semaine; }
function ecartLisible(valeur, unite, bonSiPlus) {
  // « +16 g » ou « −30 kcal », avec un sens : mieux, moins bien, ou pareil.
  if (Math.abs(valeur) < 0.5) return `<span class="ecart pareil">= ${unite === "g" ? "mêmes protéines" : "mêmes calories"}</span>`;
  const mieux = bonSiPlus === null ? "" : ((valeur > 0) === bonSiPlus ? " mieux" : " moins");
  return `<span class="ecart${mieux}">${valeur > 0 ? "+" : "−"}${nombre(Math.abs(valeur))} ${unite === "g" ? "g de protéines" : "kcal"}</span>`;
}
// « Remplacer par un autre plat », le cœur de l'appli. Taha, 21/11/2026, deuxième version : « Retirer ce repas » est déjà sur
// la carte du plat ; un seul champ IA qui cherche un plat ET crée le tien (« Mon propre plat ») ; pas de filtres ; des lignes
// compactes. La journée montrée est celle de l'écran Jour (ce que tu as noté en plus compris).
const REMPLACER = { cle: "" };
const TRIS_REMPLACER = [["objectif", "Pour ton objectif"], ["proches", "Mêmes calories"], ["proteines", "Plus de protéines"],
  ["leger", "Plus léger"], ["aimes", "Tes préférés"], ["stock", "Avec mon stock"]];
// La date d'un jour d'une semaine composée, et ce qui a été noté « en plus » ce jour-là (compté dans l'écran Jour).
const dateDuPlan = (s, n) => { const d = new Date(s.debut + "T12:00"); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function enPlusDuJour(s, n) {
  const jj = enSuivi() && s && s.debut ? (E.journal_repas.jours || []).find(x => x.date === dateDuPlan(s, n)) : null;
  const e = jj ? jj.entrees || [] : [];
  return { kcal: e.reduce((t, x) => t + (Number(x.kcal) || 0), 0), prot: e.reduce((t, x) => t + (Number(x.prot) || 0), 0) };
}
function demanderChangement(k, n, moment) {
  const s = planDe(k), j = s.jours[n], d = $("dialogue");
  const actuelId = moment === "pdj" ? j.pdj : moment === "dej" ? j.dej : moment === "din" ? j.din : j.collations[Number(moment.slice(3))] || "rien";
  const nouvelle = moment.startsWith("col") && Number(moment.slice(3)) >= j.collations.length;        // une collation de plus
  const cat = moment === "pdj" ? "petitdej" : moment === "dej" || moment === "din" ? "plat" : "collation", sansRepas = nouvelle || actuelId === "rien";
  const operation = plat => nouvelle ? { type: "ajouter", jour: n, plat } : { type: "changer", jour: n, moment, plat };
  const fodmap = (s.modes || []).includes("fodmap");
  const permise = r => r.id !== actuelId && r.id !== "extrariz" && r.id !== "rien" && (!fodmap || (r.fodmap && !r.filtres.cru));
  // N'importe quel plat à n'importe quel repas (Taha, 19/11/2026) : en cherchant, tous les types ; sinon ceux de ce repas.
  const tous = E.recettes.filter(r => ["collation", "plat", "petitdej"].includes(r.cat) && permise(r) && !estRetire(r.id));
  const tousCherche = E.recettes.filter(r => ["collation", "plat", "petitdej"].includes(r.cat) && permise(r) && !estExclu(r.id));
  const possibles = tous.filter(r => r.cat === cat);
  const milieu = cle => { const v = possibles.map(r => r[cle]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] || 0; };
  const actuel = sansRepas ? { ...recette("rien"), kcal: milieu("kcal"), prot: milieu("prot") } : recette(actuelId);   // sans repas : un plat moyen
  const f = sansRepas ? (j.facteur || 1) : tailleDe(j, actuelId);
  const compte = sansRepas ? null : repasCompte(j, moment, actuelId);
  const avantK = sansRepas ? 0 : compte ? compte.kcal : actuel.kcal * f, avantP = sansRepas ? 0 : compte ? compte.prot : actuel.prot * f;
  const refK = sansRepas ? actuel.kcal * f : avantK, refP = sansRepas ? actuel.prot * f : avantP;
  const plus = enPlusDuJour(s, n), obj = s.objectif || {};
  const jourK = (j.kcal || 0) + plus.kcal, jourP = (j.prot || 0) + plus.prot;          // les mêmes chiffres que l'écran Jour
  const kc = r => r.kcal * tailleDe(j, r.id), pr = r => r.prot * tailleDe(j, r.id);
  const journee = r => ({ kcal: jourK - avantK + kc(r), prot: jourP - avantP + pr(r) });
  const loin = r => { const x = journee(r), ok = obj.kcal && obj.prot;
    return ok ? Math.abs(x.kcal - obj.kcal) / obj.kcal + 1.5 * Math.max(0, obj.prot - x.prot) / obj.prot + 0.3 * Math.max(0, x.prot - obj.prot) / obj.prot
      : Math.abs(kc(r) - refK) / Math.max(refK, 1); };
  const aime = r => (r.gout === "tester" ? 3 : 0) + (r.nb_notes ? r.note : 0) + (r.perso ? 1 : 0);
  const ORDRES = { objectif: (a, b) => loin(a) - loin(b), proches: (a, b) => Math.abs(kc(a) - refK) - Math.abs(kc(b) - refK) || pr(b) - pr(a),
    proteines: (a, b) => pr(b) / Math.max(kc(b), 1) - pr(a) / Math.max(kc(a), 1), leger: (a, b) => kc(a) - kc(b),
    aimes: (a, b) => aime(b) - aime(a) || loin(a) - loin(b),
    stock: (a, b) => ((E.stock_couvre || {})[b.id] || 0) - ((E.stock_couvre || {})[a.id] || 0) || loin(a) - loin(b) };

  const cle = `${k}|${n}|${moment}|${actuelId}`, revient = REMPLACER.cle === cle;
  if (!revient) Object.assign(REMPLACER, { cle, tri: obj.kcal ? "objectif" : "proches", cherche: "", nb: 20, defile: 0 });
  const R = REMPLACER;
  // Sans recherche : les plats de ce repas ; en cherchant : tous les plats, même ceux d'un autre repas ou cachés, le
  // nom d'abord, fautes de frappe pardonnées (Taha, 27/11/2026 : « œufs durs au dîner ne remonte pas »).
  const trouves = () => {
    const m = motsRech(R.cherche);
    if (!m.length) return tous.filter(r => r.cat === cat && r.gout !== "non").sort((a, b) => ORDRES[R.tri](a, b) || a.nom.localeCompare(b.nom, "fr"));
    return tousCherche.map(r => [r, scoreRecherche(r, m, { ingredients: true })]).filter(x => x[1] > 0)
      .sort((a, b) => b[1] - a[1] || ORDRES[R.tri](a[0], b[0]) || a[0].nom.localeCompare(b[0].nom, "fr")).map(x => x[0]);
  };
  const carte = r => {
    const x = journee(r), tient = obj.kcal && Math.abs(x.kcal - obj.kcal) <= obj.kcal * 0.05 && x.prot >= obj.prot * 0.95;
    const dp = Math.round(pr(r) - avantP);
    return `<li><button type="button" class="rp-plat" data-plat="${r.id}">${photo(r, 120, "carre")}
      <span class="rp-texte"><b>${esc(r.nom)}</b>
        <span class="rp-macros chiffres"><span><strong>${nombre(Math.round(kc(r)))}</strong> kcal</span><span><strong>${nombre(Math.round(pr(r)))} g</strong> prot.</span>${
          sansRepas || !dp ? "" : `<span class="rp-ecart${dp > 0 ? " plus" : ""}">${dp > 0 ? "+" : "−"}${nombre(Math.abs(dp))} g</span>`}</span></span>
      ${(E.stock_couvre || {})[r.id] >= 0.8 ? `<span class="rp-stock" title="Faisable avec ton stock">${icone("package")}</span>` : tient ? `<span class="rp-tient" title="Ta journée tient l'objectif">${icone("check")}</span>` : ""}</button></li>`; };
  const carteAliment = a => { const it = itemAliment(a);
    return `<li><button type="button" class="rp-plat aliment-seul" data-aliment="${esc(a.nom)}"><div class="photo vide carre aliment-pastille">${icone("orange")}</div>
      <span class="rp-texte"><b>${esc(a.nom)}</b><span class="rp-macros chiffres"><span>${qteAliment(a)}</span><span><strong>${nombre(Math.round(it.kcal))}</strong> kcal</span><span><strong>${nombre(Math.round(it.prot))} g</strong> prot.</span></span>
        <small class="discret">Un aliment seul</small></span></button></li>`; };
  const tete = () => {                  // tout de suite, à chaque lettre : le bouton IA et la croix
    if (!$("rpListe")) return;           // la fenêtre a changé entre-temps
    const texte = R.cherche.trim();
    $("rpEffacer").hidden = !texte;
    $("rpBadge").hidden = !!texte;
    // Le même champ crée ton plat : Claude, l'IA, trouve les aliments, les grammes et les macros de ce que tu as écrit.
    $("rpIA").innerHTML = texte.length >= 2 ? `<button type="button" class="rp-ia" data-ia>${icone("sparkle")}<span>Créer « ${esc(texte.length > 48 ? texte.slice(0, 46) + "…" : texte)} » avec l'IA
        <small>L'IA en fait ton plat : aliments, grammes et macros</small></span>${icone("caret-right")}</button>` : "";
  };
  const maj = () => {
    if (!$("rpListe")) return;
    const liste = trouves(), texte = R.cherche.trim();
    tete();
    $("rpCompte").textContent = texte ? (liste.length ? `${liste.length > 1 ? `${liste.length} plats trouvés` : `${liste.length} plat trouvé`}` : "Aucun plat de ta base")
      : `${liste.length} ${cat === "petitdej" ? "petits-déjeuners" : cat === "plat" ? "plats" : "collations"}`;
    // Un aliment seul aussi (28/11/2026) : en tête si c'est son nom exact, sinon après les plats.
    const als = texte ? alimentsTrouves(texte, new Set(liste.slice(0, 40).map(r => sansAcc(r.nom))), maj) : [];
    const exacts = als.filter(a => nomExact(a, motsRech(texte))), autres = als.filter(a => !exacts.includes(a));
    $("rpListe").innerHTML = (exacts.map(carteAliment).join("") + liste.slice(0, R.nb).map(carte).join("") + autres.map(carteAliment).join(""))
      || `<li class="rp-vide">${texte ? "Rien à ce nom : crée-le avec l'IA juste au-dessus." : "Aucun plat."}</li>`;
    $("rpSuite").innerHTML = liste.length > R.nb ? `<button type="button" class="bouton second rp-voir-plus" data-voir-plus>Voir ${Math.min(20, liste.length - R.nb)} de plus</button>` : "";
  };
  const place = moment.startsWith("col") && !nouvelle ? ((j.au_repas || {})[actuelId] || "col") : moment;
  const leRepas = { pdj: "le petit-déjeuner", dej: "le déjeuner", din: "le dîner" }[place] || "la collation";
  const nomRepas = { pdj: "Petit-déjeuner", dej: "Déjeuner", din: "Dîner" }[place] || "Collation";
  const suite = moment === "din" && n < 6 && s.jours[n + 1].dej_reste ? `Le déjeuner de ${s.jours[n + 1].jour.toLowerCase()} changera aussi : c'est la seconde part de ce dîner.`
    : moment === "dej" && j.dej_reste ? "Ce déjeuner ne sera plus le reste de la veille : il se cuisinera à midi." : "";
  d.innerHTML = `<div class="feuille rp">
    <div class="rp-tete"><div><p class="rp-sur">${esc(j.jour)} · ${nomRepas}</p>
      <h2 id="dialogueTitre">${nouvelle ? "Ajouter une collation" : sansRepas ? `Choisir ${leRepas}` : `Remplacer ${leRepas}`}</h2></div>
      <button type="button" class="rp-fermer" data-fermer aria-label="Fermer">${icone("x")}</button></div>
    ${sansRepas ? "" : `<div class="rp-actuel">${photo(actuel, 120, "carre")}<div><b>${esc(actuel.nom)}</b>
        <span class="chiffres">${nombre(Math.round(avantK))} kcal · ${nombre(Math.round(avantP))} g prot.</span></div></div>`}
    ${obj.kcal ? `<p class="rp-objectif chiffres">Ta journée : <b>${nombre(Math.round(jourK))}</b> / ${nombre(obj.kcal)} kcal · <b>${nombre(Math.round(jourP))}</b> / ${nombre(obj.prot)} g</p>` : ""}
    ${suite ? `<p class="petit discret rp-intro">${suite}</p>` : ""}
    <div class="rp-collant" id="rpCollant">
      <div class="rp-recherche champ-ia">${icone("sparkle")}<input id="chPlat" type="search" enterkeyhint="go" autocomplete="off"
          placeholder="Un plat, ou ce que tu manges" aria-label="Chercher un plat, ou décrire ce que tu manges pour que l'IA crée le plat" value="${esc(R.cherche)}">
        <span id="rpBadge" class="rp-badge-ia">IA</span>
        <button type="button" id="rpEffacer" data-effacer aria-label="Effacer" hidden>${icone("x")}</button></div>
      <div id="rpIA"></div></div>
    <div class="rp-bandeau"><p class="rp-compte" id="rpCompte" role="status"></p>
      <label class="rp-tri"><span class="sr">Trier</span><select id="rpTri">${TRIS_REMPLACER.filter(([id]) => id !== "objectif" || obj.kcal)
        .map(([id, nom]) => `<option value="${id}"${R.tri === id ? " selected" : ""}>${nom}</option>`).join("")}</select>${icone("caret-right")}</label></div>
    <ul class="rp-liste" id="rpListe"></ul>
    <div id="rpSuite"></div></div>`;
  const retour = () => demanderChangement(k, n, moment);
  const sortir = () => { R.defile = d.scrollTop; };
  const creerAvecIA = () => {
    const texte = R.cherche.trim();
    if (texte.length < 2) return;
    sortir();
    noterRepas({ date: dateDuPlan(s, n), remplacer: { texte, place: moment.startsWith("col") ? "col" : moment, retour, avant: { kcal: avantK, prot: avantP },
      k, operation, titre: nom => `${sansRepas ? "Mettre" : "Remplacer par"} « ${nom} » ?`,
      main: () => demanderPlatPerso({ cat, k, n, moment, operation, remplace: sansRepas ? null : actuelId, retour },
        { nom: "", ingredients: texte.split(/[,;\n+]|\s+et\s+/i).map(x => x.trim()).filter(Boolean), telQuel: true }) } });
  };
  d.querySelector(".rp").addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    const x = b.dataset;
    if ("fermer" in x) return d.close("non");
    if ("ia" in x) return creerAvecIA();
    if (x.aliment) {                     // un aliment seul : sa ligne à vérifier, puis l'aperçu (28/11/2026)
      const a = (ALIMENTS.liste || []).find(y => y.nom === x.aliment);
      if (!a) return;
      sortir();
      return noterRepas({ date: dateDuPlan(s, n), remplacer: { texte: a.nom, aliment: a, place: moment.startsWith("col") ? "col" : moment, retour,
        avant: { kcal: avantK, prot: avantP }, k, operation, titre: nom => `${sansRepas ? "Mettre" : "Remplacer par"} « ${nom} » ?` } });
    }
    if (x.plat) { sortir(); return apercuChangement(k, operation(x.plat), `${sansRepas ? "Mettre" : "Remplacer par"} « ${recette(x.plat).nom} » ?`, retour); }
    if ("voirPlus" in x) { R.nb += 20; return maj(); }
    if ("effacer" in x) { R.cherche = ""; $("chPlat").value = ""; R.nb = 20; maj(); if (!TACTILE.matches) $("chPlat").focus(); }
  });
  $("rpTri").addEventListener("change", ev => { R.tri = ev.target.value; R.nb = 20; maj(); });
  const majPlusTard = plusTard(maj);
  $("chPlat").addEventListener("input", ev => { R.cherche = ev.target.value; R.nb = 20; tete(); majPlusTard(); });
  // Entrée : le nom exact d'un plat l'ouvre ; sinon l'IA crée le plat.
  $("chPlat").addEventListener("keydown", ev => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const exact = tousCherche.find(r => nomExact(r, motsRech(R.cherche)));
    if (exact) { sortir(); return apercuChangement(k, operation(exact.id), `${sansRepas ? "Mettre" : "Remplacer par"} « ${exact.nom} » ?`, retour); }
    ev.target.blur();
    creerAvecIA();
  });
  maj();
  if (!d.open) d.showModal();
  d.scrollTop = revient ? R.defile || 0 : 0;
}
// « Créer mon propre plat » du catalogue (Taha, 22/11/2026 : « pas à jour avec ce qu'on a fait ») : le même champ IA que
// « Remplacer un plat ». L'IA trouve aliments, grammes et macros, tu vérifies, le plat rejoint tes plats.
// Sans compte Claude : les ingrédients à la main, comme avant.
// Un plat écrit, ou le lien d'une recette vue en ligne : Instagram, TikTok, YouTube, Facebook, un site de recettes
// (Taha, 23/11/2026). L'appli lit ce que le lien laisse lire, l'IA en fait un plat pour une portion, avec ses étapes.
const RE_LIEN = /^\s*(https?:\/\/|www\.)\S+\s*$/i;
function creerPlatIA(cat = "plat", texte = "", lien = "", description = "") {
  if (E.claude === false) return demanderPlatPerso({ cat });
  const d = $("dialogue");
  d.innerHTML = `<form class="feuille rp creer-plat" novalidate>
    <div class="rp-tete"><div><p class="rp-sur">Catalogue</p><h2 id="dialogueTitre">Créer un plat</h2></div>
      <button type="button" class="rp-fermer" data-fermer aria-label="Fermer">${icone("x")}</button></div>
    <p class="petit discret rp-intro">Écris ton plat, ou colle le lien d'une recette vue en ligne. L'IA trouve les aliments, les grammes et les étapes ; tu vérifies avant d'enregistrer.</p>
    <div class="rp-recherche champ-ia">${icone("sparkle")}<input id="cpTexte" type="text" enterkeyhint="go" autocomplete="off" maxlength="300"
        placeholder="Ex. : 2 œufs, pain pita 70 g" aria-label="Ton plat, ou ce que tu manges" value="${esc(texte)}"><span class="rp-badge-ia">IA</span></div>
    <p class="cp-ou" aria-hidden="true"><span>ou</span></p>
    <div class="rp-recherche cp-lien">${icone("link")}<input id="cpLien" type="url" inputmode="url" enterkeyhint="go" autocomplete="off"
        placeholder="Colle un lien de recette" aria-label="Lien d'une recette : Instagram, TikTok, YouTube, Facebook, site de recettes" value="${esc(lien)}"></div>
    <p class="cp-sites">Instagram · TikTok · YouTube · Facebook · sites de recettes</p>
    <textarea id="cpDesc" class="cp-desc" rows="3" maxlength="6000" ${lien ? "" : "hidden "}placeholder="Sa description ou ses ingrédients, si tu les as (facultatif, plus précis)" aria-label="Description de la recette">${esc(description)}</textarea>
    <small class="erreur" id="eCp" role="alert" style="display:block;min-height:1em;margin-top:6px;color:var(--critique)"></small>
    <button class="bouton bouton-ia" type="submit" style="width:100%;margin-top:6px">${icone("sparkle")}Créer avec l'IA</button>
    <p class="petit" style="margin:14px 0 0;text-align:center"><button type="button" class="lien" data-main>Sans l'IA : entrer les ingrédients moi-même</button></p></form>`;
  const f = d.querySelector("form"), champ = $("cpTexte"), lienCh = $("cpLien"), desc = $("cpDesc");
  const montrer = () => { desc.hidden = !lienCh.value.trim(); };
  // Un lien collé dans le premier champ passe dans le champ du lien.
  champ.addEventListener("input", () => { if (RE_LIEN.test(champ.value)) { lienCh.value = champ.value.trim(); champ.value = ""; montrer(); desc.focus(); } });
  lienCh.addEventListener("input", montrer);
  f.querySelector("[data-fermer]").addEventListener("click", () => d.close("non"));
  f.querySelector("[data-main]").addEventListener("click", () => demanderPlatPerso({ cat }));
  f.addEventListener("submit", ev => {
    ev.preventDefault();
    const t = champ.value.trim(), l = lienCh.value.trim().replace(/^www\./i, "https://www."), de = desc.value.trim();
    const retour = () => creerPlatIA(cat, t, l, de), place = cat === "petitdej" ? "pdj" : cat === "collation" ? "col" : undefined;
    if (l) {
      if (!/^https?:\/\/\S+\.\S+/.test(l)) { $("eCp").textContent = "Ce lien n'a pas l'air complet : copie-le depuis « Partager »."; return; }
      return noterRepas({ date: E.journal_repas.aujourdhui, remplacer: { texte: "", lien: l, description: de, creer: true, place, retour, main: () => demanderPlatPerso({ cat }) } });
    }
    if (t.length < 2) { $("eCp").textContent = "Écris ton plat, ou colle un lien."; return; }
    noterRepas({ date: E.journal_repas.aujourdhui, remplacer: { texte: t, creer: true, place, retour, main: () => demanderPlatPerso({ cat }) } });
  });
  if (!d.open) d.showModal();
}
function demanderClonage(k, n) {
  const s = planDe(k), d = $("dialogue");
  d.innerHTML = `<div class="feuille">
    <h2 id="dialogueTitre">Copier un autre jour sur ${s.jours[n].jour.toLowerCase()}</h2>
    <p>Tous les repas du jour choisi remplacent ceux de ${s.jours[n].jour.toLowerCase()}.</p>
    <ul class="lignes choix-jour">${s.jours.map((x, i) => i === n ? "" : `<li><button type="button" data-depuis="${i}">
      <span><b>${x.jour}</b><small>${esc(recette(x.dej).nom)} · ${esc(recette(x.din).nom)}</small></span>${icone("caret-right")}</button></li>`).join("")}</ul>
    <div class="actions"><button class="bouton second" type="button" value="non">Annuler</button></div></div>`;
  d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
  d.querySelectorAll("[data-depuis]").forEach(b => b.addEventListener("click", () =>
    apercuChangement(k, { type: "cloner", jour: n, depuis: Number(b.dataset.depuis) }, `Copier ${s.jours[Number(b.dataset.depuis)].jour.toLowerCase()} sur ${s.jours[n].jour.toLowerCase()} ?`,
      () => demanderClonage(k, n))));
  d.showModal();
}
async function apercuChangement(k, operation, titre, retour) {
  // Jarvis calcule d'abord ce que le changement entraine ; rien n'est ecrit avant la confirmation.
  const d = $("dialogue");
  const jf = operation.type === "changer" ? planDe(k).jours[operation.jour] : null;
  if (jf && operation.ensemble === undefined && (planDe(k).modes || []).includes("flemmard") && ["dej", "din"].includes(operation.moment)
      && jf.dej === jf.din && jf.dej !== "rien" && !jf.dej_reste) {
    // Mode flemmard : le meme plat midi et soir. L'utilisateur choisit si l'autre repas change aussi.
    const ici = operation.moment === "dej" ? "midi" : "soir", autre = operation.moment === "dej" ? "soir" : "midi";
    d.innerHTML = `<form class="feuille" novalidate>
      <h2 id="dialogueTitre">Le ${autre} aussi ?</h2>
      <p>${esc(jf.jour)} : « ${esc(recette(jf.dej).nom)} » est prévu midi et soir. Tu le remplaces par « ${esc(recette(operation.plat).nom)} »…</p>
      <div class="actions pied" style="flex-wrap:wrap"><button class="bouton second" type="button" value="non">${retour ? "Retour" : "Annuler"}</button>
        <button class="bouton second" type="button" data-ensemble="0">Seulement le ${ici}</button>
        <button class="bouton" type="button" data-ensemble="1">Midi et soir</button></div></form>`;
    d.querySelector("[value=non]").addEventListener("click", () => retour ? retour() : d.close("non"));
    d.querySelectorAll("[data-ensemble]").forEach(b => b.addEventListener("click", () =>
      apercuChangement(k, { ...operation, ensemble: b.dataset.ensemble === "1" }, titre, retour)));
    if (!d.open) d.showModal();
    return;
  }
  let rep;
  try {
    const r = await fetch("/api/semaine/modifier", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, semaine: k, apercu: true }) });
    rep = await r.json();
    if (!r.ok) { dire(rep.erreur || "L'appli a refusé."); return; }
  } catch (e) { dire("L'appli ne répond pas."); return; }
  const a = rep.apercu, signe = v => `${v > 0 ? "+" : v < 0 ? "−" : ""}${nombre(Math.abs(v))}`;
  const q = m => m.unite === "qs" ? "" : ` ${quantite(m.quantite, m.unite)}`;
  // Les grammes réglés par Jarvis : en tête quand on ajuste les quantités d'un plat, après la journée sinon.
  const GRAMMES = a.reglages && a.reglages.length ? `<h3${operation.type === "reequilibrer" ? ' style="margin-top:0"' : ""}>${operation.type === "objectif" ? "Ce que l'appli règle" : operation.type === "reequilibrer" ? "Les nouvelles quantités" : "Le plat mis, réglé pour l'objectif"}</h3>
      <p class="petit discret" style="margin:-4px 0 6px">Quantités de l'assiette, pour ${planDe(k).jours[operation.jour].jour.toLowerCase()} seulement. ${operation.type === "objectif" ? "Tes plats à toi, tes repas fixes et ce qui est déjà cuisiné ne bougent pas." : "Les autres repas ne bougent pas."}</p>
      ${a.reglages.map(c => `${operation.type === "reequilibrer" ? "" : `<h4 style="margin:10px 0 4px">${esc(c.nom)}</h4>`}<ul class="lignes">${c.lignes.map(l =>
        `<li><span>${esc(l.n)}</span><span class="q chiffres">${quantite(Math.round(l.avant * c.taille * 10) / 10, l.u)} → <b>${quantite(Math.round(l.apres * c.taille * 10) / 10, l.u)}</b></span></li>`).join("")}</ul>`).join("")}`
      : operation.type === "objectif" && !a.combler ? `<p class="dujour"><strong>Déjà dans l'objectif.</strong> Rien à régler.</p>`
      : operation.type === "objectif" && !a.reglables ? `<p class="petit discret">Rien à régler en grammes ce jour-là : il ne reste que tes plats à toi, tes repas fixes ou des repas déjà cuisinés.</p>`
      : operation.type === "reequilibrer" && a.atteint ? `<p class="dujour" style="margin-top:0"><strong>Déjà dans l'objectif.</strong> Les grammes de ce plat restent comme ils sont.</p>` : "";
  // Choisir un plat : ses ingrédients et sa quantité, réglables avant de valider ; les chiffres de la journée
  // suivent tout de suite (Taha, 21/11/2026). Pas pour un plat dont Jarvis règle lui-même les grammes.
  const choisi = ["changer", "ajouter"].includes(operation.type) && !operation.regler_plat && !operation.quantites && recette(operation.plat)
    && (recette(operation.plat).ing || []).length ? recette(operation.plat) : null;
  const tChoisi = choisi ? tailleDe(planDe(k).jours[operation.jour], choisi.id) : 1;
  let fois = 1;
  const ecartsHTML = () => {
    const plusK = choisi ? (fois - 1) * choisi.kcal * tChoisi : 0, plusP = choisi ? (fois - 1) * choisi.prot * tChoisi : 0;
    const base = a.ecarts.length ? a.ecarts : plusK || plusP ? [{ jour: a.jour, kcal: 0, prot: 0, kcal_total: a.jour_kcal, prot_total: a.jour_prot }] : [];
    // Ce qui a été noté en plus ce jour-là compte aussi, comme sur l'écran Jour (Taha, 21/11/2026).
    const sPlan = planDe(k), horsMenu = nom => { const i = sPlan.jours.findIndex(x => x.jour === nom); return i < 0 ? { kcal: 0, prot: 0 } : enPlusDuJour(sPlan, i); };
    const liste = base.map(e => { const h = horsMenu(e.jour), ici = e.jour === a.jour;
      return { ...e, kcal: Math.round(e.kcal + (ici ? plusK : 0)), prot: Math.round(e.prot + (ici ? plusP : 0)),
        kcal_total: Math.round(e.kcal_total + h.kcal + (ici ? plusK : 0)), prot_total: Math.round(e.prot_total + h.prot + (ici ? plusP : 0)) }; });
    // Compact (Taha, 27/11/2026 : « grand et moche ») : une ligne par mesure, une fine barre où se voit ce qui change.
    return liste.length ? `<p class="ap-titre">${operation.type === "reequilibrer" ? "Ta journée" : "Ta journée après"}</p>
      ${liste.map(e => { const mesure = (nom, avant, apres, unite, objectif, bonSiPlus) => {
          const delta = Math.round(apres - avant), pc = v => Math.max(0, Math.min(100, 100 * v / objectif));
          const bas = pc(Math.min(avant, apres)), haut = pc(Math.max(avant, apres)), trop = bonSiPlus === null && apres > objectif * 1.05;
          const sens = !delta ? "" : bonSiPlus === null ? (trop && delta > 0 ? " moins" : "") : (delta > 0) === bonSiPlus ? " mieux" : " moins";
          return `<div class="ap-m"><span class="ap-nom">${nom}</span>
            <span class="ap-val chiffres">${delta ? `<s>${nombre(avant)}</s><span aria-hidden="true">→</span><span class="sr">devient</span>` : ""}<b>${nombre(apres)}</b> / ${nombre(objectif)} ${unite}</span>
            <span class="ap-delta chiffres${sens}">${delta ? `${delta > 0 ? "+" : "−"}${nombre(Math.abs(delta))}` : "="}</span>
            <span class="ap-piste${trop ? " trop" : ""}" role="img" aria-label="${Math.round(100 * apres / objectif)} % de l'objectif de ${nombre(objectif)} ${unite}"><i style="width:${bas}%"></i>${haut > bas ? `<i class="ap-diff${delta < 0 ? " retire" : ""}" style="left:${bas}%;width:${haut - bas}%"></i>` : ""}</span></div>`; };
        const mp = Math.round(a.objectif.prot - e.prot_total), mk = Math.round(a.objectif.kcal - e.kcal_total);
        const reste = [mp > a.objectif.prot * 0.05 ? `${nombre(mp)} g de protéines` : "", mk > a.objectif.kcal * 0.05 ? `${nombre(mk)} kcal` : ""].filter(Boolean);
        return `<div class="ap-jour">${liste.length > 1 || e.jour !== a.jour ? `<p class="ap-jour-nom">${e.jour}</p>` : ""}
          ${e.jour !== a.jour ? `<p class="ap-note">La seconde part du dîner de ${a.jour.toLowerCase()} : il change aussi.</p>` : ""}
          ${mesure("Protéines", e.prot_total - e.prot, e.prot_total, "g", a.objectif.prot, true)}
          ${mesure("Calories", e.kcal_total - e.kcal, e.kcal_total, "kcal", a.objectif.kcal, null)}
          ${reste.length ? `<p class="ap-reste">Il manque ${reste.join(" et ")}</p>` : ""}</div>`; }).join("")}`
      : `<p class="ap-note">Calories et protéines ne changent pas.</p>`;
  };
  const macrosChoisi = f => `<b>${nombre(Math.round(choisi.kcal * tChoisi * f))}</b> kcal · <b>${nombre(Math.round(choisi.prot * tChoisi * f))} g</b> prot.`;
  const dateQui = ["changer", "ajouter", "retirer"].includes(operation.type) && enFamille() ? dateFamille(k, operation.jour) : "";
  d.innerHTML = `<form class="feuille ap" method="dialog" novalidate>
    <div class="ap-tete">${choisi ? photo(choisi, 120, "carre") : ""}<div><p class="ap-sur">${esc(planDe(k).jours[operation.jour].jour)}</p>
      <h2 id="dialogueTitre" tabindex="-1" autofocus>${esc(titre)}</h2></div></div>
    ${choisi ? `<div class="ap-choisi"><div class="ap-ligne"><span class="chiffres ap-macros" id="apMacros">${macrosChoisi(1)}</span>
        <span class="ap-pas"><button type="button" data-ap-fois="-0.5" aria-label="Moins" disabled>−</button><b class="chiffres" id="apFois">×1</b>
        <button type="button" data-ap-fois="0.5" aria-label="Plus">+</button></span></div>
      <details class="ap-ing"><summary>${(n => n > 1 ? `${n} ingrédients` : `${n} ingrédient`)((choisi.ing || []).filter(i => i.u !== "qs").length)}${icone("caret-right")}</summary><div id="apIng">${listeIngredients(choisi, tChoisi)}</div></details></div>` : ""}
    ${operation.type === "reequilibrer" ? `<p class="petit discret" style="margin:-4px 0 14px">« ${esc(recette(operation.plat).nom)} », ${esc(a.jour.toLowerCase())}. L'appli règle les grammes de ce plat, et seulement les siens, pour viser ${nombre(a.objectif.kcal)} kcal et ${a.objectif.prot} g de protéines.</p>` : ""}
    ${operation.type === "reequilibrer" ? GRAMMES : ""}
    ${operation.type === "reequilibrer" && !a.atteint ? `<div class="alerte" role="status" style="margin:0 0 14px">${icone("warning-circle")}<span><strong>Ce plat ne suffit pas pour tenir l'objectif.</strong>
      Même en réglant ses grammes (de la moitié au double), ${a.jour.toLowerCase()} ${a.reglages && a.reglages.length ? "arrive" : "reste"} à ${nombre(a.jour_kcal)} kcal et ${nombre(a.jour_prot)} g de protéines, pour ${nombre(a.objectif.kcal)} kcal et ${a.objectif.prot} g visés.
      ${a.remplacer ? "Ces plats-là tiennent mieux l'objectif, grammes réglés :" : "Aucun autre plat de ce repas ne ferait mieux."}</span></div>` : ""}
    ${operation.type === "reequilibrer" && !a.atteint ? `
      ${a.remplacer ? `<ul class="candidats">${a.remplacer.plats.map(x => `<li><button type="button" class="candidat" data-remplacer="${x.id}">${photo(recette(x.id), 160, "carre")}
        <span class="texte"><b>${esc(x.nom)}</b><span class="chiffres">Journée : ${nombre(x.kcal_jour)} kcal, ${nombre(x.prot_jour)} g de protéines${x.atteint ? " · dans l'objectif" : ""}</span>
        ${x.avec && x.avec.length ? `<small class="discret">Avec ${esc(x.avec.join(", "))}</small>` : ""}</span>${icone("caret-right")}</button></li>`).join("")}</ul>` : ""}` : ""}
    <div id="apEcarts">${ecartsHTML()}</div>
    ${operation.type === "reequilibrer" ? "" : GRAMMES}
    ${a.combler && a.combler.plats.length ? `<p class="ap-titre">Pour combler ${nombre(a.combler.kcal)} kcal${a.combler.prot > 5 ? ` et ${nombre(a.combler.prot)} g` : ""} <small>(${a.combler.moment.startsWith("col") ? "en collation" : `au ${nomMoment(a.combler.moment)}`})</small></p>
      <ul class="candidats">${a.combler.plats.map(x => `<li><button type="button" class="candidat" data-combler="${x.id}">${photo(recette(x.id), 160, "carre")}
        <span class="texte"><b>${esc(x.nom)}</b><span class="chiffres">${nombre(x.kcal)} kcal, ${nombre(x.prot)} g de protéines</span></span>${icone("caret-right")}</button></li>`).join("")}</ul>` : ""}
    ${a.manque.length && !enSuivi() ? `<h3>${a.achete ? "À acheter toi-même" : "Ajouté à tes courses"}</h3>
      <p class="petit discret" style="margin:-4px 0 6px">${a.achete ? "Tes courses sont déjà faites : ces produits ne sont pas dans ton stock. Achète-les près de chez toi." : "Ces produits s'ajoutent à tes listes de courses."}</p>
      <ul class="lignes">${a.manque.map(m => `<li><span>${esc(m.nom)}</span><span class="q">${q(m)}</span></li>`).join("")}</ul>`
      : (a.achete && !enSuivi() ? `<p class="dujour" style="margin-top:14px"><strong>Rien à racheter.</strong> Ton stock couvre ce changement.</p>` : "")}
    ${a.panier_a_refaire ? `<p class="dujour" style="margin-top:14px"><strong>Panier déjà rempli.</strong> Il ne correspondra plus tout à fait : vide-le et refais-le avant de payer.</p>` : ""}
    ${a.supplements.length ? `<p class="ap-titre">En plus, pour tes protéines <small>(facultatif)</small></p>
      <div class="ap-supp">${a.supplements.map(x => `<label><input type="checkbox" name="supplement" value="${x.id}">
        <span><b>${esc(x.nom)}</b><small class="chiffres">+${x.prot} g · ${nombre(x.kcal)} kcal${x.en_stock ? " · en stock" : ""}</small></span></label>`).join("")}</div>` : ""}
    ${a.confirmation_requise ? `<div class="options" style="margin-top:18px"><label class="option"><input type="checkbox" id="auCourant" required>
      <span><b>Je suis au courant</b><small>J'ai vu l'écart de calories et de protéines${a.manque.length ? ", et j'achète moi-même ce qui manque" : ""}.</small></span></label></div>
      <small id="eCourant" class="erreur" role="alert" style="display:block;margin-top:8px;color:var(--accent-texte)"></small>` : ""}
    ${dateQui ? QUI_AIDE : ""}
    <div class="actions pied"${dateQui ? ` style="flex-wrap:wrap"` : ""}><button class="bouton second" type="button" value="non">${retour ? "Retour" : "Annuler"}</button>
      ${dateQui ? boutonsQui() : `<button class="bouton" type="submit" value="oui">${operation.type === "reequilibrer" ? "Appliquer" : "Confirmer"}</button>`}</div></form>`;
  d.querySelector("[value=non]").addEventListener("click", () => retour ? retour() : d.close("non"));
  d.querySelectorAll("[data-ap-fois]").forEach(b => b.addEventListener("click", () => {
    fois = Math.min(5, Math.max(0.5, fois + Number(b.dataset.apFois)));
    $("apFois").textContent = `×${virgule(fois)}`;
    d.querySelector('[data-ap-fois="-0.5"]').disabled = fois <= 0.5;
    d.querySelector('[data-ap-fois="0.5"]').disabled = fois >= 5;
    $("apMacros").innerHTML = macrosChoisi(fois);
    $("apIng").innerHTML = listeIngredients(choisi, tChoisi * fois);
    $("apEcarts").innerHTML = ecartsHTML();
  }));
  d.querySelectorAll("[data-remplacer]").forEach(b => b.addEventListener("click", () => {
    const plat = b.dataset.remplacer;
    const op = { type: "changer", jour: operation.jour, moment: a.remplacer.moment, plat, regler_plat: true,
                 ...(operation.ensemble !== undefined ? { ensemble: operation.ensemble } : {}) };
    apercuChangement(k, op, `Mettre « ${recette(plat).nom} » à la place ?`, () => apercuChangement(k, operation, titre, retour));
  }));
  d.querySelectorAll("[data-combler]").forEach(b => b.addEventListener("click", () => {
    const m = a.combler.moment, plat = b.dataset.combler, n = operation.jour;
    const op = { ...(m.startsWith("col") ? { type: "ajouter", jour: n, plat } : { type: "changer", jour: n, moment: m, plat }), regler_plat: true };
    apercuChangement(k, op, `Mettre « ${recette(plat).nom} » ?`, () => apercuChangement(k, operation, titre, retour));
  }));
  if (["objectif", "reequilibrer"].includes(operation.type) && !(a.reglages || []).length) {
    const ok = d.querySelector("[type=submit]"); if (ok) ok.style.display = "none";     // rien a enregistrer
  }
  d.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault(); ev.stopPropagation();
    if (a.confirmation_requise && !$("auCourant").checked) { $("eCourant").textContent = "Coche la case pour confirmer que tu as vu les écarts."; return $("auCourant").focus(); }
    const supplements = [...d.querySelectorAll("[name=supplement]:checked")].map(i => i.value);
    d.close("oui");
    const qui = quiChoisi(ev.submitter || d.querySelector("[type=submit]"), dateQui, momentsTouches(operation));
    const fini = agir("/api/semaine/modifier", { operation, semaine: k, confirme: true, supplements, ...qui }, choisi && fois !== 1 ? "" : "Changement enregistré.");
    if (choisi && fois !== 1) fini.then(ok => {
      // Puis la quantité choisie, sur le plat tel qu'il est maintenant au menu (une copie « (2) » si le plat y était déjà).
      const jn = ok && planDe(k) && planDe(k).jours[operation.jour], m = operation.moment || "";
      if (!jn) return;
      const id = operation.type === "changer" && ["pdj", "dej", "din"].includes(m) ? jn[m]
        : operation.type === "changer" && m.startsWith("col") ? jn.collations[Number(m.slice(3))] : jn.collations[jn.collations.length - 1];
      const r = recette(id) || choisi, quantites = {};
      for (const i of r.ing || []) if (i.u !== "qs") quantites[i.n] = Math.round(i.q * fois * 100) / 100;
      agir("/api/semaine/modifier", { operation: { type: "ajuster", jour: operation.jour, plat: id, quantites }, semaine: k, confirme: true },
        `Changement enregistré, quantité ×${virgule(fois)}.`);
    });
  });
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}

/* ------------------------------------------------------------ scanner un produit */
// Un produit emballé par son code-barres (Taha, 28/11/2026 : « c'est génial ») : Open Food Facts donne son nom et ses
// valeurs ; il devient un de tes aliments (ou reprend celui que tu as déjà), puis va au stock (`stock`), dans ce que tu
// manges (`repas` : `suite(aliment, quantité)` ouvre la vérification) ou dans tes plats, tel quel (`plat`).
function chargerScanner() {
  if (typeof Scanner !== "undefined") return Promise.resolve();
  if (!chargerScanner.p) chargerScanner.p = new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "scan.js"; s.onload = ok;
    s.onerror = () => { chargerScanner.p = null; ko(new Error("Scanner indisponible : vérifie ta connexion.")); };
    document.head.appendChild(s);
  });
  return chargerScanner.p;
}
const TITRES_SCAN = { stock: "Scanner pour le stock", repas: "Scanner ce que tu manges", plat: "Scanner un plat tout prêt" };
async function scannerProduit(pour, o = {}) {
  const d = $("dialogue"), revenir = () => o.retour ? o.retour() : d.open && d.close("non");
  let code;
  try { await chargerScanner(); code = await Scanner.lire({ titre: TITRES_SCAN[pour] }); }
  catch (e) { dire(e.message || "Scanner indisponible."); return revenir(); }
  if (!code) return revenir();
  d.innerHTML = `<div class="feuille scan-res"><p class="rp-sur">Code ${esc(code)}</p><h2 id="dialogueTitre">Je cherche le produit…</h2></div>`;
  if (!d.open) d.showModal();
  let r;
  try {
    const x = await fetch(`/api/produit?code=${encodeURIComponent(code)}`);
    r = await x.json();
    if (!x.ok) r = { code, erreur: r.erreur || "Code illisible." };
  } catch (e) { r = { code, erreur: "Open Food Facts ne répond pas : réessaie dans un instant." }; }
  carteProduit(pour, r, o);
}
function carteProduit(pour, r, o) {
  const d = $("dialogue"), p = r.produit, lie = r.aliment || null, proches = r.proches || [];
  let choix = lie ? lie.n : r.sur && proches[0] ? proches[0].n : "";          // "" : un nouvel aliment
  let cat = "plat";
  const alDe = n => lie && lie.n === n ? lie : proches.find(a => a.n === n) || null;
  const piece = () => { const a = alDe(choix); return !!a && aLaPiece(a); };
  const unite = () => { const a = alDe(choix); return a ? a.u : (p ? p.unite : "g"); };
  const qDefaut = () => {
    const a = alDe(choix);
    if (a && aLaPiece(a)) return pour === "stock" && p && p.quantite && a.gp > 1 ? Math.max(1, Math.round(p.quantite / a.gp)) : 1;
    if (pour === "stock") return p && p.quantite ? p.quantite : a && a.q >= 10 ? a.q : 100;
    return p && p.portion_g ? p.portion_g : p && p.quantite && p.quantite <= 400 ? p.quantite : a && a.q >= 10 ? a.q : 100;
  };
  const valeurs = () => alDe(choix) || p || {};
  const grammes = q => piece() ? q * (alDe(choix).gp || 1) : q;
  const libelle = pour === "stock" ? "Ajouter au stock" : pour === "plat" ? "Ajouter à mes plats" : "Continuer";
  const rien = r.inconnu || r.erreur || (!p && !lie);
  d.innerHTML = `<form class="feuille formulaire scan-res" novalidate>
    <p class="rp-sur">Code ${esc(r.code || "")}</p>
    <div class="scan-tete">${p && p.image ? `<img class="scan-image" src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
      <h2 id="dialogueTitre">${p ? esc(p.nom) : lie ? esc(lie.n) : "Produit inconnu"}</h2></div>
    ${p ? `<p class="scan-valeurs chiffres"><span>Pour 100 ${p.unite === "ml" ? "ml" : "g"}</span><span>${nombre(Math.round(p.kcal))} kcal</span><span>${virgule(p.prot)} g de protéines</span><span>${virgule(p.gluc)} g de glucides</span><span>${virgule(p.lip)} g de lipides</span></p>` : ""}
    ${r.inconnu ? `<p class="petit">Open Food Facts ne connaît pas ce code. Décris le produit à l'IA, ou crée-le comme nouvel ingrédient.</p>` : ""}
    ${r.erreur ? `<p class="petit" style="color:var(--critique)">${esc(r.erreur)}</p>` : ""}
    ${p && !lie ? `<fieldset class="scan-choix"><legend class="petit discret">C'est…</legend>
      ${proches.map(a => `<label class="option"><input type="radio" name="scanAl" value="${esc(a.n)}"${choix === a.n ? " checked" : ""}>
        <span><b>Ton aliment « ${esc(a.n)} »</b><small>${nombre(Math.round(a.kcal))} kcal · ${virgule(a.prot)} g de protéines pour 100 g</small></span></label>`).join("")}
      <label class="option"><input type="radio" name="scanAl" value=""${choix === "" ? " checked" : ""}>
        <span><b>Un nouvel aliment</b><small>Avec les valeurs de l'étiquette</small></span></label></fieldset>` : ""}
    ${lie ? `<p class="petit discret">C'est ton aliment « ${esc(lie.n)} ».</p>` : ""}
    ${rien ? "" : `<div class="champ"><label for="scanQ">${pour === "stock" ? "Combien en ajouter" : pour === "plat" ? "Une portion" : "Ce que tu en manges"}</label>
      <div class="scan-q"><input id="scanQ" type="number" inputmode="decimal" min="0" step="any" value="${qDefaut()}"><span id="scanU"></span></div>
      ${pour === "stock" ? "" : `<small class="chiffres" id="scanMacros"></small>`}</div>
      ${pour === "plat" ? `<div class="gouts scan-cat" role="group" aria-label="Pour quel repas">${[["petitdej", "Matin"], ["plat", "Midi ou soir"], ["collation", "Collation"]]
        .map(([c, nom]) => `<button type="button" data-scan-cat="${c}" aria-pressed="${c === cat}">${nom}</button>`).join("")}</div>` : ""}`}
    <small id="eScan" class="erreur" role="alert" style="display:block;margin-top:8px;color:var(--critique)"></small>
    <div class="actions pied"><button type="button" class="bouton second" data-scan-retour>Retour</button>
      ${rien ? `<button type="button" class="bouton" data-scan-encore>${icone("barcode")}Scanner encore</button>` : `<button class="bouton" type="submit">${libelle}</button>`}</div></form>`;
  const f = d.querySelector("form");
  const majQ = () => {
    if (!$("scanQ")) return;
    $("scanU").textContent = piece() ? (Number($("scanQ").value) > 1 ? "pièces" : "pièce") : unite();
    if (!$("scanMacros")) return;
    const v = valeurs(), g = grammes(Number(String($("scanQ").value).replace(",", ".")) || 0);
    $("scanMacros").textContent = g > 0 ? `${nombre(Math.round(v.kcal * g / 100))} kcal · ${nombre(Math.round(v.prot * g / 10) / 10)} g de protéines` : "";
  };
  majQ();
  if ($("scanQ")) $("scanQ").addEventListener("input", majQ);
  f.querySelectorAll("[name=scanAl]").forEach(i => i.addEventListener("change", () => { choix = i.value; $("scanQ").value = qDefaut(); majQ(); }));
  f.querySelectorAll("[data-scan-cat]").forEach(b => b.addEventListener("click", () => {
    cat = b.dataset.scanCat; f.querySelectorAll("[data-scan-cat]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); }));
  f.querySelector("[data-scan-retour]").addEventListener("click", () => o.retour ? o.retour() : d.close("non"));
  if (f.querySelector("[data-scan-encore]")) f.querySelector("[data-scan-encore]").addEventListener("click", () => scannerProduit(pour, o));
  f.addEventListener("submit", async ev => {
    ev.preventDefault();
    const q = Number(String($("scanQ").value).replace(",", "."));
    if (!(q > 0) || q > (piece() ? 40 : 20000)) { $("eScan").textContent = "Une quantité, s'il te plaît."; return $("scanQ").focus(); }
    const b = ev.submitter || f.querySelector("[type=submit]");
    b.disabled = true; b.textContent = "Un instant…";
    const echec = m => { b.disabled = false; b.textContent = libelle; $("eScan").textContent = m; };
    let a = lie;
    if (!a || p) {                          // le code est gardé : la fois d'après, le produit est reconnu tout de suite
      const ok = await appel("/api/produit/choisir", { code: r.code, aliment: lie ? lie.n : choix });
      if (ok !== true || !E.produit_choisi) return echec((ok && ok.erreur) || "Pas enregistré, réessaie.");
      a = E.produit_choisi.aliment;
    }
    const al = { ...a, nom: a.n, ing: [] };
    if (pour === "stock") {
      const deja = ((E.stock || []).find(l => l.nom === a.n && l.unite === a.u) || {}).quantite || 0;
      const ok = await appel("/api/stock", { nom: a.n, unite: a.u, quantite: Math.round((deja + q) * 10) / 10 });
      if (ok !== true) return echec((ok && ok.erreur) || "Pas ajouté, réessaie.");
      d.close("oui"); rendre();
      return dire(`${a.n} : ${quantite(q, a.u)} de plus au stock.`);
    }
    if (pour === "plat") {
      const ok = await appel("/api/produit/plat", { aliment: a.n, q, cat });
      if (ok !== true || !E.au_menu) return echec((ok && ok.erreur) || "Pas créé, réessaie.");
      d.close("oui"); rendre();
      dire(E.au_menu.existant ? `Ce plat existe déjà : « ${recette(E.au_menu.plat).nom} ».` : `« ${recette(E.au_menu.plat).nom} » est dans tes plats.`);
      return ficheRapide(E.au_menu.plat, null);
    }
    o.suite(al, aLaPiece(al) ? { q, u: "pièce" } : { q, u: al.u === "ml" ? "ml" : "g" });
  });
  if (!d.open) d.showModal();
}

/* ------------------------------------------------------------ mon propre plat */
// Les plats retirés pour de bon par la personne (Taha, 22/11/2026) : plus au catalogue ni dans les choix.
// Un plat noté un jour depuis « Ajouter un repas » reste hors de tes plats tant que tu ne l'y mets pas (Taha, 23/11/2026).
const estCopie = id => !!(recette(id) || {}).photo_de;          // le même plat une 2e fois le même jour (Taha, 28/11/2026)
const estRetire = id => (E.plats_retires || []).includes(id) || (E.plats_hors_regime || []).includes(id) || !!(recette(id) || {}).cache || estCopie(id);
// Retiré pour de bon ou hors régime : jamais proposé. Un plat caché (noté un jour, pas gardé) se retrouve en le cherchant
// (Taha, 27/11/2026 : « je l'ai créé 2 fois mais il remonte pas »).
const estExclu = id => (E.plats_retires || []).includes(id) || (E.plats_hors_regime || []).includes(id) || estCopie(id);

/* ------------------------------------------------------------ recherche tolérante */
// Taper un nom de plat (Taha, 27/11/2026 : « si je fais une erreur de frappe, pas grave ») : sans accents, « oe » pour
// « œ » (même en majuscule : « Œufs durs » ne se trouvait pas), pluriels comme singuliers, début de mot suffisant,
// une faute de frappe pardonnée (deux dans un mot de 7 lettres ou plus).
const sansAcc = x => String(x).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
const MOTS_VIDES = new Set(["de", "du", "des", "la", "le", "les", "et", "au", "aux", "un", "une", "avec", "en", "a", "d", "l"]);
const motsRech = x => sansAcc(x).split(/[^a-z0-9]+/).filter(m => m && !MOTS_VIDES.has(m)).map(m => m.length > 3 ? m.replace(/[sx]$/, "") : m);
function fautes(a, b, max) {             // distance d'édition (inversion de deux lettres = une faute), arrêtée au-delà de max
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let p2 = null, p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const c = [i]; let mini = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      c.push(v); if (v < mini) mini = v;
    }
    if (mini > max) return max + 1;
    p2 = p; p = c;
  }
  return p[b.length];
}
function motTrouve(m, n) {               // 2 : le mot du plat commence pareil ; 1 : à une faute près ; 0 : non
  if (n.startsWith(m) || (m.length >= 4 && n.length >= 4 && m.startsWith(n))) return 2;
  if (m.length < 4) return 0;
  const max = m.length >= 7 ? 2 : 1;
  return fautes(m, n, max) <= max || (n.length > m.length && fautes(m, n.slice(0, m.length), max) <= max) ? 1 : 0;
}
const MOTS_PLAT = new WeakMap();
const motsDuPlat = r => { let x = MOTS_PLAT.get(r);
  if (!x) { x = { nom: motsRech(r.nom), ing: motsRech((r.ing || []).map(i => i.n).join(" ")) }; MOTS_PLAT.set(r, x); } return x; };
// Le score d'un plat pour ce qui est tapé (0 = pas trouvé) : chaque mot (ou la part `part` des mots) se retrouve dans
// le nom, ou dans les ingrédients si `ingredients`. Le nom compte plus, l'exact plus que la faute, le nom entier encore plus.
function scoreRecherche(r, mots, { ingredients = false, part = 1 } = {}) {
  if (!mots.length) return 0;
  const x = motsDuPlat(r);
  let total = 0, pris = 0;
  for (const m of mots) {
    let s = 0;
    for (const n of x.nom) { s = Math.max(s, motTrouve(m, n) * 2); if (s === 4) break; }
    if (s < 4 && ingredients) for (const n of x.ing) { s = Math.max(s, motTrouve(m, n)); if (s >= 2) break; }
    if (s) { pris++; total += s; }
  }
  if (pris < Math.ceil(mots.length * part - 1e-9)) return 0;
  return total + (x.nom.join(" ") === mots.join(" ") ? 20 : 0) - x.nom.length * 0.01;
}
const nomExact = (r, mots) => mots.length && motsDuPlat(r).nom.join(" ") === mots.join(" ");
// Ce qu'on tape s'affiche tout de suite ; la liste suit dès qu'on lève le doigt (Taha, 27/11/2026 : « entre lettre et
// lettre j'ai l'impression que je dois attendre »).
const plusTard = (f, ms = 140) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
// Tes aliments, à prendre seuls comme repas (Taha, 28/11/2026 : « skyr nature, pomme… mais seuls ») : la liste vient
// du moteur (/api/aliments : unité, quantité habituelle, grammes d'une pièce, valeurs pour 100 g), une fois ; relue quand
// on crée un aliment ou qu'on change de profil. `puis` redessine quand elle arrive.
const ALIMENTS = { cle: "", liste: null, attente: null };
function aliments(puis) {
  const cle = `${typeof M !== "undefined" && M ? M.uid : ""}|${Object.keys(E.ingredients_perso || {}).length}`;
  if (ALIMENTS.cle === cle && ALIMENTS.liste) return ALIMENTS.liste;
  if (ALIMENTS.cle !== cle) Object.assign(ALIMENTS, { cle, liste: null, attente: null });
  if (!ALIMENTS.attente) ALIMENTS.attente = fetch("/api/aliments").then(r => r.json())
    .then(x => { if (ALIMENTS.cle === cle) ALIMENTS.liste = (x.aliments || []).map(a => ({ ...a, nom: a.n, ing: [] })); })
    .catch(() => { ALIMENTS.attente = null; });
  if (puis && ALIMENTS.attente) ALIMENTS.attente.then(() => { if (ALIMENTS.liste) puis(); });
  return null;
}
// Les aliments qui répondent à ce qui est tapé (fautes pardonnées), sauf ceux dont le plat est déjà dans la liste.
function alimentsTrouves(texte, sauf, puis, n = 3) {
  const mots = motsRech(texte), l = mots.length ? aliments(puis) : null;
  if (!l) return [];
  return l.map(a => ({ a, s: scoreRecherche(a, mots, { part: mots.length === 1 ? 1 : 0.6 }) }))
    .filter(x => x.s > 0 && !(sauf && sauf.has(sansAcc(x.a.nom))))
    .sort((x, y) => y.s - x.s || x.a.nom.length - y.a.nom.length).slice(0, n).map(x => x.a);
}
const aLaPiece = a => !["g", "ml"].includes(a.u);
// La ligne d'« Ajouter un repas » pour un aliment seul : la quantité tapée (« 200 g », « 2 »), sinon celle de tes
// recettes, en grammes ; le moteur en fait le plat de l'aliment et la dose de ce jour-là (repas_au_menu).
function itemAliment(a, lu) {
  let g = Math.round(aLaPiece(a) ? (a.q >= 0.5 ? a.q : 1) * a.gp : (a.q >= 10 ? a.q : 100));
  if (lu && lu.q > 0 && (lu.u === "g" || lu.u === "ml")) g = lu.q;
  else if (lu && lu.q > 0 && (!lu.u || lu.u === "pièce") && aLaPiece(a)) g = Math.round(lu.q * a.gp);
  const pour100 = { kcal: a.kcal, prot: a.prot, gluc: a.gluc, lip: a.lip, fib: a.fib };
  return { nom: a.nom, aliment: a.nom, g, pour100, ...Object.fromEntries(Object.entries(pour100).map(([m, v]) => [m, Math.round(v * g) / 100])),
           source: "tes aliments" };
}
const qteAliment = a => { const it = itemAliment(a); return quantite(aLaPiece(a) ? Math.round(it.g / a.gp * 2) / 2 : it.g, a.u); };
function boutonAliment(a) {                         // dans « Ajouter un repas »
  const it = itemAliment(a);
  return `<button type="button" class="candidat aliment-seul" data-aliment="${esc(a.nom)}"><div class="photo vide carre aliment-pastille">${icone("orange")}</div>
    <span class="texte"><b>${esc(a.nom)}</b><span class="chiffres aliment-chiffres"><span>${qteAliment(a)}</span><span>${nombre(Math.round(it.kcal))} kcal</span><span>${nombre(Math.round(it.prot))} g de protéines</span></span>
    <small class="discret">Un aliment seul</small></span>${icone("caret-right")}</button>`;
}
function ingredientsConnus() {
  // Les ingredients du site et ceux crees par le profil, pour les listes de saisie.
  return [...new Set(E.recettes.filter(r => !r.perso).flatMap(r => r.ing.filter(i => i.u !== "qs").map(i => i.n))
    .concat(Object.keys(E.ingredients_perso || {})))].sort((a, b) => a.localeCompare(b, "fr"));
}
function lireQuantite(texte) {
  // « poulet 150 g », « 150g de poulet », « riz 0,2 kg » -> { nom, q, u } ; sans quantite : { nom }.
  const t = texte.trim(), nb = x => Number(x.replace(",", "."));
  // les cuillères aussi (Taha, 22/11/2026 : « 2 c thé fromage cottage » devenait un aliment nommé « 2 c thé … »)
  const unites = "kg|g|gr|grammes?|cl|ml|l|pi[eè]ces?|pcs?|c\\.? ?[àa]\\.? ?c\\.?|c\\.? ?[àa]\\.? ?s\\.?|cuill[eè]res? [àa] (?:caf[eé]|soupe)|c\\.? (?:th[eé]|caf[eé]|soupe)|cc|cs";
  let m = t.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${unites})?\\.?$`, "i"));
  if (m) return mesure(m[1], nb(m[2]), m[3]);
  m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${unites})?\\s+(?:de\\s+|d['’]\\s*)?(.+)$`, "i"));
  if (m) return mesure(m[3], nb(m[1]), m[2]);
  return { nom: t };
  function mesure(nom, q, u) {
    u = (u || "").toLowerCase();
    if (u === "kg" || u === "l") q *= 1000;
    if (u === "cl") q *= 10;
    const unite = /^(kg|g|gr|gramme|grammes)$/.test(u) ? "g" : /^(l|cl|ml)$/.test(u) ? "ml"
      : /soupe|^cs$|s\.?$/.test(u) && /^c/.test(u) ? "c.à.s" : /th[eé]|caf[eé]|^cc$|[àa]\.? ?c\.?$/.test(u) ? "c.à.c" : u ? "pièce" : "";
    return { nom: nom.trim(), q: Math.round(q * 100) / 100, u: unite };
  }
}
function demanderPlatPerso(ctx, saisie = { nom: "", ingredients: [], telQuel: true }, erreur = "") {
  // Par défaut, exactement ce que tu dis (Taha, 18/11/2026 : « je dis café au lait Tassimo, il met d'autres choses »).
  // ctx = { cat, k, n, moment, remplace } : le repas a remplacer, ou seulement { cat } depuis le catalogue.
  const d = $("dialogue"), connus = ingredientsConnus(), unites = saisie.unites || {};
  const qs = Object.fromEntries(Object.entries(saisie.quantites || {}).map(([n, q]) => [n, q && typeof q === "object" ? q.q : q]));
  const garder = (ingredients, telQuel, renomme = {}, nom = $("ppNom").value) => {   // les quantites tapees suivent les pastilles
    const q = {}, u = {};
    ingredients.forEach(n => { const avant = Object.keys(renomme).find(k => renomme[k] === n) || n;
      if (qs[avant] != null) { q[n] = qs[avant]; u[n] = unites[avant]; } });
    return { nom, telQuel, ingredients, quantites: q, unites: u };
  };
  const CATS = { plat: "un plat", petitdej: "un petit-déjeuner", collation: "une collation" };
  // Refaite (Taha, 23/11/2026 : « la page créer mon propre plat est nulle ») : même en-tête que les autres fenêtres,
  // textes courts, rubriques.
  d.innerHTML = `<form class="feuille formulaire form-propre" novalidate>
    <div class="rp-tete"><div><p class="rp-sur">${ctx.remplace ? "Remplacer" : CATS[ctx.cat] ? "Créer " + CATS[ctx.cat] : "Catalogue"}</p><h2 id="dialogueTitre">Mon propre plat</h2></div>
      <button type="button" class="rp-fermer" data-fermer-pp aria-label="Fermer">${icone("x")}</button></div>
    <p class="fp-intro">Ce que tu manges, avec les quantités si tu les connais. L'appli met exactement ça.</p>
    <div class="champ"><label for="ppNom">Nom du plat <small>(facultatif)</small></label>
      <input id="ppNom" name="nom" type="text" maxlength="80" autocomplete="off" placeholder="Poulet riz de ma mère" value="${esc(saisie.nom)}"></div>
    <div class="champ"><label for="ppIng">Ingrédients</label>
      <div class="ajout"><input id="ppIng" type="text" list="ppConnus" autocomplete="off" maxlength="300" placeholder="Café au lait Tassimo, 2 œufs, riz 80 g…">
        <button class="bouton second" type="button" id="ppAjouter">Ajouter</button></div>
      <datalist id="ppConnus">${connus.map(n => `<option value="${esc(n)}">`).join("")}</datalist>
      <small>Un par un ou séparés par des virgules. Sans quantité : une portion habituelle, réglable ensuite.</small></div>
    <div class="gouts" id="ppListe" aria-label="Ingrédients choisis">${saisie.ingredients.map((n, i) => `<button type="button" data-oter="${i}" aria-label="Retirer ${esc(n)}">${esc(n)}${qs[n] != null ? ` · ${nombre(qs[n])}${unites[n] && unites[n] !== "pièce" ? " " + unites[n] : ""}` : ""}${icone("x")}</button>`).join("")}</div>
    <div class="options" style="margin-top:14px"><label class="option"><input type="checkbox" id="ppCompleter"${saisie.telQuel ? "" : " checked"}>
      <span><b>L'IA complète la recette ${BADGE_IA}</b><small>Ajoute ce qui manque (matière grasse, épices…) et règle les quantités sur ${ctx.remplace ? `« ${esc(recette(ctx.remplace).nom)} »` : "ton objectif"}. Il faut un nom de plat.</small></span></label></div>
    <small id="ePerso" class="erreur" role="alert" style="display:block;margin-top:12px;color:var(--critique)">${erreur}</small>
    <div class="actions pied"><button class="bouton second" type="button" value="non">${ctx.retour ? "Retour" : "Annuler"}</button>
      <button class="bouton" type="submit">Voir le plat</button></div></form>`;
  const fermerPP = d.querySelector("[data-fermer-pp]");
  if (fermerPP) fermerPP.addEventListener("click", () => ctx.retour ? ctx.retour() : d.close("non"));
  const lire = () => ({ nom: $("ppNom").value.trim(), ingredients: saisie.ingredients, telQuel: !$("ppCompleter").checked, unites: saisie.unites,
    quantites: Object.fromEntries(Object.entries(saisie.quantites || {}).map(([n, q]) => [n, unites[n] != null ? { q, u: unites[n] } : q])) });
  const ajouter = () => {
    // « et » et « + » séparent aussi, sauf dans le nom d'un ingrédient connu (« Pizza thon + sandwich kebab + frites »).
    const brut = $("ppIng").value, entier = connus.find(n => n.toLowerCase() === brut.trim().toLowerCase());
    const lus = (entier ? [entier] : brut.split(/[,;\n+]|\s+et\s+/i)).map(x => x.trim()).filter(Boolean).map(lireQuantite).filter(x => x.nom);
    if (!lus.length) return false;
    const suite = garder([...saisie.ingredients, ...lus.map(x => x.nom).filter(x => !saisie.ingredients.includes(x))], !$("ppCompleter").checked);
    lus.filter(x => x.q != null).forEach(x => { suite.quantites[x.nom] = x.q; suite.unites[x.nom] = x.u; });
    if (lus.some(x => x.q != null)) suite.telQuel = true;     // des grammes donnes : l'appli les garde tels quels
    demanderPlatPerso(ctx, suite);
    $("ppIng").focus();
    return true;
  };
  d.querySelector("[value=non]").addEventListener("click", () => ctx.retour ? ctx.retour() : d.close("non"));
  $("ppAjouter").addEventListener("click", ajouter);
  $("ppIng").addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); ajouter(); } });
  d.querySelectorAll("[data-oter]").forEach(b => b.addEventListener("click", () =>
    demanderPlatPerso(ctx, garder(saisie.ingredients.filter((_, i) => i !== Number(b.dataset.oter)), !$("ppCompleter").checked))));
  d.querySelectorAll("[data-proche]").forEach(b => b.addEventListener("click", () =>
    demanderPlatPerso(ctx, garder(saisie.ingredients.map(x => x === b.dataset.pour ? b.dataset.proche : x), !$("ppCompleter").checked, { [b.dataset.pour]: b.dataset.proche }))));
  d.querySelectorAll("[data-creer]").forEach(b => b.addEventListener("click", () => {
    const pour = b.dataset.creer, garde = garder(saisie.ingredients, !$("ppCompleter").checked);
    demanderIngredient({ nom: pour, creer: true,
      retour: () => demanderPlatPerso(ctx, garde),
      apres: nom => demanderPlatPerso(ctx, garder(saisie.ingredients.map(x => x === pour ? nom : x), garde.telQuel, { [pour]: nom }, garde.nom)) });
  }));
  d.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault(); ev.stopPropagation();
    if ($("ppIng").value.trim()) return ajouter();
    const s = lire();
    if (!s.ingredients.length) { $("ePerso").textContent = "Ajoute au moins un ingrédient."; return $("ppIng").focus(); }
    if (s.nom.length < 3 && !s.telQuel) { $("ePerso").textContent = "Donne un nom à ton plat."; return $("ppNom").focus(); }
    // le bouton qui a envoyé (ou celui du formulaire : la touche Entrée n'en donne pas toujours) (27/11/2026)
    const bouton = ev.submitter || d.querySelector("form [type=submit]");
    if (bouton) bouton.disabled = true;
    // L'IA complète la recette (une dizaine de secondes) : la même carte d'attente que « L'IA calcule » (27/11/2026).
    if (!s.telQuel) attenteIA(d, { titre: "L'IA complète", sujet: s.nom || s.ingredients.map(i => i.nom || i).join(", "),
      etapes: ["Ingrédients", "Quantités", "Étapes"], annuler: () => { s.annule = true; demanderPlatPerso(ctx, s); } });
    apercuPlatPerso(ctx, s);
  });
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
async function apercuPlatPerso(ctx, saisie) {
  // Jarvis complete la recette ; rien n'est enregistre avant le bouton du bas.
  const d = $("dialogue"), corps = { nom: saisie.nom, ingredients: saisie.ingredients, tel_quel: !!saisie.telQuel, quantites: saisie.quantites || null, cat: ctx.cat, remplace: ctx.remplace || null,
                                    modes: ctx.k != null ? (planDe(ctx.k).modes || []) : null };
  let p;
  try {
    const r = await fetch("/api/plat_perso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corps, apercu: true }) });
    const rep = await r.json();
    if (saisie.annule) return;                       // annulé pendant que l'IA complétait
    if (!r.ok) return demanderPlatPerso(ctx, saisie, esc(rep.erreur || "L'appli a refusé."));
    p = rep.plat;
  } catch (e) { if (saisie.annule) return; return demanderPlatPerso(ctx, saisie, "L'appli ne répond pas."); }
  if (!p.recette) {
    return demanderPlatPerso(ctx, saisie, p.inconnus.map(x => `Je ne connais pas « ${esc(x.nom)} ».${x.proches.length
      ? ` Tu voulais dire ${x.proches.map(n => `<button type="button" class="lien" data-pour="${esc(x.nom)}" data-proche="${esc(n)}">${esc(n)}</button>`).join(", ")} ?` : ""}
      Sinon <button type="button" class="lien" data-creer="${esc(x.nom)}">crée « ${esc(x.nom)} » avec Claude ${BADGE_IA}</button>.`).join("<br>"));
  }
  const r = p.recette, c = p.cible, f = ctx.k != null ? planDe(ctx.k).jours[ctx.n].facteur : 1;
  const mesure = (nom, valeur, cible, unite) => { const pct = Math.min(100, Math.round(100 * valeur / Math.max(1, cible)));
    return `<div class="mesure"><span class="nom">${nom}</span><span class="valeurs chiffres"><b>${nombre(valeur)} ${unite}</b> pour ${nombre(cible)} visés</span>
      <span class="piste" role="img" aria-label="${pct} % de la cible"><i style="width:${pct}%"></i></span></div>`; };
  const loin = !p.tel_quel && (Math.abs(p.ecart.kcal) > c.kcal * 0.1 || Math.abs(p.ecart.prot) > Math.max(6, c.prot * 0.15));
  const pas = i => i.u === "g" || i.u === "ml" ? (i.q < 30 ? 5 : 10) : 0.5;
  d.innerHTML = `<form class="feuille" novalidate>
    <h2 id="dialogueTitre">${esc(r.nom)}</h2>
    ${p.tel_quel ? `<p class="petit discret" style="margin:-4px 0 12px">Tes quantités : rien d'ajouté ni recalculé. Règle-les avec − et + ou tape le grammage. ${euros(p.cout)} la portion.</p>
    <div class="macros" role="status">${[["Calories", r.kcal, "kcal"], ["Protéines", r.prot, "g"], ["Glucides", r.gluc, "g"], ["Lipides", r.lip, "g"]].map(([nom, v, u]) => `<div class="macro"><span>${nom}</span><b>${nombre(v)} ${u}</b></div>`).join("")}</div>`
    : `<p class="petit discret" style="margin:-4px 0 12px">Une portion, calée sur ${c.d_apres ? `« ${esc(c.d_apres)} » qu'il remplace` : "la part de ce repas dans ton objectif du jour"}. ${euros(p.cout)} la portion.</p>
    <div class="jour-change">${mesure("Calories", r.kcal, c.kcal, "kcal")}${mesure("Protéines", r.prot, c.prot, "g")}</div>`}
    ${loin ? `<p class="dujour" style="margin-top:12px"><strong>Cible pas tout à fait tenue.</strong> Avec ces ingrédients, l'appli ne peut pas faire mieux sans sortir de quantités raisonnables. Ajoute ${p.ecart.prot < 0 ? "une protéine (poulet, œufs, thon…)" : "un féculent ou enlève un ingrédient riche"} si tu veux t'en rapprocher.</p>` : ""}
    <h3>Ingrédients pour une portion</h3>
    ${p.tel_quel ? `<ul class="lignes reglables">${r.ing.map((i, n) => i.u === "qs" ? `<li><span>${esc(i.n)}</span><span class="q">au goût</span></li>`
      : `<li><label for="pq${n}">${esc(i.n)}</label><span class="reglage"><button type="button" data-n="${n}" data-sens="-1" aria-label="Moins de ${esc(i.n)}">−</button>
          <input id="pq${n}" data-n="${n}" type="number" inputmode="decimal" min="0" step="${pas(i)}" value="${i.q}">
          <button type="button" data-n="${n}" data-sens="1" aria-label="Plus de ${esc(i.n)}">+</button><span class="unite">${esc(i.u)}</span></span></li>`).join("")}</ul>`
    : `<ul class="lignes">${r.ing.map(i => `<li><span>${esc(i.n)}${p.ajoutes.includes(i.n) ? `<small>Ajouté par l'IA pour compléter la recette</small>` : ""}</span><span class="q">${quantite(i.q, i.u)}</span></li>`).join("")}</ul>`}
    ${p.tel_quel ? "" : p.par_claude ? `<details style="margin-top:12px"><summary>La recette, ${r.temps} min${icone("caret-right")}</summary>
      <ol class="etapes" style="margin:8px 0 0;padding-left:20px;display:grid;gap:6px">${r.etapes.map(e => `<li>${esc(e)}</li>`).join("")}</ol></details>`
      : `<p class="petit discret" style="margin-top:10px">Claude n'a pas répondu : la recette est complétée avec les règles simples du site, sans épices ni vraie méthode.</p>`}
    ${Object.keys(p.compris).length ? `<p class="petit discret" style="margin-top:10px">J'ai compris : ${Object.entries(p.compris).map(([a, b]) => `« ${esc(a)} » = ${esc(b)}`).join(", ")}.</p>` : ""}
    ${f !== 1 && !p.tel_quel ? `<p class="petit discret" style="margin-top:6px">Ces quantités sont celles de la recette de base. Ce jour-là, le site ajuste toutes tes assiettes à ${nombre(f * 100)} % pour tomber sur tes calories : dans Cuisine tu verras les quantités déjà ajustées, à cuisiner et à manger en entier.</p>` : ""}
    ${p.manque.length || p.boucher.length ? `<h3>À acheter pour ce plat</h3>
      <ul class="lignes">${p.manque.map(m => `<li><span>${esc(m.nom)}</span><span class="q">${quantite(m.quantite, m.unite)}</span></li>`).join("")}
        ${p.boucher.map(m => `<li><span>${esc(m.nom)}<small>Chez le boucher</small></span><span class="q">${quantite(m.quantite, m.unite)}</span></li>`).join("")}</ul>`
      : `<p class="dujour" style="margin-top:14px"><strong>Rien à acheter.</strong> Ton stock couvre une portion.</p>`}
    ${p.existe ? `<p class="petit discret" style="margin-top:10px">Tu as déjà un plat de ce nom : il sera remplacé par celui-ci.</p>` : ""}
    <div class="actions pied"><button class="bouton second" type="button" value="non">Modifier</button>
      <button class="bouton" type="submit">${ctx.moment ? "Enregistrer et mettre au menu" : "Enregistrer mon plat"}</button></div></form>`;
  d.querySelector("[value=non]").addEventListener("click", () => demanderPlatPerso(ctx, saisie));
  const avec = (i, q) => apercuPlatPerso(ctx, { ...saisie, quantites: { ...Object.fromEntries(r.ing.filter(x => x.u !== "qs").map(x => [x.n, x.q])), [i.n]: Math.max(pas(i), q) } });
  d.querySelectorAll("[data-sens]").forEach(b => b.addEventListener("click", () => { const i = r.ing[Number(b.dataset.n)];
    avec(i, Math.round((i.q + Number(b.dataset.sens) * pas(i)) / pas(i)) * pas(i)); }));
  d.querySelectorAll("input[data-n]").forEach(c => c.addEventListener("change", () => avec(r.ing[Number(c.dataset.n)], Number(c.value) || 0)));
  d.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault(); ev.stopPropagation();
    if (await appel("/api/plat_perso", { ...corps, quantites: p.tel_quel ? Object.fromEntries(r.ing.filter(x => x.u !== "qs").map(x => [x.n, x.q])) : null, apercu: false }) !== true) return;
    if (ctx.moment) return apercuChangement(ctx.k, ctx.operation(r.id), `Mettre « ${r.nom} » au menu ?`);
    d.close("oui");
    rendre();
    dire("Plat enregistré : il est dans ton catalogue.");
  });
  d.scrollTop = 0;
}

/* ------------------------------------------------------------ un ingredient : le creer ou corriger ses valeurs */
async function demanderIngredient(o) {
  // o = { nom, creer, apres(nom), retour() }. creer : Claude propose les valeurs du produit tape
  // (rien n'est enregistre avant le bouton) ; sinon les valeurs de l'ingredient, a corriger.
  const d = $("dialogue"), fermer = () => o.retour ? o.retour() : d.close("non");
  d.innerHTML = `<div class="feuille"><h2 id="dialogueTitre">${o.creer ? "Nouvel ingrédient" : esc(o.nom)}</h2>
    <p class="discret" role="status">${o.creer ? `Claude cherche les valeurs de « ${esc(o.nom)} »…` : "Chargement…"}</p></div>`;
  if (!d.open) d.showModal();
  let v;
  try {
    const r = await fetch(o.creer ? "/api/ingredient/proposer" : "/api/ingredient/valeurs",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nom: o.nom }) });
    const rep = await r.json();
    if (!r.ok) { dire(rep.erreur || "L'appli a refusé."); return fermer(); }
    v = rep.ingredient;
  } catch (e) { dire("L'appli ne répond pas."); return fermer(); }
  const nouveau = o.creer || v.cree, val = o.creer ? v : v.valeurs, u = (nouveau ? v.u : null) || "g";
  // D'où viennent les valeurs : l'étiquette lue en ligne (avec son lien), sinon l'estimation de Claude.
  const origine = i => { const e = i == null ? null : (v.etiquettes || [])[i];
    return e ? `Valeurs lues sur l'étiquette en ligne : <a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.nom)}</a> (${esc(e.source)}). Vérifie que c'est bien ton produit.`
      : v.par_claude ? ((v.etiquettes || []).length ? "Aucune étiquette en ligne n'est exactement ce produit : valeurs estimées par Claude. Prends un produit de la liste s'il correspond, ou recopie l'étiquette (tableau « pour 100 g »)."
        : "Aucune étiquette trouvée en ligne : valeurs estimées par Claude. Vérifie-les avec le tableau « pour 100 g » de l'étiquette avant d'enregistrer.")
      : "Claude n'a pas répondu : recopie les valeurs de l'étiquette (tableau « pour 100 g »)."; };
  const champ = (id, libelle, valeur, unite) => `<div class="champ" style="margin:0"><label for="${id}">${libelle}</label>
    <input id="${id}" type="text" inputmode="decimal" autocomplete="off" value="${valeur == null ? "" : String(valeur).replace(".", ",")}" placeholder="${unite}"></div>`;
  const MAC = [["kcal", "Calories", "kcal"], ["prot", "Protéines", "g"], ["gluc", "Glucides", "g"], ["lip", "Lipides", "g"], ["fib", "Fibres", "g"]];
  d.innerHTML = `<form class="feuille formulaire form-propre" novalidate>
    <div class="rp-tete"><div><p class="rp-sur">${o.creer ? "Nouvel ingrédient" : "Ingrédient"}</p><h2 id="dialogueTitre">${esc(o.creer ? (o.nom || "Nouvel ingrédient") : v.nom)}</h2></div>
      <button type="button" class="rp-fermer" data-fermer-in aria-label="Fermer">${icone("x")}</button></div>
    ${o.creer ? `<p class="fp-intro" id="inOrigine">${origine(v.etiquette)}</p>`
      : `<p class="fp-intro">${v.nb_plats ? `Utilisé dans ${v.nb_plats > 1 ? `${v.nb_plats} plats` : `${v.nb_plats} plat`} : ${v.nb_plats > 1 ? "ils seront recalculés" : "il sera recalculé"} pour toi.` : "Utilisé dans aucun plat pour l'instant."}
        ${v.corrige ? " Tu as déjà corrigé ces valeurs." : v.cree ? " Ingrédient créé par toi." : " Valeurs du site (ordres de grandeur des tables CIQUAL)."}</p>`}
    ${o.creer && (v.deja || []).length ? `<div class="dujour" style="margin-bottom:12px"><strong>Tu l'as peut-être déjà.</strong>
      ${v.deja.map(n => `<span style="display:block;margin-top:6px">${esc(n)} : <button type="button" class="lien" data-deja="${esc(n)}">prendre celui-ci</button>
        · <button type="button" class="lien" data-modifier="${esc(n)}">modifier ses valeurs</button></span>`).join("")}</div>` : ""}
    ${o.creer && v.attention ? `<p class="dujour" style="margin-bottom:12px"><strong>À vérifier :</strong> ${esc(v.attention)}</p>` : ""}
    ${o.creer && (v.etiquettes || []).length ? `<details class="etiquettes" style="margin-bottom:12px"${v.etiquette == null ? " open" : ""}><summary>${v.etiquette == null ? "Produits proches trouvés en ligne" : "Autres produits trouvés en ligne"} (${v.etiquettes.length})${icone("caret-right")}</summary>
      <ul class="lignes">${v.etiquettes.map((e, i) => `<li><span><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.nom)}</a>
        <small class="discret" style="display:block">${esc(e.source)} · pour 100 g : ${nombre(e.kcal)} kcal, ${String(e.prot).replace(".", ",")} g de protéines${e.portion_g ? ` · portion ${nombre(e.portion_g)} g` : ""}${e.attention ? ` · ${esc(e.attention)}` : ""}</small></span>
        <button type="button" class="lien" data-etiquette="${i}">prendre ces valeurs</button></li>`).join("")}</ul></details>` : ""}
    ${nouveau ? `<p class="fp-rubrique">L'aliment</p>` : ""}
    ${o.creer ? `<div class="champ"><label for="inNom">Nom</label><input id="inNom" type="text" maxlength="80" autocomplete="off" value="${esc(v.nom)}" required></div>` : ""}
    ${nouveau ? `<div class="fp-grille">
      <div class="champ" style="margin:0"><label for="inU">Unité</label><select id="inU"><option value="g"${u === "g" ? " selected" : ""}>grammes</option><option value="ml"${u === "ml" ? " selected" : ""}>millilitres</option></select></div>
      ${champ("inQ", "Une portion", v.q, u)}
      <div class="champ" style="margin:0"><label for="inA">Rayon</label><select id="inA">${E.rayons.map((n, k) => `<option value="${k}"${k === Number(v.a) ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      ${champ("inPrix", "Prix au kilo (€)", v.prix, "€")}</div>` : ""}
    <p class="fp-rubrique" id="inPour">Pour 100 ${u}</p>
    <div class="fp-macros">${MAC.map(([k, nom, un]) => champ("in_" + k, `${nom} <small>${un}</small>`, val[k], un)).join("")}</div>
    ${nouveau && E.claude === false ? `<details class="fp-vit"><summary><span class="fp-vit-t">Vitamines pour 100 g</span><small>facultatif, 0 si tu ne sais pas</small>${icone("caret-right")}</summary>
      ${champsVitamines("inV_", Object.fromEntries(Object.keys(UNITES_VIT).map(x => [x, 0])))}</details>` : ""}
    ${!o.creer && v.corrige && v.site ? `<p class="petit discret" style="margin-top:10px">Valeurs du site : ${v.site.kcal} kcal, ${String(v.site.prot).replace(".", ",")} g de protéines, ${String(v.site.gluc).replace(".", ",")} g de glucides, ${String(v.site.lip).replace(".", ",")} g de lipides.
      <button type="button" class="lien" id="inRetablir">Revenir à ces valeurs</button></p>` : ""}
    ${!o.creer && v.cree ? `<p class="petit" style="margin-top:10px"><button type="button" class="lien" id="inRetablir">Supprimer cet ingrédient</button></p>` : ""}
    <small id="eIng" class="erreur" role="alert" style="display:block;margin-top:12px;color:var(--critique)"></small>
    <div class="actions pied"><button class="bouton second" type="button" value="non">${o.retour ? "Retour" : "Annuler"}</button>
      <button class="bouton" type="submit">${o.creer ? "Créer l'ingrédient" : "Enregistrer"}</button></div></form>`;
  const nb = id => { const x = $(id) ? $(id).value.trim().replace(",", ".") : ""; return x === "" ? null : Number(x); };
  let choisie = o.creer ? v.etiquette : null;
  d.querySelectorAll("[data-etiquette]").forEach(b => b.addEventListener("click", () => {
    const e = v.etiquettes[Number(b.dataset.etiquette)];
    choisie = Number(b.dataset.etiquette);
    for (const [k] of MAC) $("in_" + k).value = String(e[k]).replace(".", ",");
    if (e.portion_g && $("inQ")) $("inQ").value = String(e.portion_g).replace(".", ",");
    $("inOrigine").innerHTML = origine(choisie);
    dire("Valeurs de l'étiquette reprises : vérifie la portion.");
  }));
  d.querySelector("[value=non]").addEventListener("click", fermer);
  d.querySelectorAll("[data-deja]").forEach(b => b.addEventListener("click", () => o.apres ? o.apres(b.dataset.deja) : d.close("non")));
  d.querySelectorAll("[data-modifier]").forEach(b => b.addEventListener("click", () =>
    demanderIngredient({ nom: b.dataset.modifier, retour: () => demanderIngredient(o), apres: o.apres })));
  if ($("inU")) $("inU").addEventListener("change", () => { $("inPour").textContent = "Pour 100 " + $("inU").value; });
  const fermerIn = d.querySelector("[data-fermer-in]");
  if (fermerIn) fermerIn.addEventListener("click", fermer);
  if ($("inRetablir")) $("inRetablir").addEventListener("click", async () => {
    if (await appel("/api/ingredient/retirer", { nom: v.nom }) !== true) return;
    d.close("oui"); rendre(); dire(v.cree ? "Ingrédient supprimé." : "Valeurs du site rétablies.");
  });
  d.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault(); ev.stopPropagation();
    const lue = o.creer && choisie != null ? v.etiquettes[choisie] : null;
    const corps = { nom: o.creer ? $("inNom").value.trim() : v.nom,
                    source: lue ? `étiquette ${lue.source} : ${lue.url}` : o.creer && v.par_claude ? "proposé par Claude, vérifié par toi" : "" };
    for (const [k] of MAC) {
      corps[k] = nb("in_" + k);
      if (corps[k] == null || Number.isNaN(corps[k])) { $("eIng").textContent = "Remplis les cinq valeurs pour 100 " + u + " (0 si l'étiquette n'en donne pas)."; return $("in_" + k).focus(); }
    }
    if (nouveau) Object.assign(corps, { u: $("inU").value, q: nb("inQ"), a: Number($("inA").value), prix: nb("inPrix") });
    if (nouveau && E.claude === false) {
      const vit = lireVitamines("inV_");
      if (vit.erreur) { $("eIng").textContent = vit.erreur; return; }
      corps.vitamines = vit;
    } else if (o.creer && v.vitamines) corps.vitamines_claude = v.vitamines;      // déjà données : pas un appel de plus
    const ok = await appel("/api/ingredient/enregistrer", corps);
    if (ok !== true) { $("eIng").textContent = (ok && ok.erreur) || ""; return; }
    const nom = E.ingredient || corps.nom;
    if (o.apres) return o.apres(nom);
    d.close("oui"); rendre();
    dire(o.creer ? `« ${nom} » créé.` : `Valeurs enregistrées${v.nb_plats ? ` : ${v.nb_plats > 1 ? `${v.nb_plats} plats recalculés` : `${v.nb_plats} plat recalculé`}` : ""}.`);
  });
  if (!TACTILE.matches) (o.creer ? $("inNom") : $("in_kcal")).focus();
  d.scrollTop = 0;
}

/* ------------------------------------------------------------ ajuster les quantites d'une recette */
const AVANT_POUBELLE = new Map();
let AJ_NOTE = null;                        // le dernier ingrédient ajouté, affiché une fois (avec « Retirer »)          // « plat|ingrédient » → sa quantité avant la poubelle (pour ↺)
async function demanderAjustement(id, quantites = null, jour = null) {
  // jour = { k, n, retour } : pour ce jour-la seulement ; sinon la recette du profil, tous les jours.
  // Chaque changement est recalcule par le site ; rien n'est enregistre avant le bouton du bas.
  const d = $("dialogue");
  let a;
  try {
    const r = await fetch("/api/recette/ajuster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plat: id, quantites, apercu: true, ...(jour ? { jour: jour.n, semaine: jour.k } : {}) }) });
    const rep = await r.json();
    if (!r.ok) return dire(rep.erreur || "L'appli a refusé.");
    a = rep.ajustement;
  } catch (e) { return dire("L'appli ne répond pas."); }
  // Le serveur garde les quantites d'UNE portion de base. Pour un jour, on saisit celles d'UN repas de ce jour :
  // portion de base × taille de l'assiette (R-01). La page Cuisine multiplie ensuite par le nombre de repas.
  const jj = jour ? planDe(jour.k).jours[jour.n] : null;
  const t = jj ? tailleDe(jj, id) : 1;
  const seance = jj ? jj.cuisine.find(c => c.id === id) : null;
  const actuel = Object.fromEntries(a.ingredients.filter(i => i.u !== "qs").map(i => [i.n, i.q]));    // portion de base
  const pas = i => i.u === "g" || i.u === "ml" ? (i.base * t < 30 ? 5 : 10) : 0.5;
  const arrondi = (q, i) => Math.max(0, Math.round(q / pas(i)) * pas(i));
  const vu = i => Math.round(i.q * t * 10) / 10;                    // ce qui s'affiche : un repas
  const versBase = (q, i) => Math.round(q / t * 100) / 100;          // ce qui s'enregistre : une portion de base
  const change = a.ingredients.some(i => i.u !== "qs" && i.q !== i.base);
  // Les chiffres comme sur la carte d'un plat (Taha, 22/11/2026) ; l'écart s'affiche seulement quand une quantité change.
  const ligne = (nom, cle, unite, bonSiPlus) => { const avant = a.avant[cle] * t, apres = a.apres[cle] * t, delta = Math.round(apres) - Math.round(avant);
    return `<div><b>${nombre(apres)}${unite === "kcal" ? "" : ` ${unite}`}</b><span>${nom}</span>${delta ? `<small class="${bonSiPlus === null ? "" : (delta > 0) === bonSiPlus ? "aj-bon" : "aj-mauvais"}">${delta > 0 ? "+" : "−"}${nombre(Math.abs(delta))}</small>` : ""}</div>`; };
  // Taha, 22/11/2026 : la journée au-dessus des chiffres du plat (calories et protéines du jour), avec l'écart quand une
  // quantité change ; « Valider » enregistre tout de suite, sans fenêtre « ce que ça change ».
  if (jour && jour.depart == null) jour.depart = { kcal: a.apres.kcal * t, prot: a.apres.prot * t };
  const sJ = jour ? planDe(jour.k) : null, plusJ = jour ? enPlusDuJour(sJ, jour.n) : null, objJ = sJ ? sJ.objectif || {} : {};
  const tuileJour = (nom, cle, unite) => { const base = (jj[cle] || 0) + plusJ[cle], delta = Math.round(a.apres[cle] * t) - Math.round(jour.depart[cle]);
    return `<div><span>${nom}</span><b class="chiffres">${nombre(Math.round(base + delta))}${objJ[cle] ? `<small> / ${nombre(objJ[cle])}</small>` : ""} ${unite}</b>${delta ? `<small class="ecart ${cle === "prot" ? (delta > 0 ? "aj-bon" : "aj-mauvais") : ""}">${delta > 0 ? "+" : "−"}${nombre(Math.abs(delta))} ${unite}</small>` : ""}</div>`; };
  const note = AJ_NOTE && AJ_NOTE.id === id ? AJ_NOTE : null;
  AJ_NOTE = null;
  const connusTous = ingredientsConnus(), dans = new Set(a.ingredients.filter(i => i.q > 0 || i.u === "qs").map(i => i.n));
  const sansAccents = x => String(x).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").trim();
  d.innerHTML = `<form class="feuille aj-form" novalidate>
    <h2 id="dialogueTitre">${jour ? "Modifier les ingrédients" : `Ajuster « ${esc(a.nom)} »`}</h2>
    ${jour ? `<p class="petit discret" style="margin:-4px 0 12px">« ${esc(a.nom)} », ${planDe(jour.k).jours[jour.n].jour.toLowerCase()} seulement.</p>` : ""}
    ${jour ? "" : `<p class="petit discret" style="margin:-4px 0 12px">Pour tous les jours où ce plat est au menu.</p>`}
    ${jour ? `<div class="aj-jour" role="status">${tuileJour("Calories du jour", "kcal", "kcal")}${tuileJour("Protéines du jour", "prot", "g")}</div>` : ""}
    <div class="cp-chiffres aj-chiffres" role="status">${ligne("kcal", "kcal", "kcal", null)}${ligne("prot.", "prot", "g", true)}${ligne("gluc.", "gluc", "g", null)}${ligne("lip.", "lip", "g", null)}</div>
    <h3>Ingrédients</h3>
    <ul class="lignes reglables">${a.ingredients.map((i, n) => i.u === "qs" ? `<li><span>${esc(i.n)}</span><span class="q">au goût</span></li>`
      : `<li${i.q === 0 ? ' class="retire"' : ""}>${i.q === 0 ? `<button type="button" class="ing-remettre" data-remettre-ing="${n}" aria-label="Remettre ${esc(i.n)}">↺</button>`
          : `<button type="button" class="ing-poubelle" data-retirer-ing="${n}" aria-label="Retirer ${esc(i.n)}">${icone("poubelle")}</button>`}<label for="aj${n}">${esc(i.n)}${i.ajoute ? `<small>ajouté par toi</small>` : i.q === 0 ? `<small>retiré</small>` : ""}
        ${i.ajoute ? "" : `<small><button type="button" class="lien" data-changer="${n}">Changer d'ingrédient</button></small>`}${seance && seance.repas > 1 ? `<small>à cuisiner pour ${seance.repas} repas : ${quantite(i.q * seance.portions, i.u)}</small>` : ""}</label>
        <span class="reglage"><button type="button" data-n="${n}" data-sens="-1" aria-label="Moins de ${esc(i.n)}">−</button>
          <input id="aj${n}" data-n="${n}" type="number" inputmode="decimal" min="0" step="${pas(i)}" value="${vu(i)}" aria-describedby="au${n}">
          <button type="button" data-n="${n}" data-sens="1" aria-label="Plus de ${esc(i.n)}">+</button><span class="unite" id="au${n}">${esc(i.u)}</span></span></li>`).join("")}</ul>
    ${note ? `<p class="aj-note" role="status">${note.texte} <button type="button" class="lien" data-note-retirer>Retirer</button>${note.voir ? ` · <button type="button" class="lien" data-note-voir>Voir ses valeurs</button>` : ""}</p>` : ""}
    <div class="champ ing-cherche" style="margin-top:14px"><label for="ajNouveau" id="ajNouveauTitre">Ajouter un ingrédient</label>
      <div class="aj-ajout"><div class="rp-recherche${E.claude === false ? "" : " champ-ia"}">${icone(E.claude === false ? "magnifying-glass" : "sparkle")}<input id="ajNouveau" type="search" maxlength="80" enterkeyhint="go" autocomplete="off"
        placeholder="Quinoa, skyr Lidl…" aria-describedby="ajAide"></div><button type="button" class="bouton second" id="ajAjouter"><span class="aj-ia-ic" hidden>${icone("sparkle")}</span>Ajouter</button></div>
      <ul class="ing-suggestions" id="ajSuggestions" aria-label="Ingrédients trouvés"></ul>
      <small id="ajAide">Tape un nom : ${connusTous.length} ingrédients connus${E.claude === false ? "" : ". Sinon, l'IA le retrouve ou le crée"}.</small></div>
    <div class="actions pied"><button class="bouton second" type="button" value="non">Annuler</button>
      ${change ? `<button class="bouton sobre" type="button" data-origine>${jour ? "Comme la recette" : "Recette d'origine"}</button>` : ""}
      <button class="bouton" type="submit">Valider</button></div></form>`;
  const refaire = q => demanderAjustement(id, q, jour);
  d.querySelector("[value=non]").addEventListener("click", () => jour && jour.retour ? jour.retour() : d.close("non"));
  d.querySelectorAll("[data-sens]").forEach(b => b.addEventListener("click", () => { const i = a.ingredients[Number(b.dataset.n)];
    refaire({ ...actuel, [i.n]: versBase(arrondi(vu(i) + Number(b.dataset.sens) * pas(i), i), i) }); }));
  d.querySelectorAll("input[data-n]").forEach(c => c.addEventListener("change", () => { const i = a.ingredients[Number(c.dataset.n)];
    refaire({ ...actuel, [i.n]: versBase(Math.max(0, Number(c.value) || 0), i) }); }));
  const origine = d.querySelector("[data-origine]");
  if (origine) origine.addEventListener("click", () => refaire({}));
  let remplace = null;                     // l'ingredient a remplacer, sinon on ajoute
  const ajouterIngredient = (nom, texte = null, voir = false) => {
    const q = { ...actuel };
    AJ_NOTE = { id, texte: texte || `Ajouté : <b>${esc(nom)}</b>.`, voir: voir ? nom : null, avant: { ...actuel } };
    if (remplace) { q[remplace] = 0; q[nom] = { comme: remplace }; } else q[nom] = null;   // null : sa quantite habituelle
    refaire(q);
  };
  // Taha, 21/11/2026 : « une liste très limitée d'ingrédients ». Tous les ingrédients connus se cherchent en tapant
  // (sans accents, n'importe quel mot) ; ce qui n'y est pas, l'IA le crée : vraie étiquette en ligne, sinon estimation.
  const creerIngredient = nom => demanderIngredient({ nom, creer: true, retour: () => refaire(actuel), apres: ajouterIngredient });
  const proposerIngredients = () => {
    const brut = $("ajNouveau").value.trim(), t = sansAccents(brut), mots = t.split(/\s+/).filter(Boolean);
    const trouves = !mots.length ? [] : connusTous.filter(n => !dans.has(n) && mots.every(m => sansAccents(n).includes(m)))
      .sort((a, b) => (sansAccents(b).startsWith(t) - sansAccents(a).startsWith(t)) || a.length - b.length).slice(0, 8);
    const exact = connusTous.some(n => sansAccents(n) === t);
    $("ajSuggestions").innerHTML = trouves.map(n => `<li><button type="button" data-ing="${esc(n)}">${esc(n)}${icone("plus")}</button></li>`).join("");
    // L'icône violette : « Ajouter » passera par l'IA (le nom n'est pas mot à mot dans la liste).
    const ia = E.claude !== false && brut.length >= 2 && !exact;
    $("ajAjouter").classList.toggle("bouton-ia", ia);
    d.querySelector(".aj-ia-ic").hidden = !ia;
  };
  $("ajNouveau").addEventListener("input", proposerIngredients);
  $("ajSuggestions").addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.ing) return ajouterIngredient(b.dataset.ing);
    if (b.dataset.autre) return parIA(b.dataset.autre);
  });
  // « Ajouter » (Taha, 22/11/2026) : 1. le nom exact → ajouté ; 2. une faute de frappe, un pluriel, l'ordre des mots →
  // « Tu veux dire … ? », sans IA ; 3. sinon UN appel à l'IA, qui reçoit les ~30 noms proches : elle dit lequel c'est,
  // ou crée l'ingrédient (étiquette en ligne, sinon estimation), enregistré tout de suite. On voit toujours ce qui est mis.
  const PETITS = new Set(["de", "du", "des", "la", "le", "les", "et", "au", "aux", "d", "l", "a", "en", "avec", "un", "une"]);
  const mots = x => sansAccents(x).replace(/[^a-z0-9]+/g, " ").split(" ").filter(m => m && !PETITS.has(m)).map(m => m.length > 3 ? m.replace(/[sx]$/, "") : m);
  const cle = x => mots(x).sort().join(" ");
  const ecart = (x, y) => { if (Math.abs(x.length - y.length) > 2) return 9;
    let l = Array.from({ length: y.length + 1 }, (_, k) => k);
    for (let i = 1; i <= x.length; i++) { const n = [i]; for (let k = 1; k <= y.length; k++) n[k] = Math.min(l[k] + 1, n[k - 1] + 1, l[k - 1] + (x[i - 1] === y[k - 1] ? 0 : 1)); l = n; }
    return l[y.length]; };
  const libres = () => connusTous.filter(n => !dans.has(n));
  const prochesLocaux = brut => { const k = cle(brut); if (!k) return [];
    const memes = libres().filter(n => cle(n) === k);
    if (memes.length) return memes.slice(0, 3);
    const tol = k.length <= 5 ? 1 : 2;
    return libres().map(n => [n, ecart(k, cle(n))]).filter(([, e]) => e <= tol).sort((x, y) => x[1] - y[1]).slice(0, 3).map(([n]) => n); };
  const paires = x => { const t = ` ${sansAccents(x)} `, p = new Set(); for (let i = 0; i < t.length - 1; i++) p.add(t.slice(i, i + 2)); return p; };
  const ressemblance = (x, y) => { const a1 = paires(x), b1 = paires(y); let c = 0; a1.forEach(p => { if (b1.has(p)) c++; }); return 2 * c / (a1.size + b1.size || 1); };
  const parIA = async brut => {
    if (E.claude === false) return creerIngredient(brut);              // sans compte Claude : ses valeurs à la main
    // La même carte d'attente que « L'IA calcule » (27/11/2026) ; Annuler revient à la liste des ingrédients.
    let annule = false;
    const att = attenteIA($("dialogue"), { titre: "L'IA cherche", sujet: brut, etapes: ["Étiquettes", "Valeurs", "Rayon"],
      annuler: () => { annule = true; refaire(actuel); } });
    const candidats = libres().map(n => [n, ressemblance(brut, n)]).sort((x, y) => y[1] - x[1]).slice(0, 30).map(([n]) => n);
    let v;
    try {
      const r = await fetch("/api/ingredient/proposer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nom: brut, candidats }) });
      const rep = await r.json();
      att.fin();
      if (annule) return;
      if (!r.ok) { dire(rep.erreur || "L'IA n'a pas pu répondre."); return refaire(actuel); }
      v = rep.ingredient;
    } catch (e) { att.fin(); if (annule) return; dire("L'appli ne répond pas."); return refaire(actuel); }
    if (v.existant && connusTous.includes(v.existant))
      return ajouterIngredient(v.existant, `Ajouté : <b>${esc(v.existant)}</b> (tu as écrit « ${esc(brut)} »).`);
    const MAC = ["kcal", "prot", "gluc", "lip", "fib"];
    if (MAC.some(m => v[m] == null)) return demanderIngredient({ nom: brut, creer: true, retour: () => refaire(actuel), apres: ajouterIngredient });   // l'IA n'a rien donné : à la main
    const lue = v.etiquette != null ? (v.etiquettes || [])[v.etiquette] : null;
    const corps = { nom: v.nom, u: v.u, q: v.q, a: v.a, prix: v.prix, ...Object.fromEntries(MAC.map(m => [m, v[m]])),
      source: lue ? `étiquette ${lue.source} : ${lue.url}` : "proposé par l'IA", ...(v.vitamines ? { vitamines_claude: v.vitamines } : {}) };
    const ok = await appel("/api/ingredient/enregistrer", corps);
    if (ok !== true) { dire((ok && ok.erreur) || "Ingrédient pas enregistré."); return refaire(actuel); }
    const nom = E.ingredient || v.nom;
    ajouterIngredient(nom, `Nouvel ingrédient : <b>${esc(nom)}</b>, valeurs ${lue ? `de l'étiquette (${esc(lue.source)})` : "estimées par l'IA"}.`, true);
  };
  const ajouterTape = () => {
    const brut = $("ajNouveau").value.trim();
    if (!brut) { $("ajNouveau").focus(); return; }
    const exact = connusTous.find(n => sansAccents(n) === sansAccents(brut));
    if (exact) return ajouterIngredient(exact);
    const proches = prochesLocaux(brut);
    if (!proches.length) { $("ajNouveau").blur(); return parIA(brut); }
    $("ajSuggestions").innerHTML = `<li class="aj-veux-dire">Tu veux dire :</li>${proches.map(n => `<li><button type="button" data-ing="${esc(n)}">${esc(n)}${icone("plus")}</button></li>`).join("")}
      <li><button type="button" class="rp-ia" data-autre="${esc(brut)}">${icone("sparkle")}<span>Non, c'est autre chose<small>L'IA le retrouve ou le crée</small></span>${icone("caret-right")}</button></li>`;
    $("ajSuggestions").scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  $("ajAjouter").addEventListener("click", ajouterTape);
  $("ajNouveau").addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); ajouterTape(); } });
  if (note) {
    const r1 = d.querySelector("[data-note-retirer]"), r2 = d.querySelector("[data-note-voir]");
    if (r1) r1.addEventListener("click", () => refaire(note.avant));
    if (r2) r2.addEventListener("click", () => demanderIngredient({ nom: note.voir, retour: () => refaire(actuel) }));
  }
  // La poubelle : l'ingrédient est retiré de l'assiette (quantité 0) ; « ↺ » le remet comme dans la recette.
  d.querySelectorAll("[data-retirer-ing]").forEach(b => b.addEventListener("click", ev => {
    ev.preventDefault();
    const i = a.ingredients[Number(b.dataset.retirerIng)], q = { ...actuel };
    AVANT_POUBELLE.set(`${id}|${i.n}`, i.q);
    if (i.ajoute) delete q[i.n]; else q[i.n] = 0;
    refaire(q);
  }));
  d.querySelectorAll("[data-remettre-ing]").forEach(b => b.addEventListener("click", ev => {
    ev.preventDefault();
    const q = { ...actuel }, nom = a.ingredients[Number(b.dataset.remettreIng)].n, avant = AVANT_POUBELLE.get(`${id}|${nom}`);
    if (typeof avant === "number" && avant > 0) q[nom] = avant; else delete q[nom];       // sinon : comme dans la recette
    refaire(q);
  }));
  d.querySelectorAll("[data-changer]").forEach(b => b.addEventListener("click", ev => {
    ev.preventDefault();
    remplace = a.ingredients[Number(b.dataset.changer)].n;
    $("ajNouveauTitre").textContent = `Remplacer « ${remplace} » par`;
    $("ajAide").textContent = "Même quantité si l'unité est la même, sinon sa quantité habituelle. Tu la règles ensuite.";
    proposerIngredients();
    $("ajNouveau").focus();
    $("ajNouveau").scrollIntoView({ block: "center" });
  }));
  d.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault(); ev.stopPropagation();
    d.close("oui");
    if (jour) return agir("/api/semaine/modifier", { operation: { type: "ajuster", jour: jour.n, plat: id, quantites: actuel }, semaine: jour.k, confirme: true },
      `« ${a.nom} » modifié pour ${planDe(jour.k).jours[jour.n].jour.toLowerCase()}.`);
    agir("/api/recette/ajuster", { plat: id, quantites: actuel, apercu: false }, change ? "Quantités enregistrées : semaines et courses recalculées." : "Recette d'origine remise.");
  });
  if (!d.open) d.showModal();
}

/* ------------------------------------------------------------ un plat */
function etoilesLues(r) {
  return r.nb_notes ? `<span class="note-lue">${icone("star-fill")}${nombre(r.note, 1)}<span class="discret petit">(${r.nb_notes > 1 ? `${r.nb_notes} notes` : `${r.nb_notes} note`})</span></span>`
                    : `<span class="discret petit">Pas encore noté</span>`;
}
// Sans compte Claude, les vitamines se renseignent à la main, pour 100 g (Taha, 19/11/2026 : c'est obligatoire).
const UNITES_VIT = { A: "µg", B1: "mg", B2: "mg", B6: "mg", B9: "µg", B12: "µg", C: "mg", D: "µg", E: "mg", K: "µg" };
function champsVitamines(prefixe, valeurs = {}) {
  return `<h3 style="margin:16px 0 4px">Vitamines pour 100 g</h3>
    <p class="petit discret" style="margin:0 0 8px">Sans compte Claude, c'est à toi de les donner : sur l'étiquette, ou dans la table CIQUAL (ciqual.anses.fr). 0 si tu ne sais pas.</p>
    <div class="vit-saisie">${Object.keys(UNITES_VIT).map(v => `<label>${v} <small>${UNITES_VIT[v]}</small><input id="${prefixe}${v}" type="text" inputmode="decimal" value="${valeurs[v] ?? ""}" required></label>`).join("")}</div>`;
}
function lireVitamines(prefixe) {
  const vit = {};
  for (const v of Object.keys(UNITES_VIT)) {
    const x = ($(prefixe + v) || {}).value;
    const n = Number(String(x ?? "").trim().replace(",", "."));
    if (String(x ?? "").trim() === "" || Number.isNaN(n) || n < 0) return { erreur: `Vitamine ${v} : un nombre (0 si tu ne sais pas).` };
    vit[v] = n;
  }
  return vit;
}
// À quoi sert chaque vitamine, en quelques mots (Taha, 20/11/2026 : « indique à quoi il sert, discrètement »).
const ROLE_VITAMINE = { A: "Vue, peau, défenses", B1: "Tire l'énergie des glucides, nerfs", B2: "Énergie, peau, yeux",
  B6: "Utilise les protéines, nerfs", B9: "Renouvelle les cellules, globules rouges", B12: "Globules rouges, nerfs",
  C: "Défenses, absorbe le fer, cicatrise", D: "Os, muscles, défenses", E: "Protège les cellules", K: "Coagulation, os" };
// prevues : les apports si toute la journée prévue est mangée, en barre grisée derrière (Taha, 20/11/2026).
function barresVitamines(apports, parJour, prevues = null, compact = false) {
  const V = E.vitamines;
  // « 12 / 80 mg » : ce que tu as / ce qu'il te faut par jour (Taha, 21/11/2026 : « pas clair combien je dois avoir par jour »).
  // compact : les 10 sur un écran, sans défiler (Taha, 22/11/2026) ; le rôle passe en bulle (title).
  return `${compact ? "" : `<p class="petit discret barres-legende">${parJour ? "Ce que tu as eu" : "Ce qu'apporte une portion"} / ce qu'il te faut chaque jour.</p>`}<ul class="barres${compact ? " compactes" : ""}">${Object.keys(V.noms).map(c => {
    const q = apports[c] || 0, pct = Math.round(100 * q / V.besoins[c]);
    const pctP = prevues ? Math.round(100 * Math.max(q, prevues[c] || 0) / V.besoins[c]) : null, plus = pctP != null && pctP > pct;
    return `<li class="${parJour && pct < 80 ? "bas" : ""}"${compact && ROLE_VITAMINE[c] ? ` title="${esc(ROLE_VITAMINE[c])}"` : ""}><span>${esc(V.noms[c].nom)}${ROLE_VITAMINE[c] && !compact ? `<small class="role">${ROLE_VITAMINE[c]}</small>` : ""}</span>
      <span class="v"><b class="chiffres">${dose(q)}</b> / ${dose(V.besoins[c])} ${V.noms[c].unite} · ${nombre(pct)} %${plus ? `<small class="prevu"> → ${nombre(pctP)} %</small>` : ""}</span>
      <span class="piste" role="img" aria-label="${nombre(pct)} % du besoin d'un jour${plus ? `, ${nombre(pctP)} % si la journée prévue est mangée` : ""}">${plus ? `<b style="width:${Math.min(100, pctP)}%"></b>` : ""}<i style="width:${Math.min(100, pct)}%"></i></span></li>`; }).join("")}</ul>`;
}
function quandMange(s, id) {
  // « lun. soir, mar. midi » : les repas de la semaine ou ce plat est au menu.
  const fois = [];
  s.jours.forEach((j, n) => {
    const jour = court(j).toLowerCase() + ".";
    if (j.pdj === id) fois.push(`${jour} matin`);
    if (j.dej === id) fois.push(`${jour} midi`);
    if (j.collations.includes(id)) fois.push(`${jour} collation`);
    if (j.din === id) fois.push(`${jour} soir`);
    if ((j.fruits || []).includes(id) || (j.fruits_secs && j.fruits_secs.id === id)) fois.push(jour);
  });
  return fois.length > 6 ? "tous les jours ou presque" : fois.join(", ");
}
function ficheRapide(id, ctx, depuis, vu = null) {
  // Toucher un plat (téléphone) : sa carte « ressort » du plat et grandit au milieu de l'écran, puis y retourne
  // quand on la ferme (Taha, 19/11/2026). Ses ingrédients, avec les quantités de CETTE assiette (Taha, 21/11/2026).
  const r0 = recette(id);
  if (!r0) return;
  const s = ctx ? planDe(ctx.k) : null, j = s ? s.jours[ctx.n] : null;
  const r = s ? platDuJour(s, ctx.n, id, ctx.moment) : r0;
  const t = j ? tailleDe(j, id) : 1, compte = j ? repasCompte(j, ctx.moment, id) : null;
  const val = m => Math.round(vu ? vu[m] || 0 : compte && compte[m] != null ? compte[m] : (r[m] || 0) * t);
  const f = r0.filtres || { regimes: [], atouts: [] };
  const CAT = { plat: "Plat", petitdej: "Petit-déjeuner", collation: "Collation" };
  const labels = [CAT[r0.cat], r0.perso ? "Mon plat" : "", ...f.regimes, ...f.atouts].filter((x, i, tous) => x && tous.indexOf(x) === i).slice(0, 3);
  const place = ctx && ctx.moment.startsWith("col") ? ((j.au_repas || {})[id] || "col") : ctx && ctx.moment;
  const quand = ctx ? [(MOMENTS_REPAS.find(([m]) => m === place) || [, ""])[1], j.jour].filter(Boolean).join(" · ") : "";
  const courante = ctx && (!E.mois || ctx.k === E.mois.rang);
  const mange = !!(ctx && courante && fait(s, ctx.n, id));
  // La part gardée d'hier soir se change, se modifie et se retire comme les autres (Taha, 23/11/2026).
  const libre = ctx && (enSuivi() || !mange) && !(!enSuivi() && ctx.moment === "dej" && j.dej_reste);
  const reg = ctx && reglable(s, ctx.k, ctx.n, id, ctx.moment);
  // Les ingrédients de l'assiette : le plat ce jour-là (quantités réglées comprises) × la taille de l'assiette.
  // Depuis l'historique : la version de ce jour-là, même d'une semaine finie (Taha, 28/11/2026 : « je trouve pas kaki…
  // j'ai jamais mis du miel ») ; sans quantités réglées, la taille se déduit des calories notées ce jour-là.
  const xVu = vu && vu.date ? repasDuJournal(vu.date, id, vu.moment || "") : null;
  const iciVu = vu && vu.date && !xVu ? semainePourDate(vu.date) : null;
  const dj = xVu ? recetteDuJournal(r0, xVu) : null;
  const rIng = ctx ? r : dj ? dj.r : iciVu ? platDuJour(iciVu.s, iciVu.n, id, vu.moment || "") : r0;
  const tIng = ctx ? t : dj ? dj.facteur : vu && rIng.kcal ? vu.kcal / rIng.kcal : 1;
  const placeVu = vu ? ((vu.moment || "").startsWith("col") ? (xVu && xVu.au_repas) || "col" : vu.moment || "") : "";
  const ceJour = vu && vu.date ? `?date=${vu.date}&moment=${encodeURIComponent(vu.moment || "")}` : "";
  fermerCarte(true);
  const fond = document.createElement("div");
  fond.className = "carte-fond";
  fond.innerHTML = `<article class="carte-plat" role="dialog" aria-modal="true" aria-labelledby="cpTitre">
    <div class="cp-photo">${photo(r0, 960, "grande", r0.nom)}
      ${r0.perso && !r0.photo_de ? `<label class="cp-ajout-photo">${icone("image")}${r0.photo ? "Changer la photo" : "Prendre une photo"}<input type="file" accept="image/*" hidden data-photo-plat="${id}"></label>` : ""}
      <button type="button" class="cp-fermer" aria-label="Fermer">${icone("x")}</button></div>
    <div class="cp-corps">
      ${quand || vu ? `<p class="petit discret">${esc(vu ? vu.quand : quand)}</p>` : ""}
      <h2 id="cpTitre">${esc((ctx ? r : vu ? rIng : r0).nom)}</h2>
      ${(ctx ? r : vu ? rIng : r0).nomBase ? `<p class="petit discret cp-d-apres">D'après « ${esc(r0.nom)} »</p>` : ""}
      ${labels.length ? `<p class="cp-etiquettes">${labels.map(x => `<span>${esc(x)}</span>`).join("")}</p>` : ""}
      ${r0.source && /^https?:\/\//.test(r0.source.lien || "") ? `<p class="cp-source"><a href="${esc(r0.source.lien)}" target="_blank" rel="noopener">${icone("link")}Vue sur ${esc(r0.source.site || "le web")}${r0.source.auteur ? ` · ${esc(r0.source.auteur)}` : ""}</a></p>` : ""}
      <div class="cp-chiffres">
        <div><b data-cp-v="${val("kcal")}" data-u="">${nombre(val("kcal"))}</b><span>kcal</span></div><div><b data-cp-v="${val("prot")}" data-u=" g">${nombre(val("prot"))} g</b><span>prot.</span></div>
        <div><b data-cp-v="${val("gluc")}" data-u=" g">${nombre(val("gluc"))} g</b><span>gluc.</span></div><div><b data-cp-v="${val("lip")}" data-u=" g">${nombre(val("lip"))} g</b><span>lip.</span></div>
      </div>
      <p class="petit discret cp-info">${[vu ? "Ce que tu as mangé ce jour-là" : ctx ? (t !== 1 ? `Assiette à ${nombre(Math.round(t * 100))} % de la recette` : "Recette telle quelle") : "Une portion",
        r0.temps ? `${r0.temps} min` : "", r.ajusteeCeJour ? "ajustée ce jour" : ""].filter(Boolean).join(" · ")}</p>
      ${vu && (rIng.changements || []).length ? `<p class="petit cp-ce-jour">Ce jour-là : ${esc(rIng.changements.join(" ; "))}.</p>` : ""}
      ${(rIng.ing || []).length && !(ctx && enSuivi()) ? `<details class="cp-ingredients"${vu ? " open" : ""}><summary>Ingrédients${icone("caret-right")}</summary>
        <div class="cp-ing-liste">${listeIngredients(rIng, tIng)}</div></details>` : ""}
      ${ctx && enSuivi() ? `<div class="cp-mange">${courante && ctx.n <= rangDuJour(s)
          ? `<button class="bouton${mange ? " second" : ""}" data-action="manger" data-jour="${ctx.n}" data-plat="${id}" data-annuler="${mange ? 1 : 0}">${icone("check")}${mange ? "Pas encore mangé" : "J'ai mangé"}</button>` : ""}
        <a class="bouton sobre" href="${courante ? `#/cuisine/${id}?jour=${ctx.n}&moment=${ctx.moment}` : `#/cuisine/${id}`}">${icone("cooking-pot")}Voir la recette</a></div>`
      : enSuivi() ? `${vu && vu.date && vu.date < E.journal_repas.aujourdhui && semainePourDate(E.journal_repas.aujourdhui)
          ? `<button type="button" class="bouton cp-cuisiner" data-action="mangerAujourdhui" data-plat="${id}" data-moment="${esc(placeVu)}" data-date="${vu.date}" data-vu="${esc(vu.moment || "")}">${icone("check")}Manger aujourd'hui</button>` : ""}
        <a class="bouton sobre cp-cuisiner" href="#/cuisine/${id}${ceJour}">${icone("cooking-pot")}Voir la recette</a>`
      : `<a class="bouton cp-cuisiner" href="${courante && ctx ? `#/cuisine/${id}?jour=${ctx.n}` : `#/cuisine/${id}${ceJour}`}">${icone("cooking-pot")}Cuisiner</a>`}
      ${ctx && (libre || reg) ? `<div class="cp-choix">
        ${libre ? `<button type="button" data-action="changer" data-semaine="${ctx.k}" data-jour="${ctx.n}" data-moment="${ctx.moment}">${icone("swap")}
          <span><b>Remplacer par un autre plat</b><small>Du catalogue ou un des tiens</small></span>${icone("caret-right")}</button>` : ""}
        ${libre || enSuivi() ? `<button type="button" data-action="ajusterJour" data-semaine="${ctx.k}" data-jour="${ctx.n}" data-plat="${id}">${icone("notebook")}
          <span><b>Modifier les ingrédients</b><small>Retirer, ajouter, changer, pour ce jour</small></span>${icone("caret-right")}</button>` : ""}
      </div>` : ctx ? "" : `${estRepas(r0) && !vu ? `<div class="cp-choix"><button type="button" data-action="ajuster" data-plat="${id}">${icone("sliders-horizontal")}
          <span><b>${r0.ajustee ? "Recette ajustée : modifier" : "Ajuster la recette"}</b><small>Les quantités, pour tous les jours</small></span>${icone("caret-right")}</button></div>` : ""}
        <div class="cp-avis">${boutonsGout(r0)}</div>
        ${estRepas(r0) && !vu ? `<p class="cp-equilibrer"><button type="button" class="bouton sobre cp-retirer" data-action="retirerPlat" data-plat="${id}">${icone("poubelle")}Retirer ce plat</button></p>` : ""}`}
      ${r0.cache ? `<div class="cp-choix cp-garder"><button type="button" data-action="garderPlat" data-plat="${id}">${icone("plus")}
          <span><b>Ajouter à mes plats</b><small>Pour le retrouver et le reprendre</small></span>${icone("caret-right")}</button></div>` : ""}
      ${(() => {
        // Deux petits boutons discrets en bas de la carte (Taha, 20/11/2026) : équilibrer la journée, fixer le plat.
        // Tout plat se fixe, à son repas (Taha, 20/11/2026).
        const fixable = !!ctx, fixe = fixable && estFixe(id, ctx.moment);
        const chaque = { pdj: "matin", dej: "midi", din: "soir" }[ctx && ctx.moment];
        // « Retirer ce repas » : petit bouton discret comme « Équilibrer », au-dessus de lui (Taha, 21/11/2026).
        const boutons = [libre ? `<button type="button" class="bouton sobre" data-action="retirerRepas" data-semaine="${ctx.k}" data-jour="${ctx.n}" data-moment="${ctx.moment}" data-plat="${id}">${icone("x")}Retirer ce repas</button><span class="cp-saut" aria-hidden="true"></span>` : "",
          reg ? `<button type="button" class="bouton sobre" data-action="reequilibrer" data-semaine="${ctx.k}" data-jour="${ctx.n}" data-moment="${ctx.moment}" data-plat="${id}">${icone("sliders-horizontal")}Équilibrer pour la journée</button>` : "",
          fixable ? `<button type="button" class="bouton sobre" data-action="fixer" data-plat="${id}" data-moment="${ctx.moment}" data-fixe="${fixe ? 0 : 1}" title="${fixe ? "Il reste prévu, mais n'est plus imposé chaque jour" : `Il revient chaque ${chaque || "jour, en collation"}, toujours une portion`}">${icone("lock-simple")}${fixe ? "Ne plus fixer" : "Fixer ce plat"}</button>` : ""].filter(Boolean);
        return boutons.length ? `<p class="cp-equilibrer">${boutons.join("")}</p>` : ""; })()}
    </div></article>`;
  document.body.appendChild(fond);
  // Centrée sur ce qui se voit vraiment : sur iPhone, l'écran visible n'est pas toujours celui de la page (Taha, 22/11/2026).
  const vv = window.visualViewport, carte = fond.querySelector(".carte-plat");
  // Jamais de défilement dans la carte (Taha, 22/11/2026) : sur un petit écran, la photo rapetisse, puis les étiquettes
  // et la ligne d'info s'effacent ; 0,8 cm sous le centre seulement s'il reste la place.
  // La photo entière, sans recadrage (Taha, 23/11/2026 : « dézoome, qu'on voie tout le plat ») : sur un fond de la
  // même photo, floutée.
  const imPhoto = carte.querySelector(".cp-photo .photo img");
  if (imPhoto) carte.querySelector(".cp-photo .photo").style.setProperty("--fond-photo", `url("${(imPhoto.currentSrc || imPhoto.src).replace(/"/g, "%22")}")`);
  const tenir = () => {
    const ph = carte.querySelector(".cp-photo .photo"), caches = carte.querySelectorAll(".cp-etiquettes, .cp-info"), sous = carte.querySelectorAll(".cp-choix small");
    sous.forEach(x => { x.hidden = false; });
    if (ph) Object.assign(ph.style, { height: "", aspectRatio: "" });
    caches.forEach(x => { x.hidden = false; });
    carte.style.top = "0px";
    const trop = () => carte.scrollHeight - carte.clientHeight;
    if (ph && trop() > 0) Object.assign(ph.style, { aspectRatio: "auto", height: `${Math.max(90, ph.offsetHeight - trop())}px` });
    if (trop() > 0) caches.forEach(x => { x.hidden = true; });
    if (ph && trop() > 0) ph.style.height = `${Math.max(60, ph.offsetHeight - trop())}px`;
    if (trop() > 0) sous.forEach(x => { x.hidden = true; });
    if (ph && trop() > 0) ph.style.height = `${Math.max(36, ph.offsetHeight - trop())}px`;
    const place = fond.clientHeight - 32 - carte.offsetHeight;
    carte.style.top = `${Math.max(0, Math.min(30, Math.floor(place / 2)))}px`;
  };
  // Le fond couvre tout l'écran, jusqu'en bas (Taha, 22/11/2026 : sur iPhone, la « zone visible » s'arrêtait au-dessus
  // de la barre du bas et laissait une bande opaque) ; la carte se centre sur tout l'écran.
  const caler = () => { fond.style.setProperty("--haut-visible", `${fond.clientHeight}px`); tenir(); };
  caler();
  if (vv) { vv.addEventListener("resize", caler); vv.addEventListener("scroll", caler); }
  // Les ingrédients ouverts : la place se refait (la photo peut rapetisser encore).
  const ing = carte.querySelector(".cp-ingredients");
  if (ing) ing.addEventListener("toggle", tenir);
  // L'effet : la carte part de la place du plat touché (position et taille), puis grandit jusqu'au centre.
  const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const depart = depuis && depuis.getBoundingClientRect();
  const versDepart = () => { const fin = carte.getBoundingClientRect();
    return `translate(${depart.left - fin.left}px, ${depart.top - fin.top}px) scale(${depart.width / fin.width}, ${depart.height / fin.height})`; };
  if (depart && !calme) {
    carte.style.transformOrigin = "0 0";
    carte.style.transform = versDepart();
    carte.style.opacity = "0.6";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fond.classList.add("ouvert");
      carte.style.transform = ""; carte.style.opacity = "";
    }));
  } else requestAnimationFrame(() => fond.classList.add("ouvert"));
  fermerCarte.etat = { fond, carte, rentrer: depart && !calme ? versDepart : null, avant: document.activeElement,
    avantFermeture: () => { if (vv) { vv.removeEventListener("resize", caler); vv.removeEventListener("scroll", caler); } } };
  fond.addEventListener("click", ev => { if (ev.target === fond) fermerCarte(); });
  carte.querySelector(".cp-fermer").addEventListener("click", () => fermerCarte());
  carte.querySelectorAll('a[href^="#/"]').forEach(x => x.addEventListener("click", () => {
    PAGE_DEPUIS_CARTE = { id, ctx, vu, depuis: location.hash || "#/semaine", page: x.getAttribute("href") }; }));
  // L'action ouvre sa propre feuille ; « Annuler » (ou la croix, ou Échap) y ramène sur cette carte, un pas en arrière
  // seulement (Taha, 22/11/2026 : « les boutons Annuler reviennent trop »).
  carte.querySelectorAll("[data-action]").forEach(x => x.addEventListener("click", () => {
    fermerCarte(true);
    if (!["manger", "fixer", "noter"].includes(x.dataset.action)) { RETOUR_CARTE = { id, ctx, vu }; $("dialogue").returnValue = ""; }
  }));
  carte.querySelector(".cp-fermer").focus({ preventScroll: true });
}
// La carte d'où vient la fenêtre ouverte : y revenir quand la fenêtre est annulée, pas quand elle est validée.
let RETOUR_CARTE = null;
$("dialogue").addEventListener("close", () => {
  const r = RETOUR_CARTE, d = $("dialogue");
  RETOUR_CARTE = null;
  if (!r || d.returnValue === "oui") return;
  setTimeout(() => { if (!d.open && !document.querySelector(".carte-fond") && recette(r.id)) ficheRapide(r.id, r.ctx, null, r.vu); }, 0);
});
function fermerCarte(tout_de_suite = false) {
  const e = fermerCarte.etat;
  if (!e) return;
  fermerCarte.etat = null;
  if (e.avantFermeture) e.avantFermeture();
  const fin = () => { e.fond.remove(); if (e.avant && e.avant.focus) e.avant.focus({ preventScroll: true }); };
  if (tout_de_suite || !e.rentrer) { if (tout_de_suite) return fin(); e.fond.classList.remove("ouvert"); return setTimeout(fin, 200); }
  e.fond.classList.remove("ouvert");
  e.carte.style.transform = e.rentrer();
  e.carte.style.opacity = "0.4";
  setTimeout(fin, 280);
}
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && fermerCarte.etat) fermerCarte(); });
window.addEventListener("hashchange", () => fermerCarte(true));
function vuePlat({ arg, params }) {
  const r = recette(arg), s = E.semaine;
  // Ouverte depuis l'historique (?date=&moment=) : « Voir la recette » montre la version de ce jour-là.
  const ceJour = params && params.has("date") ? `?date=${encodeURIComponent(params.get("date"))}&moment=${encodeURIComponent(params.get("moment") || "")}` : "";
  if (!r) return vueIntrouvable();
  const choix = s && s.choix[arg];
  const f = r.filtres || { regimes: [], atouts: [] };
  const labels = [r.perso ? "Mon plat" : "", r.ajustee ? "Quantités ajustées" : "", ...f.regimes, ...f.atouts, f.origine, f.genre].filter((t, i, tous) => t && tous.indexOf(t) === i);
  const entame = s && Object.keys(s.prepares || {}).some(k => k.endsWith("|" + arg));
  barre("");
  return `<a class="retour" href="#/semaine">${icone("caret-left")}Semaine</a>
  <article class="fiche">
    ${photo(r, 960, "grande", r.nom)}
    <div><h1 tabindex="-1">${esc(r.nom)}</h1>
      <p class="discret" style="margin-top:6px">${etoilesLues(r)}</p>
      ${labels.length ? `<p class="etiquettes" style="margin:12px 0 0">${labels.map(t => `<span class="etiquette">${esc(t)}</span>`).join("")}</p>` : ""}</div>
    <dl class="reperes">
      <div><dt>Calories</dt><dd>${nombre(r.kcal)} kcal</dd></div>
      <div><dt>Protéines</dt><dd>${r.prot} g</dd></div>
      ${r.gluc == null ? "" : `<div><dt>Glucides, lipides</dt><dd>${r.gluc} g, ${r.lip} g</dd></div><div><dt>Fibres</dt><dd>${r.fib} g</dd></div>`}
      <div><dt>Prix d'une portion</dt><dd>${euros(r.cout)}</dd></div>
      <div><dt>${choix ? "Cette semaine" : "En cuisine"}</dt><dd>${choix ? nombre(choix.portions, 1) + " portions" : r.temps + " min"}</dd>
        ${choix ? `<p class="petit discret" style="margin-top:2px">(${esc(quandMange(s, arg))})</p>` : ""}</div>
    </dl>
    ${choix ? `<section aria-labelledby="tPourquoi"><details class="nu"><summary><h2 id="tPourquoi">Pourquoi ce plat</h2>${icone("caret-right")}</summary>
      <ul class="raisons" style="margin-top:10px">${choix.raisons.map(x => `<li class="${x.points < 0 ? "moins" : ""}"><span>${esc(x.texte.charAt(0).toUpperCase() + x.texte.slice(1))}</span>
        <b>${x.points > 0 ? "+" : ""}${nombre(x.points)} pts</b></li>`).join("")}</ul></details></section>` : ""}
    <section aria-labelledby="tVit"><details class="nu"><summary><h2 id="tVit">Vitamines d'une portion</h2>${icone("caret-right")}</summary>
      <p class="discret petit" style="margin:10px 0 14px">Quantité, puis part de ton besoin d'une journée.</p>
      ${barresVitamines(r.vitamines, false)}</details></section>
    ${estRepas(r) ? `<section aria-labelledby="tAvis"><h2 id="tAvis" style="margin-bottom:12px">Ton avis</h2>${boutonsGout(r)}</section>` : ""}
    <div class="actions">
      <a class="bouton" href="#/cuisine/${r.id}${ceJour}">Voir la recette</a>
      ${estRepas(r) ? `<button class="bouton second" data-action="ajuster" data-plat="${r.id}">${icone("sliders-horizontal")}Ajuster ou changer les ingrédients</button>` : ""}
      ${choix && estRepas(r) && !entame ? `<button class="bouton second" data-action="ecarter" data-plat="${r.id}">Écarter ce plat</button>` : ""}
      ${r.cache ? `<button class="bouton second" data-action="garderPlat" data-plat="${r.id}">${icone("plus")}Ajouter à mes plats</button>` : ""}
      ${r.perso && !choix ? `<button class="bouton sobre" data-action="supprimerPlat" data-plat="${r.id}">${icone("x")}Supprimer mon plat</button>` : ""}
    </div>
  </article>`;
}

/* ------------------------------------------------------------ courses */
/* Produits coches pendant les courses : gardes sur l'appareil, remis a zero quand la semaine change. */
const coches = (() => { try { return JSON.parse(localStorage.getItem("coches")) || {}; } catch (e) { return {}; } })();
const cleDesCoches = () => `${E.profil.id}:${E.semaine ? E.semaine.id : ""}`;
const estPris = cle => coches.sem === cleDesCoches() && (coches.pris || []).includes(cle);
function cocher(cle, oui) {
  if (coches.sem !== cleDesCoches()) { coches.sem = cleDesCoches(); coches.pris = []; }
  coches.pris = coches.pris.filter(x => x !== cle);
  if (oui) coches.pris.push(cle);
  try { localStorage.setItem("coches", JSON.stringify(coches)); } catch (e) { /* stockage refuse : la coche tient jusqu'au rechargement */ }
}
function lignesCochables(liste, lignes, q = l => quantite(l.acheter ?? l.quantite, l.unite), sous = l => l.stock ? `${quantite(l.stock, l.unite)} déjà en stock` : "") {
  return `<ul class="lignes cochables">${lignes.map(l => { const cle = `${liste}|${l.nom}`, s = sous(l);
    return `<li><label class="coche"><input type="checkbox" data-coche="${esc(cle)}"${(liste === "secs" ? estPris(cle) : l.coche) ? " checked" : ""}><span>${esc(l.nom)}${s ? `<small>${esc(s)}</small>` : ""}</span></label><span class="q">${q(l)}</span></li>`; }).join("")}</ul>`;
}
// Les lignes a acheter suivies de celles que l'utilisateur a cochees « j'en ai deja ».
const avecCoches = t => [...t.a_acheter, ...(t.coches || []).map(l => ({ ...l, coche: true }))];
const NOTE_COCHES = `<p class="doux petit sous-titre">Coche ce que tu as déjà chez toi : l'appli ne l'achète pas et il ne compte plus dans la liste.</p>`;
function listeParRayon(lignes, liste = "panier") {
  // Une carte par rayon, dans l'ordre du magasin.
  const rayonDe = {};
  E.recettes.forEach(r => r.ing.forEach(i => { rayonDe[i.n] = i.a; }));
  const parRayon = {};
  lignes.forEach(l => { const k = rayonDe[l.nom] ?? 2; (parRayon[k] = parRayon[k] || []).push(l); });
  return `<div class="rayons">${E.rayons.map((nom, i) => !parRayon[i] ? "" : `<div class="rayon-carte"><h3>${esc(nom)}<span class="puce">${parRayon[i].length}</span></h3>${lignesCochables(liste, parRayon[i])}</div>`).join("")}</div>`;
}
function etapes(noms, rang) {
  // Ou en sont les courses : segments faits, en cours, a venir (meme dessin que les phases).
  const colonnes = `repeat(${noms.length},minmax(0,1fr))`;
  return `<div class="phases" style="grid-template-columns:${colonnes}">${noms.map((x, i) => `<i class="${i < rang ? "faite" : i === rang ? "encours" : ""}" title="${esc(x)}"></i>`).join("")}</div>
    <div class="phases-noms etapes" style="grid-template-columns:${colonnes}">${noms.map((x, i) => `<span class="${i === rang ? "encours" : ""}">${esc(x)}</span>`).join("")}</div>`;
}
const etatEnClair = (conseils, suite = "") => { const [premier] = conseils.filter(Boolean);       // la premiere ligne dit ou on en est
  return (premier ? `<p class="dujour" role="status" style="margin-top:16px">${premier[2]}</p>` : "") + suite; };
const suiviDeJarvis = (t, ouvert) => t.lignes.length ? `<details${ouvert ? " open" : ""} style="margin-top:16px"><summary>Ce que fait l'appli${icone("caret-right")}</summary>
    <div class="journal-suivi" id="suivi" tabindex="0">${esc(t.lignes.join("\n"))}</div></details>` : "";

function produitsManquants(cm, magasin, duree) {
  // Ce que Jarvis n'a pas mis au panier : pour chaque produit, les remplacants trouves chez
  // l'enseigne. En choisir un le met au panier ET change les recettes des semaines composees.
  const hors = cm.hors_panier || [], faits = cm.remplacements || [];
  if (!hors.length && !faits.length) return "";
  const cherche = hors.some(l => l.cherche), avec = hors.some(l => l.alternatives.length);
  const option = (i, valeur, titre, sous, coche) => `<label class="option"><input type="radio" name="alt${i}" value="${esc(valeur)}"${coche ? " checked" : ""}><span><b>${titre}</b>${sous ? `<small>${sous}</small>` : ""}</span></label>`;
  return `<section class="bloc large" aria-labelledby="tHors"><h2 id="tHors">Produits manquants${hors.length ? `<span class="puce">${hors.length > 1 ? `${hors.length} produits` : `${hors.length} produit`}</span>` : ""}</h2>
    ${hors.length ? `<p class="doux petit sous-titre">L'appli ne les a pas mis au panier ${magasin}. ${avec ? `Pour chacun, choisis un produit de remplacement trouvé chez ${magasin} : il va dans ton panier, et les recettes de ${duree === "la semaine" ? "ta semaine" : duree.replace("les", "tes")} l'utilisent à la place, toutes seules. Sinon, achète-le ailleurs.` : cherche ? `Rien de proche chez ${magasin} : prends-les dans un autre magasin.` : `Prends-les ailleurs, ou demande à l'appli de chercher de quoi les remplacer chez ${magasin}.`}</p>
    <div class="manquants">${hors.map((l, i) => `<fieldset class="manquant" data-manquant="${esc(l.nom)}">
      <legend><b>${esc(l.nom)}</b> <span class="q">${quantite(l.acheter, l.unite)}</span></legend>
      <p class="doux petit">${esc(l.raison.charAt(0).toUpperCase() + l.raison.slice(1))}.${l.plats.length ? ` Sert dans : ${l.plats.map(esc).join(", ")}.` : ""}</p>
      <div class="options">
        ${l.alternatives.map(a => option(i, a.nom, `${esc(a.nom)}, ${quantite(a.quantite, a.unite)}`,
          `${a.paquets} × ${esc(a.produit)}${a.format ? ` (${esc(a.format)})` : ""} · ${euros(a.cout)}${a.pourquoi ? `<br>${esc(a.pourquoi)}` : ""}${a.deja_au_panier ? "<br>Déjà dans ton panier pour d'autres plats : l'appli en ajoute." : ""}${a.composition_non_lue ? "<br>Étiquette non lue sur le site : vérifie la composition avant de payer." : ""}`)).join("")}
        ${option(i, "", l.alternatives.length ? "Je l'achète moi-même ailleurs" : "À acheter toi-même ailleurs", l.alternatives.length ? "La recette ne change pas." : l.cherche ? `Aucun produit proche trouvé chez ${magasin}.` : "Alternatives pas encore cherchées.", true)}
      </div>
      <label class="coche" style="margin-top:12px"><input type="checkbox" data-coche="${esc("hors|" + l.nom)}"><span>J'en ai déjà chez moi</span></label></fieldset>`).join("")}</div>
    <div class="actions" style="margin-top:18px">${avec ? `<button class="bouton" data-action="appliquerAlternatives">Remplacer et ajouter au panier</button>` : ""}
      <button class="bouton ${avec ? "sobre" : "second"}" data-action="chercherAlternatives">${icone("arrows-clockwise")}${cherche ? "Chercher à nouveau" : "Chercher des alternatives"}</button></div>` : ""}
    ${faits.length ? `<h3 class="sous">Déjà remplacés dans tes recettes</h3>
      <ul class="lignes">${faits.map(f => `<li><span>${esc(f.nom)}<small>à la place de ${esc(f.de)}</small></span><button class="bouton sobre" data-action="annulerRemplacement" data-nom="${esc(f.de)}">Annuler</button></li>`).join("")}</ul>` : ""}
  </section>`;
}
function vueCoursesDuMois() {
  // Trois listes : le panier du supermarche pour les semaines composees (rempli par
  // Jarvis), le marche de la semaine, et les fruits secs du mois.
  const cm = E.courses_mois, c = E.courses, s = E.semaine, t = E.tache, m = E.mois, fs = cm.fruits_secs;
  const enCours = t.etat === "en cours", marcheFait = s.etat === "commandee" || s.etat === "terminee";
  const aCommander = cm.a_acheter.length, reste = m.nb - m.rang, magasin = esc(E.magasin.principale);
  const duree = reste > 1 ? `les ${reste} semaines` : "la semaine";
  const total = E.couts && E.couts.paye_total, ap = E.couts.a_payer;
  const marche = c.a_acheter.length + c.boucher.length;
  let action = "", bouton = "";
  const conseils = [];
  if (enCours) {
    conseils.push(["monter", "En cours", /alternatives/.test(t.titre) ? "L'appli cherche des produits de remplacement pour ce qui manque… Quelques minutes. Tu peux quitter cette page, elle se met à jour toute seule."
      : /complète/.test(t.titre) ? "L'appli ajoute tes produits de remplacement au panier… Une ou deux minutes."
      : "L'appli remplit le panier… Compte une vingtaine de minutes. Tu peux quitter cette page, elle se met à jour toute seule."]);
    action = `<div><b>Panier en cours…</b><span>${esc(t.lignes.filter(Boolean).slice(-1)[0] || "").slice(0, 60)}</span></div><button class="bouton" disabled>En cours…</button>`;
  } else if (cm.panier) {
    conseils.push(["monter", "À toi", `<b>Le panier est rempli</b> : ${cm.panier.articles} produits pour ${euros(cm.panier.total)} hors livraison. ${E.profil.chrome ? `Il est dans le Chrome de TON profil, pas dans un autre navigateur : clique sur « Ouvrir mon profil Chrome », en haut de cette page` : `Ouvre le site de ${magasin} dans le Chrome de l'appli`}, choisis ta livraison et paie.`]);
    action = `<div><b>Panier de ${euros(cm.panier.total)}</b><span>Il reste à payer chez ${magasin}</span></div><button class="bouton" data-action="payerMois">C'est payé</button>`;
    bouton = `<button class="bouton grand" data-action="payerMois">C'est payé</button><button class="bouton sobre" data-action="panier">${icone("arrows-clockwise")}Refaire le panier</button>`;
  } else if (aCommander) {
    if (t.etat === "occupe") {
      conseils.push(["", "Occupé", "L'appli remplit le panier d'un autre profil. Réessaie dans quelques minutes."]);
      action = `<div><b>L'appli est occupée</b><span>Il remplit le panier d'un autre profil</span></div><button class="bouton" disabled>Patiente…</button>`;
    } else if (!E.valide) {
      conseils.push(["alerte", "À faire", "Valide d'abord ton menu dans Semaine : tu pourras ensuite passer la commande ici."]);
      action = `<div><b>Menu pas encore validé</b><span>Valide-le, puis passe la commande ici</span></div><a class="bouton" href="#/semaine">Voir le menu</a>`;
      bouton = `<a class="bouton grand" href="#/semaine">Voir le menu</a>`;
    } else {
      conseils.push(["monter", "Prêt", `${aCommander} produits à mettre au panier ${magasin} pour ${duree}, environ ${euros(cm.estimation)}. Clique sur « Passer la commande » : l'appli remplit le panier, tu paies toi-même.`]);
      action = `<div><b>${magasin}, ${aCommander} produits</b><span>Pour ${duree}, environ ${euros(cm.estimation)}</span></div><button class="bouton" data-action="panier">Passer la commande</button>`;
      bouton = `<button class="bouton grand" data-action="panier">Passer la commande</button><button class="bouton sobre" data-action="payerMois">J'ai fait cette commande moi-même</button>`;
    }
  } else if (cm.commande) {
    conseils.push(["", "Payé", `<b>Panier payé</b>${cm.commande.montant != null ? ` : ${euros(cm.commande.montant)} le ${dateLongue(cm.commande.date)}` : ""}. Les produits sont dans ton stock.`]);
  }
  if (!aCommander && !cm.panier && !enCours) {
    if (!marcheFait && marche) {
      action = `<div><b>Marché de la semaine</b><span>${marche} produits</span></div><button class="bouton" data-action="payer">C'est fait</button>`;
      bouton = `<button class="bouton grand" data-action="payer">J'ai fait le marché</button>`;
    } else if (marcheFait) {
      action = `<div><b>Tout est acheté</b><span>Stock à jour</span></div><a class="bouton" href="#/cuisine">Cuisiner</a>`;
      bouton = `<a class="bouton grand" href="#/cuisine">Cuisiner</a>`;
    }
  }
  if (cm.commande && aCommander && !enCours) conseils.push(["alerte", "Manque", `Il manque encore ${aCommander} produits après ta dernière commande.`]);
  if (cm.hors_panier && cm.hors_panier.length && !enCours) conseils.push(["alerte", "Manquants", cm.hors_panier.some(l => l.alternatives.length)
    ? `${cm.hors_panier.length} produits manquent chez ${magasin}, et j'ai trouvé de quoi en remplacer ${cm.hors_panier.filter(l => l.alternatives.length).length} : choisis plus bas, dans « Produits manquants ».`
    : `${cm.hors_panier.length} produits introuvables chez ${magasin} : à prendre toi-même, la liste est plus bas.`]);
  conseils.push(marcheFait ? ["", "Marché", `Marché de la semaine fait${total != null ? `, ${euros(total)} payés viande comprise` : ""}. Les fruits et légumes sont dans ton stock.`]
    : marche ? ["", "Marché", `${marche} produits frais à acheter près de chez toi cette semaine${ap ? `, environ ${euros(ap.supermarche + ap.boucher)} dont ${euros(ap.boucher)} de viande` : ""}.`] : null);
  if (fs && fs.acheter) conseils.push(["", "Fruits secs", `${nombre(fs.acheter)} g à acheter ce mois-ci, environ ${euros(fs.cout)} : jamais dans le panier en ligne.`]);
  barre(action);
  const rang = enCours ? 1 : cm.panier ? 2 : aCommander ? (E.valide ? 1 : 0) : marcheFait ? 4 : 3;
  return `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}<div class="tete">
    <div><h1 tabindex="-1">Courses</h1>
      <p class="doux">Trois listes : <b>le panier ${magasin}</b>, rempli par l'appli une fois pour les ${m.nb} semaines (épicerie, frais, surgelés) ; <b>le marché</b>, à faire toi-même chaque semaine (fruits, légumes, viande chez le boucher) ; <b>les fruits secs</b>, une fois par mois.</p></div>
    <div class="ligne"><span class="puce">Semaine ${m.rang + 1} sur ${m.nb}</span>${cm.panier ? `<span class="puce accent">Panier rempli</span>` : ""}${E.profil.chrome ? `<button class="bouton second" data-action="enseignes">Ouvrir mon profil Chrome</button>` : ""}${boutonPdf("courses")}</div>
  </div>
  <div class="grille accueil">
    <section class="bloc large" aria-labelledby="tEtape"><h2 id="tEtape">Où j'en suis</h2>
      <div class="faits">
        <div class="fait"><b>${aCommander}</b><span>produits à commander chez ${magasin}</span></div>
        <div class="fait"><b>${cm.panier ? euros(cm.panier.total) : aCommander ? euros(cm.estimation) : "0 €"}</b><span>${cm.panier ? "dans le panier, hors livraison" : "environ, pour " + duree}</span></div>
        <div class="fait"><b>${cm.en_stock.length}</b><span>produits déjà en stock</span></div>
      </div>
      ${etapes(["Menu validé", "Panier rempli", "Panier payé", "Marché fait"], rang)}
      ${etatEnClair(conseils, enCours || cm.panier ? suiviDeJarvis(t, enCours) : "")}
      ${bouton ? `<div class="actions" style="margin-top:18px">${bouton}</div>` : ""}
    </section>

    ${aCommander ? `<section class="bloc large" aria-labelledby="tMoisC"><h2 id="tMoisC">Panier ${magasin}<span class="puce">${aCommander} produits</span></h2>
      <p class="doux petit sous-titre">Rempli par l'appli pour ${duree} : épicerie, frais, surgelés, et les légumes qui se gardent (oignons, ail, pommes de terre, carottes).</p>
      ${NOTE_COCHES}${cm.panier && (cm.coches || []).length ? `<p class="dujour" style="margin-bottom:12px"><strong>Panier déjà rempli.</strong> Ce que tu coches maintenant y est peut-être déjà : retire-le sur le site de ${magasin}, ou refais le panier.</p>` : ""}
      ${listeParRayon(avecCoches(cm), "panier")}</section>` : ""}

    ${!enCours ? produitsManquants(cm, magasin, duree) : ""}

    <section class="bloc" aria-labelledby="tSemC"><h2 id="tSemC">Marché, semaine ${m.rang + 1}${!marcheFait && marche ? `<span class="puce">${marche} produits</span>` : ""}</h2>
      ${marcheFait ? avis("check", "Marché de la semaine fait", (total != null ? `Tu as payé ${euros(total)}, viande comprise. ` : "") + "Les fruits et légumes sont dans ton stock.")
          + `<p style="margin-top:12px"><button class="bouton sobre" data-action="corriger">${total != null ? "Corriger les montants payés" : "Indiquer le montant payé"}</button></p>`
          + (c.a_acheter.some(l => l.unite !== "qs" && l.acheter) || c.boucher.length ? `<h3 class="sous">Il manque encore</h3>
            <p class="doux petit sous-titre" style="margin-top:0">Des plats ont changé après ton marché. Achète ces produits, puis dis-le ici pour qu'ils entrent au stock.</p>
            ${lignesCochables("marche", avecCoches(c))}${c.boucher.length ? `<h3 class="sous">Viande, chez le boucher</h3>${lignesCochables("boucher", c.boucher)}` : ""}
            ${c.a_acheter.some(l => l.unite !== "qs" && l.acheter) ? `<p style="margin-top:18px"><button class="bouton second" data-action="appoint">J'ai acheté ces produits</button></p>` : ""}` : "") : `
      <h3 class="sous">Fruits et légumes</h3>
      ${avecCoches(c).length ? lignesCochables("marche", avecCoches(c)) : `<p class="discret">Rien cette semaine.</p>`}
      <h3 class="sous">Viande, chez le boucher</h3>
      ${c.boucher.length ? lignesCochables("boucher", c.boucher) : `<p class="discret">Rien cette semaine.</p>`}
      ${marche ? `<p style="margin-top:18px"><button class="bouton second" data-action="payer">J'ai fait le marché</button></p>` : ""}`}
    </section>

    ${(cm.marches_suivants || []).map(x => { const p = m.semaines[x.rang], total = x.a_acheter.length + x.boucher.length;
      return `<section class="bloc" aria-labelledby="tSem${x.rang}"><h2 id="tSem${x.rang}">Marché, semaine ${x.rang + 1}${total ? `<span class="puce">${total} produits</span>` : ""}</h2>
      <p class="doux petit sous-titre">À acheter plus tard${periode(p) ? `, pour la semaine ${periode(p)}` : ""} : produits frais et viande ne se gardent pas deux semaines. Cette liste passera en haut quand tu seras à la semaine ${x.rang + 1}.</p>
      <h3 class="sous">Fruits et légumes</h3>
      ${x.a_acheter.length ? `<ul class="lignes">${x.a_acheter.map(l => `<li><span>${esc(l.nom)}</span><span class="q">${quantite(l.acheter, l.unite)}</span></li>`).join("")}</ul>` : `<p class="discret">Rien.</p>`}
      <h3 class="sous">Viande, chez le boucher</h3>
      ${x.boucher.length ? `<ul class="lignes">${x.boucher.map(l => `<li><span>${esc(l.nom)}</span><span class="q">${quantite(l.quantite, l.unite)}</span></li>`).join("")}</ul>` : `<p class="discret">Rien.</p>`}
    </section>`; }).join("")}

    <div class="pile">
    ${fs ? `<section class="bloc" aria-labelledby="tSecs"><h2 id="tSecs">Fruits secs du mois</h2>
      <p class="doux petit sous-titre">Dans un magasin près de chez toi, jamais dans le panier en ligne.${fs.nom ? ` ${fs.par_jour} g par jour, soit ${nombre(fs.besoin)} g pour 30 jours.` : ""}</p>
      ${fs.acheter ? `<dl class="kpis">
          <div><dt>À acheter</dt><dd>${nombre(fs.acheter)} g</dd><p>Environ ${euros(fs.cout)}. ${esc(fs.conseil)}</p></div>
          <div><dt>En stock</dt><dd>${fs.jours_en_stock > 1 ? `${fs.jours_en_stock} jours` : `${fs.jours_en_stock} jour`}</dd><p>${nombre(fs.stock)} g à la maison.</p></div></dl>
        <p style="margin-top:16px"><button class="bouton second" data-action="fruitsSecs">J'ai acheté les fruits secs</button></p>`
        : (fs.nom ? avis("check", "Tu en as pour le mois", `${fs.jours_en_stock} jours de fruits secs en stock.`) : "")}
      ${fs.autres.length ? `<h3 class="sous">Pour tes recettes</h3>
        <p class="doux petit sous-titre">Noix, amandes et cacahuètes des plats des ${reste > 1 ? `${reste} semaines` : "prochains jours"}, à prendre au même endroit.</p>
        ${lignesCochables("secs", fs.autres, l => quantite(l.acheter, l.unite))}
        ${fs.acheter ? "" : `<p style="margin-top:16px"><button class="bouton second" data-action="fruitsSecs">J'ai acheté ces produits</button></p>`}` : ""}
    </section>` : ""}
    ${cm.en_stock.length ? `<section class="bloc" aria-labelledby="tStockC"><details class="nu"><summary><h2 id="tStockC">Déjà en stock<span class="puce">${cm.en_stock.length} produits</span></h2>${icone("caret-right")}</summary>
      <ul class="lignes" style="margin-top:8px">${cm.en_stock.map(l => `<li><span>${esc(l.nom)}</span><span class="q">${quantite(l.besoin, l.unite)}</span></li>`).join("")}</ul></details></section>` : ""}
    </div>
  </div>`;
}
// Les rayons de ma liste se replient et se déploient (Taha, 23/11/2026) ; ouverts par défaut, on retient ceux qu'on ferme.
const LC_FERMES = new Set();
function vueCourses() {
  apresRendu.push(() => document.querySelectorAll("details[data-lc-rayon]").forEach(d => d.addEventListener("toggle", () =>
    d.open ? LC_FERMES.delete(d.dataset.lcRayon) : LC_FERMES.add(d.dataset.lcRayon))));
  if (E.rythme === "mois" && E.courses_mois && E.semaine) return vueCoursesDuMois();
  const c = E.courses, s = E.semaine, t = E.tache;
  if (!c) { barre(""); return `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}<div class="titre"><h1 tabindex="-1">Courses</h1></div>${vide("Pas encore de liste", "Compose d'abord ta semaine : la liste de courses en découle.", "#/semaine", "Aller à la semaine")}`; }
  const enCours = t.etat === "en cours", fini = s.etat === "commandee" || s.etat === "terminee", magasin = esc(E.magasin.principale);
  const total = E.couts && E.couts.paye_total, ap = E.couts && E.couts.a_payer, n = c.a_acheter.length;
  let action = "", bouton = "";
  const conseils = [];
  if (enCours) {
    conseils.push(["monter", "En cours", /alternatives/.test(t.titre) ? "L'appli cherche des produits de remplacement pour ce qui manque… Quelques minutes. Tu peux quitter cette page, elle se met à jour toute seule."
      : /complète/.test(t.titre) ? "L'appli ajoute tes produits de remplacement au panier… Une ou deux minutes."
      : "L'appli remplit le panier… Compte une vingtaine de minutes. Tu peux quitter cette page, elle se met à jour toute seule."]);
    action = `<div><b>Panier en cours…</b><span>${esc(t.lignes.filter(Boolean).slice(-1)[0] || "").slice(0, 60)}</span></div>
      <button class="bouton" disabled>En cours…</button>`;
  } else if (fini) {
    conseils.push(["", "Payé", `<b>Commande payée</b>${total != null ? ` : ${euros(total)} cette semaine, viande comprise` : ""}. Les produits sont entrés dans ton stock.`]);
    action = `<div><b>Commande payée</b><span>Stock à jour</span></div><a class="bouton" href="#/cuisine">Cuisiner</a>`;
    bouton = `<a class="bouton grand" href="#/cuisine">Cuisiner</a><button class="bouton sobre" data-action="corriger">${total != null ? "Corriger les montants payés" : "Indiquer le montant payé"}</button>`;
  } else if (s.etat === "panier") {
    conseils.push(["monter", "À toi", `<b>Le panier est rempli.</b> Ouvre le site de ${magasin} dans le Chrome de l'appli, choisis ta livraison et paie. Reviens ensuite ici.`]);
    action = `<div><b>Panier rempli</b><span>Il reste à payer chez ${magasin}</span></div>
      <button class="bouton" data-action="payer">C'est payé</button>`;
    bouton = `<button class="bouton grand" data-action="payer">C'est payé</button>`;
  } else if (n) {
    if (t.etat === "occupe") {
      conseils.push(["", "Occupé", "L'appli remplit le panier d'un autre profil. Réessaie dans quelques minutes."]);
      action = `<div><b>L'appli est occupée</b><span>Il remplit le panier d'un autre profil</span></div><button class="bouton" disabled>Patiente…</button>`;
    } else if (!E.valide) {
      conseils.push(["alerte", "À faire", "Valide d'abord ton menu dans Semaine : tu pourras ensuite passer la commande ici."]);
      action = `<div><b>Menu pas encore validé</b><span>Valide-le, puis passe la commande ici</span></div><a class="bouton" href="#/semaine">Voir le menu</a>`;
      bouton = `<a class="bouton grand" href="#/semaine">Voir le menu</a>`;
    } else {
      conseils.push(["monter", "Prêt", `${n} articles à mettre au panier chez ${magasin}. Clique sur « Passer la commande » : l'appli remplit le panier, tu paies toi-même.`]);
      action = `<div><b>${n} articles à acheter</b><span>Tu paies toi-même</span></div>
      <button class="bouton" data-action="panier">Passer la commande</button>`;
      bouton = `<button class="bouton grand" data-action="panier">Passer la commande</button><button class="bouton sobre" data-action="payer">J'ai fait les courses moi-même</button>`;
    }
  } else conseils.push(["", "Stock", "Rien à acheter : tout est déjà en stock."]);
  if (c.boucher.length && !fini) conseils.push(["", "Boucher", `${c.boucher.length > 1 ? `${c.boucher.length} produits` : `${c.boucher.length} produit`} de viande à prendre chez ton boucher : jamais dans le panier.`]);
  if (c.en_stock.length) conseils.push(["", "Stock", `${c.en_stock.length} produits sont déjà chez toi : l'appli ne les rachète pas.`]);
  barre(action);
  const rang = fini ? 4 : s.etat === "panier" ? 2 : enCours || E.valide ? 1 : 0;
  return `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}<div class="tete">
    <div><h1 tabindex="-1">Courses</h1>
      <p class="doux">${fini ? (n ? `Courses faites, mais ${n} articles manquent encore.` : "Tout est acheté.") : `${n} articles à acheter chez ${magasin}. ${c.boucher.length ? "La viande reste chez ton boucher." : ""}`}</p></div>
    <div class="ligne">${s.etat === "panier" ? `<span class="puce accent">Panier rempli</span>` : fini ? `<span class="puce">Commande payée</span>` : ""}${E.profil.chrome ? `<button class="bouton second" data-action="enseignes">Ouvrir mon profil Chrome</button>` : ""}${boutonPdf("courses")}</div>
  </div>
  <div class="grille accueil">
    <section class="bloc large" aria-labelledby="tEtape"><h2 id="tEtape">Où j'en suis</h2>
      <div class="faits">
        <div class="fait"><b>${n}</b><span>${fini ? "articles qui manquent encore" : `articles à acheter chez ${magasin}`}</span></div>
        <div class="fait"><b>${fini && total != null ? euros(total) : ap ? euros(ap.supermarche + ap.boucher) : "–"}</b><span>${fini && total != null ? "payés, viande comprise" : ap ? `environ, dont ${euros(ap.boucher)} de viande` : "montant non indiqué"}</span></div>
        <div class="fait"><b>${c.en_stock.length}</b><span>produits déjà en stock</span></div>
      </div>
      ${etapes(["Menu validé", "Panier rempli", "Payé", "En stock"], rang)}
      ${etatEnClair(conseils, enCours || s.etat === "panier" ? suiviDeJarvis(t, enCours) : "")}
      ${bouton ? `<div class="actions" style="margin-top:18px">${bouton}</div>` : ""}
    </section>

    <section class="bloc large" aria-labelledby="tAcheter"><h2 id="tAcheter">${fini ? "Il manque encore" : "À acheter"}${n ? `<span class="puce">${n} articles</span>` : ""}</h2>
      ${fini && n ? `<p class="doux petit sous-titre">Des plats ont changé après tes courses : ces produits ne sont pas dans ton stock. Achète-les près de chez toi, puis dis-le ici pour qu'ils y entrent.</p>` : ""}
      ${NOTE_COCHES}${avecCoches(c).length ? listeParRayon(avecCoches(c), "semaine") : `<p class="discret">Rien à acheter, tout est en stock.</p>`}
      ${fini && c.a_acheter.some(l => l.unite !== "qs" && l.acheter) ? `<p style="margin-top:18px"><button class="bouton second" data-action="appoint">J'ai acheté ces produits</button></p>` : ""}
    </section>
    <section class="bloc" aria-labelledby="tBoucher"><h2 id="tBoucher">Chez le boucher${c.boucher.length ? `<span class="puce">${c.boucher.length}</span>` : ""}</h2>
      ${c.boucher.length ? lignesCochables("boucher", c.boucher, l => quantite(l.quantite, l.unite)) : `<p class="discret">Rien cette semaine.</p>`}</section>
    ${c.en_stock.length ? `<section class="bloc" aria-labelledby="tStockC"><details class="nu"><summary><h2 id="tStockC">Déjà en stock<span class="puce">${c.en_stock.length} produits</span></h2>${icone("caret-right")}</summary>
      <ul class="lignes" style="margin-top:8px">${c.en_stock.map(l => `<li><span>${esc(l.nom)}</span><span class="q">${quantite(l.besoin, l.unite)}</span></li>`).join("")}</ul></details></section>` : ""}
  </div>`;
}

/* ------------------------------------------------------------ cuisine, jour par jour */
function vueCuisine({ params }) {
  // Mode flemmard : la page Cuisine n'existe pas (Taha, 22/11/2026) ; on retombe sur le Jour.
  if (enSuivi()) { location.replace("#/semaine"); return ""; }
  const s = E.semaine;
  if (!s) { barre(""); return `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}<div class="titre"><h1 tabindex="-1">Cuisine</h1></div>${vide("Rien à cuisiner", "Compose d'abord ta semaine.", "#/semaine", "Aller à la semaine")}`; }
  const n = jourDemande(params), j = s.jours[n];
  const seances = j.cuisine.filter(c => c.quand !== "fruit"), fruits = fruitsDuJour(j);
  const reste = j.cuisine.filter(c => !fait(s, n, c.id));
  const aCuisiner = reste.filter(c => c.quand !== "fruit").length;
  const ligne = c => { const r = recette(c.id), ok = fait(s, n, c.id);
    return `<a class="exo repas${ok ? " fait" : ""}" href="#/cuisine/${c.id}?jour=${n}">${photo(r, 480)}
      <div class="exo-texte"><div class="quand">${QUAND[c.quand]}${c.pour_demain ? ", en double pour demain midi" : ""}</div><h3>${esc(platDuJour(s, n, c.id).nom)}</h3>
      <div class="chiffres">${ok ? `${icone("check")}Cuisiné` : `${[pourCombien(c, j), r.temps ? `${r.temps} min` : ""].filter(Boolean).join(", ")}`}</div></div></a>`; };
  barre(reste.length ? `<div><b>${j.jour}</b><span>${aCuisiner ? `${aCuisiner} à cuisiner` : "Reste les fruits"}</span></div>
    <button class="bouton" data-action="journee" data-jour="${n}">Journée faite</button>` : "");
  const tout = s.jours.every((x, i) => x.cuisine.every(c => fait(s, i, c.id)));
  const k = E.mois ? E.mois.rang : 0;
  const vides = [["Matin", "pdj"], ["Midi", "dej"], ["Soir", "din"]].filter(([, m]) => j[m] === "rien");
  return `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}<div class="titre"><h1 tabindex="-1">Cuisine</h1>
    <p>Tu cuisines chaque jour. Le plat du soir se fait en double : la seconde part est ton déjeuner du lendemain.</p>
    <p class="actions" style="margin-top:12px">${boutonPdf("cuisine", "Exporter les fiches en PDF")}</p></div>
  ${selecteurDeJour(s, n, "cuisine")}
  <p class="jour-resume chiffres">${j.jour}${n === rangDuJour() ? ", aujourd'hui" : ""}. ${reste.length ? `${nombre(seances.reduce((t, c) => t + recette(c.id).temps, 0))} min de cuisine en tout.` : "Tout est fait."}</p>
  ${j.dej_reste ? `<p class="dujour"><strong>Ce midi.</strong> ${esc(recette(j.dej).nom)}, la part gardée d'hier soir.</p>` : ""}
  <section aria-label="À cuisiner ce jour"><div class="exos">${seances.map(ligne).join("")}${vides.map(([quand, m]) => carteSansRepas(quand, k, n, m)).join("")}</div>
    <p class="actions" style="margin-top:14px"><button class="bouton sobre" data-action="changer" data-semaine="${k}" data-jour="${n}" data-moment="col${j.collations.length}">${icone("cooking-pot")}Ajouter une collation</button></p></section>
  ${fruits.length ? `<p class="dujour"><strong>À manger aussi.</strong> ${esc(fruits.join(", ").replace(/^./, c => c.toUpperCase()))}.</p>` : ""}
  ${tout ? `<div class="bloc"><button class="bouton" data-action="composer">Composer la semaine suivante</button></div>` : ""}`;
}

function vueRecette({ arg, params }) {
  let r = recette(arg);
  const s = E.semaine;
  if (!r) return vueIntrouvable();
  // Depuis l'historique (?date=&moment=) : l'assiette de ce jour-là, quantités réglées et taille comprises (Taha,
  // 28/11/2026 : « je trouve pas kaki quand je clique sur Voir la recette… j'ai jamais mis du miel »).
  const vu = params.has("date") ? repasDuJournal(params.get("date"), arg, params.get("moment") || "") : null;
  const dj = vu ? recetteDuJournal(r, vu) : null;
  if (dj) r = dj.r;
  const repasVu = vu ? ((vu.moment || "").startsWith("col") ? vu.au_repas || "col" : vu.moment) : "";
  // La seance demandee (?jour=), sinon la prochaine fois ou ce plat se cuisine.
  let n = params.has("date") ? -1 : params.has("jour") ? jourDemande(params) : -1, seance = null;
  if (s && !params.has("date")) {
    if (n < 0) n = [...s.jours.keys()].find(i => s.jours[i].cuisine.some(c => c.id === arg && !fait(s, i, arg))) ?? -1;
    seance = n >= 0 ? s.jours[n].cuisine.find(c => c.id === arg) : null;
  }
  if (seance) r = platDuJour(s, n, arg);                   // les quantites de ce jour-la, si elles ont ete ajustees
  // Mode suivi : la recette telle qu'elle est dans l'assiette ce jour-là, même sans séance (part gardée d'hier soir,
  // plat d'un autre repas) (Taha, 23/11/2026 : « la recette avec les portions du jour »).
  const auJour = !seance && s && n >= 0 && enSuivi() && P_MOMENTS(s.jours[n]).includes(arg);
  if (auJour) r = platDuJour(s, n, arg, params.get("moment") || (s.jours[n].dej === arg ? "dej" : ""));
  const portions = seance ? seance.portions : 1, ok = seance && fait(s, n, arg);
  const k = E.mois ? E.mois.rang : 0;
  const goute = s && Object.keys(s.prepares || {}).some(k => k.endsWith("|" + arg));
  const combien = seance ? pourCombien(seance, s.jours[n]) : "pour 1 repas", facteur = dj ? dj.facteur : seance || auJour ? tailleDe(s.jours[n], arg) : 1;
  // Taha, 22/11/2026 : « dans Modifier les ingrédients des portions, dans Cuisine d'autres » → en mode flemmard, les
  // quantités d'UNE assiette (comme Modifier) ; ce qui se cuisine pour plusieurs repas, à part, sur demande.
  const listeRecette = mult => `<ul class="ingredients">${r.ing.map(i => `<li><span>${i.u === "qs" ? esc(i.n) : `<button type="button" class="lien" data-action="ingredient" data-nom="${esc(i.n)}"
        aria-label="Valeurs de ${esc(i.n)}">${esc(i.n)}</button>`}</span>
        <span>${quantite(i.u === "qs" ? 0 : Math.round(i.q * mult * 10) / 10, i.u)}</span></li>`).join("")}</ul>`;
  apresRendu.push(() => { const b = document.querySelector("[data-ing-tout]"); if (b) b.addEventListener("click", () => {
    const t = document.querySelector("[data-ing-total]"); t.hidden = !t.hidden;
    b.textContent = t.hidden ? `Voir les quantités à cuisiner pour les ${seance.repas}` : "Cacher"; }); });
  barre(seance && !ok ? `<div><b>${s.jours[n].jour}, ${combien}</b><span>Les ingrédients sortiront du stock</span></div>
    <button class="bouton" data-action="cuisine" data-plat="${r.id}" data-jour="${n}">${enSuivi() ? "J'ai mangé" : "C'est cuisiné"}</button>` : "");
  // Mode flemmard : pas de page Cuisine ; « Retour » ramène là d'où tu viens (Jour, Catalogue…) (Taha, 22/11/2026).
  if (enSuivi()) apresRendu.push(() => { const a = document.querySelector("a.retour[data-precedent]");
    if (a && adressePrecedente) a.addEventListener("click", ev => { ev.preventDefault(); RETOUR_ARRIERE = true; history.back(); }); });
  return `${enSuivi() ? `<a class="retour" href="#/semaine" data-precedent>${icone("caret-left")}Retour</a>`
    : vu ? `<a class="retour" href="#/historique">${icone("caret-left")}Historique</a>`
    : `<a class="retour" href="#/cuisine${n >= 0 ? `?jour=${n}` : ""}">${icone("caret-left")}Cuisine</a>`}
  <article class="fiche fiche-compacte">
    <div class="fc-tete">${photo(r, 240, "carre", r.nom)}
      <div><h1 tabindex="-1">${esc(r.nom)}</h1>
        ${r.nomBase ? `<p class="discret petit fc-d-apres">D'après « ${esc(r.nomBase)} »</p>` : ""}
        <p class="discret chiffres">${[`${nombre(vu ? vu.kcal : r.kcal * facteur)} kcal`, `${nombre(vu ? vu.prot : r.prot * facteur)} g prot.`, r.temps ? `${r.temps} min` : "",
          (seance || auJour) && facteur !== 1 ? `${nombre(facteur * 100)} %` : ""].filter(Boolean).join(" · ")}</p>
        ${goute && estRepas(r) ? `<div class="etoiles fc-note" role="group" aria-label="Ta note, de 1 à 5 : elle décide si ce plat revient" title="Ta note : elle décide si ce plat revient">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-action="noter" data-plat="${r.id}" data-note="${i}"
          class="${r.note && i <= Math.round(r.note) ? "pleine" : ""}" aria-label="${i > 1 ? `${i} étoiles` : `${i} étoile`} sur 5">${icone(r.note && i <= Math.round(r.note) ? "star-fill" : "star")}</button>`).join("")}</div>` : ""}
        ${vu ? `<p class="discret petit fc-vu">Ce que tu as mangé <span>${esc(dateLongueCourte(params.get("date")))}</span>, <span>${repasVu === "col" ? "en collation" : `au ${nomMoment(repasVu)}`}</span>.</p>`
          : enSuivi() ? "" : `<p class="discret petit">${seance ? `${s.jours[n].jour}, ` : ""}${combien}${seance && seance.pour_demain ? " : ce soir et demain midi" : ""}.</p>`}</div></div>
    <section class="fc-bloc" aria-labelledby="tIng"><h2 id="tIng">Ingrédients</h2>
      ${listeRecette(enSuivi() || vu ? facteur : portions)}
      ${enSuivi() && seance && seance.repas > 1 ? `<p class="petit discret fc-double">Tu cuisines pour ${seance.repas} repas${seance.pour_demain ? " (ce soir et demain midi)" : ""} : ci-dessus, UNE assiette.
        <button type="button" class="lien" data-ing-tout>Voir les quantités à cuisiner pour les ${seance.repas}</button></p>
        <div hidden data-ing-total>${listeRecette(portions)}</div>` : ""}
</section>
    <section class="fc-bloc" aria-labelledby="tEtapes"><h2 id="tEtapes">Préparation</h2>
      ${r.source && /^https?:\/\//.test(r.source.lien || "") ? `<p class="cp-source"><a href="${esc(r.source.lien)}" target="_blank" rel="noopener">${icone("link")}Recette vue sur ${esc(r.source.site || "le web")}${r.source.auteur ? ` · ${esc(r.source.auteur)}` : ""}</a></p>` : ""}
      <ol class="etapes">${r.etapes.map(e => `<li>${esc(e)}</li>`).join("")}</ol>
      ${r.four ? `<p class="petit discret" style="margin-top:10px">Four : ${esc(r.four)}.</p>` : ""}</section>
  </article>`;
}

/* ------------------------------------------------------------ plus */
function vuePlus() {
  barre("");
  const p = E.phase, admin = E.utilisateur.admin;
  const comptes = comptesNav();
  const lien = (vue, nomIcone, titre) => `<li><a href="#/${vue}">${icone(nomIcone)}<span>${titre}</span>${comptes[vue] ? `<span class="compte" aria-label="${comptes[vue]} ${vue === "courses" ? "à acheter" : "à cuisiner"}">${comptes[vue]}</span>` : ""}${icone("caret-right")}</a></li>`;
  return `<div class="titre"><h1 tabindex="-1">${esc(E.profil.nom)}</h1>
    <p>${admin ? "Vue admin. " : ""}Phase ${p.n}, ${esc(p.nom).toLowerCase()}. ${nombre(p.kcal + (E.reglages.ajustement || 0))} kcal par jour${enSuivi() ? "" : `, budget de ${euros(E.reglages.budget_mois)} par mois`}.</p></div>
  <ul class="menu">
    ${enSuivi() ? "" : lien("courses", "shopping-cart-simple", "Courses") + lien("cuisine", "cooking-pot", "Cuisine") + lien("budget", "receipt", "Budget et coûts")}
    ${lien("vitamines", "orange", "Vitamines")}
    ${enSuivi() ? "" : lien("stock", "package", "Stock") + lien("journal", "notebook", "Journal de l'appli")}
    ${lien("profil", "user-circle", "Mon profil")}
    ${admin ? lien("profils", "users", "Profils") : ""}
    ${lien("reglages", "sliders-horizontal", "Réglages")}
  </ul>`;
}
function vueAvancement({ params }) {
  barre("");
  const a = E.avancement, b = E.budget, c = E.couts, s = E.semaine;
  const p = ["jour", "semaine", "mois"].includes(params.get("p")) ? params.get("p") : "jour", x = a[p];
  const NOMS = { jour: "Aujourd'hui", semaine: "Cette semaine", mois: "Ce mois-ci" };
  const kpi = (libelle, valeur, aide, pct, pctPrevu = null) => `<div><dt>${libelle}</dt><dd>${valeur}</dd>
    ${pct == null ? "" : `<span class="piste" role="img" aria-label="${nombre(pct)} % de l'objectif"><b style="width:${pctPrevu != null && pctPrevu > pct ? Math.min(100, pctPrevu) : 0}%"></b><i style="width:${Math.min(100, pct)}%"></i></span>`}
    ${aide ? `<p>${aide}</p>` : ""}</div>`;
  // Le mois attend une semaine complète (7 journées finies ce mois-ci) : avant, la semaine dit déjà tout (Taha, 20/11/2026).
  const moisTropTot = p === "mois" && enSuivi() && (x.jours_finis || 0) < 7;
  const suivi = x.jours_suivis > 0 && !moisTropTot, parJour = p === "jour" ? "" : " / jour";
  const macro = (nom, valeur, but, prevu = null) => valeur == null ? "" : kpi(nom + (p === "jour" && prevuJour ? (nom === "Fibres" ? " mangées" : " mangés") : parJour), `${nombre(valeur)} g`,
    but ? `${nombre(Math.round(100 * valeur / but))} % de ton objectif.${prevu != null ? ` ${nombre(Math.round(100 * prevu / but))} % avec tout le prévu.` : ""}` : "Pas d'objectif fixé dans ton profil.",
    but ? Math.round(100 * valeur / but) : null, but && prevu != null ? Math.round(100 * prevu / but) : null);
  const pctK = Math.round(100 * x.kcal / a.objectif.kcal), pctP = Math.round(100 * x.prot / a.objectif.prot);
  // Aujourd'hui : la journée prévue en gris derrière ce qui est mangé, comme sur l'écran Jour (Taha, 20/11/2026).
  const prevuJour = p === "jour" && enSuivi() && E.journal_repas ? (E.journal_repas.jours || []).find(d => d.date === a.aujourdhui) || null : null;
  // Argent : ce qui est sorti (paye) quand on le sait, sinon la valeur de ce qui a ete mange.
  let argent;
  if (p === "mois") argent = kpi("Dépensé ce mois-ci", euros(b.paye), `Sur ${euros(b.budget)} de budget. ${b.reste < 0 ? `Dépassé de ${euros(-b.reste)}.` : `Il reste ${euros(b.reste)}, stock de début de mois déduit.`}`, Math.round(100 * (b.budget - Math.max(0, b.reste)) / b.budget));
  else if (p === "semaine") argent = kpi("Payé cette semaine", c && c.paye_total != null ? euros(c.paye_total) : "Rien encore", s ? `Pour ${euros(s.budget_semaine)} prévus par semaine.` : "", c && c.paye_total != null && s ? Math.round(100 * c.paye_total / s.budget_semaine) : null);
  else argent = kpi("Valeur des repas du jour", euros(x.cout), s ? `Pour ${euros(s.budget_semaine / 7)} prévus par jour.` : "", s ? Math.round(100 * x.cout / (s.budget_semaine / 7)) : null);
  if (enSuivi()) argent = "";                     // mode flemmard : ni courses ni budget suivis
  const faitsJour = s ? s.jours[aujourdhui()].cuisine.filter(k => fait(s, aujourdhui(), k.id)).length : 0;
  const totalJour = s ? s.jours[aujourdhui()].cuisine.length : 0;
  const court = iso => new Intl.DateTimeFormat(LOCALE, p === "semaine" ? { weekday: "short" } : { day: "numeric" }).format(new Date(iso + "T12:00"));
  const basses = Object.keys(E.vitamines.noms).filter(v => x.vitamines[v] / E.vitamines.besoins[v] < 0.8);
  if (p !== "jour" && enSuivi() && suivi) apresRendu.push(() => {
    // Une courbe : ce que tu as mangé chaque journée finie (depuis ta date de début), et ton objectif en pointillés.
    const jours = x.detail.filter(d => d.date < a.aujourdhui && (!E.reglages.date_debut || d.date >= E.reglages.date_debut));
    const manges = jours.filter(d => d.kcal != null).map(d => ({ x: d.date, y: d.kcal }));
    // L'axe va de 500 kcal sous la journée la moins calorique à 200 kcal au-dessus de la plus calorique
    // (Taha, 20/11/2026) ; l'objectif reste toujours visible.
    const ys = manges.map(m => m.y), obj = a.objectif.kcal;
    Graph.courbes($("gMange"), { unite: "kcal", hauteur: 230, titre: "Calories mangées chaque jour, comparées à l'objectif",
      yMin: ys.length ? Math.max(0, Math.min(Math.min(...ys) - 500, obj - 100)) : null,
      yMax: ys.length ? Math.max(Math.max(...ys) + 200, obj + 100) : null,
      videTexte: "La courbe apparaît dès la première journée finie.",
      series: manges.length ? [{ nom: "Calories mangées", couleur: "var(--s1)", marques: true, points: manges },
        { nom: "Objectif", couleur: "var(--s2)", pointille: true, points: jours.map(d => ({ x: d.date, y: a.objectif.kcal })) }] : [] });
  });
  if (p !== "jour" && !enSuivi()) apresRendu.push(() => Graph.courbes($("gMange"), { unite: "kcal", hauteur: 230, aujourdhui: enSuivi() ? null : a.aujourdhui,
    ...(() => { const ys = x.detail.filter(d => d.kcal != null).map(d => d.kcal), obj = a.objectif.kcal;
      return ys.length ? { yMin: Math.max(0, Math.min(Math.min(...ys) - 500, obj - 100)), yMax: Math.max(Math.max(...ys) + 200, obj + 100) } : {}; })(),
    videTexte: "Tes calories apparaîtront ici dès le premier plat déclaré cuisiné.", titre: "Calories mangées chaque jour, comparées à l'objectif",
    series: x.detail.some(d => d.kcal != null) ? [
      { nom: "Mangé", couleur: "var(--s1)", marques: true, points: x.detail.filter(d => d.kcal != null).map(d => ({ x: d.date, y: d.kcal })) },
      { nom: "Objectif", couleur: "var(--s2)", pointille: true, points: x.detail.map(d => ({ x: d.date, y: a.objectif.kcal })) }] : [] }));
  return `<div class="titre"><h1 tabindex="-1">Avancement</h1>
    <p>Ce que tu as vraiment cuisiné et mangé, comparé à ton objectif de ${nombre(a.objectif.kcal)} kcal et ${a.objectif.prot} g de protéines par jour.${p !== "jour" ? " Journées terminées seulement : aujourd'hui compte dès demain." : ""}</p></div>
  <nav class="jours" aria-label="Période">
    ${Object.keys(NOMS).map(k => `<a href="#/avancement?p=${k}"${k === p ? ' aria-current="true"' : ""}>${NOMS[k]}</a>`).join("")}
  </nav>
  ${moisTropTot ? `<div class="vide"><h2>Le mois arrive après ta première semaine</h2>
    <p>Il s'affiche quand 7 journées de ce mois sont finies : ${(n => n > 1 ? `encore ${n} jours` : `encore ${n} jour`)(7 - (x.jours_finis || 0))}. En attendant, regarde « Cette semaine ».</p>
    <a class="bouton second" href="#/avancement?p=semaine">Voir cette semaine</a></div>`
  : !suivi ? `<div class="vide"><h2>${enSuivi() && p !== "jour" ? `Pas encore de journée finie ${p === "semaine" ? "cette semaine" : "ce mois-ci"}` : (enSuivi() ? { jour: "Rien de mangé aujourd'hui", semaine: "Rien de mangé cette semaine", mois: "Rien de mangé ce mois-ci" }
      : { jour: "Rien de cuisiné aujourd'hui", semaine: "Rien de cuisiné cette semaine", mois: "Rien de cuisiné ce mois-ci" })[p]}</h2>
    ${enSuivi() ? `<p>${p === "jour" ? "L'avancement se remplit avec les repas que tu notes." : "La semaine et le mois comptent les journées terminées : la moyenne commence demain."}</p>
    <a class="bouton second" href="#/semaine">Noter ce que je mange</a></div>` : `<p>L'avancement se remplit quand tu touches « C'est cuisiné » ou « Journée faite » dans l'onglet Cuisine.</p>
    <a class="bouton second" href="#/cuisine">Aller à la cuisine</a></div>
    <dl class="kpis bloc">${argent}</dl>`}` : `
  ${prevuJour ? `<p class="legende-jauges legende-avancement"><span><i class="mange"></i>mangé</span><span><i></i>prévu</span></p>` : ""}
  ${p === "jour" ? "" : `<p class="petit discret" style="margin:10px 0 -6px">Moyenne par jour.</p>`}
  <dl class="kpis kpis-avancement" style="margin-top:14px">
    ${kpi(p === "jour" ? "Calories mangées" : "Calories" + parJour, `${nombre(x.kcal)} kcal`, `${nombre(pctK)} % de ton objectif${x.kcal > a.objectif.kcal * 1.05 ? ", au-dessus" : ""}.${prevuJour ? ` ${nombre(Math.round(100 * prevuJour.kcal / a.objectif.kcal))} % avec tout le prévu.` : ""}`, pctK, prevuJour ? Math.round(100 * prevuJour.kcal / a.objectif.kcal) : null)}
    ${kpi(p === "jour" ? "Protéines mangées" : "Protéines" + parJour, `${x.prot} g`, `${nombre(pctP)} % de ton objectif.${prevuJour ? ` ${nombre(Math.round(100 * prevuJour.prot / a.objectif.prot))} % avec tout le prévu.` : ""}`, pctP, prevuJour ? Math.round(100 * prevuJour.prot / a.objectif.prot) : null)}
    ${macro("Glucides", x.gluc, a.objectif.gluc, prevuJour ? prevuJour.gluc : null)}
    ${macro("Lipides", x.lip, a.objectif.lip, prevuJour ? prevuJour.lip : null)}
    ${macro("Fibres", x.fib, a.objectif.fib, prevuJour && prevuJour.fib != null ? prevuJour.fib : null)}
    ${enSuivi() ? (p === "jour" ? "" : kpi("Jours notés", `${x.jours_suivis} sur ${x.jours}`, "Jours où tu as noté tes repas.", Math.round(100 * x.jours_suivis / x.jours)))
      : p === "jour" ? kpi("Fait aujourd'hui", `${faitsJour} sur ${totalJour}`, "Repas, collations et fruits prévus ce jour.", totalJour ? Math.round(100 * faitsJour / totalJour) : null)
      : kpi("Jours suivis", `${x.jours_suivis} sur ${x.jours}`, "Jours où tu as déclaré avoir cuisiné.", Math.round(100 * x.jours_suivis / x.jours))}
    ${argent}
  </dl>
  ${p !== "jour" ? `<section class="bloc" aria-labelledby="tJours"><h2 id="tJours">Calories : ce que tu as mangé et ton objectif</h2>
    <div class="legende"><span><i style="background:var(--s1)"></i>Mangé</span><span><i style="background:var(--s2)"></i>Objectif</span></div>
    <div id="gMange"></div>
    <p class="petit discret" style="margin-top:8px">Un jour sans point est un jour non déclaré.</p></section>` : ""}
  ${enSuivi() ? "" : `<section class="bloc" aria-labelledby="tVitA"><h2 id="tVitA">Vitamines${p === "jour" ? " du jour" : ", moyenne par jour"}</h2>
    <p class="discret petit" style="margin:4px 0 14px">${basses.length ? `À surveiller : ${basses.join(", ")}.` : "Tous tes besoins sont couverts à 80 % ou plus."}</p>
    ${barresVitamines(x.vitamines, true)}
    <p style="margin-top:12px"><a class="bouton sobre" href="#/vitamines">Voir les détails${icone("caret-right")}</a></p></section>`}`}
  ${enSuivi() ? "" : `<p class="bloc"><a class="bouton sobre" href="#/budget">Voir le détail du budget</a></p>`}`;
}
function vueVitaminesMangees(params) {
  // Ce que tu as mangé (plats marqués mangés), comparé à tes besoins (Taha, 19/11/2026).
  const a = E.avancement, V = E.vitamines;
  // Un jour à la fois (Taha, 19/11/2026 : « garde que le jour ») ; ?j=AAAA-MM-JJ, avec ‹ et › comme les jours de
  // l'écran Jour, et la date qui ouvre un calendrier (Taha, 20/11/2026). Du début du suivi à aujourd'hui.
  const decaler = (iso, n) => { const x = new Date(iso + "T12:00"); x.setDate(x.getDate() + n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const passes = Object.keys(a.par_jour || {}).sort();
  const premier = [E.reglages.date_debut, passes[0], a.aujourdhui].filter(d => d && d <= a.aujourdhui).sort()[0];
  const voulu = /^\d{4}-\d{2}-\d{2}$/.test(params.get("j") || "") ? params.get("j") : a.aujourdhui;
  const date = voulu > a.aujourdhui ? a.aujourdhui : voulu < premier ? premier : voulu;
  const dec = Math.round((new Date(a.aujourdhui + "T12:00") - new Date(date + "T12:00")) / 864e5);
  const p = "jour", x = dec ? (a.par_jour || {})[date] || { jours_suivis: 0, vitamines: {} } : a.jour;
  const bulle = dec === 0 ? "Aujourd'hui" : dec === 1 ? "Hier"
    : new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" }).format(new Date(date + "T12:00")).replace(/^./, c => c.toUpperCase());
  const lien = d => `#/vitamines${d === a.aujourdhui ? "" : `?j=${d}`}`;
  const nav = `<nav class="jours jours-suivi jours-vitamines" aria-label="Jour">
    ${date > premier ? `<a class="fleche" href="${lien(decaler(date, -1))}" aria-label="Jour d'avant">${icone("caret-left")}</a>` : ""}
    <button type="button" class="date-choix" id="vitDate" aria-current="true" aria-expanded="false" aria-controls="vitCal">${esc(bulle)}${icone("calendar-blank")}</button>
    ${dec > 0 ? `<a class="fleche" href="${lien(decaler(date, 1))}" aria-label="Jour suivant">${icone("caret-right")}</a>` : ""}</nav>
    <div class="cal" id="vitCal" hidden></div>`;
  // Le calendrier : les jours après aujourd'hui (et avant le début du suivi) grisés, un point sous les jours mangés
  // (Taha, 20/11/2026 ; celui de l'iPhone ne grise rien).
  const avecDonnees = new Set([...passes, ...(a.jour.jours_suivis ? [a.aujourdhui] : [])]);
  const MOIS = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
  const calendrier = mois => {                  // mois = "AAAA-MM"
    const [an, m] = mois.split("-").map(Number), premierDuMois = new Date(an, m - 1, 1, 12);
    const vide = (premierDuMois.getDay() + 6) % 7, nb = new Date(an, m, 0).getDate();
    const iso = n => `${mois}-${String(n).padStart(2, "0")}`;
    const avant = mois > premier.slice(0, 7), apres = mois < a.aujourdhui.slice(0, 7);
    const cases = Array.from({ length: vide }, () => "<span></span>").concat(Array.from({ length: nb }, (_, k) => {
      const d = iso(k + 1), hors = d > a.aujourdhui || d < premier;
      return `<button type="button" data-jour="${d}"${hors ? " disabled" : ""} class="${[d === date ? "choisi" : "", d === a.aujourdhui ? "auj" : "", avecDonnees.has(d) ? "mange" : ""].filter(Boolean).join(" ")}">${k + 1}</button>`; }));
    return `<div class="cal-tete"><button type="button" data-mois="-1"${avant ? "" : " disabled"} aria-label="Mois d'avant">${icone("caret-left")}</button>
      <b>${esc(MOIS.format(premierDuMois).replace(/^./, c => c.toUpperCase()))}</b>
      <button type="button" data-mois="1"${apres ? "" : " disabled"} aria-label="Mois suivant">${icone("caret-right")}</button></div>
      <div class="cal-jours">${["L", "M", "M", "J", "V", "S", "D"].map(j => `<span>${j}</span>`).join("")}${cases.join("")}</div>`;
  };
  apresRendu.push(() => {
    const bouton = $("vitDate"), cal = $("vitCal");
    if (!bouton || bouton.dataset.branche) return;          // une seule fois, même si la vue est posée deux fois
    bouton.dataset.branche = "1";
    // Ouvert, il le reste si la page se redessine (une photo ou une mise à jour arrivée en fond).
    let mois = calVitamines.ouvert && calVitamines.date === date ? calVitamines.mois : date.slice(0, 7);
    const dessiner = () => { cal.innerHTML = calendrier(mois); Object.assign(calVitamines, { mois, date }); };
    const ouvrir = oui => { cal.hidden = !oui; calVitamines.ouvert = oui; bouton.setAttribute("aria-expanded", String(oui)); if (oui) dessiner(); };
    if (calVitamines.ouvert && calVitamines.date === date) ouvrir(true);
    bouton.addEventListener("click", () => ouvrir(cal.hidden));
    cal.addEventListener("click", ev => {
      const j = ev.target.closest("[data-jour]"), m = ev.target.closest("[data-mois]");
      if (j && !j.disabled) { calVitamines.ouvert = false; location.hash = lien(j.dataset.jour); }
      else if (m && !m.disabled) { const x = new Date(mois + "-15T12:00"); x.setMonth(x.getMonth() + Number(m.dataset.mois));
        mois = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; dessiner(); }
    });
  });
  const codes = Object.keys(V.noms);
  const pct = c => V.besoins[c] ? Math.round(100 * (x.vitamines[c] || 0) / V.besoins[c]) : 0;
  const couvertes = codes.filter(c => pct(c) >= 100).length, basses = codes.filter(c => pct(c) < 80);
  const vue = ["semaine", "mois"].includes(params.get("vue")) ? params.get("vue") : params.get("vue") === "suivi" ? (params.get("p") === "30" ? "mois" : "semaine") : "jour";
  const manquent = E.vitamines_a_completer || [], suivi = vue !== "jour", completer = params.get("completer") === "1";
  // Deux vues (Taha, 22/11/2026) : le jour, tout sur un écran ; « Sur la durée », ce qui te manque souvent.
  const onglets = `<div class="vit-titre"><h1 tabindex="-1">Vitamines</h1><nav class="jours vit-onglets" aria-label="Vue">
    ${[["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"]].map(([v, t]) => `<a href="#/vitamines${v === "jour" ? "" : `?vue=${v}`}"${v === vue ? ' aria-current="true"' : ""}>${t}</a>`).join("")}</nav></div>`;
  const aCompleter = manquent.length ? `<details class="bloc a-completer"${completer ? " open" : ""}><summary><span>${icone("warning-circle")}${manquent.length > 1 ? `${manquent.length} aliments` : `${manquent.length} aliment`} sans vitamines : à compléter</span>${icone("caret-right")}</summary>
      <p class="petit discret">Tant qu'elles manquent, ces aliments comptent zéro vitamine. Branche ton compte Claude (Réglages) pour qu'il les estime, ou renseigne-les ici.</p>
      ${manquent.map((nom, i) => `<details class="completer"><summary>${esc(nom)}${icone("caret-right")}</summary>
        <form class="formulaire" data-completer="${esc(nom)}" data-i="${i}" novalidate>${champsVitamines(`cv${i}_`)}
          <small class="erreur" id="eCv${i}" style="display:block;color:var(--critique)"></small>
          <button class="bouton second" type="submit">Enregistrer</button></form></details>`).join("")}</details>` : "";
  if (suivi) return onglets + vueVitaminesDuree(vue === "mois" ? 30 : 7, a, V, decaler) + aCompleter;
  return `${completer ? aCompleter : ""}${onglets}
  ${nav}
  ${!x.jours_suivis && !Object.values(x.vitamines_prevues || {}).some(v => v > 0) ? vide(dec ? "Rien de marqué mangé ce jour-là" : "Rien de mangé pour l'instant",
      "Les vitamines se remplissent avec les plats que tu marques « mangé ».", "#/semaine", "Aller au jour")
    : `<section class="bloc vit-jour" aria-label="${dec ? `Apport ${dec === 1 ? "d'hier" : "de ce jour"}` : "Apport du jour"}">
      <p class="vit-resume"><b>${couvertes} sur ${codes.length}</b> couvertes${basses.length ? ` · <span class="bas">${basses.length} sous 80 %</span>` : ""}</p>
      <p class="petit discret legende-prevu">${!dec && Object.values(x.vitamines_prevues || {}).some(v => v > 0) ? `<span><i class="consomme"></i>Mangé</span><span><i></i>Avec tout le prévu</span>` : ""}<span>Eu / besoin par jour</span></p>
      ${barresVitamines(x.vitamines, true, dec ? null : x.vitamines_prevues, true)}</section>`}
  ${completer ? "" : aCompleter}`;
}
// « Sur la durée » (Taha, 22/11/2026 : « voir les vitamines qui me manquent toujours, sans que ce soit trop sur les yeux ») :
// les 7 ou 30 derniers jours finis où tu as marqué des plats mangés ; pour chaque vitamine, la moyenne et le nombre de
// jours sous 80 % du besoin, les plus en manque en premier.
function vueVitaminesDuree(n, a, V, decaler) {
  const dates = Array.from({ length: n }, (_, i) => decaler(a.aujourdhui, -1 - i)).filter(d => ((a.par_jour || {})[d] || {}).jours_suivis > 0);
  const periodes = "";
  if (!dates.length) return periodes + vide("Pas encore de journée finie", "Marque tes plats « mangé » : demain, cette page te dira ce qui te manque souvent.", "#/semaine", "Aller au jour");
  const codes = Object.keys(V.noms).filter(c => V.besoins[c]);
  const ligne = c => { const p = dates.map(d => 100 * ((a.par_jour[d].vitamines || {})[c] || 0) / V.besoins[c]);
    return { c, moy: Math.round(p.reduce((x, y) => x + y, 0) / p.length), bas: p.filter(x => x < 80).length }; };
  const lignes = codes.map(ligne).sort((x, y) => x.moy - y.moy);
  const souvent = lignes.filter(l => l.bas >= Math.max(1, Math.ceil(dates.length * 0.6)));
  const court = c => V.noms[c].nom.replace(/^Vitamine /, "");
  return `${periodes}
  <section class="bloc vit-jour" aria-labelledby="tDuree">
    <p class="vit-resume" id="tDuree">${souvent.length ? `Te manquent souvent : <b class="bas">${souvent.map(l => esc(court(l.c))).join(", ")}</b>` : "<b>Rien ne te manque souvent.</b>"}</p>
    <p class="petit discret legende-prevu"><span>Moyenne par jour sur les ${n} derniers jours (${dates.length > 1 ? `${dates.length} jours` : `${dates.length} jour`} avec des plats mangés)</span></p>
    <ul class="barres compactes">${lignes.map(l => `<li class="${l.moy < 80 ? "bas" : ""}"${ROLE_VITAMINE[l.c] ? ` title="${esc(ROLE_VITAMINE[l.c])}"` : ""}><span>${esc(V.noms[l.c].nom)}</span>
      <span class="v"><b class="chiffres">${nombre(l.moy)} %</b>${l.bas ? ` · bas ${l.bas} j sur ${dates.length}` : ""}</span>
      <span class="piste" role="img" aria-label="${nombre(l.moy)} % du besoin en moyenne"><i style="width:${Math.min(100, l.moy)}%"></i></span></li>`).join("")}</ul>
  </section>`;
}
function vueVitamines({ params } = {}) {
  if (enSuivi()) { barre(""); return vueVitaminesMangees(params || new URLSearchParams()); }
  barre("");
  const s = E.semaine, v = s && s.vitamines, V = E.vitamines;
  const tete = `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}
  <div class="titre"><h1 tabindex="-1">Vitamines</h1>
    <p>Ce que t'apporte la semaine, en moyenne par jour, comparé à tes besoins.</p></div>`;
  if (!v || !Object.keys(v).length) return tete + vide("Pas encore de semaine", "Compose ta semaine pour voir ce qu'elle t'apporte.", "#/semaine", "Aller à la semaine");
  const codes = Object.keys(V.noms).filter(c => v[c]);
  const couvertes = codes.filter(c => v[c].pct >= 100).length, basses = codes.filter(c => v[c].pct < 80);
  const sources = c => E.recettes.filter(r => s.choix[r.id] && r.vitamines[c] > 0)
    .sort((a, b) => b.vitamines[c] * s.choix[b.id].portions - a.vitamines[c] * s.choix[a.id].portions).slice(0, 2).map(r => r.nom);
  return `${tete}
  <dl class="kpis">
    <div><dt>Besoins couverts</dt><dd>${couvertes} sur ${codes.length}</dd><p>Vitamines à 100 % ou plus de ton besoin.</p></div>
    <div><dt>À surveiller</dt><dd>${basses.length ? basses.join(", ") : "Aucune"}</dd><p>Vitamines sous 80 % du besoin.</p></div>
  </dl>
  <section class="bloc" aria-labelledby="tApports"><h2 id="tApports">Apport moyen par jour</h2>
    ${barresVitamines(Object.fromEntries(codes.map(c => [c, v[c].apport])), true)}</section>
  <section class="bloc" aria-labelledby="tSources"><details class="nu"><summary><h2 id="tSources">D'où elles viennent cette semaine</h2>${icone("caret-right")}</summary>
    <ul class="lignes" style="margin-top:10px">${codes.map(c => `<li><span>${esc(V.noms[c].nom)}<small>${esc(sources(c).join(", ") || "Aucune source cette semaine")}</small></span>
      <span class="q">${dose(V.besoins[c])} ${V.noms[c].unite}</span></li>`).join("")}</ul>
    <p class="petit discret" style="margin-top:8px">À droite, ton besoin par jour.</p></details></section>`;
}
function vueProfil() {
  barre("");
  if (enSuivi()) return vueProfilFlemmard();
  const p = E.profil, i = p.identite || {}, ph = E.phase, V = E.vitamines;
  const l = (a, b) => `<li><span>${a}</span><span class="q">${b}</span></li>`;
  return `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}
  <div class="titre"><h1 tabindex="-1">Mon profil</h1><p>${esc(p.programme || "")}</p></div>
  <section aria-labelledby="tQui"><h2 id="tQui" style="margin-bottom:8px">${esc(p.nom)}</h2>
    <ul class="lignes">${i.nom_famille ? l("Nom", esc(`${i.nom || p.nom} ${i.nom_famille}`)) : ""}${l("Identifiant de connexion", esc(p.id))}
      ${i.date_naissance ? l("Date de naissance", `${esc(dateLongueCourte(i.date_naissance).replace(/^[a-zé]+ /i, ""))} (${i.age} ans)`) : i.age ? l("Âge", `${i.age} ans`) : ""}
      ${i.sexe ? l("Sexe", esc(i.sexe)) : ""}${i.pays ? l("Pays", `${drapeau(i.pays)} ${esc(paysDe(i.pays)[2])}`) : ""}${i.telephone ? l("Téléphone", esc(i.telephone)) : ""}
      ${i.taille_cm ? l("Taille", `${i.taille_cm} cm`) : ""}${i.poids_kg ? l("Poids", `${nombre(i.poids_kg, 1).replace(",0", "")} kg`) : ""}</ul>
    <p class="petit discret" style="margin-top:8px"><a href="#/reglages">Modifier mes informations</a> (l'identifiant ne change pas).</p></section>
  <section class="bloc" aria-labelledby="tBesoins"><h2 id="tBesoins" style="margin-bottom:8px">Mes besoins par jour</h2>
    <ul class="lignes">${l("Calories", `${nombre(ph.kcal + (E.reglages.ajustement || 0))} kcal`)}${l("Protéines", `${ph.prot} g`)}${E.eau ? l("Eau", `${virgule(E.eau.litres)} L`) : ""}
      ${Object.keys(V.noms).map(c => l(esc(V.noms[c].nom), `${dose(V.besoins[c])} ${V.noms[c].unite}`)).join("")}</ul>
    <p class="petit discret" style="margin-top:8px">Phase ${ph.n}, ${esc(ph.nom).toLowerCase()}. Ces repères ne remplacent pas un avis médical.</p></section>
  ${enSuivi() ? "" : `<section class="bloc" aria-labelledby="tCourses"><h2 id="tCourses" style="margin-bottom:8px">Mes courses</h2>
    <ul class="lignes">${l("Budget", `${euros(E.reglages.budget_mois)} par mois`)}${l("Enseigne", esc(E.magasin.principale))}${l("Navigateur", p.chrome ? "Mon propre Chrome" : "Le Chrome de l'appli")}</ul>
    <p class="petit discret" style="margin-top:8px">Ta fiche complète est dans le fichier PROFIL.md de ton dossier de profil.</p></section>`}`;
}
function vueProfilFlemmard() {
  const p = E.profil, i = p.identite || {}, ph = E.phase, kcal = ph.kcal + (E.reglages.ajustement || 0);
  const l = (a, b) => `<li><span>${a}</span><span class="q">${b}</span></li>`;
  const lien = (href, nomIcone, titre, sous) => `<li><a href="${href}">${icone(nomIcone)}<span>${titre}${sous ? `<small>${sous}</small>` : ""}</span>${icone("caret-right")}</a></li>`;
  return `<div class="m-tete"><div><h1 tabindex="-1">${esc(p.nom)}${i.nom_famille ? ` ${esc(i.nom_famille)}` : ""}</h1>
      <p class="petit discret">Identifiant : ${esc(p.id)}</p></div></div>
  <div class="suivi-chiffres">
    <div class="fait"><b>${nombre(kcal)}</b><span>kcal par jour</span></div>
    <div class="fait"><b>${ph.prot}<small> g</small></b><span>protéines</span></div>
    ${E.eau ? `<div class="fait"><b>${virgule(E.eau.litres)}<small> L</small></b><span>d'eau</span></div>` : ""}
  </div>
  <p class="petit discret" style="margin:-4px 0 16px">Phase ${ph.n}, ${esc(ph.nom).toLowerCase()}. Ces repères ne remplacent pas un avis médical.</p>
  ${autreAvecTelephone() ? "" : `<section class="bloc" aria-labelledby="tQui"><h2 id="tQui" style="margin-bottom:8px">Mes informations</h2>
    <ul class="lignes">${i.date_naissance ? l("Date de naissance", `${esc(dateLongueCourte(i.date_naissance).replace(/^[a-zé]+ /i, ""))} (${i.age} ans)`) : i.age ? l("Âge", `${i.age} ans`) : ""}
      ${i.sexe ? l("Sexe", esc(i.sexe)) : ""}${i.pays ? l("Pays", `${drapeau(i.pays)} ${esc(paysDe(i.pays)[2])}`) : ""}${i.telephone ? l("Téléphone", esc(i.telephone)) : ""}
      ${i.taille_cm ? l("Taille", `${i.taille_cm} cm`) : ""}${i.poids_kg ? l("Poids", `${nombre(i.poids_kg, 1).replace(",0", "")} kg`) : ""}</ul></section>`}
  <ul class="menu" style="margin-top:16px">
    ${lien("#/reglages", "sliders-horizontal", "Réglages", "")}
    ${typeof sb !== "undefined" ? lien("#/famille", "users", "Ma famille", demandesFamille().length ? `${demandesFamille().length > 1 ? `${demandesFamille().length} demandes` : `${demandesFamille().length} demande`} pour entrer` : enFamille() ? esc(M.famille.famille.nom) : (M.familleEtat && M.familleEtat.statut === "attente") ? "Demande en attente" : "Stock et plats en commun") : ""}
    ${estAdminConso() ? lien("#/conso", "chart-bar", "Suivi de conso", "Ce que chaque compte consomme en IA") : ""}
    ${E.utilisateur.admin ? lien("#/profils", "users", "Profils", "") : ""}
  </ul>
  ${lienAndroid()}
  <p style="margin-top:18px"><button class="bouton sobre" data-action="deconnexion">${icone("sign-out")}Se déconnecter</button></p>
  ${typeof VERSION === "string" ? `<p class="petit discret" style="margin-top:6px;font-size:.7rem;opacity:.6">Version ${esc(VERSION.replace(/^(\d{4})-(\d\d)-(\d\d)-(\d\d)(\d\d)\d\d$/, "du $3/$2 à $4:$5"))} · écran ${innerHeight}/${screen.height}, trou ${getComputedStyle(document.documentElement).getPropertyValue("--trou-bas").trim() || "0px"}</p>` : ""}`;
}
// « Suivi de conso » (Taha, 23/11/2026 : « voir la consommation de chaque user, pour juger la facturation ») :
// chaque appel à l'IA est noté par la fonction en ligne (Claude : tokens envoyés et reçus, sa clé ou celle de l'appli ;
// Gemini : une image). Réservé à l'admin, ici et côté serveur. Les tokens ne sont comptés que depuis le 23/11/2026.
let CONSO = null, CONSO_P = "mois";
function vueConso() {
  barre("");
  if (!estAdminConso()) return vueIntrouvable();
  const tete = `<a class="retour" href="#/profil">${icone("caret-left")}Profil</a>
    <div class="m-tete"><div><h1 tabindex="-1">Suivi de conso</h1><p class="petit discret">Les appels à l'IA de chaque compte de l'appli.</p></div></div>`;
  if (!CONSO || CONSO.vieux) {
    const etait = CONSO;
    CONSO = { charge: true };
    sb.functions.invoke("claude", { body: { action: "conso" } }).then(({ data, error }) => {
      CONSO = data && data.lignes ? { ...data, recu: Date.now() } : { erreur: (data && data.erreur) || (error && error.message) || "lecture impossible" };
      if (route().vue === "conso") rendre();
    }).catch(e => { CONSO = { erreur: e.message }; if (route().vue === "conso") rendre(); });
    if (!etait || etait.erreur) return tete + `<p class="petit discret">Chargement…</p>`;
    CONSO = { ...etait, charge: true, vieux: false };
  }
  if (CONSO.charge && !CONSO.lignes) return tete + `<p class="petit discret">Chargement…</p>`;
  if (CONSO.erreur) return tete + `<p class="erreur" role="alert">${esc(CONSO.erreur)}</p>`;
  const P = { jour: ["Aujourd'hui", 1], semaine: ["7 jours", 7], mois: ["30 jours", 30], tout: ["Tout", 0] };
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const depuis = P[CONSO_P][1] ? auj.getTime() - (P[CONSO_P][1] - 1) * 864e5 : 0;
  const noms = Object.fromEntries((CONSO.profils || []).map(p => [p.id, p.identifiant]));
  const vide = () => ({ claude: 0, perso: 0, partagee: 0, entree: 0, sortie: 0, sans: 0, images: 0, img_e: 0, img_s: 0, web: 0, modeles: new Set() });
  const par = new Map(), total = vide();
  for (const l of CONSO.lignes) {
    if (new Date(l.quand).getTime() < depuis) continue;
    const qui = noms[l.user_id] || "compte supprimé";
    if (!par.has(qui)) par.set(qui, vide());
    for (const x of [par.get(qui), total]) {
      if (l.action === "messages") {
        x.claude++;
        if (l.cle === "perso" || l.cle === "partagee") x[l.cle]++;
        if (l.tokens_entree == null) x.sans++; else { x.entree += l.tokens_entree; x.sortie += l.tokens_sortie || 0; }
        if (l.modele) x.modeles.add(l.modele.replace(/^claude-/, ""));
      } else if (l.action === "image") { x.images++; x.img_e += l.tokens_entree || 0; x.img_s += l.tokens_sortie || 0; }
      else if (l.action === "web") x.web++;
    }
  }
  const k = n => n >= 1e6 ? `${virgule(Math.round(n / 1e5) / 10)} M` : n >= 1e4 ? `${nombre(Math.round(n / 1e3))} k` : nombre(n);
  const bloc = (titre, x, sous = "") => `<section class="bloc conso-bloc"><h2>${esc(titre)}${sous ? `<small>${sous}</small>` : ""}</h2>
    <ul class="lignes">
      <li><span>Claude<small>${x.claude > 1 ? `${x.claude} appels` : `${x.claude} appel`}${x.perso || x.partagee ? ` · ${x.partagee} sur la clé de l'appli, ${x.perso} sur sa clé` : ""}${x.modeles.size ? ` · ${esc([...x.modeles].join(", "))}` : ""}</small></span>
        <span class="q chiffres">${k(x.entree)} → ${k(x.sortie)}</span></li>
      <li><span>Photos Gemini<small>${x.images > 1 ? `${x.images} images` : `${x.images} image`}</small></span><span class="q chiffres">${x.images ? `${k(x.img_e)} → ${k(x.img_s)}` : "—"}</span></li>
      <li><span>Pages lues<small>étiquettes, photos libres (pas d'IA)</small></span><span class="q chiffres">${x.web}</span></li>
    </ul>${x.sans ? `<p class="petit discret">${x.sans > 1 ? `${x.sans} appels` : `${x.sans} appel`} Claude d'avant le 23/11 : tokens non comptés.</p>` : ""}</section>`;
  const comptes = [...par.entries()].sort((a, b) => (b[1].entree + b[1].sortie + b[1].img_s) - (a[1].entree + a[1].sortie + a[1].img_s) || b[1].claude - a[1].claude);
  apresRendu.push(() => document.querySelectorAll("[data-conso-p]").forEach(b => b.addEventListener("click", () => { CONSO_P = b.dataset.consoP; rendre(); })));
  apresRendu.push(() => $("consoMaj") && $("consoMaj").addEventListener("click", () => { CONSO.vieux = true; rendre(); }));
  return tete + `<nav class="jours" aria-label="Période">${Object.entries(P).map(([c, [t]]) =>
      `<button type="button" data-conso-p="${c}"${c === CONSO_P ? ' aria-current="true"' : ""}>${t}</button>`).join("")}</nav>
    <p class="petit discret" style="margin:4px 0 12px">Tokens envoyés → reçus. ${CONSO.charge ? "Mise à jour…" : `<button type="button" class="lien" id="consoMaj">Actualiser</button>`}</p>
    ${bloc("Tous les comptes", total)}
    ${comptes.length ? comptes.map(([qui, x]) => bloc(qui, x)).join("") : `<p class="petit discret">Aucun appel sur cette période.</p>`}`;
}
// « Ma famille » (Taha, 23/11/2026) : un stock commun et les mêmes plats pour tous, chacun à ses quantités. On rejoint
// une famille avec son code ; le créateur accepte. Seul le créateur compose les menus ; les autres les reçoivent.
async function famille(action, args = {}, message = "") {
  const { data, error } = await sb.rpc(action, args);
  if (error) { dire(error.message.replace(/^.*?:\s*/, "")); return null; }
  const avant = enFamille();
  M.familleEtat = data;
  if (message) dire(message);
  // Une notification sur le téléphone de l'autre (Taha, 27/11/2026) : la demande au créateur, l'accord au nouveau membre.
  if (typeof notifier === "function") {
    if (action === "famille_rejoindre" && data && data.statut === "attente") notifier("demande");
    if (action === "famille_repondre" && args.p_accepter) notifier("accepte", { membre: args.p_user });
  }
  // Entrer dans une famille ou en sortir change le stock et la composition : le moteur repart avec.
  if (avant !== (data && data.statut === "membre")) { await relancerMoteur(); return data; }
  M.famille = data && data.statut === "membre" ? data : null;
  rendre();
  return data;
}
// Les notifications sur ce téléphone (Taha, 27/11/2026) : un bouton pour les activer, rempli après le rendu.
// Activer / couper les notifications sur ce téléphone : la même zone dans Ma famille et dans Réglages → Rappels.
function zoneNotifications(id) {
  apresRendu.push(async function maj() {
    const z = $(id);
    if (!z || typeof notificationsActives !== "function") return;
    const actif = await notificationsActives();
    z.innerHTML = actif ? `<span class="fam-notif-ok">${icone("check")}Actives sur ce téléphone</span><button type="button" class="lien" id="${id}Couper">Couper</button>`
      : `<button type="button" class="bouton second" id="${id}On">${icone("bell")}Activer sur ce téléphone</button>`;
    const b = $(id + "On"), c = $(id + "Couper");
    if (b) b.addEventListener("click", async () => {
      b.disabled = true;
      try { await activerNotifications(); dire("Notifications activées sur ce téléphone."); } catch (e) { dire(e.message || "Notifications impossibles."); }
      maj();
    });
    if (c) c.addEventListener("click", async () => { await couperNotifications(); dire("Notifications coupées."); maj(); });
  });
  return `<div id="${id}" class="fam-notif"></div>`;
}
function blocNotifications(texte) {
  return `<section class="bloc fam-bloc"><h2>Notifications</h2><p class="petit discret">${texte}</p>${zoneNotifications("famNotif")}</section>`;
}
// Rappels sur le téléphone (Taha, 28/11/2026) : cochés ici (table « rappels », avec le fuseau du téléphone), envoyés en
// ligne à leur heure par la fonction notifier (pg_cron, chaque heure), seulement s'ils servent encore.
const RAPPELS = [["pesee", "Pèse-toi", "À 8 h, si tu ne t'es pas encore pesé aujourd'hui"], ["eau", "Bois de l'eau", "À 16 h, si ton eau n'est pas cochée"],
                 ["diner", "Note ton dîner", "À 21 h, s'il n'est pas coché"], ["silhouette", "Ta silhouette au miroir", "Le lundi à 9 h"]];
function blocRappels() {
  if (typeof sb === "undefined" || typeof M === "undefined" || !M.moi || autreProfil()) return "";
  apresRendu.push(async () => {
    const z = $("rappelsChoix");
    if (!z) return;
    const { data } = await sb.from("rappels").select("types").eq("user_id", M.moi.uid).maybeSingle();
    const types = new Set((data && data.types) || []);
    z.innerHTML = RAPPELS.map(([t, titre, aide]) => `<label class="option"><input type="checkbox" data-rappel="${t}"${types.has(t) ? " checked" : ""}>
      <span><b>${titre}</b><small>${aide}</small></span></label>`).join("");
    z.querySelectorAll("[data-rappel]").forEach(i => i.addEventListener("change", async () => {
      const choisis = [...z.querySelectorAll("[data-rappel]:checked")].map(x => x.dataset.rappel);
      const fuseau = String(Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris").slice(0, 60);
      const { error } = await sb.from("rappels").upsert({ user_id: M.moi.uid, types: choisis, fuseau, maj: new Date().toISOString() });
      if (error) { i.checked = !i.checked; return dire("Pas enregistré, réessaie."); }
      const actives = typeof notificationsActives === "function" && await notificationsActives();
      dire(!choisis.length ? "Plus de rappels." : actives ? "Rappels enregistrés." : "Rappels enregistrés : active aussi les notifications sur ce téléphone.");
    }));
  });
  return `<section class="bloc" aria-labelledby="tRappels" data-resume="Pesée, eau, dîner, silhouette"><h2 id="tRappels">Rappels</h2>
    <p class="doux petit sous-titre">Une notification sur ton téléphone, seulement si c'est encore à faire.</p>
    ${zoneNotifications("rapNotif")}
    <div class="options rappels-choix" id="rappelsChoix"></div></section>`;
}
// Un membre sans téléphone (Taha, 27/11/2026) : son profil se crée ici, s'ouvre depuis le téléphone des autres.
// Une date à N années d'aujourd'hui (bornes des dates de naissance : 15 à 95 ans).
const isoPlusAns = n => { const d = new Date(); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10); };
function formulaireMembre() {
  const d = $("dialogue"), i = E.profil.identite || {};
  const choix = (id, options) => `<select id="${id}"><option value="" selected disabled>Choisis…</option>${options.map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select>`;
  d.innerHTML = `<form class="feuille formulaire" novalidate id="fMembre">
    <h2 id="dialogueTitre">Un membre sans téléphone</h2>
    <p class="petit discret">Un enfant, un parent… Son profil s'ouvre depuis le téléphone des autres membres ; il reçoit les menus de la famille, à ses quantités.</p>
    <div class="champs2"><div class="champ"><label for="mbPrenom">Prénom</label><input id="mbPrenom" maxlength="40" autocomplete="off"></div>
      <div class="champ"><label for="mbNom">Nom</label><input id="mbNom" maxlength="60" autocomplete="off" value="${esc(i.nom_famille || "")}"></div></div>
    <div class="champs2"><div class="champ"><label for="mbNaissance">Date de naissance</label><input id="mbNaissance" type="date" min="${isoPlusAns(-95)}" max="${isoPlusAns(-15)}"></div>
      <div class="champ"><label for="mbSexe">Sexe</label>${choix("mbSexe", [["femme", "Femme"], ["homme", "Homme"]])}</div></div>
    <div class="champs2"><div class="champ"><label for="mbTaille">Taille, en cm</label><input id="mbTaille" inputmode="numeric" maxlength="3"></div>
      <div class="champ"><label for="mbPoids">Poids, en kg</label><input id="mbPoids" inputmode="decimal" maxlength="5"></div></div>
    <div class="champs2"><div class="champ"><label for="mbActivite">Activité</label>${choix("mbActivite", [["sedentaire", "Sédentaire"], ["leger", "Un peu actif"], ["modere", "Actif"], ["actif", "Très actif"], ["intense", "Sport intense"]])}</div>
      <div class="champ"><label for="mbObjectif">Objectif</label>${choix("mbObjectif", [["perte", "Perdre du poids"], ["maintien", "Garder son poids"], ["prise", "Prendre du muscle"]])}</div></div>
    <div class="champ"><label for="mbIdent">Identifiant</label><input id="mbIdent" maxlength="20" autocapitalize="none" autocomplete="off" spellcheck="false">
      <small>Sert seulement à le reconnaître : il ne se connecte pas.</small></div>
    <small id="eMb" class="erreur" role="alert" style="display:block;color:var(--critique)"></small>
    <div class="actions pied"><button class="bouton second" type="button" value="non">Annuler</button><button class="bouton" type="submit">Créer son profil</button></div></form>`;
  let identTouche = false;
  $("mbIdent").addEventListener("input", () => { identTouche = true; });
  $("mbPrenom").addEventListener("input", () => {
    if (!identTouche) $("mbIdent").value = sansAcc($("mbPrenom").value).replace(/[^a-z0-9]+/g, "").slice(0, 14) + "-" + (M.moi.ident || "").slice(0, 5);
  });
  d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
  d.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const v = id => $(id).value.trim(), erreur = m => { $("eMb").textContent = m; };
    if (!v("mbPrenom") || !v("mbNom")) return erreur("Prénom et nom, s'il te plaît.");
    if (!v("mbNaissance")) return erreur("Sa date de naissance, pour ses besoins en calories.");
    if (!(Number(v("mbTaille")) > 50) || !(Number(v("mbPoids").replace(",", ".")) > 15)) return erreur("Sa taille (cm) et son poids (kg).");
    if (!v("mbSexe") || !v("mbActivite") || !v("mbObjectif")) return erreur("Son sexe, son activité et son objectif : choisis-les.");
    const b = d.querySelector("[type=submit]");
    b.disabled = true; b.textContent = "Création…"; erreur("");
    try {
      await ajouterMembreSansTelephone({ prenom: v("mbPrenom"), nom_famille: v("mbNom"), date_naissance: v("mbNaissance"), sexe: v("mbSexe"),
        taille_cm: v("mbTaille"), poids_kg: v("mbPoids").replace(",", "."), activite: v("mbActivite"), objectif: v("mbObjectif"),
        identifiant: v("mbIdent").toLowerCase(), pays: i.pays || paysProbable() });
      d.close("oui"); rendre(); dire(`Profil de ${v("mbPrenom")} créé : il est dans la famille.`);
    } catch (e) { erreur(e.message || "Création impossible."); b.disabled = false; b.textContent = "Créer son profil"; }
  });
  if (!d.open) d.showModal();
}
function vueFamille() {
  barre("");
  if (typeof sb === "undefined") return vueIntrouvable();
  const f = M.familleEtat, tete = `<a class="retour" href="#/profil">${icone("caret-left")}Profil</a>
    <div class="m-tete"><div><h1 tabindex="-1">Ma famille</h1><p class="petit discret">Un stock commun, les mêmes plats pour tous, chacun à ses quantités. Chacun peut ouvrir le profil des autres.</p></div></div>`;
  apresRendu.push(() => {
    const on = (id, fn) => { const b = $(id); if (b) b.addEventListener("click", fn); };
    on("famCreer", () => sb.from("fichiers").select("nom, contenu").eq("user_id", (M.moi || M).uid).in("nom", ["stock.csv", "mouvements.csv"]).then(({ data }) => {
      const c = n => ((data || []).find(x => x.nom === n) || {}).contenu || "";
      famille("famille_creer", { p_nom: $("famNom").value.trim(), p_stock: c("stock.csv"), p_mouvements: c("mouvements.csv") }, "Famille créée.");
    }));
    on("famRejoindre", () => { const c = $("famCode").value.trim(); if (!c) return $("famCode").focus();
      famille("famille_rejoindre", { p_code: c }, "Demande envoyée : le créateur doit l'accepter."); });
    document.querySelectorAll("[data-fam-repondre]").forEach(b => b.addEventListener("click", () =>
      famille("famille_repondre", { p_user: b.dataset.famRepondre, p_accepter: b.dataset.oui === "1" }, b.dataset.oui === "1" ? "Accepté dans la famille." : "Demande refusée.")));
    on("famCopier", () => navigator.clipboard && navigator.clipboard.writeText(f.famille.code).then(() => dire("Code copié.")));
    on("famAjouter", formulaireMembre);
    document.querySelectorAll("[data-fam-retirer]").forEach(b => b.addEventListener("click", async () => {
      const m = (f.membres || []).find(x => x.id === b.dataset.famRetirer);
      if (!m || !await confirmer({ titre: `Retirer ${nomMembre(m)} ?`, oui: "Retirer", non: "Garder",
        texte: "Son profil, ses menus et ses repas sont effacés pour de bon." })) return;
      try { await retirerMembreSansTelephone(m.id); dire(`${nomMembre(m)} est retiré de la famille.`); rendre(); }
      catch (e) { dire(e.message || "Impossible de le retirer."); }
    }));
    on("famQuitter", async () => {
      const chef = f.famille && f.famille.createur && f.statut === "membre";
      if (await confirmer({ titre: f.statut === "attente" ? "Annuler la demande ?" : chef ? "Dissoudre la famille ?" : "Quitter la famille ?",
        oui: f.statut === "attente" ? "Annuler la demande" : chef ? "Dissoudre" : "Quitter", non: "Rester",
        texte: f.statut === "attente" ? "Ta demande sera retirée." : chef ? "Chacun retrouve son propre stock et compose de nouveau ses menus." : "Tu retrouves ton propre stock et tu composes de nouveau tes menus." }))
        famille("famille_quitter", {}, f.statut === "attente" ? "Demande annulée." : "C'est fait.");
    });
  });
  if (!f || !f.famille) return tete + `
    <section class="bloc fam-bloc"><h2>Créer une famille</h2><p class="petit discret">Ton stock devient celui de la famille. Tu composes les menus, les autres les reçoivent à leurs quantités.</p>
      <div class="fam-ligne"><input id="famNom" type="text" maxlength="40" placeholder="Nom de la famille" aria-label="Nom de la famille" autocomplete="off">
      <button type="button" class="bouton" id="famCreer">Créer</button></div></section>
    <section class="bloc fam-bloc"><h2>Rejoindre une famille</h2><p class="petit discret">Tape le code que le créateur voit sur sa page « Ma famille ». Il devra accepter ta demande.</p>
      <div class="fam-ligne"><input id="famCode" type="text" maxlength="12" placeholder="FAM-XXXX" aria-label="Code de la famille" autocapitalize="characters" autocomplete="off" spellcheck="false">
      <button type="button" class="bouton second" id="famRejoindre">Rejoindre</button></div></section>`;
  if (f.statut === "attente") return tete + `<section class="bloc fam-bloc"><h2>Demande envoyée</h2>
    <p class="petit discret">Ta demande pour rejoindre « ${esc(f.famille.nom)} » attend l'accord de ${esc(f.famille.createur_ident || "son créateur")}.</p>
    <button type="button" class="bouton sobre" id="famQuitter">${icone("x")}Annuler la demande</button></section>
    ${blocNotifications("Pour savoir dès que ta demande est acceptée, même appli fermée.")}`;
  const membres = (f.membres || []).filter(m => m.statut === "membre"), attente = (f.membres || []).filter(m => m.statut === "attente");
  const ligneMembre = m => `<li class="fam-membre"><i class="av" aria-hidden="true">${esc(nomMembre(m).charAt(0))}</i>
      <span class="fam-nom"><b>${esc(nomMembre(m))}${m.moi ? " (toi)" : ""}</b><small>${m.createur ? "compose les menus" : "reçoit les menus"}${m.sans_telephone ? " · sans téléphone" : ""}</small></span>
      ${m.id === M.uid ? `<span class="q">affiché</span>` : `<button type="button" class="bouton sobre" data-fam-profil="${m.id}">Ouvrir</button>`}
      ${m.sans_telephone ? `<button type="button" class="effacer" data-fam-retirer="${m.id}" aria-label="Retirer ${esc(nomMembre(m))}">${icone("x")}</button>` : ""}</li>`;
  return tete + `
    <section class="bloc fam-bloc"><h2>${esc(f.famille.nom)}</h2>
      <div class="fam-code"><span>Code pour rejoindre</span><b class="chiffres">${esc(f.famille.code || "")}</b><button type="button" class="bouton sobre" id="famCopier">${icone("copy")}Copier</button></div>
      <ul class="lignes fam-membres">${membres.map(ligneMembre).join("")}</ul>
      <p style="margin:10px 0 0"><button type="button" class="lien" id="famAjouter">+ Ajouter un membre sans téléphone</button></p></section>
    ${attente.length ? `<section class="bloc fam-bloc"><h2>Demandes</h2><ul class="lignes">${attente.map(m => `<li><span>${esc(m.identifiant)}</span>
      <span class="fam-choix"><button type="button" class="bouton sobre" data-fam-repondre="${m.id}" data-oui="0">Refuser</button>
      <button type="button" class="bouton" data-fam-repondre="${m.id}" data-oui="1">Accepter</button></span></li>`).join("")}</ul></section>` : ""}
    ${blocNotifications(f.famille.createur ? "Quand quelqu'un demande à entrer, ou change un plat pour toute la famille." : "Quand quelqu'un change un plat pour toute la famille.")}
    <section class="bloc fam-bloc"><h2>Comment ça marche</h2><ul class="fam-regles petit discret">
      <li>Le stock est le même pour tous : ce que chacun mange en sort.</li>
      <li>${f.famille.createur ? "Tu composes les menus" : `${esc(f.famille.createur_ident || "Le créateur")} compose les menus`} ; chacun reçoit les mêmes plats, à ses calories.</li>
      <li>Sur l'écran du jour, « Tous » montre la dose de chacun, plat par plat ; un prénom ouvre son profil.</li>
      <li>Quand tu changes, ajoutes ou retires un plat, l'appli te demande si c'est pour toi seul ou pour toute la famille.</li>
      <li>Le suivi (poids, mesures, silhouette) reste privé.</li></ul></section>
    <p><button type="button" class="bouton sobre" id="famQuitter">${icone("sign-out")}${f.famille.createur ? "Dissoudre la famille" : "Quitter la famille"}</button></p>`;
}
function vueProfils() {
  barre("");
  if (!E.utilisateur.admin) return vueIntrouvable();
  return `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}
  <div class="titre"><h1 tabindex="-1">Profils</h1><p>Chaque personne a ses objectifs, son stock, son historique et son propre Chrome pour ses paniers.</p></div>
  <ul class="lignes">${E.profils.map(p => `<li><span>${esc(p.nom)}<small>Identifiant ${esc(p.id)}</small></span>
    ${p.id === E.profil.id ? `<span class="q">Affiché</span>` : `<button class="bouton sobre" data-action="voir" data-profil="${esc(p.id)}">Voir</button>`}</li>`).join("")}</ul>
  <div class="bloc actions"><a class="bouton" href="#/nouveau">${icone("user-circle-plus")}Créer un profil</a></div>
  <section class="bloc" aria-labelledby="tInvit"><h2 id="tInvit">Laisser quelqu'un créer le sien</h2>
    <p style="margin-top:6px">Sur la page de connexion, la personne choisit « Créer mon profil » et saisit ce code d'invitation.</p>
    <p class="calcul chiffres" translate="no">${esc(E.invitation)}</p></section>`;
}
// Un mot de passe solide (Taha, 22/11/2026) : les mêmes règles que le serveur, et une jauge pendant qu'on tape.
const REGLE_MDP = "10 caractères au moins, avec une minuscule, une majuscule et un chiffre.";
const mdpValide = m => m.length >= 10 && /[a-z]/.test(m) && /[A-Z]/.test(m) && /\d/.test(m);
function forceMdp(m) {
  if (!m) return [0, ""];
  let p = (m.length >= 10) + (m.length >= 14) + (/[a-z]/.test(m) && /[A-Z]/.test(m)) + /\d/.test(m) + /[^A-Za-z0-9]/.test(m);
  if (/^(.)\1+$|0123|1234|azerty|qwerty|password|motdepasse/i.test(m)) p = Math.min(p, 1);
  if (!mdpValide(m)) p = Math.min(p, 2);
  return [p, ["Trop faible", "Trop faible", "Faible", "Correct", "Solide", "Très solide"][p]];
}
const champMdp = (id, nom, auto) => `<div class="mdp-saisie"><input id="${id}" name="${nom}" type="password" autocomplete="${auto}" minlength="10" required aria-describedby="${id}Force">
  <button type="button" class="mdp-voir" data-voir-mdp="${id}" aria-label="Afficher le mot de passe">${icone("eye")}</button></div>
  <span class="mdp-jauge" aria-hidden="true"><i id="${id}Jauge"></i></span><small id="${id}Force">${REGLE_MDP}</small>`;
document.addEventListener("input", ev => {
  const j = ev.target.id && document.getElementById(ev.target.id + "Jauge");
  if (!j) return;
  const [p, nom] = forceMdp(ev.target.value);
  j.style.width = `${p * 20}%`; j.dataset.niveau = p;
  $(ev.target.id + "Force").textContent = ev.target.value ? `${nom}${mdpValide(ev.target.value) ? "" : " · " + REGLE_MDP}` : REGLE_MDP;
});
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-voir-mdp]");
  if (!b) return;
  const i = $(b.dataset.voirMdp), voir = i.type === "password";
  i.type = voir ? "text" : "password"; b.setAttribute("aria-label", voir ? "Cacher le mot de passe" : "Afficher le mot de passe");
});
// Ce que la personne mange (Taha, 23/11/2026) : à la création du compte et dans Réglages. Des pastilles à cocher.
const ALLERGENES = ["Arachides", "Fruits à coque", "Œufs", "Poisson", "Crustacés", "Soja", "Sésame"];
// Le résumé de « Mon alimentation », replié comme les autres rubriques (Taha, 23/11/2026).
function resumeAlimentation(r, fodmap) {
  const g = E.regime || {}, evite = [g.lactose ? "lactose" : "", g.gluten ? "gluten" : "", g.vegetarien ? "viande" : ""].filter(Boolean);
  const n = evite.length + (g.allergies || []).length + autresListe(g.autres).length;
  return [r.meme_plat !== false ? "Même plat midi et soir" : "Deux plats", r.stock_seul ? "Stock" : "", fodmap ? "FODMAP" : "",
          n ? `${n} à éviter` : ""].filter(Boolean).join(" · ");
}
const autresListe = t => String(t || "").split(",").map(x => x.trim()).filter(Boolean);
function champsRegime(r = {}, enDirect = false) {
  const puce = (nom, valeur, texte, coche) => `<label class="puce-choix"><input type="checkbox" name="${nom}" value="${esc(valeur)}"${coche ? " checked" : ""}${enDirect ? " data-regime" : ""}><span>${texte}</span></label>`;
  return `<div class="regime">
    <p class="regime-titre">J'évite</p>
    <div class="puces-choix">${puce("reg", "lactose", "Le lactose", r.lactose)}${puce("reg", "gluten", "Le gluten", r.gluten)}${puce("reg", "vegetarien", "La viande et le poisson", r.vegetarien)}</div>
    <p class="regime-titre">Allergies</p>
    <div class="puces-choix">${ALLERGENES.map(a => puce("allergie", a, a, (r.allergies || []).includes(a))).join("")}</div>
    <p class="regime-titre">Autre chose à éviter</p>
    ${(() => {
      // Un aliment à la fois, avec + ; chacun devient une pastille qu'on retire (Taha, 23/11/2026).
      const liste = autresListe(r.autres);
      return `<input type="hidden" name="autres" value="${esc(liste.join(", "))}"${enDirect ? " data-regime" : ""}>
      <div class="puces-choix regime-autres">${liste.map(x => `<button type="button" class="regime-autre" data-retirer-autre="${esc(x)}" aria-label="Ne plus éviter ${esc(x)}">${esc(x)}${icone("x")}</button>`).join("")}</div>
      <div class="regime-ajout"><input type="text" maxlength="40" autocomplete="off" enterkeyhint="done" placeholder="Champignons, kiwi…" aria-label="Un aliment à éviter">
        <button type="button" class="regime-plus" aria-label="Ajouter cet aliment">${icone("plus")}</button></div>`; })()}
  </div>`;
}
// « Autre chose à éviter » : ajouter (+ ou Entrée) et retirer une pastille ; le champ caché garde la liste pour lireRegime.
function regimeAutres(racine, liste) {
  const cache = racine.querySelector('input[name="autres"]');
  cache.value = liste.join(", ");
  racine.querySelector(".regime-autres").innerHTML = liste.map(x => `<button type="button" class="regime-autre" data-retirer-autre="${esc(x)}" aria-label="Ne plus éviter ${esc(x)}">${esc(x)}${icone("x")}</button>`).join("");
  cache.dispatchEvent(new Event("change", { bubbles: true }));
}
function regimeAjouter(champ) {
  const racine = champ.closest(".regime"), v = champ.value.replace(/,/g, " ").trim().replace(/\s+/g, " ");
  if (!v) return;
  const liste = autresListe(racine.querySelector('input[name="autres"]').value);
  if (!liste.some(x => x.toLowerCase() === v.toLowerCase())) liste.push(v.charAt(0).toUpperCase() + v.slice(1));
  champ.value = "";
  regimeAutres(racine, liste);
  champ.focus();
}
document.addEventListener("click", ev => {
  const plus = ev.target.closest && ev.target.closest(".regime-plus");
  if (plus) return regimeAjouter(plus.parentElement.querySelector("input"));
  const x = ev.target.closest && ev.target.closest("[data-retirer-autre]");
  if (x) { const racine = x.closest(".regime"); regimeAutres(racine, autresListe(racine.querySelector('input[name="autres"]').value).filter(v => v !== x.dataset.retirerAutre)); }
});
document.addEventListener("keydown", ev => {
  if (ev.key === "Enter" && ev.target.closest && ev.target.closest(".regime-ajout")) { ev.preventDefault(); regimeAjouter(ev.target); }
});
function lireRegime(racine) {
  const coches = nom => [...racine.querySelectorAll(`input[name="${nom}"]:checked`)].map(i => i.value);
  const reg = coches("reg");
  return { lactose: reg.includes("lactose"), gluten: reg.includes("gluten"), vegetarien: reg.includes("vegetarien"),
           allergies: coches("allergie"), autres: (racine.querySelector('input[name="autres"]') || {}).value || "" };
}
// Pays et indicatif du téléphone, avec leur drapeau (Taha, 23/11/2026). Le pays proposé vient de la région du téléphone.
const PAYS = [["FR", 33, "France"], ["MA", 212, "Maroc"], ["DZ", 213, "Algérie"], ["TN", 216, "Tunisie"], ["BE", 32, "Belgique"],
  ["CH", 41, "Suisse"], ["LU", 352, "Luxembourg"], ["MC", 377, "Monaco"], ["CA", 1, "Canada"], ["US", 1, "États-Unis"],
  ["GB", 44, "Royaume-Uni"], ["IE", 353, "Irlande"], ["DE", 49, "Allemagne"], ["NL", 31, "Pays-Bas"], ["ES", 34, "Espagne"],
  ["PT", 351, "Portugal"], ["IT", 39, "Italie"], ["AT", 43, "Autriche"], ["SE", 46, "Suède"], ["NO", 47, "Norvège"],
  ["DK", 45, "Danemark"], ["FI", 358, "Finlande"], ["PL", 48, "Pologne"], ["RO", 40, "Roumanie"], ["GR", 30, "Grèce"],
  ["TR", 90, "Turquie"], ["EG", 20, "Égypte"], ["SA", 966, "Arabie saoudite"], ["AE", 971, "Émirats arabes unis"],
  ["QA", 974, "Qatar"], ["KW", 965, "Koweït"], ["LB", 961, "Liban"], ["JO", 962, "Jordanie"], ["SN", 221, "Sénégal"],
  ["CI", 225, "Côte d'Ivoire"], ["ML", 223, "Mali"], ["CM", 237, "Cameroun"], ["CD", 243, "RD Congo"], ["CG", 242, "Congo"],
  ["GA", 241, "Gabon"], ["BF", 226, "Burkina Faso"], ["GN", 224, "Guinée"], ["MR", 222, "Mauritanie"], ["MG", 261, "Madagascar"],
  ["NE", 227, "Niger"], ["TD", 235, "Tchad"], ["BJ", 229, "Bénin"], ["TG", 228, "Togo"], ["HT", 509, "Haïti"],
  ["RE", 262, "La Réunion"], ["GP", 590, "Guadeloupe"], ["MQ", 596, "Martinique"], ["GF", 594, "Guyane"],
  ["NC", 687, "Nouvelle-Calédonie"], ["PF", 689, "Polynésie française"], ["BR", 55, "Brésil"], ["MX", 52, "Mexique"],
  ["IN", 91, "Inde"], ["PK", 92, "Pakistan"], ["JP", 81, "Japon"], ["CN", 86, "Chine"], ["AU", 61, "Australie"]]
  .sort((a, b) => a[2].localeCompare(b[2], "fr"));
const drapeau = c => String.fromCodePoint(...[...String(c || "FR")].map(x => 0x1F1E6 + x.charCodeAt(0) - 65));
const paysDe = c => PAYS.find(p => p[0] === c) || PAYS.find(p => p[0] === "FR");
function paysProbable() {
  const FUSEAUX = { "Africa/Casablanca": "MA", "Africa/Algiers": "DZ", "Africa/Tunis": "TN", "Europe/Brussels": "BE", "Europe/Zurich": "CH",
    "Europe/Luxembourg": "LU", "Europe/Monaco": "MC", "America/Montreal": "CA", "America/Toronto": "CA", "Europe/London": "GB",
    "Europe/Berlin": "DE", "Europe/Madrid": "ES", "Europe/Lisbon": "PT", "Europe/Rome": "IT", "Europe/Amsterdam": "NL",
    "Africa/Dakar": "SN", "Africa/Abidjan": "CI", "Indian/Reunion": "RE", "America/Guadeloupe": "GP", "America/Martinique": "MQ" };
  try { const f = FUSEAUX[Intl.DateTimeFormat().resolvedOptions().timeZone]; if (f) return f; } catch (e) {}
  const r = (String(navigator.language || "").split("-")[1] || "").toUpperCase();
  return PAYS.some(p => p[0] === r) ? r : "FR";
}
const optionsPays = (choisi, avecIndicatif) => PAYS.map(([c, i, n]) => `<option value="${c}"${c === choisi ? " selected" : ""}>${drapeau(c)} ${n}${avecIndicatif ? ` +${i}` : ""}</option>`).join("");
// Le numéro : l'indicatif (drapeau + « +33 ») à gauche, choisi dans la liste des pays ; le numéro du pays à droite.
function champTel(id, nom, pays, valeur = "", plus = "") {
  const [c, i] = paysDe(pays);
  return `<div class="tel"><label class="tel-ind"><span aria-hidden="true">${drapeau(c)} +${i}</span>
      <select data-tel-ind aria-label="Indicatif du pays">${optionsPays(c, true)}</select></label>
    <input id="${id}" name="${nom}" type="tel" autocomplete="tel-national" inputmode="tel" maxlength="20" value="${esc(valeur)}" placeholder="6 12 34 56 78" ${plus}></div>`;
}
// « 06 12… » ou « 6 12… » + l'indicatif choisi → +33612… ; un numéro déjà international reste tel quel.
function telComplet(input) {
  const v = String(input.value || "").replace(/[\s.\-()]/g, ""), sel = input.closest(".tel").querySelector("[data-tel-ind]");
  if (!v) return "";
  if (/^\+/.test(v)) return v;
  if (/^00/.test(v)) return "+" + v.slice(2);
  return "+" + paysDe(sel.value)[1] + v.replace(/^0/, "");
}
// Un numéro +33612… → [pays, numéro sans l'indicatif] pour remplir le champ.
function telDecoupe(t, pays) {
  t = String(t || "");
  if (!t.startsWith("+")) return [pays, t];
  const p = [...PAYS].sort((a, b) => String(b[1]).length - String(a[1]).length).find(([c, i]) => t.startsWith("+" + i) && (c === pays || !PAYS.some(x => x[0] === pays && x[1] === i)));
  return p ? [p[0], t.slice(String(p[1]).length + 1)] : [pays, t];
}
function telRemplir(input, t) {
  const sel = input.closest(".tel").querySelector("[data-tel-ind]"), [c, n] = telDecoupe(t, sel.value);
  sel.value = c; sel.dispatchEvent(new Event("change", { bubbles: true })); input.value = n;
}
document.addEventListener("change", ev => {
  if (ev.target.matches && ev.target.matches("[data-tel-ind]")) {
    const [c, i] = paysDe(ev.target.value);
    ev.target.previousElementSibling.textContent = `${drapeau(c)} +${i}`;
  }
  // Choisir son pays règle aussi l'indicatif du téléphone.
  if (ev.target.matches && ev.target.matches("[data-pays]")) {
    const sel = ev.target.form && ev.target.form.querySelector("[data-tel-ind]");
    if (sel) { sel.value = ev.target.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  }
});
function formulaireProfil(avecCode) {
  const champ = (id, libelle, corps, aide = "") => `<div class="champ"><label for="${id}">${libelle}</label>${corps}${aide ? `<small>${aide}</small>` : ""}</div>`;
  const nombreChamp = (id, min, max, pas, exemple) => `<input id="${id}" name="${id}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${pas}" autocomplete="off" placeholder="${exemple}…" required>`;
  // rien de choisi d'office (Taha, 28/11/2026) : un homme pressé restait « Femme, Sédentaire, Perdre du poids »
  const choix = (id, options) => `<select id="${id}" name="${id}" required><option value="" selected disabled>Choisis…</option>${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>`;
  const coche = (id, titre, aide, defaut) => `<label class="option"><input type="checkbox" id="${id}" name="${id}"${defaut ? " checked" : ""}><span><b>${titre}</b><small>${aide}</small></span></label>`;
  const rubrique = t => avecCode ? `<p class="auth-rubrique">${t}</p>` : "";
  return `<form class="formulaire" id="fProfil" novalidate>
    ${rubrique("Ton compte")}
    ${avecCode ? champ("pCode", "Code d'invitation", `<input id="pCode" name="code" type="text" maxlength="40" autocomplete="off" spellcheck="false" autocapitalize="none" required>`, "Demande-le à la personne qui gère le site.") : ""}
    <div class="champs2">
    ${champ("pNom", "Prénom", `<input id="pNom" name="prenom" type="text" autocomplete="given-name" maxlength="40" required>`)}
    ${champ("pFamille", "Nom", `<input id="pFamille" name="nom_famille" type="text" autocomplete="family-name" maxlength="60" required>`)}
    </div>
    ${champ("pIdent", "Identifiant de connexion", `<input id="pIdent" name="identifiant" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required>`, "3 à 20 lettres minuscules, chiffres ou tirets. Il ne pourra plus changer.")}
    ${avecCode ? champ("pEmail", "Email", `<input id="pEmail" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="120" required>`, "Pour te connecter et retrouver ton mot de passe.") : ""}
    ${champ("pMdp", "Mot de passe", avecCode ? champMdp("pMdp", "mot_de_passe", "new-password") : `<input id="pMdp" name="mot_de_passe" type="password" autocomplete="new-password" minlength="10" required>`)}
    ${rubrique("Toi")}
    <div class="champs2">
    ${champ("date_naissance", "Date de naissance", `<input id="date_naissance" name="date_naissance" type="date" min="${isoPlusAns(-95)}" max="${isoPlusAns(-15)}" required>`)}
    ${champ("sexe", "Sexe", choix("sexe", [["femme", "Femme"], ["homme", "Homme"]]))}
    </div>
    ${(() => { const p = paysProbable(); return champ("pays", "Pays", `<select id="pays" name="pays" data-pays autocomplete="country">${optionsPays(p)}</select>`)
      + champ("telephone", "Téléphone", champTel("telephone", "telephone", p, "", "required")); })()}
    <div class="champs2 deux">
    ${champ("taille_cm", "Taille (cm)", nombreChamp("taille_cm", 130, 220, 1, "170"))}
    ${champ("poids_kg", "Poids (kg)", nombreChamp("poids_kg", 35, 250, 0.1, "70"))}
    </div>
    ${rubrique("Ton objectif")}
    ${champ("activite", "Activité", choix("activite", [["sedentaire", "Sédentaire, peu ou pas de sport"], ["leger", "Sport léger, 1 à 3 fois par semaine"], ["modere", "Sport modéré, 3 à 5 fois par semaine"], ["actif", "Sport intense, 6 à 7 fois par semaine"], ["intense", "Sport très intense ou métier physique"]]))}
    ${champ("objectif", "Objectif", choix("objectif", [["perte", "Perdre du poids"], ["maintien", "Garder mon poids"], ["prise", "Prendre du muscle"]]))}
    ${rubrique("Ce que tu manges")}
    ${champsRegime()}
    <div style="margin-bottom:18px"></div>
    <small id="eProfil" class="erreur" role="alert" style="display:block;margin-bottom:12px;color:var(--critique)"></small>
    <button class="bouton large" type="submit">Créer mon profil</button>
    <p class="petit discret" style="margin-top:14px">L'appli calcule tes calories, tes protéines et tes besoins en vitamines, puis compose tes deux premières semaines. Tout se change ensuite dans Réglages, sauf l'identifiant.</p>
  </form>`;
}
function vueNouveau() {
  barre("");
  if (!E.utilisateur.admin) return vueIntrouvable();
  return `<a class="retour" href="#/profils">${icone("caret-left")}Profils</a>
  <div class="titre"><h1 tabindex="-1">Nouveau profil</h1><p>La personne remplit ses informations, l'appli calcule le reste.</p></div>${formulaireProfil(false)}`;
}
function vueCreation() {
  clearTimeout(minuteur);
  rendreNavigation("");
  barre("");
  $("contenu").innerHTML = accueil(`<div class="auth-carte auth-large">
    <h1 tabindex="-1">Créer mon profil</h1><p class="auth-intro">Quelques informations, et l'appli calcule tes besoins et compose tes repas.</p>
    ${formulaireProfil(true)}</div>
    <p class="auth-bas">Déjà un compte ? <button type="button" class="lien" data-action="versConnexion">Me connecter</button></p>`);
  window.scrollTo(0, 0);
}
function lienDesMontants(c) {
  // Trois montants pour une meme semaine : on dit ce que chacun compte.
  const morceaux = [`Tu manges pour ${euros(c.repas)} cette semaine`];
  if (c.a_payer) morceaux.push(`il reste ${euros(c.a_payer.supermarche + c.a_payer.boucher)} à acheter, le reste est déjà en stock ou déjà payé`);
  const panier = (E.courses_mois && E.courses_mois.panier) || c.panier;
  if (panier && panier.total != null) morceaux.push(`le panier ${esc(E.magasin.principale)} de ${euros(panier.total)} est plus haut parce qu'il ${E.courses_mois ? `couvre ${E.nb_semaines} semaines et ` : ""}contient des paquets entiers`);
  return `<p class="calcul chiffres">${morceaux.join(" ; ")}.</p>`;
}
function vueBudget() {
  barre("");
  // En ligne, la page n'est ouverte qu'aux comptes qui en ont l'icône (Taha, 27/11/2026 : cachée du menu, mais l'adresse
  // #/budget l'ouvrait encore pour tout le monde).
  if (enSuivi() && typeof M !== "undefined" && M.moi && !BUDGET_POUR.includes(String(M.moi.ident || "").toLowerCase())) return vueIntrouvable();
  const b = E.budget, c = E.couts, s = E.semaine;
  const mois = new Intl.DateTimeFormat(LOCALE, { month: "long" }).format(new Date(b.mois + "-01"));
  const kpi = (libelle, valeur, aide) => `<div><dt>${libelle}</dt><dd>${valeur}</dd>${aide ? `<p>${aide}</p>` : ""}</div>`;
  const depasse = b.reste < 0;
  if (c) apresRendu.push(() => Graph.barres($("gBudget"), { unite: "€", decimales: 2, hauteur: 210, cible: Math.round(s.budget_semaine / 7 * 100) / 100, nomCible: "budget",
    titre: "Valeur des repas chaque jour, comparée au budget", donnees: c.jours.map((j, i) => ({ etiquette: court(j), valeur: j.cout, detail: j.jour })) }));

  let semaine = "";
  if (c) {
    const p = c.paye;
    let titre, montant, aide;
    if (c.paye_total != null) {
      titre = "Payé cette semaine"; montant = c.paye_total;
      aide = p.boucher != null ? `${euros(p.supermarche)} au supermarché, ${euros(p.boucher)} chez le boucher.`
        : `${euros(p.supermarche)} au supermarché, viande estimée à ${euros(p.boucher_estime || 0)}.`;
    } else if (p) {
      titre = "Payé cette semaine"; montant = null; aide = "Montant non renseigné.";
    } else if (c.panier) {
      titre = "Panier à payer"; montant = c.panier.total + c.a_payer.boucher;
      aide = `${euros(c.panier.total)} dans le panier, viande estimée à ${euros(c.a_payer.boucher)}.`;
    } else {
      titre = "À payer, estimation"; montant = c.a_payer.supermarche + c.a_payer.boucher;
      aide = "Compté au gramme. Le vrai total sera plus haut, on achète des paquets entiers.";
    }
    semaine = `<section class="bloc" aria-labelledby="tSemaine"><h2 id="tSemaine">Cette semaine</h2>
      <dl class="kpis">
        ${kpi(titre, montant == null ? "Inconnu" : euros(montant), aide)}
        ${kpi("Coût réel par jour", montant == null ? "Inconnu" : euros(montant / 7), "Ce que tu paies, divisé par 7 jours.")}
        ${kpi("Valeur des repas", euros(c.repas), "Ce que tu manges, au prix de chaque ingrédient.")}
        ${kpi("Valeur des repas par jour", euros(c.par_jour), `Pour ${euros(s.budget_semaine / 7)} prévus par jour.`)}
      </dl>
      ${lienDesMontants(c)}
      ${p ? `<p style="margin-top:14px"><button class="bouton second" data-action="corriger">${c.paye_total != null ? "Corriger les montants payés" : "Indiquer le montant payé"}</button></p>` : ""}
      <h3 style="margin:26px 0 10px">Valeur des repas, jour par jour</h3>
      <div id="gBudget"></div>
    </section>`;
  }

  return `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}
  <div class="titre"><h1 tabindex="-1">Budget et coûts</h1>
    <p>Ton budget couvre ce que tu manges dans le mois. Ce qui est déjà dans ton stock en fait partie, tu n'as donc pas à le racheter.</p></div>

  <section aria-labelledby="tMois"><h2 id="tMois">En ${mois}</h2>
    <dl class="kpis">
      ${kpi("Budget du mois", euros(b.budget), "Réglable dans les réglages.")}
      ${kpi("Stock au début du mois", euros(b.stock_debut), "Les courses qu'il te restait au 1er du mois.")}
      ${kpi("Payé ce mois-ci", euros(b.paye), `${b.commandes > 1 ? `${b.commandes} commandes payées` : `${b.commandes} commande payée`}, viande comprise.`)}
      ${kpi(depasse ? "Dépassement" : "Reste à dépenser", euros(Math.abs(b.reste)), depasse ? "Tu as dépassé ton budget du mois." : "Ce que tu peux encore acheter ce mois-ci.")}
    </dl>
    <p class="calcul chiffres">${euros(b.budget)} de budget, moins ${euros(b.stock_debut)} de stock au début du mois, moins ${euros(b.paye)} déjà payés : ${depasse ? `${euros(-b.reste)} de trop` : `il reste ${euros(b.reste)}`}.</p>
  </section>

  ${semaine}

  <section class="bloc" aria-labelledby="tStockB"><h2 id="tStockB">Ton stock</h2>
    <dl class="kpis">
      ${kpi("Valeur du stock aujourd'hui", euros(b.stock.valeur), `${b.stock.produits > 1 ? `${b.stock.produits} produits` : `${b.stock.produits} produit`}${b.stock.sans_prix ? `, dont ${b.stock.sans_prix} sans prix connu` : ""}.`)}
      ${kpi("Mangé ce mois-ci", euros(b.consomme), "La valeur des plats que tu as dit avoir cuisinés.")}
    </dl>
    <p class="petit discret" style="margin-top:14px">Ce qui restera en stock à la fin du mois sera compté dans le budget du mois suivant.</p>
  </section>

  <section class="bloc" aria-labelledby="tLire"><details class="nu"><summary><h2 id="tLire">Comment lire ces chiffres</h2>${icone("caret-right")}</summary>
    <ul class="definitions" style="margin-top:10px">
      <li><strong>Coût réel.</strong> L'argent qui sort : les paquets entiers au supermarché et la viande chez le boucher. Il est haut la semaine où tu remplis les placards, bas ensuite.</li>
      <li><strong>Valeur des repas.</strong> Le prix de ce que tu manges vraiment, gramme par gramme. Elle bouge peu d'une semaine à l'autre.</li>
      <li><strong>Budget du mois.</strong> Il se compare au coût réel, pas à la valeur des repas. Le stock de début de mois est déjà de l'argent dépensé, il est donc déduit.</li>
    </ul></details>
  </section>`;
}
function glucidesLipides(j) {
  // Absent des semaines composees avant que glucides et lipides soient calcules.
  if (j.gluc == null) return "";
  const o = E.phase, cible = (v, but) => but ? ` sur ${nombre(but)} g visés` : "";
  return `<p class="jour-resume chiffres">Glucides ${nombre(j.gluc)} g${cible(j.gluc, o.glucides)}, lipides ${nombre(j.lip)} g${cible(j.lip, o.lipides)}${j.fib == null ? "" : `, fibres ${nombre(j.fib)} g sur 30 g conseillés`}.</p>`;
}
function boutonsGout(r) {
  // « Je veux bien tester » n'a de sens qu'avant d'avoir goute : ensuite, la note parle.
  const bouton = (gout, nomIcone, texte) => `<button type="button" data-action="gout" data-plat="${r.id}" data-gout="${gout}" aria-pressed="${r.gout === gout}">${icone(nomIcone)}${texte}</button>`;
  return `<div class="gouts" role="group" aria-label="Ton avis sur ${esc(r.nom)}">
    ${r.nb_notes ? "" : bouton("tester", "check", "Je veux bien tester")}${bouton("non", "x", "J'aime pas")}</div>`;
}
const FILTRES_DEFIL = {};
function vueCatalogue({ params }) {
  barre("");
  if (params.get && params.get("stock") === "1") { Object.assign(filtresCat, { stock: true, ouvert: true, debut: 0 }); history.replaceState(null, "", "#/catalogue"); }
  const CATS = [["plat", "Plats"], ["petitdej", "Petits-déjeuners"], ["collation", "Collations"]];
  const AVIS = [["", "Tous"], ["tester", "À tester"], ["non", "J'aime pas"]];
  const REGIMES = ["Pauvre en FODMAP", "Sans gluten", "Sans lactose", "Végétarien"];
  const PRIX = [[2, "Moins de 2 €"], [3, "Moins de 3 €"], [4, "Moins de 4 €"]];
  const TEMPS = [[20, "Moins de 20 min"], [30, "Moins de 30 min"]];
  const ATOUTS = ["Riche en protéines", "Riche en fibres"];
  const PROTEINES = [["poulet", "Poulet"], ["boeuf", "Bœuf"], ["poisson", "Poisson"], ["dinde", "Dinde"], ["agneau", "Agneau"], ["veau", "Veau"],
                     ["oeufs", "Œufs"], ["tofu", "Tofu"], ["legumineuses", "Légumineuses"]];
  const TRIS = [["nom", "Nom"], ["prix", "Prix"], ["prot", "Protéines"], ["kcal", "Calories"], ["temps", "Temps"]];
  // Type de repas et avis : de simples filtres (Taha, 19/11/2026), plus des onglets.
  const NOM_CAT = Object.fromEntries(CATS);
  const motsCat = motsRech(filtreCatalogue), score = new Map();
  // En cherchant, les plats cachés aussi, et les fautes de frappe pardonnées (Taha, 27/11/2026).
  const repas = E.recettes.filter(r => estRepas(r) && (motsCat.length ? !estExclu(r.id) : !estRetire(r.id))), F = filtresCat, couvre = E.stock_couvre || {};
  if (motsCat.length) for (const r of repas) { const v = scoreRecherche(r, motsCat, { ingredients: true }); if (v > 0) score.set(r.id, v); }
  // Croissant ou décroissant (Taha, 23/11/2026).
  const ordre = { nom: (a, b) => a.nom.localeCompare(b.nom, "fr"), prix: (a, b) => a.cout - b.cout, prot: (a, b) => a.prot - b.prot,
                  kcal: (a, b) => a.kcal - b.kcal, temps: (a, b) => (a.temps || 0) - (b.temps || 0) };
  const lignes = repas.filter(r => (!F.cats.size || F.cats.has(r.cat)) && (!F.avis || (F.avis === "sans" ? !r.gout : r.gout === F.avis)) && (!motsCat.length || score.has(r.id))
      && [...F.regimes].every(x => r.filtres.regimes.includes(x)) && [...F.atouts].every(x => r.filtres.atouts.includes(x))
      && (!F.proteines.size || F.proteines.has(r.filtres.proteine)) && (!F.origines.size || F.origines.has(r.filtres.origine))
      && (!F.prix || r.cout < F.prix) && (!F.temps || (r.temps && r.temps < F.temps)) && (!F.stock || couvre[r.id] >= 0.8)
      && [...F.ings].every(n => (r.ing || []).some(i => i.n === n)))
    .sort((a, b) => (motsCat.length ? Math.round(score.get(b.id)) - Math.round(score.get(a.id)) : 0) || F.sens * ordre[F.tri](a, b) || ordre.nom(a, b));
  if (F.debut >= lignes.length) F.debut = 0;
  const nb = gout => repas.filter(r => r.gout === gout).length;
  const puce = (cle, valeur, texte, actif) => `<button type="button" data-action="filtreCat" data-cle="${cle}" data-valeur="${esc(valeur)}" aria-pressed="${actif}">${texte}</button>`;
  const actifs = F.ings.size + F.cats.size + (F.avis ? 1 : 0) + F.regimes.size + F.atouts.size + F.proteines.size + F.origines.size + (F.prix ? 1 : 0) + (F.temps ? 1 : 0) + (F.stock ? 1 : 0);
  // Seules les cuisines et les proteines presentes dans cette categorie sont proposees.
  const ici = repas.filter(r => !F.cats.size || F.cats.has(r.cat));
  const origines = [...new Set(ici.map(r => r.filtres.origine).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const proteines = PROTEINES.filter(([id]) => ici.some(r => r.filtres.proteine === id));
  // Chaque rangée garde sa position quand on touche une puce (la page se redessine).
  apresRendu.push(() => document.querySelectorAll(".ft-onglets, .ft-choix").forEach(g => { const k = g.className.split(" ")[0] + (g.getAttribute("aria-label") || "");
    g.scrollLeft = FILTRES_DEFIL[k] || 0; g.addEventListener("scroll", () => { FILTRES_DEFIL[k] = g.scrollLeft; }, { passive: true }); }));
  return `<div class="titre"><h1 tabindex="-1">Catalogue</h1>
    <p>${repas.length} recettes. Dis ce que tu veux bien tester et ce que tu n'aimes pas : l'appli en tient compte quand il compose ta semaine. ${nb("tester")} à tester, ${nb("non")} que tu n'aimes pas.</p></div>
  <div class="cat-ajout"><button type="button" class="stock-bouton" data-action="creerPlat" data-cat="${F.cats.size === 1 ? [...F.cats][0] : "plat"}" aria-label="Créer mon plat">${icone("cooking-pot")}<span>Créer</span><small>mon plat</small></button>
    <button type="button" class="stock-bouton" data-action="scannerPlat" aria-label="Scanner un produit">${icone("barcode")}<span>Scanner</span><small>un produit</small></button></div>
  <section class="filtres ft" aria-labelledby="tFiltres">
    <h2 id="tFiltres"><button type="button" class="filtres-bascule" data-action="filtreCat" data-cle="ouvert" data-valeur="" aria-expanded="${F.ouvert}">${icone("sliders-horizontal")}Filtres${actifs ? ` <span class="ft-nb">${actifs}</span>` : ""}${icone("caret-right")}</button>
      ${actifs ? `<button type="button" class="ft-raz" data-action="filtreCat" data-cle="raz" data-valeur="">Effacer</button>` : ""}</h2>
    ${(() => {
      // Une rangée d'onglets, un seul groupe ouvert à la fois, les filtres actifs en pastilles (Taha, 23/11/2026 :
      // « trop d'espacement, pas de gras, pas de texte collé, quelque chose de moderne »).
      const G = [
        ["cat", "Repas", CATS.map(([id, nom]) => [puce("cat", id, nom, F.cats.has(id)), F.cats.has(id), nom, "cat", id])],
        ["avis", "Avis", AVIS.filter(([id]) => id).concat([["sans", "Pas encore d'avis"]]).map(([id, nom]) => [puce("avis", id, nom, F.avis === id), F.avis === id, nom, "avis", id])],
        ["regime", "Régime", REGIMES.map(x => [puce("regime", x, x, F.regimes.has(x)), F.regimes.has(x), x, "regime", x])],
        ["proteine", "Protéine", proteines.map(([id, nom]) => [puce("proteine", id, nom, F.proteines.has(id)), F.proteines.has(id), nom, "proteine", id])],
        ["origine", "Cuisine", origines.map(x => [puce("origine", x, x, F.origines.has(x)), F.origines.has(x), x, "origine", x])],
        ["temps", "Temps", TEMPS.map(([v, t]) => [puce("temps", v, t, F.temps === v), F.temps === v, t, "temps", v])],
        ["prix", "Prix", PRIX.map(([v, t]) => [puce("prix", v, t, F.prix === v), F.prix === v, t, "prix", v])],
        ["atout", "Atouts", ATOUTS.map(x => [puce("atout", x, x, F.atouts.has(x)), F.atouts.has(x), x, "atout", x])],
        ["stock", "Stock", [[puce("stock", "", "Faisable avec ton stock", F.stock), F.stock, "Avec mon stock", "stock", ""]]],
        ["ing", "Ingrédient", []]].filter(([id, , xs]) => id === "ing" || xs.length);
      const ouvert = G.find(([id]) => id === F.groupe) || G[0];
      const actives = G.flatMap(([, , xs]) => xs.filter(x => x[1]));
      return `${actives.length ? `<div class="ft-actifs">${actives.map(([, , nom, cle, v]) => `<button type="button" data-action="filtreCat" data-cle="${cle}" data-valeur="${esc(v)}" aria-label="Retirer le filtre ${esc(nom)}">${esc(nom)}${icone("x")}</button>`).join("")}</div>` : ""}
      ${F.ouvert ? `<div class="ft-onglets" role="tablist" aria-label="Familles de filtres">${G.map(([id, nom, xs]) => { const n = xs.filter(x => x[1]).length + (id === "ing" ? F.ings.size : 0);
        return `<button type="button" role="tab" aria-selected="${id === ouvert[0]}" data-action="filtreCat" data-cle="groupe" data-valeur="${id}">${nom}${n ? `<i>${n}</i>` : ""}</button>`; }).join("")}</div>
      <div class="ft-choix gouts" role="group" aria-label="${ouvert[1]}">${ouvert[0] === "ing" ? `<input id="ingCat" type="search" list="ingCatListe" autocomplete="off" placeholder="Lait, poulet…" aria-label="Voir les plats avec cet ingrédient">
        <datalist id="ingCatListe">${[...new Set(repas.flatMap(r => (r.ing || []).filter(i => i.u !== "qs").map(i => i.n)))].sort((a, b) => a.localeCompare(b, "fr")).map(n => `<option value="${esc(n)}">`).join("")}</datalist>`
        : ouvert[2].map(x => x[0]).join("")}</div>` : ""}`; })()}
    <div class="champ formulaire tri"><label for="triCat">Trier par</label>
      <select id="triCat" name="tri">${TRIS.map(([id, nom]) => `<option value="${id}"${F.tri === id ? " selected" : ""}>${nom}</option>`).join("")}</select>
      <button type="button" class="tri-sens${F.sens < 0 ? " bas" : ""}" data-action="filtreCat" data-cle="sens" data-valeur="" aria-label="Ordre ${F.sens > 0 ? "croissant" : "décroissant"}, toucher pour inverser">${icone("caret-right")}${F.sens > 0 ? "Croissant" : "Décroissant"}</button></div>
  </section>
  ${F.ings.size ? `<p class="cat-ings">Avec ${[...F.ings].map(n => `<button type="button" data-action="sansIngCat" data-nom="${esc(n)}" aria-label="Retirer ${esc(n)}">${esc(n)}${icone("x")}</button>`).join("")}</p>` : ""}
  <div class="champ formulaire"><label for="filtre">Chercher une recette</label>
    <input id="filtre" name="filtre" type="search" autocomplete="off" placeholder="Poulet, curry…" value="${esc(filtreCatalogue)}"></div>
  <p class="discret petit" role="status" style="margin:-6px 0 8px"><span>${lignes.length > 1 ? `${lignes.length} recettes` : `${lignes.length} recette`}</span>${F.stock && !E.stock.length ? ` · <span>Ton stock est vide : ajoute ce que tu as dans Stock</span>` : ""}</p>
  ${lignes.length ? `<ul class="rp-liste cat-liste">${lignes.slice(F.debut, F.debut + 5).map(r => `<li><a class="rp-plat" href="#/plat/${r.id}">${photo(r, 120, "carre")}
      <span class="rp-texte"><b>${esc(r.nom)}</b>${macrosLigne(r.kcal, r.prot).replace("</span></span>", `</span><span>${euros(r.cout)}</span>${r.gout === "tester" ? `<span class="rp-ecart plus">À tester</span>` : r.gout === "non" ? `<span>J'aime pas</span>` : ""}</span>`)}</span></a></li>`).join("")}</ul>`
    : `<p class="discret">Aucune recette ne correspond.</p>`}
  ${F.stock && lignes.length ? `<p class="stock-refaire"><button type="button" class="bouton large second" data-action="stockProposer">${icone("arrows-clockwise")}Refaire mes repas avec mon stock</button></p>` : ""}
  ${lignes.length > 5 ? `<nav class="cat-pages" aria-label="Pages du catalogue">
    <button type="button" data-action="pageCat" data-pas="-5" aria-label="5 précédents"${F.debut ? "" : " disabled"}>${icone("caret-left")}</button>
    <span class="chiffres">${nombre(F.debut + 1)}–${nombre(Math.min(F.debut + 5, lignes.length))} <small>sur ${nombre(lignes.length)}</small></span>
    <button type="button" data-action="pageCat" data-pas="5" aria-label="5 suivants"${F.debut + 5 < lignes.length ? "" : " disabled"}>${icone("caret-right")}</button></nav>` : ""}`;
}
// ---------- Le stock à la maison (Taha, 22/11/2026) : photo du frigo ou du placard, ticket de caisse, ou saisie ; l'IA lit,
// tu vérifies, ça entre ; ce que tu manges en sort ; les plats faisables avec sont marqués, et les prochains jours peuvent
// être refaits avec. ----------
function rayonsDesIngredients() {
  const r = {};
  for (const x of E.recettes) for (const i of x.ing || []) if (i.a != null && r[i.n] == null) r[i.n] = i.a;
  return r;
}
// Le stock se lit en kg et en litres (Taha, 22/11/2026 : « au lieu de g mettre en kg ») ; il reste rangé en g et en ml.
const enAffiche = l => l.unite === "g" || l.unite === "ml"
  ? { q: Math.round(l.quantite) / 1000, u: l.unite === "g" ? "kg" : "L", f: 1000 }
  : { q: Math.round(l.quantite * 10) / 10, u: l.unite === "pièce" ? (l.quantite > 1 ? "pièces" : "pièce") : l.unite, f: 1 };
// Les mots d'une recherche dans le stock, sans quantités, unités, accents ni pluriel (« 6 Œufs » → ["oeuf"]).
const motsStock = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe")
  .split(/[^a-z]+/).filter(m => m.length > 2 && !["kg", "ml", "cl", "des", "les", "une", "pour", "avec", "boite", "boites", "paquet", "paquets", "pack", "brique"].includes(m))
  .map(m => m.replace(/(?<=..)[sx]$/, ""));
// Le stock sur les plats (Taha, 22/11/2026) : un cadre vert si tout est en stock, orange s'il manque un ou deux
// ingrédients, rouge au-delà ; une pastille « 2 manquent » qui, touchée, donne la liste. Rien sans stock.
function marquerStock(racine) {
  if (!E || !(E.stock || []).length || !E.stock_manque) return;
  racine.querySelectorAll('a.repas[href^="#/plat/"]:not([data-stock-vu]), a.rp-plat[href^="#/plat/"]:not([data-stock-vu]), .rp-plat[data-plat]:not([data-stock-vu])').forEach(a => {
    a.dataset.stockVu = "1";
    const id = a.dataset.plat || decodeURIComponent((a.getAttribute("href") || "").slice(7).split("?")[0]);
    if (!recette(id) || !estRepas(recette(id))) return;
    const m = E.stock_manque[id] || [], carte = a.closest(".exo, li") || a;
    // Ni dans « Faisable avec ton stock » (déjà dit), ni sur ce qui est déjà mangé (Taha, 22/11/2026).
    if (a.closest(".stock-faisable, .histo-plats") || carte.classList.contains("cuisine-fait")) return;
    carte.classList.add("stock-cadre", !m.length ? "stock-ok" : m.length <= 2 ? "stock-peu" : "stock-loin");
    if (m.length) a.insertAdjacentHTML("beforeend", `<span class="manque" role="button" tabindex="0" data-manque="${esc(id)}"
      aria-label="${m.length > 1 ? `${m.length} ingrédients manquants` : "1 ingrédient manquant"} : toucher pour voir">${m.length > 1 ? `${m.length} manquent` : "1 manque"}<small>touche pour voir</small></span>`);
  });
}
let marquage = 0;
new MutationObserver(() => { if (!marquage) marquage = requestAnimationFrame(() => { marquage = 0; marquerStock(document); }); })
  .observe(document.body, { childList: true, subtree: true });
// Une petite carte au centre, sobre comme la carte d'un plat (Taha, 23/11/2026 : « pas adaptée, un peu grande »).
function montrerManque(sur, titre, lignes) {
  document.querySelector(".manque-fond")?.remove();
  const hote = document.querySelector("dialog[open]") || document.body;
  hote.insertAdjacentHTML("beforeend", `<div class="manque-fond"><div class="manque-feuille" role="dialog" aria-modal="true" aria-label="${esc(sur + " : " + titre)}">
    <button type="button" class="manque-x" data-manque-fermer aria-label="Fermer">${icone("x")}</button>
    <p class="manque-sur">${esc(sur)}</p><h3>${esc(titre)}</h3>
    <ul class="manque-lignes">${lignes.map(([n, q, u]) => `<li data-n="${esc(n)}" data-u="${esc(u)}" data-q="${q}"><span>${esc(n)}</span><span class="q chiffres">${quantite(q, u)}</span>
      <button type="button" class="manque-ai" data-manque-ai>Je l'ai</button></li>`).join("")}</ul>
    <p class="manque-aide">« Je l'ai » : dis combien tu en as, ça va dans ton stock.</p></div></div>`);
}
// « Je l'ai » (Taha, 23/11/2026) : la quantité qu'on a, tapée dans la carte, s'ajoute au stock tout de suite.
document.addEventListener("click", async ev => {
  const ai = ev.target.closest && ev.target.closest("[data-manque-ai]");
  if (ai) {
    const li = ai.closest("li"), u = li.dataset.u, pas = u === "g" || u === "ml" ? 1 : 0.5;
    li.classList.add("saisie");
    li.querySelector(".q").outerHTML = `<span class="manque-q"><input type="number" inputmode="decimal" min="0" step="${pas}" value="${Number(li.dataset.q)}" aria-label="Combien de ${esc(li.dataset.n)} as-tu, en ${esc(u)}"><small>${esc(u)}</small></span>`;
    ai.outerHTML = `<button type="button" class="manque-ok" data-manque-ok aria-label="Ajouter au stock">${icone("check")}</button>`;
    const i = li.querySelector("input"); i.focus(); i.select();
    i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); li.querySelector("[data-manque-ok]").click(); } });
    return;
  }
  const ok = ev.target.closest && ev.target.closest("[data-manque-ok]");
  if (!ok) return;
  const li = ok.closest("li"), n = li.dataset.n, u = li.dataset.u, q = Number(String(li.querySelector("input").value).replace(",", "."));
  if (!(q > 0)) return li.querySelector("input").focus();
  ok.disabled = true;
  const deja = ((E.stock || []).find(l => l.nom === n && l.unite === u) || {}).quantite || 0;
  const rep = await appel("/api/stock", { nom: n, unite: u, quantite: Math.round((deja + q) * 10) / 10 });
  if (rep !== true) { ok.disabled = false; return dire((rep && rep.erreur) || "Pas ajouté, réessaie."); }
  li.classList.remove("saisie"); li.classList.add("fait");
  li.querySelector(".manque-q").outerHTML = `<span class="q">${quantite(q, u)} au stock</span>`;
  ok.outerHTML = `<span class="manque-fait">${icone("check")}</span>`;
  rendre();
});
document.addEventListener("click", ev => {
  const b = ev.target.closest && ev.target.closest("[data-manque], [data-manque-jour], .manque-fond");
  if (!b) return;
  if (b.classList.contains("manque-fond")) {
    if (ev.target === b || ev.target.closest("[data-manque-fermer]")) { ev.preventDefault(); b.remove(); }
    return;
  }
  ev.preventDefault(); ev.stopPropagation();
  if (b.dataset.manque) return montrerManque("Il te manque, pour une portion", recette(b.dataset.manque).nom, E.stock_manque[b.dataset.manque] || []);
  const d = b.dataset.manqueJour;
  montrerManque("À acheter pour les repas du", new Date(d + "T12:00").toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }).replace(/^./, c => c.toUpperCase()),
    (E.manque_jours[d] || []).map(x => [x.nom, x.quantite, x.unite]));
}, true);
// Des pas qui comptent (Taha, 23/11/2026 : « la granularité est trop petite ») : un verre pour les liquides, 100 g sinon.
const pasStock = l => l.unite === "ml" ? 250 : l.unite === "g" ? (l.quantite >= 2000 ? 250 : 100) : 1;
function vueStockMaison({ params } = {}) {
  barre("");
  // Deux rubriques (Taha, 23/11/2026 : « ajoute une rubrique courses dans stock pour t'aider à t'organiser »).
  const courses = !!(params && params.get && params.get("v") === "courses"), nl = (E.liste_courses || []).length;
  const onglets = `<nav class="stock-onglets" aria-label="Stock">
      <a href="#/stock"${courses ? "" : ' aria-current="page"'}>Mon stock</a>
      <a href="#/stock?v=courses"${courses ? ' aria-current="page"' : ""}>Courses${nl ? `<span>${nl}</span>` : ""}</a></nav>`;
  if (courses) return `<div class="m-tete"><div><h1 tabindex="-1">Stock</h1></div></div>${onglets}${vueCourses()}`;
  const st = E.stock || [], voulus = motsStock(filtreStock), rayons = rayonsDesIngredients(), groupes = new Map();
  // Tous les ingrédients des plats sont là, à 0 et grisés tant que tu n'en as pas ; 0 n'efface rien (Taha, 23/11/2026).
  const unites = {};
  for (const x of E.recettes) for (const i of x.ing || []) {
    const u = (unites[i.n] = unites[i.n] || {});
    if (i.u !== "qs") u[i.u] = (u[i.u] || 0) + 1;
  }
  const dejaLa = new Set(st.map(l => l.nom));
  const zeros = Object.entries(unites).filter(([n]) => !dejaLa.has(n)).map(([n, u]) =>
    ({ nom: n, unite: Object.keys(u).sort((a, b) => u[b] - u[a])[0] || "g", quantite: 0, zero: true }));
  const trouves = [...st, ...zeros].filter(l => !voulus.length || voulus.every(m => motsStock(l.nom).some(n => n.startsWith(m))));
  trouves.sort((a, b) => (b.quantite > 0) - (a.quantite > 0) || a.nom.localeCompare(b.nom, "fr")).forEach(l => {
    const g = rayons[l.nom] != null && E.rayons && E.rayons[rayons[l.nom]] ? E.rayons[rayons[l.nom]] : "Autres";
    groupes.set(g, [...(groupes.get(g) || []), l]); });
  const ajout = `<div class="stock-ajout">
      <label class="stock-bouton">${icone("image")}<span>Photo</span><small>frigo, placard</small><input type="file" accept="image/*" hidden data-stock-photo="photo"></label>
      <label class="stock-bouton">${icone("receipt")}<span>Ticket</span><small>de caisse</small><input type="file" accept="image/*" hidden data-stock-photo="ticket"></label>
      <button type="button" class="stock-bouton" data-action="scannerStock">${icone("barcode")}<span>Scanner</span><small>un code-barres</small></button>
      </div>`;
  // La barre chercher / ajouter vient sous « Refaire mes repas avec mon stock » (Taha, 22/11/2026).
  const barreStock = `<form class="rp-recherche champ-ia stock-taper" id="fStockTaper" novalidate>${icone("sparkle")}
      <input id="filtre" name="filtre" type="search" enterkeyhint="go" autocomplete="off" maxlength="600" value="${esc(filtreStock)}"
        placeholder="Chercher ou ajouter : riz, 6 œufs…" aria-label="Chercher dans ton stock, ou ajouter ce que tu as acheté" aria-describedby="stockAide"></form>
    ${(() => {
      // Plus de liste « À ajouter » (Taha, 23/11/2026) : on tape, l'appli propose, comme dans Courses.
      const proposes = voulus.length ? trouves.filter(l => !(l.quantite > 0)).slice(0, 8) : [];
      return proposes.length ? `<div class="stock-puces stock-proposes">${proposes.map(l => `<button type="button" class="stock-puce" data-stock-pas="1" data-nom="${esc(l.nom)}" data-unite="${esc(l.unite)}" data-q="0" aria-label="Ajouter ${esc(l.nom)} au stock">${esc(l.nom)}${icone("plus")}</button>`).join("")}</div>` : ""; })()}
    <p class="stock-aide" id="stockAide" aria-live="polite">${!voulus.length ? "" : !trouves.length
      ? `« ${esc(filtreStock.trim())} » n'est pas dans ton stock : <button type="submit" form="fStockTaper" class="lien">l'ajouter</button>`
      : /\d/.test(filtreStock) ? `Entrée pour ajouter « ${esc(filtreStock.trim())} » à ton stock.` : ""}</p>
    <small class="erreur" id="eStockTaper" role="alert"></small>`;
  for (const n of [...ING_CHOISIS]) if (!st.some(l => l.nom === n && l.quantite > 0)) ING_CHOISIS.delete(n);
  if (ING_CHOISIS.size) {
    // Une carte posée au-dessus des onglets (Taha, 23/11/2026 : « pas élégant ») : les produits choisis en pastilles
    // qu'on retire d'un toucher, et quand rien ne va ensemble, le produit à enlever pour retrouver des plats.
    const ch = [...ING_CHOISIS], n = platsAvec(ING_CHOISIS).length, pl = k => `${k > 1 ? `${k} plats` : `${k} plat`}`;
    const sans = n ? [] : ch.map(x => ({ x, k: platsAvec(ch.filter(y => y !== x)).length })).filter(o => o.k && ch.length > 1)
      .sort((a, b) => b.k - a.k).slice(0, 2);
    const ouv = ch.length === 1 && E.ouverts && ch[0] in E.ouverts ? E.ouverts[ch[0]] : undefined;
    barre(`<div class="bi${n ? "" : " bi-vide"}">
      <div class="bi-tete"><span class="bi-ic">${icone(n ? "cooking-pot" : "sparkle")}</span>
        <div><b>${n ? `${pl(n)} avec ${ch.length > 1 ? "ces produits" : "ça"}` : `Aucun plat avec ${ch.length > 1 ? `ces ${ch.length} produits` : "ce produit"}`}</b>
        <small>${n ? "Touche un autre produit pour affiner." : sans.length ? "Retire un produit, ou laisse l'IA en inventer un." : "L'IA peut t'en inventer un."}</small></div>
        <button type="button" class="bi-x" data-action="lacherIngs" aria-label="Tout désélectionner">${icone("x")}</button></div>
      <div class="bi-puces">${ch.map(x => `<button type="button" class="bi-puce" data-action="choisirIng" data-nom="${esc(x)}" aria-label="Retirer ${esc(x)}">${esc(x)}${icone("x")}</button>`).join("")}
        ${ouv === null ? `<button type="button" class="bi-puce bi-ouvrir" data-action="ouvrirIng" data-nom="${esc(ch[0])}">${icone("plus")}Je l'ai ouvert</button>`
          : ouv != null ? `<span class="bi-ouvert">ouvert ${ouv ? `il y a ${ouv} j` : "aujourd'hui"}</span>` : ""}</div>
      <div class="bi-actions">${n ? `<button type="button" class="bouton large" data-action="voirPlatsIngs">Voir les ${pl(n)}</button>`
        : `${sans.map(o => `<button type="button" class="bouton second" data-action="choisirIng" data-nom="${esc(o.x)}">Sans ${esc(o.x.toLowerCase())} · ${pl(o.k)}</button>`).join("")}
           <button type="button" class="bouton bouton-ia" data-action="inventerPlat">${icone("sparkle")}Inventer un plat</button>`}</div></div>`);
  }
  return `<div class="m-tete"><div><h1 tabindex="-1">Stock</h1>
      ${onglets}
      <p class="petit discret">${st.length ? `${st.length > 1 ? `${st.length} produits` : `${st.length} produit`} à la maison. Ce que tu marques mangé en sort tout seul.` : "Ajoute ce que tu as chez toi : l'appli te propose des repas avec."}</p></div></div>
    ${ajout}
    ${barreStock}
    ${(() => {
      // Deux parties (Taha, 23/11/2026 : « beaucoup d'ingrédients, plus facile pour le user ») : ce que tu as, en
      // lignes à régler ; le reste, rangé par rayon et replié, en pastilles qu'un toucher ajoute au stock.
      const ordre = ([a], [b]) => (a === "Autres") - (b === "Autres") || a.localeCompare(b, "fr");
      const parRayon = liste => { const m = new Map(); for (const l of liste) { const g = rayons[l.nom] != null && E.rayons && E.rayons[rayons[l.nom]] ? E.rayons[rayons[l.nom]] : "Autres"; m.set(g, [...(m.get(g) || []), l]); } return [...m.entries()].sort(ordre); };
      const chez = trouves.filter(l => l.quantite > 0), reste = trouves.filter(l => !(l.quantite > 0));
      const ligne = l => `<li><button type="button" class="stock-nom" data-action="choisirIng" data-nom="${esc(l.nom)}" aria-pressed="${ING_CHOISIS.has(l.nom)}"
          aria-label="${esc(l.nom)} : choisir pour voir les plats qui en ont">${ING_CHOISIS.has(l.nom) ? icone("check") : ""}${esc(l.nom)}${E.ouverts && E.ouverts[l.nom] != null ? `<em class="st-ouvert">ouvert</em>` : ""}</button><span class="stock-q">
          <button type="button" data-stock-pas="-1" data-nom="${esc(l.nom)}" data-unite="${esc(l.unite)}" data-q="${l.quantite}" aria-label="Moins de ${esc(l.nom)}">−</button>
          <input class="stock-saisie" type="number" inputmode="decimal" min="0" step="any" value="${enAffiche(l).q}" data-nom="${esc(l.nom)}" data-unite="${esc(l.unite)}" data-facteur="${enAffiche(l).f}" aria-label="Quantité de ${esc(l.nom)}, en ${esc(enAffiche(l).u)}">
          <span class="stock-u">${esc(enAffiche(l).u)}</span>
          <button type="button" data-stock-pas="1" data-nom="${esc(l.nom)}" data-unite="${esc(l.unite)}" data-q="${l.quantite}" aria-label="Plus de ${esc(l.nom)}">+</button></span></li>`;
      apresRendu.push(() => document.querySelectorAll("details[data-rayon]").forEach(d => d.addEventListener("toggle", () =>
        d.open ? STOCK_OUVERTS.add(d.dataset.rayon) : STOCK_OUVERTS.delete(d.dataset.rayon))));
      const finir = (E.a_finir || []).filter(x => chez.some(l => l.nom === x.nom));
      const quand = x => x.reste < 0 ? "a peut-être expiré" : x.reste === 0 ? "expire aujourd'hui" : x.reste === 1 ? "expire demain" : `expire dans ${x.reste} jours`;
      return `${finir.length && !voulus.length ? `<section class="bloc a-finir" aria-labelledby="tFinir"><h2 id="tFinir">${icone("warning-circle")}À finir bientôt</h2>
        <ul>${finir.map(x => `<li><span><b>${esc(x.nom)}</b><small>${x.ouvert != null ? (x.ouvert ? `ouvert il y a ${x.ouvert > 1 ? `${x.ouvert} jours` : `${x.ouvert} jour`}` : "ouvert aujourd'hui") : `entré il y a ${x.depuis > 1 ? `${x.depuis} jours` : `${x.depuis} jour`}`}</small></span><span class="af-quand${x.reste <= 0 ? " urgent" : ""}">${quand(x)}</span></li>`).join("")}</ul>
        <button type="button" class="bouton large second" data-action="platsAFinir">${icone("cooking-pot")}Des plats pour les finir</button></section>` : ""}
      ${chez.length ? `<p class="petit discret stock-astuce">Touche un produit pour voir les plats qui en ont.</p>
      <div class="stock-rayons">${parRayon(chez).map(([g, lignes]) => `<details class="stock-rayon stock-chez" data-rayon="chez|${esc(g)}"${voulus.length || STOCK_OUVERTS.has("chez|" + g) || lignes.some(l => ING_CHOISIS.has(l.nom)) ? " open" : ""}>
        <summary><span class="sr-nom">${esc(g)}</span><small>${lignes.length}</small>${icone("caret-right")}</summary>
        <ul class="stock-liste">${lignes.map(ligne).join("")}</ul></details>`).join("")}</div>`
        : `<p class="petit discret stock-vide">${voulus.length ? "" : "Ton stock est vide : tape un produit, ou prends en photo ton frigo ou un ticket."}</p>`}
`;
    })()}`;
}
const STOCK_OUVERTS = new Set();
// Les plats qui contiennent TOUS ces ingrédients (Taha, 23/11/2026 : « sélectionner lait, il expire demain »).
const platsAvec = noms => E.recettes.filter(r => estRepas(r) && !estRetire(r.id) && !["extrariz", "rien"].includes(r.id)
  && [...noms].every(n => (r.ing || []).some(i => i.n === n)));
const LC_COCHES = new Set();
// Ma liste de courses (Taha, 23/11/2026) : UN tableau. Vide, il propose de le remplir avec les N produits qui permettent de
// cuisiner le plus de plats avec le stock (N au choix). Chaque produit dit en clair à quoi il sert ; on coche ce qu'on a
// acheté, « Ajouter au stock ».
const raisonCourse = x => x.plats.length ? `pour ${x.plats.length > 1 ? `${x.plats.length} nouveaux plats` : `${x.plats.length} nouveau plat`}`
  : `pour compléter ${x.aide.length > 1 ? `${x.aide.length} plats` : `${x.aide.length} plat`}`;
const ING_CHOISIS = new Set();             // produits du stock choisis pour voir les plats qui en ont
let filtreCourses = "";
function vueCourses() {
  const l = E.liste_courses || [], aStock = (E.stock || []).length;
  for (const n of [...LC_COCHES]) if (!l.some(x => x.nom === n)) LC_COCHES.delete(n);
  const nb = `<span class="lc-nb"><button type="button" data-action="lcNb" data-pas="-1" aria-label="Un produit de moins">−</button>
      <input id="lcNb" type="number" inputmode="numeric" min="0" max="50" value="${lcProposes().length}" aria-label="Nombre de produits proposés sur ta liste">
      <button type="button" data-action="lcNb" data-pas="1" aria-label="Un produit de plus">+</button></span>`;
  const idees = `<section class="bloc lc-idees" aria-labelledby="tIdees"><h2 id="tIdees">${icone("shopping-cart-simple")}Les plus utiles</h2>
      ${aStock ? `<p class="lc-aide">+ ajoute à ta liste le produit qui te fait cuisiner le plus de plats avec ce que tu as ; − le retire.</p>
      <div class="lc-remplir">${nb}<span class="lc-nb-aide">${lcProposes().length ? (lcProposes().length > 1 ? "produits sur ta liste" : "produit sur ta liste") : "touche + pour commencer"}</span></div>`
      : `<p class="lc-aide">Ajoute d'abord ce que tu as dans « Mon stock » : l'appli te dira quoi acheter pour cuisiner plus.</p>`}</section>`;
  // Ajouter à la main : les ingrédients de l'appli qui commencent par ce qu'on tape.
  const mots = motsStock(filtreCourses), tous = Object.keys(rayonsDesIngredients()).sort((a, b) => a.localeCompare(b, "fr"));
  const trouves = mots.length ? tous.filter(n => !l.some(x => x.nom === n) && mots.every(m => motsStock(n).some(k => k.startsWith(m)))).slice(0, 8) : [];
  const unite = nom => { for (const x of E.recettes) for (const i of x.ing || []) if (i.n === nom && i.u !== "qs") return i.u; return "g"; };
  const ajout = `<div class="lc-ajout"><div class="rp-recherche lc-champ">${icone("plus")}<input id="filtreCourses" type="search" autocomplete="off" enterkeyhint="done"
      placeholder="Ajouter un produit : riz, lait…" value="${esc(filtreCourses)}" aria-label="Ajouter un produit à ma liste"></div>
    ${trouves.length ? `<div class="stock-puces">${trouves.map(n => { const u = unite(n);
      return `<button type="button" class="stock-puce" data-action="lcAjouter" data-nom="${esc(n)}" data-unite="${esc(u)}" data-q="${u === "g" ? 500 : u === "ml" ? 1000 : 1}">${esc(n)}${icone("plus")}</button>`; }).join("")}</div>`
      : mots.length ? `<p class="lc-aide">Aucun produit de l'appli ne s'appelle ainsi.</p>` : ""}</div>`;
  const rayons = rayonsDesIngredients(), groupes = new Map();
  for (const x of l) { const g = rayons[x.nom] != null && E.rayons && E.rayons[rayons[x.nom]] ? E.rayons[rayons[x.nom]] : "Autres"; groupes.set(g, [...(groupes.get(g) || []), x]); }
  const ligne = x => `<li><label><input type="checkbox" data-lc="${esc(x.nom)}"${LC_COCHES.has(x.nom) ? " checked" : ""}><i aria-hidden="true">${icone("check")}</i>
      <span class="lc-nom"><b>${esc(x.nom)}</b>${x.raison ? `<small>${esc(x.raison)}</small>` : ""}</span><span class="lc-q chiffres">${quantite(x.quantite, x.unite)}</span></label>
      <button type="button" class="lc-x" data-action="lcRetirer" data-nom="${esc(x.nom)}" data-unite="${esc(x.unite)}" aria-label="Retirer ${esc(x.nom)} de la liste">${icone("x")}</button></li>`;
  const liste = `<section class="bloc liste-courses" aria-labelledby="tListe"><h2 id="tListe">Ma liste${l.length ? `<span>${l.length}</span>` : ""}</h2>
    ${coursesFamillePossible() ? `<p class="lc-famille"><button type="button" class="bouton second" data-action="coursesFamille">${icone("users")}Les courses de toute la famille</button></p>` : ""}
    ${ajout}
    ${l.length ? `${[...groupes.entries()].sort(([a], [b]) => (a === "Autres") - (b === "Autres") || a.localeCompare(b, "fr")).map(([g, xs]) =>
        `<details class="lc-groupe" data-lc-rayon="${esc(g)}"${LC_FERMES.has(g) ? "" : " open"}><summary><span>${esc(g)}</span><small>${xs.length}</small>${icone("caret-right")}</summary>
          <ul>${xs.map(ligne).join("")}</ul></details>`).join("")}
      <button type="button" class="bouton large" id="lcValider" data-action="lcValider"${LC_COCHES.size ? "" : " disabled"}>${lcTexte()}</button>
      <p class="lc-aide lc-sous">Coche ce que tu as acheté : ça passe dans « Mon stock ».</p>` : `<p class="lc-aide">Ta liste est vide.</p>`}</section>`;
  // Tous les ingrédients de l'appli, ici plutôt que dans Mon stock (Taha, 23/11/2026) : ce qu'on n'a pas, par rayon, replié ;
  // un toucher le met sur la liste.
  const chez = new Set((E.stock || []).filter(x => x.quantite > 0).map(x => x.nom));
  const autres = tous.filter(n => !chez.has(n) && !l.some(x => x.nom === n)), parR = new Map();
  for (const n of autres) { const g = rayons[n] != null && E.rayons && E.rayons[rayons[n]] ? E.rayons[rayons[n]] : "Autres"; parR.set(g, [...(parR.get(g) || []), n]); }
  apresRendu.push(() => document.querySelectorAll("details[data-rayon]").forEach(d => d.addEventListener("toggle", () =>
    d.open ? STOCK_OUVERTS.add(d.dataset.rayon) : STOCK_OUVERTS.delete(d.dataset.rayon))));
  const tousProduits = autres.length && !mots.length ? `<details class="stock-tous"${STOCK_OUVERTS.has("lc-tous") ? " open" : ""} data-rayon="lc-tous"><summary>Tous les ingrédients<small>${autres.length}</small>${icone("caret-right")}</summary>
      <p class="petit discret stock-astuce">Touche un ingrédient pour le mettre sur ta liste.</p>
      <div class="stock-rayons">${[...parR.entries()].sort(([a], [b]) => (a === "Autres") - (b === "Autres") || a.localeCompare(b, "fr")).map(([g, ns]) => `<details class="stock-rayon" data-rayon="lc|${esc(g)}"${STOCK_OUVERTS.has("lc|" + g) ? " open" : ""}>
        <summary><span class="sr-nom">${esc(g)}</span><small>${ns.length}</small>${icone("caret-right")}</summary>
        <div class="stock-puces">${ns.map(n => { const u = unite(n);
          return `<button type="button" class="stock-puce" data-action="lcAjouter" data-nom="${esc(n)}" data-unite="${esc(u)}" data-q="${u === "g" ? 500 : u === "ml" ? 1000 : 1}" aria-label="Mettre ${esc(n)} sur ma liste">${esc(n)}${icone("plus")}</button>`; }).join("")}</div></details>`).join("")}</div></details>` : "";
  return idees + liste + tousProduits;          // le nombre à choisir d'abord (Taha, 23/11/2026)
}

// Les produits que l'appli a mis sur la liste (ils ont une raison) ; lcViser(n) en garde exactement n.
const lcProposes = () => (E.liste_courses || []).filter(x => x.raison);
let LC_EN_COURS = false;
async function lcViser(n) {
  if (LC_EN_COURS) return;
  const p = lcProposes(), voulu = Math.max(0, Math.min(50, Math.round(Number(n)) || 0));
  if (voulu === p.length) { const i = $("lcNb"); if (i) i.value = p.length; return; }
  LC_EN_COURS = true;
  try {
    if (voulu > p.length) {
      const c = coursesMalines(voulu - p.length, new Set((E.liste_courses || []).map(x => x.nom)));
      if (!c.length) { dire("Rien de plus à proposer avec ton stock."); rendre(); return; }
      await agir("/api/liste_courses/lot", { items: c.map(x => ({ nom: x.nom, unite: x.unite, quantite: x.q, raison: raisonCourse(x) })) },
        c.length === 1 ? `${c[0].nom} : sur ta liste.` : `${c.length} produits sur ta liste.`);
    } else {
      const partent = p.slice(voulu).reverse();
      partent.forEach(x => LC_COCHES.delete(x.nom));
      await agir("/api/liste_courses/lot", { items: partent.map(x => ({ nom: x.nom, unite: x.unite })), retirer: true },
        partent.length === 1 ? `${partent[0].nom} : retiré.` : `${partent.length} produits retirés.`);
    }
  } finally { LC_EN_COURS = false; }
}
const LC_NB = { n: (() => { try { const v = parseInt(localStorage.getItem("mp-lc-nb"), 10); return v >= 1 && v <= 50 ? v : 8; } catch (e) { return 8; } })() };
const lcNbGarder = v => { LC_NB.n = Math.max(1, Math.min(50, Math.round(v) || 8)); try { localStorage.setItem("mp-lc-nb", String(LC_NB.n)); } catch (e) {} };                 // cochés sur ma liste de courses, pas encore validés
const lcTexte = () => LC_COCHES.size ? `${icone("check")}Ajouter au stock (${LC_COCHES.size})` : "Ajouter au stock";
// La liste de courses qui ouvre le plus de plats avec ce qu'on a déjà (Taha, 23/11/2026) : à chaque tour, le produit
// qui rend faisables le plus de plats (à égalité, celui qui rapproche le plus d'autres plats) ; toujours un top 10
// (Taha, 23/11/2026), même quand les derniers ne font que rapprocher des plats.
function coursesMalines(max = 10, deja = new Set()) {
  if (!(E.stock || []).length || !E.stock_manque) return [];
  const ok = id => { const r = recette(id); return r && estRepas(r) && !estRetire(id) && r.gout !== "non" && !["extrariz", "rien"].includes(id); };
  const reste = Object.entries(E.stock_manque).filter(([id]) => ok(id))
    .map(([id, m]) => ({ id, m: new Map(m.filter(([n]) => !deja.has(n)).map(([n, q, u]) => [n, [q, u]])) })).filter(r => r.m.size);
  const choix = [];
  while (choix.length < max) {
    const score = new Map();
    for (const r of reste) for (const n of r.m.keys()) {
      const x = score.get(n) || { finis: 0, proches: 0 };
      if (r.m.size === 1) x.finis++; else x.proches += 1 / r.m.size;
      score.set(n, x);
    }
    const [nom, x] = [...score.entries()].sort((a, b) => b[1].finis - a[1].finis || b[1].proches - a[1].proches)[0] || [];
    if (!nom) break;
    const unite = reste.find(r => r.m.has(nom)).m.get(nom)[1], plats = [], qs = [], qa = [], aide = [];
    for (const r of reste) { const v = r.m.get(nom); if (r.m.delete(nom)) (r.m.size ? (aide.push(r.id), qa) : (plats.push(r.id), qs)).push(v[0]); }
    // Assez pour une portion de chaque plat qu'il ouvre (sinon, du plus gourmand de ceux qu'il rapproche), arrondi.
    const brut = qs.length ? qs.reduce((a, b) => a + b, 0) : Math.max(...qa);
    const q = unite === "g" || unite === "ml" ? Math.max(50, Math.ceil(brut / 50) * 50) : Math.max(1, Math.ceil(brut));
    choix.push({ nom, unite, q, plats, aide });
    for (let i = reste.length - 1; i >= 0; i--) if (!reste[i].m.size) reste.splice(i, 1);
  }
  return choix;
}
async function stockAnalyser(corps, sorte) {
  const d = $("dialogue");
  d.innerHTML = `<div class="feuille"><h2 id="dialogueTitre">${icone("sparkle")} L'IA lit${sorte === "ticket" ? " le ticket" : sorte === "photo" ? " la photo" : " ta liste"}…</h2>
    <p class="discret" role="status">Les produits, leurs quantités, et l'ingrédient de l'appli qui va avec. Tu vérifies ensuite.</p></div>`;
  d.returnValue = ""; if (!d.open) d.showModal();
  let rep;
  try {
    const r = await fetch("/api/stock/analyser", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corps, sorte }) });
    rep = await r.json();
    if (!r.ok) { d.close("non"); return dire(rep.erreur || "L'IA n'a pas pu lire."); }
  } catch (e) { d.close("non"); return dire("L'appli ne répond pas."); }
  stockVerifier(rep.items, sorte);
}
function stockVerifier(items, sorte) {
  const d = $("dialogue");
  const unites = [["g", "g"], ["ml", "ml"], ["pièce", "pièce(s)"]];
  d.innerHTML = `<form class="feuille formulaire" novalidate>
    <h2 id="dialogueTitre">Vérifie avant d'ajouter</h2>
    <p class="petit discret" style="margin:-4px 0 10px">${items.length > 1 ? `${items.length} produits lus` : `${items.length} produit lu`}. Décoche ce qui n'est pas à toi, corrige une quantité.</p>
    <ul class="stock-verifs">${items.map((x, k) => `<li>
      <input type="checkbox" checked data-k="${k}" data-champ="garde" aria-label="Ajouter ${esc(x.nom)}">
      <span class="sv-nom"><input type="text" value="${esc(x.nom)}" data-k="${k}" data-champ="nom" aria-label="Produit">
        <small>${x.connu ? (x.lu && x.lu.toLowerCase() !== x.nom.toLowerCase() ? `lu : « ${esc(x.lu)} »` : "") : "pas dans tes recettes : gardé tel quel"}</small></span>
      <input type="number" inputmode="decimal" min="0" step="any" value="${x.quantite}" data-k="${k}" data-champ="quantite" aria-label="Quantité">
      <select data-k="${k}" data-champ="unite" aria-label="Unité">${unites.map(([v, t]) => `<option value="${v}"${v === x.unite ? " selected" : ""}>${t}</option>`).join("")}</select></li>`).join("")}</ul>
    <small id="eStock" class="erreur" role="alert" style="display:block;color:var(--critique)"></small>
    <div class="actions pied"><button class="bouton second" type="button" value="non">Annuler</button><button class="bouton" type="submit">Ajouter au stock</button></div></form>`;
  d.querySelectorAll("[data-champ]").forEach(c => c.addEventListener("change", () => {
    const x = items[Number(c.dataset.k)];
    x[c.dataset.champ] = c.type === "checkbox" ? c.checked : c.dataset.champ === "quantite" ? Number(c.value) || 0 : c.value.trim();
    c.closest("li").classList.toggle("retire", x.garde === false); }));
  d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
  d.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault(); ev.stopPropagation();
    const gardes = items.filter(x => x.garde !== false && x.quantite > 0 && x.nom);
    if (!gardes.length) { $("eStock").textContent = "Rien à ajouter : coche au moins un produit."; return; }
    const ok = await appel("/api/stock/ajouter", { items: gardes, sorte });
    if (ok === true) { d.close("oui"); rendre(); dire(`${gardes.length > 1 ? `${gardes.length} produits ajoutés` : `${gardes.length} produit ajouté`} au stock.`); }
    else $("eStock").textContent = (ok && ok.erreur) || "Pas ajouté, réessaie.";
  });
  if (!d.open) d.showModal();
}
function vueStock() {
  if (enSuivi()) return vueStockMaison(arguments[0] || {});
  barre("");
  const lignes = E.stock.filter(l => l.nom.toLowerCase().includes(filtreStock.toLowerCase()));
  return `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}
  <div class="titre"><h1 tabindex="-1">Stock</h1>
    <p>Il monte quand tu dis qu'une commande est payée, et baisse quand tu dis qu'un plat est cuisiné.</p></div>
  ${!E.stock.length ? vide("Le stock est vide", "Il se remplira à ta prochaine commande payée.", "#/courses", "Voir les courses") : `
  <div class="champ formulaire"><label for="filtre">Chercher un produit</label>
    <input id="filtre" name="filtre" type="search" autocomplete="off" placeholder="Riz, lait…" value="${esc(filtreStock)}"></div>
  <div class="stock">${lignes.map(l => `<div class="stock-ligne"><span>${esc(l.nom)}</span>
      <input type="number" inputmode="decimal" min="0" step="any" name="quantite" autocomplete="off" value="${l.quantite}"
        data-nom="${esc(l.nom)}" data-unite="${esc(l.unite)}" aria-label="Quantité de ${esc(l.nom)}, en ${esc(l.unite)}">
      <span class="u">${esc(l.unite)}</span></div>`).join("") || `<p class="discret">Aucun produit ne correspond.</p>`}</div>
  <p class="petit discret" style="margin-top:18px">Corrige une quantité si elle est fausse. Mets 0 pour retirer le produit.</p>`}`;
}
/* ------------------------------------------------------------ mode flemmard : ce que je mange */
const MOMENTS_REPAS = [["pdj", "Matin"], ["dej", "Midi"], ["col", "Collation"], ["din", "Soir"]];
const isoPlus = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dateLongueCourte = iso => new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso + "T12:00"));
function jaugesDuJour(j, o, mange = null) {
  // Les chiffres sont ceux du PRÉVU ; aujourd'hui, la barre montre en gris le prévu et en vert, pour illustrer,
  // ce qui est déjà mangé (Taha, 20/11/2026 : « la barre verte c'est juste pour illustration »).
  const jauge = (nom, prevu, but, unite) => {
    const pctP = but ? Math.min(100, Math.round(100 * prevu / but)) : 0;
    return `<div class="jauge"><div><span>${nom === "Calories" ? "Calories prévues" : "Protéines prévues"}</span><b class="chiffres">${nombre(Math.round(prevu))}<small>${but ? ` / ${nombre(but)}` : ""} ${unite}</small></b></div>
      <span class="piste" role="img" aria-label="${pctP} % de l'objectif"><i style="width:${pctP}%"></i></span></div>`; };
  return `<div class="m-resume">${jauge("Calories", j.kcal, o.kcal, "kcal")}${jauge("Protéines", j.prot, o.prot, "g")}</div>`;
}
function ligneRepasNote(e) {
  return `<button type="button" class="ligne-note" data-action="ouvrirRepas" data-id="${e.id}">
    <span><small>${(MOMENTS_REPAS.find(([m]) => m === e.moment) || [, ""])[1]}</small><b>${esc(e.nom)}</b>
      <small class="chiffres">${esc(e.items.map(i => i.nom).join(", ")).slice(0, 90)}</small></span>
    <span class="q chiffres">${nombre(Math.round(e.kcal))} kcal<small>${nombre(Math.round(e.prot))} g prot.</small></span></button>`;
}
function semainePourDate(date) {
  // La semaine composée (et le jour) qui contient cette date : en mode flemmard, demain peut être dans la semaine suivante.
  const liste = E.mois ? E.mois.semaines.map((s, k) => [k === E.mois.rang ? E.semaine : s, k]) : [[E.semaine, 0]];
  for (const [s, k] of liste) {
    if (!s || !s.debut) continue;
    const n = Math.round((new Date(date + "T12:00") - new Date(s.debut + "T12:00")) / 864e5);
    if (n >= 0 && n < 7) return { s, k, n };
  }
  return null;
}
function vueJourSuivi(params) {
  // Mode flemmard : aujourd'hui et demain, les plats prévus (changer, rééquilibrer, photos, repas fixes)
  // et ce que tu notes en plus ; ni courses ni menu à valider (Taha, 19/11/2026).
  barre("");
  // ?d=N : N jours après aujourd'hui, jusqu'au dernier jour d'une semaine composée (« › » à côté de « Demain »).
  // Le jour se calcule à J-1 (Taha, 20/11/2026) : plus de menus visibles au-delà de demain.
  // ?d=-1, -2… : les jours d'avant, jusqu'à une semaine, pour changer un repas ou sa quantité (Taha, 21/11/2026).
  const J = E.journal_repas, dmax = 1, dmin = -7;
  const dec = params.get("d") === "demain" ? 1 : Math.min(dmax, Math.max(dmin, parseInt(params.get("d"), 10) || 0));
  const demain = dec === 1, date = dec ? isoPlus(dec) : J.aujourdhui;
  const nomJour = new Intl.DateTimeFormat(LOCALE, { weekday: "long" }).format(new Date(date + "T12:00")).replace(/^./, c => c.toUpperCase());
  const bulle = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric" }).format(new Date(date + "T12:00")).replace(/^./, c => c.toUpperCase());
  const j = J.jours.find(x => x.date === date) || { entrees: [], repas: [], kcal: 0, prot: 0, gluc: 0, lip: 0, reste: { kcal: J.objectif.kcal, prot: J.objectif.prot } };
  // Aujourd'hui, la barre illustre aussi ce qui est déjà mangé ; les chiffres restent ceux du prévu (Taha, 20/11/2026).
  const mangeJour = dec === 0 && E.avancement ? E.avancement.jour : null;
  const o = J.objectif, r = j.reste || {}, ici = semainePourDate(date);
  const m = E.mois, courante = ici && (!m || ici.k === m.rang);
  const reste = r.kcal > 0 ? `Il te reste <b>${nombre(r.kcal)} kcal</b>${r.prot > 0 ? ` et <b>${nombre(r.prot)} g de protéines</b>` : ", protéines atteintes"}.`
    : `Objectif de calories atteint${r.kcal < -100 ? ` (+${nombre(-r.kcal)} kcal)` : ""}${r.prot > 0 ? `, il manque ${nombre(r.prot)} g de protéines` : ""}.`;
  const jp = ici ? ici.s.jours[ici.n] : null;
  // « Pour finir la journée » se calcule à la demande, pour chaque jour (28/11/2026 : dans /api/etat, c'était 45 % du
  // calcul de chaque action) ; gardé tant que la journée ne change pas (mêmes totaux, mêmes notes, même objectif).
  const jourJ = (J.jours || []).find(x => x.date === date);
  const cleIdees = JSON.stringify([typeof M !== "undefined" && M ? M.uid : "", jourJ ? [jourJ.kcal, jourJ.prot, (jourJ.entrees || []).length, (jourJ.repas || []).length] : null, o.kcal, o.prot]);
  if (!IDEES_JOUR[date] || IDEES_JOUR[date].cle !== cleIdees) {
    IDEES_JOUR[date] = { cle: cleIdees, idees: null };
    const ici_ = location.hash;
    fetch(`/api/repas/idees?date=${date}`).then(r => r.ok ? r.json() : null).then(rep => {
      const c = IDEES_JOUR[date];
      if (!rep || !c || c.cle !== cleIdees || !rep.idees) return;
      c.idees = rep.idees;
      if (location.hash === ici_ && route().vue === "semaine" && !document.querySelector("#dialogue[open]")) rendre();
    }).catch(() => {});
  }
  const autres = IDEES_AUTRES[date] && IDEES_AUTRES[date].etat === E ? IDEES_AUTRES[date] : null;
  const idees = autres ? autres.idees : IDEES_JOUR[date].idees;
  // « Ajouter un repas » : une case de la grille en pointillés, un + au centre, comme un repas retiré (Taha, 22/11/2026).
  const tuileAjout = `<button type="button" class="exo ajout-tuile" data-action="noterRepas" data-date="${date}" aria-label="Ajouter un repas : un de tes plats, une description, une photo ou un ticket"><span class="at-rond">${icone("plus")}</span><b>Ajouter un repas</b><small>Plat, photo ou ticket</small></button>`;
  apresRendu.push(() => document.querySelectorAll("[data-idee]").forEach(b => b.addEventListener("click", () => {
    const x = idees.plats[Number(b.dataset.idee)];
    apercuChangement(idees.semaine, { ...x.operation, regler_plat: true }, `Ajouter « ${x.nom} » ?`);
  })));
  const navJours = `<nav class="jours jours-suivi" aria-label="Jour">${dec > dmin ? `<a class="fleche" href="#/semaine?d=${Math.min(dec, 0) - 1}" aria-label="Jour d'avant">${icone("caret-left")}</a>` : ""}
      ${dec < 0 ? `<a href="#/semaine?d=${dec}" aria-current="true">${dec === -1 ? "Hier" : esc(bulle)}</a>` : ""}
      ${dec < -1 ? `<a class="fleche" href="#/semaine?d=${dec + 1}" aria-label="Jour suivant">${icone("caret-right")}</a>` : ""}
      <a href="#/semaine"${dec ? "" : ' aria-current="true"'}>Aujourd'hui</a>
      <a href="#/semaine?d=1"${demain ? ' aria-current="true"' : ""}>Demain</a></nav>`;
  // En famille, « Tous » : les doses de chacun pour ce jour, plat par plat (Taha, 27/11/2026).
  if (VUE_TOUS && enFamille() && membresDeLaFamille().length > 1) return `<div class="rubrique-jour"><div class="m-tete">
      <div><h1 tabindex="-1">${dec === 0 ? "Aujourd'hui" : demain ? "Demain" : dec === -1 ? "Hier" : esc(nomJour)}</h1><p class="petit discret">${esc(dateLongueCourte(date))}</p></div></div>
    ${navJours}
    ${choixProfils()}
    <div class="doses">${vueDoses(date)}</div></div>`;
  return `<div class="rubrique-jour"><div class="m-tete">
      <div><h1 tabindex="-1">${dec === 0 ? "Aujourd'hui" : demain ? "Demain" : dec === -1 ? "Hier" : esc(nomJour)}</h1><p class="petit discret">${esc(dateLongueCourte(date))}</p></div>
      <div class="ligne-boutons"><a class="bouton sobre rond" href="#/historique" aria-label="Historique des repas">${icone("notebook")}</a>
</div>
    </div>
    ${navJours}
    ${choixProfils()}
    ${dec === 1 ? `<p class="petit discret" style="margin:-2px 0 12px">Provisoire : les quantités de demain se règlent demain matin, d'après ce que tu auras vraiment mangé aujourd'hui.</p>` : ""}
    ${dec === 0 ? alerteFamille() : ""}
    ${dec === 0 ? carteAccueil() : ""}
    ${dec === 0 ? carteObjectifSemaine() : ""}
    ${jaugesDuJour(j, o, mangeJour)}
    <p class="reste-jour">${reste}</p>
    ${(E.a_finir || []).length && dec === 0 ? `<a class="rappel" href="#/stock">${icone("warning-circle")}<span>À finir : ${esc(E.a_finir.slice(0, 3).map(x => x.nom).join(", "))}${E.a_finir.length > 3 ? "…" : ""}</span>${icone("caret-right")}</a>` : ""}
    ${(E.vitamines_a_completer || []).length && dec === 0 ? `<a class="rappel" href="#/vitamines?completer=1">${icone("warning-circle")}<span>${E.vitamines_a_completer.length > 1 ? `${E.vitamines_a_completer.length} aliments` : `${E.vitamines_a_completer.length} aliment`} sans vitamines : complète-les</span>${icone("caret-right")}</a>` : ""}
    ${E.eau && dec === 0 ? (() => {
      // L'eau : un seul bouton, coché = l'objectif du jour est bu (Taha, 21/11/2026 : « juste un bouton check »).
      const fait = eauCochee(date);
      return `<div class="eau" title="${esc(E.eau.selon)}">${icone("goutte")}<span class="eau-txt">Eau <small class="chiffres">${virgule(E.eau.litres)} L</small></span>
        <button type="button" class="eau-check" id="eauCheck" data-date="${date}" aria-pressed="${fait}" aria-label="${virgule(E.eau.litres)} L d'eau bus aujourd'hui">${icone("check")}</button></div>`; })() : ""}
    ${o.gluc || o.lip ? `<p class="petit discret chiffres" style="margin:-4px 0 12px">Glucides ${nombre(Math.round(j.gluc || 0))}${o.gluc ? ` / ${nombre(o.gluc)}` : ""} g · Lipides ${nombre(Math.round(j.lip || 0))}${o.lip ? ` / ${nombre(o.lip)}` : ""} g</p>` : ""}
    ${ici && (!m || ici.k >= m.rang) ? `<section class="m-repas grille-plats" aria-label="Les plats prévus">${repasDuJour(ici.s, ici.k, ici.n, true, true, false, true, tuileAjout)}</section>`
      : dec < 0 && (j.repas || []).length ? `<section class="grille-plats histo-plats" aria-label="Les plats de ce jour"><div class="exos">${j.repas.map(x => platDHistorique(x, date)).join("")}${tuileAjout}</div></section>`
      : `${dec < 0 ? `<div class="dujour"><strong>Pas de menu ce jour-là.</strong> Ajoute ce que tu as mangé.</div>`
      : `<div class="dujour"><strong>Pas de menu prévu ce jour-là.</strong> Note ce que tu manges, ou compose la suite.
        <p style="margin-top:8px"><button class="bouton second" data-action="suivante">Composer la suite</button></p></div>`}
        <section class="grille-plats" aria-label="Ajouter"><div class="exos">${tuileAjout}</div></section>`}
    ${(E.stock || []).length && E.manque_jours && E.manque_jours[date] ? (E.manque_jours[date].length
      ? `<button type="button" class="manque-jour" data-manque-jour="${date}">${icone("shopping-cart-simple")}<span>${E.manque_jours[date].length > 1 ? `${E.manque_jours[date].length} ingrédients manquants` : `${E.manque_jours[date].length} ingrédient manquant`}</span>${icone("caret-right")}</button>`
      : `<p class="manque-jour complet">${icone("check")}Tu as tout en stock pour les repas de ce jour.</p>`) : ""}
    ${j.entrees.length ? `<h2 class="titre-section">En plus</h2><div class="liste-notes">${j.entrees.map(ligneRepasNote).join("")}</div>` : ""}
    </div>
    <div class="rubrique-fin">
    ${idees && idees.plats.length ? `<details class="bloc idees idees-ligne"${autres ? " open" : ""}><summary><span><b>Pour finir la journée</b><small><span>${idees.plats.length > 1 ? `${idees.plats.length} idées` : `${idees.plats.length} idée`}</span> <span>${idees.moment.startsWith("col") ? "en collation" : `pour le ${nomMoment(idees.moment)}`}</span>, <span>${idees.plats.length > 1 ? "réglées sur ton objectif" : "réglée sur ton objectif"}</span></small></span>${icone("caret-right")}</summary>
      <ul class="rp-liste">${idees.plats.map((x, i) => `<li><button type="button" class="rp-plat" data-idee="${i}">${photo(recette(x.id), 120, "carre")}
        <span class="rp-texte"><b>${esc(x.nom)}</b>${macrosLigne(x.kcal, x.prot)}</span>
        ${o.kcal && Math.abs(x.kcal_jour - o.kcal) <= o.kcal * 0.05 && x.prot_jour >= o.prot * 0.95 ? `<span class="rp-tient" title="Ta journée tient l'objectif">${icone("check")}</span>` : ""}</button></li>`).join("")}</ul>
      <button type="button" class="idees-autres" data-idees-autres="${date}">${icone("arrows-clockwise")}3 autres idées</button></details>` : ""}
    ${ici && courante && !jp.retire && ici.n <= rangDuJour(ici.s) && (jp.cuisine.some(c => !fait(ici.s, ici.n, c.id)) || (jp.dej_reste && !fait(ici.s, ici.n, jp.dej))) ? `<div class="m-actions bas">
      <button class="bouton second" data-action="journee" data-jour="${ici.n}">${icone("check")}Tout mangé</button></div>` : ""}</div>`;
}
// « 3 autres idées » (Taha, 27/11/2026) : de nouvelles propositions, sans celles déjà vues ; au bout, on repart du début.
const IDEES_AUTRES = {};
const IDEES_JOUR = {};                                     // date -> {cle, idees} : « Pour finir la journée », à la demande
document.addEventListener("click", async ev => {
  const b = ev.target.closest && ev.target.closest("[data-idees-autres]");
  if (!b) return;
  const date = b.dataset.ideesAutres, J = E.journal_repas, etat = E;
  const avant = IDEES_AUTRES[date] && IDEES_AUTRES[date].etat === E ? IDEES_AUTRES[date] : null;
  const montrees = avant ? avant.idees : (IDEES_JOUR[date] || {}).idees;
  const vus = [...new Set([...(avant ? avant.vus : []), ...((montrees && montrees.plats) || []).map(x => x.id)])];
  b.disabled = true; b.classList.add("tourne");
  let rep = null;
  try { const r = await fetch(`/api/repas/idees?date=${date}&sauf=${vus.join(",")}`); rep = r.ok ? await r.json() : null; } catch (e) {}
  if (etat !== E) return;
  if (!rep || !rep.idees || !rep.idees.plats.length) {
    let encore = null;                        // tout a été vu : on repart des premières
    try { const r = await fetch(`/api/repas/idees?date=${date}`); encore = r.ok ? await r.json() : null; } catch (e) {}
    if (etat !== E) return;
    if (!encore || !encore.idees) { b.disabled = false; b.classList.remove("tourne"); return dire("Pas d'autre idée pour ce jour."); }
    IDEES_AUTRES[date] = { etat: E, idees: encore.idees, vus: [] };
  } else IDEES_AUTRES[date] = { etat: E, idees: rep.idees, vus };
  rendre();
});
// Un plat de l'historique, en carte comme sur l'écran Jour : le toucher ouvre sa carte avec les chiffres de CE jour-là.
function platDHistorique(x, date) {
  const r = recette(x.id), place = x.moment.startsWith("col") ? (x.au_repas || "col") : x.moment;
  const quand = (MOMENTS_REPAS.find(([m]) => m === place) || [, "Collation"])[1];
  const texte = `<div class="exo-texte"><div class="quand">${quand}</div><h3>${esc(x.nom)}</h3>
    <div class="chiffres">${nombre(x.kcal)} kcal, ${nombre(x.prot)} g de protéines${x.ajustes ? " · quantités ajustées ce jour" : ""}</div></div>`;
  if (!r) return `<div class="exo repas-ligne"><div class="repas">${photo({}, 480)}${texte}</div></div>`;     // plat supprimé depuis
  // ?date=&moment= : sur ordinateur, la fiche du plat garde le jour pour « Voir la recette » (la version de ce jour-là).
  return `<div class="exo repas-ligne"><a class="repas" href="#/plat/${x.id}?date=${date}&moment=${encodeURIComponent(x.moment)}" data-date="${date}" data-moment-vu="${esc(x.moment)}" data-kcal="${x.kcal}" data-prot="${x.prot}" data-gluc="${x.gluc || 0}"
    data-lip="${x.lip || 0}" data-quand="${esc(`${quand} · ${dateLongueCourte(date)}`)}">${photo(r, 480)}${texte}</a>
    ${date < E.journal_repas.aujourdhui && semainePourDate(E.journal_repas.aujourdhui) ? `<button type="button" class="histo-manger" data-action="mangerAujourdhui" data-plat="${x.id}" data-moment="${esc(place)}" data-date="${date}" data-vu="${esc(x.moment)}">Manger aujourd'hui</button>` : ""}</div>`;
}
// « Manger aujourd'hui » sur un plat de l'historique (Taha, 21/11/2026) : au même repas aujourd'hui s'il n'est pas
// encore mangé (le plat prévu est remplacé), sinon en plus ; l'aperçu montre ce que ça change avant d'enregistrer.
function mangerAujourdhui(id, moment, date = "", momentVu = "") {
  const ici = semainePourDate(E.journal_repas.aujourdhui), r = recette(id);
  if (!ici || !r) return dire("Pas de menu aujourd'hui.");
  // Taha, 22/11/2026 : « ça a remplacé un repas » → le plat s'AJOUTE à la journée (au même repas), rien n'est retiré ;
  // seulement un repas vide (« rien ») est rempli.
  const jp = ici.s.jours[ici.n], place = ["pdj", "dej", "din"].includes(moment) ? moment : null;
  const vide = place && !(place === "dej" && jp.dej_reste) && jp[place] === "rien";
  // L'assiette de ce jour-là, pas la recette de base : ses quantités réglées et sa taille (Taha, 28/11/2026 : le bol
  // au kaki, sans miel).
  const x = date ? repasDuJournal(date, id, momentVu) : null;
  const pareil = x && x.ajustes ? { quantites: x.ajustes, taille: x.taille || 1 } : {};
  const op = vide ? { type: "changer", jour: ici.n, moment: place, plat: id, ...pareil }
    : { type: "ajouter", jour: ici.n, plat: id, ...(place ? { moment: place } : {}), ...pareil };
  apercuChangement(ici.k, op, `Ajouter « ${x && x.ajustes && x.nom ? x.nom : r.nom} » aujourd'hui ?`);
}
const calVitamines = { ouvert: false, mois: "", date: "" };      // le calendrier des Vitamines, ouvert ou non
const eauCochee = date => !!(E.eau && ((E.eau.bu || {})[date] || 0) >= E.eau.litres - 0.001);
function vueHistorique() {
  barre("");
  const J = E.journal_repas, o = J.objectif;
  const passes = J.jours.filter(j => j.date < J.aujourdhui && (j.entrees.length || (j.repas || []).length));
  const pct = (v, b) => b ? Math.min(100, Math.round(100 * v / b)) : 0;
  return `<a class="retour" href="#/semaine">${icone("caret-left")}Aujourd'hui</a>
  <div class="titre"><h1 tabindex="-1">Historique</h1><p>Ce que tu as mangé jour après jour, comparé à ton objectif de ${nombre(o.kcal)} kcal et ${o.prot} g de protéines.</p></div>
  ${passes.length ? `<div class="historique-jours">${passes.map(j => `<details class="jour-histo">
      <summary><span><b>${esc(new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" }).format(new Date(j.date + "T12:00")).replace(/^./, c => c.toUpperCase()))}</b>
        <small>${[j.repas && j.repas.length ? (j.repas.length > 1 ? `${j.repas.length} plats prévus` : "1 plat prévu") : "",
          j.entrees.length ? (j.entrees.length > 1 ? `${j.entrees.length} notés en plus` : "1 noté en plus") : ""].filter(Boolean).join(" · ")}</small>
        ${E.eau ? `<small class="histo-eau${eauCochee(j.date) ? " coche" : ""}">${icone("goutte")}${virgule((E.eau.bu || {})[j.date] || 0)} L${eauCochee(j.date) ? ` ${icone("check")}` : " · pas coché"}</small>` : ""}</span>
        <span class="chiffres histo-chiffres"><span>${nombre(Math.round(j.kcal))} kcal <i class="mini-piste"><i style="width:${pct(j.kcal, o.kcal)}%"></i></i></span>
          <span>${nombre(Math.round(j.prot))} g <i class="mini-piste"><i style="width:${pct(j.prot, o.prot)}%"></i></i></span></span>${icone("caret-right")}</summary>
      ${(j.repas || []).length ? `<section class="grille-plats histo-plats" aria-label="Les plats de ce jour"><div class="exos">${j.repas.map(x => platDHistorique(x, j.date)).join("")}</div></section>` : ""}
      ${j.entrees.length ? `<div class="liste-notes" style="margin-top:8px">${j.entrees.map(ligneRepasNote).join("")}</div>` : ""}
      <p class="actions" style="margin-top:8px"><button class="bouton sobre" data-action="noterRepas" data-date="${j.date}">${icone("cooking-pot")}Ajouter un repas ce jour-là</button></p>
    </details>`).join("")}</div>` : `<p class="discret">Rien pour l'instant : les jours apparaissent ici dès que tu notes tes repas.</p>`}`;
}
async function photoReduite(fichier, max = 1600) {
  // L'iPhone donne des photos de plusieurs Mo : on les réduit (1600 px, JPEG) avant l'envoi.
  const url = await new Promise((ok, ko) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = ko; l.readAsDataURL(fichier); });
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
  const echelle = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * echelle); c.height = Math.round(img.naturalHeight * echelle);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}
// L'IA travaille (Taha, 27/11/2026 : « c'est sur 2 lignes et c'est moche ») : une petite carte centrée, le titre sur
// une ligne, ce qu'on a écrit sur une ligne, trois étapes qui s'allument l'une après l'autre, et Annuler.
function attenteIA(d, { titre = "L'IA calcule", sujet = "", etapes = ["Aliments", "Grammes", "Macros"], annuler } = {}) {
  d.innerHTML = `<div class="ia-att" role="status" aria-live="polite">
    <div class="ia-orbe" aria-hidden="true"><i></i>${icone("sparkle")}</div>
    <h2 id="dialogueTitre">${esc(titre)}<span class="ia-points" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></h2>
    ${sujet ? `<p class="ia-sujet">${esc(sujet)}</p>` : ""}
    <ol class="ia-etapes">${etapes.map((e, i) => `<li${i ? "" : ' class="en-cours"'}>${esc(e)}</li>`).join("")}</ol>
    <p class="ia-lent" hidden>Encore un instant : garde l'appli ouverte.</p>
    <button type="button" class="lien ia-annuler">Annuler</button></div>`;
  if (!d.open) d.showModal();
  const zone = d.querySelector(".ia-att"), lis = [...zone.querySelectorAll(".ia-etapes li")];
  const avancer = k => lis.forEach((li, i) => { li.classList.toggle("fait", i < k); li.classList.toggle("en-cours", i === k); });
  const minuteurs = [setTimeout(() => avancer(1), 2600), setTimeout(() => avancer(2), 7000),
    setTimeout(() => { const l = zone.querySelector(".ia-lent"); if (l) l.hidden = false; }, 20000)];
  const fin = () => minuteurs.forEach(clearTimeout);
  zone.querySelector(".ia-annuler").addEventListener("click", () => { fin(); annuler ? annuler() : d.close("non"); });
  return { fin };
}

function noterRepas({ date, entree = null, remplacer = null }) {
  // 1. décrire (texte, photo, chiffres) ; 2. vérifier ce que Claude a compris, corriger, enregistrer.
  // remplacer = { texte, place, k, operation(plat), titre(nom), retour(), main() } : le champ IA de « Remplacer un plat »
  // (Taha, 21/11/2026) ; l'IA calcule tout de suite, puis le plat créé passe par l'aperçu du changement.
  const d = $("dialogue"), heure = new Date().getHours();
  let moment = remplacer ? remplacer.place : entree ? entree.moment : heure < 11 ? "pdj" : heure < 15 ? "dej" : heure < 18 ? "col" : "din";
  let photoJointe = null, texte = remplacer ? remplacer.texte : "", photoPlat;      // photoPlat : la photo qui deviendra celle du plat
  let recetteVue = null;                           // une recette vue en ligne : ses étapes et son lien suivent jusqu'au plat
  // Un nouveau repas : plus de Matin / Midi / Soir à choisir, l'IA le dit d'après le plat (Taha, 21/11/2026).
  // Ils restent pour changer un repas déjà noté.
  const puces = () => !entree ? "" : `<div class="gouts" role="group" aria-label="Repas">${MOMENTS_REPAS.map(([m, nom]) => `<button type="button" data-moment="${m}" aria-pressed="${m === moment}">${nom}</button>`).join("")}</div>`;
  const brancherPuces = () => d.querySelectorAll("[data-moment]").forEach(b => b.addEventListener("click", () => {
    moment = b.dataset.moment; d.querySelectorAll("[data-moment]").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
  // Taper le nom d'un plat de ta base le retrouve (Taha, 19/11/2026) : sans accents, « oe » pour « œ »,
  // début de mot suffisant (« crep nut »), petits mots ignorés, pluriels comme singuliers.
  // Les fautes de frappe aussi (Taha, 27/11/2026), et les plats cachés (notés un autre jour) : voir scoreRecherche.
  const motsDe = motsRech;
  const tous = E.recettes.filter(r => (["plat", "petitdej", "collation"].includes(r.cat) || (r.cat === "fruit" && r.sec)) && !estExclu(r.id));
  const chercherPlats = t => {
    const mots = motsDe(t);
    if (!mots.length) return [];
    return tous.map(r => ({ r, score: scoreRecherche(r, mots, { part: mots.length === 1 ? 1 : 0.6 }), exact: nomExact(r, mots) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.exact - a.exact || b.score - a.score || (b.r.perso ? 1 : 0) - (a.r.perso ? 1 : 0) || a.r.nom.length - b.r.nom.length);
  };
  const proposerPlats = () => {
    // Un plat de ta base (les tiens d'abord) s'ajoute au menu du jour, avec sa photo et ses réglages ;
    // le reste (un kebab, un ticket…) est calculé par Claude puis devient un plat du menu.
    const mots = motsDe(texte);
    const trouves = mots.length ? chercherPlats(texte).slice(0, 6).map(x => x.r) : tous.filter(r => r.perso && !r.cache).slice(0, 6);
    const zone = $("nrPlats");
    if (!zone) return;
    const als = mots.length ? alimentsTrouves(texte, new Set(trouves.map(r => sansAcc(r.nom))), proposerPlats) : [];
    zone.innerHTML = (trouves.length ? `<p class="petit discret" style="margin:2px 0 6px">${mots.length ? "Un de ces plats ?" : "Tes plats"}</p>
      <ul class="candidats">${trouves.map(r => `<li><button type="button" class="candidat" data-plat-connu="${r.id}">${photo(r, 160, "carre")}
        <span class="texte"><b>${esc(r.nom)}</b><span class="chiffres">${nombre(r.kcal)} kcal, ${nombre(r.prot)} g de protéines</span>
        <small class="discret ing-courts">${esc(ingredientsCourts(r))}</small></span>${icone("caret-right")}</button></li>`).join("")}</ul>` : "")
      + (als.length ? `<p class="petit discret" style="margin:10px 0 6px">Ou un aliment seul</p>
      <ul class="candidats">${als.map(a => `<li>${boutonAliment(a)}</li>`).join("")}</ul>` : "");
    zone.querySelectorAll("[data-plat-connu]").forEach(b => b.addEventListener("click", () => ajouterPlatConnu(recette(b.dataset.platConnu))));
    zone.querySelectorAll("[data-aliment]").forEach(b => b.addEventListener("click", () => {
      const a = (ALIMENTS.liste || []).find(x => x.nom === b.dataset.aliment);
      if (a) verifier({ nom: a.nom, items: [itemAliment(a)], remarque: "" });
    }));
  };
  // Un plat de ta base : son repas vient de son type ; un plat de midi ou du soir va au repas encore libre, sinon selon l'heure.
  const momentDuPlat = r => {
    if (r.cat === "petitdej") return "pdj";
    if (r.cat !== "plat") return "col";
    const ici = semainePourDate(date), jp = ici && ici.s.jours[ici.n];
    const pref = date === E.journal_repas.aujourdhui && heure >= 15 ? "din" : "dej", autre = pref === "dej" ? "din" : "dej";
    const vide = m => !!jp && jp[m] === "rien" && !(m === "dej" && jp.dej_reste);
    return !vide(pref) && vide(autre) ? autre : pref;
  };
  const ajouterPlatConnu = r => {
    moment = momentDuPlat(r);
    const ici = semainePourDate(date);
    if (ici) {                                       // dans le menu du jour : au repas choisi s'il est vide, sinon en collation
      const jp = ici.s.jours[ici.n], libre = moment !== "col" && jp[moment] === "rien" && !(moment === "dej" && jp.dej_reste);
      const op = libre ? { type: "changer", jour: ici.n, moment, plat: r.id } : { type: "ajouter", jour: ici.n, plat: r.id, ...(moment !== "col" ? { moment } : {}) };
      return apercuChangement(ici.k, op, `Ajouter « ${r.nom} » ?`, saisie);
    }
    verifier({ nom: r.nom, items: [{ nom: r.nom, g: null, pour100: null, kcal: r.kcal, prot: r.prot, gluc: r.gluc || 0, lip: r.lip || 0, fib: r.fib || 0, source: "tes plats" }], remarque: "" });
  };
  const choixRestaurant = R => {
    d.innerHTML = `<div class="feuille resto">
      <h2 id="dialogueTitre">Au restaurant</h2>
      <p class="petit resto-reste">Pour ce repas, il te reste <b class="chiffres">≈ ${nombre(R.reste.kcal)} kcal</b> et <b class="chiffres">${nombre(R.reste.prot)} g</b> de protéines.</p>
      <ul class="candidats resto-plats">${R.plats.map((x, k) => `<li><button type="button" class="candidat resto-plat" data-resto="${k}">
        <span class="resto-rang chiffres" aria-hidden="true">${k + 1}</span>
        <span class="texte"><b>${esc(x.nom)}</b><span class="chiffres aliment-chiffres"><span>≈ ${nombre(x.kcal)} kcal</span><span>${nombre(x.prot)} g de protéines</span></span>
          ${x.pourquoi ? `<small>${esc(x.pourquoi)}</small>` : ""}${x.conseil ? `<small class="resto-conseil">${esc(x.conseil)}</small>` : ""}</span>${icone("caret-right")}</button></li>`).join("")}</ul>
      <p class="petit discret">Des estimations : les portions changent d'un restaurant à l'autre. Tu vérifies avant d'enregistrer.</p>
      <div class="actions pied"><button class="bouton second" type="button" data-resto-retour>Retour</button></div></div>`;
    d.querySelector("[data-resto-retour]").addEventListener("click", () => saisie());
    d.querySelectorAll("[data-resto]").forEach(b => b.addEventListener("click", () => {
      const x = R.plats[Number(b.dataset.resto)];
      verifier({ nom: x.nom, remarque: x.conseil || "", items: [{ nom: x.nom, g: null, pour100: null, kcal: x.kcal, prot: x.prot, gluc: x.gluc || 0,
        lip: x.lip || 0, fib: 0, source: "estimation au restaurant" }] });
    }));
    d.scrollTop = 0;
  };
  const saisie = () => {
    d.innerHTML = `<form class="feuille formulaire" novalidate>
      <h2 id="dialogueTitre">${date === E.journal_repas.aujourdhui ? "Ajouter" : esc(dateLongueCourte(date).replace(/^./, c => c.toUpperCase()))}</h2>
      ${puces()}
      <div class="champ champ-ia" style="margin-top:14px"><label for="nrTexte">Un plat, ou ce que tu as mangé, comme tu veux ${BADGE_IA}</label>
        <textarea id="nrTexte" rows="4" maxlength="300" placeholder="Ex. : 2 œufs, 70 g de pain pita et mon café Tassimo. Ou : un kebab frites. Ou : shake, 30 g de protéines, 150 kcal">${esc(texte)}</textarea>
        <small>Claude, l'IA, trouve les aliments, les grammes et les macros. Tes plats se retrouvent dès que tu tapes leur nom.</small></div>
      <div id="nrPlats" class="nr-plats"></div>
      <div class="photo-ajout">
        <label class="bouton second" for="nrPhoto">${icone("image")}${photoJointe ? "Changer la photo" : "Ajouter une photo"}</label>
        <input id="nrPhoto" type="file" accept="image/*" hidden>
        ${photoJointe ? "" : `<button type="button" class="bouton second" id="nrScan">${icone("barcode")}Scanner</button>`}
        ${photoJointe || E.claude === false ? "" : `<label class="bouton second" for="nrResto">${icone("couverts")}Au restaurant</label><input id="nrResto" type="file" accept="image/*" hidden>`}
        ${photoJointe ? `<img src="${photoJointe}" alt="Photo jointe" class="apercu-photo"><button type="button" class="lien" id="nrSansPhoto">Retirer la photo</button>` : `<small class="discret">Pas de balance ? Photographie ton assiette : l'IA estime les quantités. Ou une étiquette, un ticket.</small>`}
      </div>
      <small id="eNr" class="erreur" role="alert" style="display:block;margin-top:10px;color:var(--critique)"></small>
      <p class="petit" style="margin-top:10px"><button type="button" class="lien" id="nrMain">Entrer les chiffres moi-même</button></p>
      <div class="actions pied"><button class="bouton second" type="button" value="non">Annuler</button>
        <button class="bouton bouton-ia" type="submit">${icone("sparkle")}Calculer avec l'IA</button></div></form>`;
    brancherPuces();
    d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
    const proposerPlusTard = plusTard(proposerPlats);
    $("nrTexte").addEventListener("input", ev => { texte = ev.target.value; proposerPlusTard(); });
    proposerPlats();
    aliments();                                      // pour « Ou un aliment seul » dès la première lettre
    // Mode restaurant (Taha, 28/11/2026) : la photo de la carte → les 3 plats qui collent le mieux à ce qu'il reste pour ce
    // repas (moteur : conseils_restaurant, tâche « restaurant ») ; en toucher un ouvre la vérification, comme un repas décrit.
    if ($("nrResto")) $("nrResto").addEventListener("change", async ev => {
      const f = ev.target.files[0]; if (!f) return;
      let photoCarte;
      try { photoCarte = await photoReduite(f); } catch (e) { $("eNr").textContent = "Photo illisible."; return; }
      const precision = $("nrTexte").value.trim();
      let annule = false;
      const att = attenteIA(d, { titre: "L'IA lit la carte", sujet: "Au restaurant", etapes: ["La carte", "Ce qu'il te reste", "Les 3 meilleurs"],
        annuler: () => { annule = true; saisie(); } });
      try {
        const r = await fetch("/api/repas/restaurant", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photo: photoCarte, moment, date, ...(precision ? { texte: precision } : {}) }) });
        const rep = await r.json();
        att.fin();
        if (annule) return;
        if (!r.ok) { saisie(); $("eNr").textContent = rep.erreur || "L'IA n'a pas pu lire la carte."; return; }
        choixRestaurant(rep.restaurant);
      } catch (e) { att.fin(); if (!annule) { saisie(); $("eNr").textContent = "L'appli ne répond pas."; } }
    });
    // Un produit emballé par son code-barres (28/11/2026) : sa ligne à vérifier, comme un aliment seul.
    if ($("nrScan")) $("nrScan").addEventListener("click", () => scannerProduit("repas", { retour: saisie,
      suite: (al, lu) => verifier({ nom: al.nom, items: [{ ...itemAliment(al, lu), source: "code-barres" }], remarque: "" }) }));
    $("nrPhoto").addEventListener("change", async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try { photoJointe = await photoReduite(f); } catch (e) { $("eNr").textContent = "Photo illisible."; return; }
      photoPlat = undefined;
      saisie();
    });
    if ($("nrSansPhoto")) $("nrSansPhoto").addEventListener("click", () => { photoJointe = null; photoPlat = undefined; saisie(); });
    $("nrMain").addEventListener("click", () => verifier({ nom: texte.slice(0, 60), items: [{ nom: texte.slice(0, 60) || "Repas", g: null, pour100: null, kcal: 0, prot: 0, gluc: 0, lip: 0, fib: 0, source: "donné par toi" }], remarque: "" }, true));
    d.querySelector("form").addEventListener("submit", async ev => {
      ev.preventDefault(); ev.stopPropagation();
      texte = $("nrTexte").value.trim();
      if (!texte && !photoJointe) { $("eNr").textContent = "Écris ce que tu as mangé, ou ajoute une photo."; return; }
      const exact = !photoJointe && chercherPlats(texte).find(x => x.exact);
      if (exact) return ajouterPlatConnu(exact.r);              // le nom exact d'un de tes plats : pas besoin de Claude
      // Le nom d'un de tes aliments, avec ou sans quantité (« skyr nature 200 g », « 2 pommes ») : pas besoin de Claude non plus.
      const lu = !photoJointe && ALIMENTS.liste ? lireQuantite(texte) : null;
      const al = lu && ALIMENTS.liste.find(a => nomExact(a, motsRech(lu.nom)));
      if (al) return verifier({ nom: al.nom, items: [itemAliment(al, lu)], remarque: "" });
      let annule = false;
      const att = attenteIA(d, { sujet: texte || "Ta photo", annuler: () => { annule = true; saisie(); } });
      const erreur = m => { if (annule) return; saisie(); $("eNr").textContent = m; };
      try {
        const r = await fetch("/api/repas/analyser", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texte, photo: photoJointe, date, ...(date === E.journal_repas.aujourdhui ? { heure } : {}) }) });
        const rep = await r.json();
        att.fin();
        if (annule) return;
        if (!r.ok) return erreur(rep.erreur || "Claude n'a pas pu calculer.");
        moment = rep.proposition.moment || moment;
        verifier(rep.proposition, false, true);
      } catch (e) { att.fin(); erreur("L'appli ne répond pas."); }
    });
    if (!d.open) d.showModal();
    if (!TACTILE.matches) setTimeout(() => $("nrTexte") && $("nrTexte").focus(), 50);     // sur iPhone : jamais (clavier bloqué)
  };
  const verifier = (p, aLaMain = false, parIA = false) => {
    const items = p.items.map(i => ({ ...i }));
    // La photo de l'assiette devient celle du plat ; pas celle d'un ticket ou d'une étiquette.
    if (photoPlat === undefined) photoPlat = photoJointe && !items.some(i => /ticket|étiquette sur la photo/.test(i.source || "")) ? photoJointe : null;
    const deNouveau = () => verifier({ ...p, items, nom: $("nrNom").value }, aLaMain, parIA);
    const MAC = ["kcal", "prot", "gluc", "lip", "fib"];
    const journee = (() => {
      if (remplacer && remplacer.creer) return null;                  // un plat créé depuis le catalogue : pas un jour
      const ici = semainePourDate(date);
      if (!ici) return null;
      const j = ici.s.jours[ici.n], plus = enPlusDuJour(ici.s, ici.n);
      let kcal = (j.kcal || 0) + plus.kcal, prot = (j.prot || 0) + plus.prot;
      if (entree) { kcal -= (entree.items || []).reduce((t, x) => t + (Number(x.kcal) || 0), 0); prot -= (entree.items || []).reduce((t, x) => t + (Number(x.prot) || 0), 0); }
      if (remplacer && remplacer.avant) { kcal -= remplacer.avant.kcal; prot -= remplacer.avant.prot; }
      return { kcal, prot, obj: ici.s.objectif || {} };
    })();
    const recalc = i => { if (i.pour100 && i.g) MAC.forEach(m => { i[m] = Math.round(i.pour100[m] * i.g) / 100; }); };
    const somme = m => items.reduce((t, i) => t + (Number(i[m]) || 0), 0);
    const rendreListe = () => {
      $("nrItems").innerHTML = items.map((i, k) => `<li class="item-note">
        <input type="text" class="nr-nom" data-k="${k}" value="${esc(i.nom)}" aria-label="Aliment">
        ${i.g != null || i.pour100 ? `<label class="nr-g"><input type="text" inputmode="decimal" data-k="${k}" data-champ="g" value="${i.g == null ? "" : virgule(i.g)}" aria-label="Grammes de ${esc(i.nom)}"><span>g</span></label>` : ""}
        <span class="nr-chiffres">${["kcal", "prot", "gluc", "lip"].map(m => `<label><input type="text" inputmode="decimal" data-k="${k}" data-champ="${m}" value="${virgule(Math.round(i[m] * 10) / 10)}" ${i.pour100 && i.g ? "readonly" : ""}><span>${{ kcal: "kcal", prot: "prot.", gluc: "gluc.", lip: "lip." }[m]}</span></label>`).join("")}</span>
        <small class="discret">${esc(i.source || "")}${i.url ? ` · <a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">étiquette</a>` : ""}</small>
        <button type="button" class="effacer" data-retirer="${k}" aria-label="Retirer ${esc(i.nom)}">${icone("x")}</button></li>`).join("");
      // La journée avec ce repas (Taha, 22/11/2026 : « voir les macros générales comme l'autre page ») : ce jour-là
      // sans ce repas, plus ce qu'il apporte ; l'écart en petit dessous.
      if (journee) {
        const k = Math.round(somme("kcal")), pr = Math.round(somme("prot"));
        const tuile = (nom, base, plus, but, unite, bonSiPlus) => `<div><span>${nom}</span><b class="chiffres">${nombre(Math.round(base + plus))}${but ? `<small> / ${nombre(but)}</small>` : ""} ${unite}</b>${plus ? `<small class="ecart ${bonSiPlus ? "aj-bon" : ""}">${plus > 0 ? "+" : "−"}${nombre(Math.abs(plus))} ${unite}</small>` : ""}</div>`;
        $("nrJour").innerHTML = tuile("Calories du jour", journee.kcal, k, journee.obj.kcal, "kcal", false) + tuile("Protéines du jour", journee.prot, pr, journee.obj.prot, "g", true);
      } else $("nrJour").hidden = true;
      // Les macros du plat, en grand, comme sur la carte d'un plat (Taha, 20/11/2026)
      $("nrTotal").innerHTML = [["kcal", "", "kcal"], ["prot", " g", "prot."], ["gluc", " g", "gluc."], ["lip", " g", "lip."]]
        .map(([m, u, nom]) => `<div><b>${nombre(Math.round(somme(m)))}${u}</b><span>${nom}</span></div>`).join("");
      d.querySelectorAll("#nrItems input").forEach(inp => inp.addEventListener("change", () => {
        const i = items[Number(inp.dataset.k)];
        if (inp.classList.contains("nr-nom")) { i.nom = inp.value.trim() || i.nom; return; }
        const v = Number(inp.value.replace(",", "."));
        if (Number.isNaN(v) || v < 0) return rendreListe();
        if (inp.dataset.champ === "g") { i.g = v || null; recalc(i); }
        else { i[inp.dataset.champ] = v; i.pour100 = null; }
        rendreListe();
      }));
      d.querySelectorAll("[data-retirer]").forEach(b => b.addEventListener("click", () => { items.splice(Number(b.dataset.retirer), 1); rendreListe(); }));
    };
    d.innerHTML = `<form class="feuille formulaire" novalidate>
      <h2 id="dialogueTitre">${entree ? "Modifier ce repas" : aLaMain ? "Tes chiffres" : "Vérifie avant d'enregistrer"}</h2>
      ${puces()}
      ${p.remarque ? `<p class="dujour" style="margin-top:12px">${esc(p.remarque)}</p>` : ""}
      ${recetteVue && (recetteVue.etapes || []).length ? `<details class="nr-etapes"><summary>${icone("cooking-pot")}Les étapes (${recetteVue.etapes.length})${recetteVue.source && recetteVue.source.site ? `<small>d'après ${esc(recetteVue.source.site)}</small>` : ""}${icone("caret-right")}</summary>
        <ol>${recetteVue.etapes.map(e => `<li>${esc(e)}</li>`).join("")}</ol></details>` : ""}
      <div class="champ" style="margin-top:12px"><label for="nrNom">${remplacer && remplacer.creer ? "Nom du plat" : "Nom du repas"}</label><input id="nrNom" type="text" maxlength="80" value="${esc(p.nom || "")}"></div>
      <div class="aj-jour" id="nrJour" role="status"></div>
      <p class="petit discret nr-titre-macros">Les macros du plat</p>
      <div class="cp-chiffres nr-macros" id="nrTotal" aria-live="polite"></div>
      ${!aLaMain && E.claude !== false ? `<div class="champ champ-ia nr-repondre"><label for="nrCorrection">Répondre à Claude ${BADGE_IA}</label>
        <textarea id="nrCorrection" rows="2" maxlength="200" placeholder="Ex. : ajoute 20 g de whey · enlève la banane · vise 600 kcal et 40 g de protéines"></textarea>
        <button type="button" class="bouton second bouton-ia" id="nrCorriger">${icone("sparkle")}Corriger avec l'IA</button></div>` : ""}
      <ul class="lignes items-note" id="nrItems"></ul>
      <p style="margin:6px 0 0"><button type="button" class="lien" id="nrAjout">+ Ajouter un aliment</button></p>
      ${semainePourDate(date) ? `<div class="photo-ajout nr-photo-plat">
        ${photoPlat ? `<img src="${photoPlat}" alt="Photo du plat" class="apercu-photo">` : ""}
        <label class="bouton second" for="nrPhotoPlat">${icone("image")}${photoPlat ? "Changer la photo du plat" : "Prendre une photo du plat"}</label>
        <input id="nrPhotoPlat" type="file" accept="image/*" hidden>
        ${photoPlat ? `<button type="button" class="lien" id="nrSansPhotoPlat">Retirer la photo</button>` : `<small class="discret">Facultatif : sans photo, l'appli en trouve une.</small>`}</div>` : ""}
      <small id="eNr" class="erreur" role="alert" style="display:block;margin-top:8px;color:var(--critique)"></small>
      ${entree && semainePourDate(date) ? (quiIci(date) ? `<div class="nr-au-menu"><p class="petit discret">${icone("cooking-pot")}Mettre dans le menu du jour</p>
        <div class="actions"><button type="button" class="bouton second" id="nrAuMenu" data-qui="moi">Seulement moi</button><button type="button" class="bouton second" id="nrAuMenuTous" data-qui="tous">Toute la famille</button></div></div>`
        : `<p style="margin:10px 0 0"><button type="button" class="bouton second" id="nrAuMenu" style="width:100%">${icone("cooking-pot")}Mettre dans le menu du jour</button></p>`) : ""}
      ${!remplacer && !entree && semainePourDate(date) && quiIci(date) ? QUI_AIDE : ""}
      <div class="actions pied"${!remplacer && !entree && semainePourDate(date) && quiIci(date) ? ` style="flex-wrap:wrap"` : ""}>${entree ? `<button class="bouton second" type="button" id="nrSuppr">Supprimer</button>` : `<button class="bouton second" type="button" id="nrRetour">Retour</button>`}
        ${!remplacer && !entree && semainePourDate(date) && quiIci(date) ? boutonsQui()
          : `<button class="bouton" type="submit">${remplacer ? (remplacer.creer ? "Créer le plat" : "Continuer") : !entree && semainePourDate(date) ? "Ajouter au menu" : "Enregistrer"}</button>`}</div></form>`;
    brancherPuces();
    rendreListe();
    $("nrAjout").addEventListener("click", () => { items.push({ nom: "Aliment", g: null, pour100: null, kcal: 0, prot: 0, gluc: 0, lip: 0, fib: 0, source: "donné par toi" }); rendreListe(); });
    if ($("nrRetour")) $("nrRetour").addEventListener("click", () => remplacer ? remplacer.retour() : saisie());
    if ($("nrPhotoPlat")) $("nrPhotoPlat").addEventListener("change", async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try { photoPlat = await photoReduite(f); } catch (e) { $("eNr").textContent = "Photo illisible."; return; }
      deNouveau();
    });
    if ($("nrSansPhotoPlat")) $("nrSansPhotoPlat").addEventListener("click", () => { photoPlat = null; deNouveau(); });
    // Répondre à Claude : il refait la liste avec ta demande (ajouter, changer, viser des macros).
    if ($("nrCorriger")) $("nrCorriger").addEventListener("click", async ev => {
      const correction = $("nrCorrection").value.trim();
      if (!correction) { $("eNr").textContent = "Écris ce que Claude doit changer."; $("nrCorrection").focus(); return; }
      // Pendant la correction : la carte d'attente ; en cas d'échec, retour à la liste telle qu'elle était.
      const nomActuel = $("nrNom").value;
      let annule = false;
      const revenir = m => {
        verifier({ ...p, items, nom: nomActuel }, aLaMain, parIA);
        if ($("nrCorrection")) $("nrCorrection").value = correction;
        if (m) $("eNr").textContent = m;
      };
      const att = attenteIA(d, { titre: "L'IA corrige", sujet: correction, etapes: ["Ta demande", "Grammes", "Macros"],
        annuler: () => { annule = true; revenir(); } });
      try {
        const r = await fetch("/api/repas/analyser", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texte, photo: photoJointe, moment, date, correction, precedent: items, ...(remplacer && remplacer.creer ? { creer: true } : {}) }) });
        const rep = await r.json();
        att.fin();
        if (annule) return;
        if (!r.ok) return revenir(rep.erreur || "Claude n'a pas pu corriger.");
        verifier(rep.proposition, false, true);
      } catch (e) { att.fin(); if (!annule) revenir("L'appli ne répond pas."); }
    });
    if ($("nrSuppr")) $("nrSuppr").addEventListener("click", async () => {
      if (await appel("/api/repas/oublier", { id: entree.id }) === true) { d.close("oui"); rendre(); dire("Repas supprimé."); } });
    // Un repas nouveau devient un plat du menu du jour, au repas choisi (Taha, 19/11/2026 : pas une rubrique à part) ;
    // sans menu ce jour-là, il est noté comme avant.
    const auMenu = async bouton => {
      bouton.disabled = true;
      const nom = $("nrNom").value.trim();
      if (remplacer) {                               // le plat est créé ; le menu change après l'aperçu
        const rep = await appel("/api/repas/au_menu", { date, moment: moment || "dej", nom, items, seulement_plat: true, ...(remplacer.creer ? { creer: true } : {}), ...(photoPlat ? { photo: photoPlat } : {}),
          ...(recetteVue ? { recette: recetteVue } : {}) });
        bouton.disabled = false;
        if (rep === true && remplacer.creer) {
          d.close("oui"); rendre();
          // Un plat qui existait déjà (mêmes ingrédients) : pas de doublon, on le montre (Taha, 22/11/2026).
          if (E.au_menu && E.au_menu.existant) { dire(`Ce plat existe déjà : « ${recette(E.au_menu.plat).nom} ».`); return ficheRapide(E.au_menu.plat, null); }
          return dire(`« ${(recette(E.au_menu && E.au_menu.plat) || { nom }).nom} » est dans tes plats.`);
        }
        if (rep === true && E.au_menu && E.au_menu.plat) return apercuChangement(remplacer.k,
          { ...remplacer.operation(E.au_menu.plat), ...(E.au_menu.quantites ? { quantites: E.au_menu.quantites } : {}) },
          remplacer.titre((recette(E.au_menu.plat) || { nom }).nom + (E.au_menu.existant ? " (plat existant, à tes quantités)" : "")), remplacer.retour);
        if (rep && rep.erreur) $("eNr").textContent = rep.erreur;
        return;
      }
      const qui = quiChoisi(bouton, date, ["col", moment || "dej"]);
      const rep = await appel("/api/repas/au_menu", { id: entree ? entree.id : "", date, moment, nom, items, ...(photoPlat ? { photo: photoPlat } : {}), ...qui });
      bouton.disabled = false;
      if (rep === true) { d.close("oui"); rendre(); dire(E.au_menu && E.au_menu.note ? "Repas noté." : `Ajouté au menu : « ${(recette(E.au_menu.plat) || { nom }).nom} »${E.au_menu.existant ? ", un plat qui existait déjà, à tes quantités" : ""}.`); }
      else if (rep && rep.erreur) $("eNr").textContent = rep.erreur;
    };
    if ($("nrAuMenu")) $("nrAuMenu").addEventListener("click", ev => auMenu(ev.currentTarget));
    if ($("nrAuMenuTous")) $("nrAuMenuTous").addEventListener("click", ev => auMenu(ev.currentTarget));
    d.querySelector("form").addEventListener("submit", async ev => {
      ev.preventDefault(); ev.stopPropagation();
      if (!entree) return auMenu(ev.submitter || d.querySelector("[type=submit]"));
      const rep = await appel("/api/repas/noter", { id: entree.id, date, moment, nom: $("nrNom").value.trim(), items });
      if (rep === true) { d.close("oui"); rendre(); dire("Repas noté."); }
      else if (rep && rep.erreur) $("eNr").textContent = rep.erreur;
    });
    if (!d.open) d.showModal();
    d.scrollTop = 0;
  };
  if (entree) return verifier(entree);
  if (!remplacer) return saisie();
  // Un aliment seul choisi dans « Remplacer » (28/11/2026) : sa ligne, à vérifier ; pas d'IA.
  if (remplacer.aliment) return verifier({ nom: remplacer.aliment.nom, items: [itemAliment(remplacer.aliment)], remarque: "" });
  // Depuis « Remplacer un plat » : l'IA calcule ce qui a été écrit, sans repasser par la saisie.
  // Sans compte Claude branché : les ingrédients à la main, comme « Mon propre plat ».
  if (E.claude === false && remplacer.main) return remplacer.main();
  const site = remplacer.lien ? (/instagram/i.test(remplacer.lien) ? "Instagram" : /tiktok/i.test(remplacer.lien) ? "TikTok" : /youtu/i.test(remplacer.lien) ? "YouTube"
    : /facebook|fb\.watch/i.test(remplacer.lien) ? "Facebook" : (remplacer.lien.match(/^https?:\/\/(?:www\.)?([^/]+)/i) || [, "le site"])[1]) : "";
  let annule = false;
  const att = attenteIA(d, {
    titre: remplacer.auto ? "La recette arrive" : site ? "L'appli lit la recette" : "L'IA calcule",
    sujet: site ? `Sur ${site}` : texte,
    etapes: site ? ["Recette", "Ingrédients", "Étapes"] : ["Aliments", "Grammes", "Macros"],
    annuler: () => { annule = true; remplacer.retour(); } });
  (async () => {
    let rep, r;
    try {
      r = await fetch("/api/repas/analyser", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte, moment, date, ...(remplacer.creer ? { creer: true } : {}), ...(remplacer.lien || remplacer.description ? { lien: remplacer.lien || "", description: remplacer.description || "" } : {}) }) });
      rep = await r.json();
    } catch (e) { att.fin(); if (!annule) { remplacer.retour(); dire("L'appli ne répond pas."); } return; }
    att.fin();
    if (annule) return;
    if (!r.ok) { remplacer.retour(); dire(rep.erreur || "Claude n'a pas pu calculer."); return; }
    if (remplacer.creer) moment = rep.proposition.moment || moment;      // depuis le catalogue : l'IA dit le repas
    recetteVue = rep.proposition.recette || null;
    if (remplacer.auto) {                      // partagé depuis une autre appli : le plat s'ajoute sans étape de plus
      const p = rep.proposition;
      const ok = await appel("/api/repas/au_menu", { date, moment: moment || "din", nom: p.nom, items: p.items, seulement_plat: true, creer: true, ...(recetteVue ? { recette: recetteVue } : {}) });
      if (ok === true && E.au_menu && E.au_menu.plat) {
        d.close("oui"); rendre();
        dire(E.au_menu.existant ? `Ce plat existe déjà : « ${recette(E.au_menu.plat).nom} ».` : `« ${recette(E.au_menu.plat).nom} » ajouté à tes plats.`);
        return ficheRapide(E.au_menu.plat, null);
      }
    }
    verifier(rep.proposition, false, true);
  })();
}

/* ------------------------------------------------------------ silhouette au miroir */
// Taha, 27/11/2026 : une photo de face et une de profil devant le miroir ; les jours suivants, l'appli remet dans la
// même pose (silhouette en pointillés, consignes à l'écran et à voix haute), prend les photos seule et compare :
// épaules (largeur), poitrine, taille, hanches, cuisse, bras (tours). La caméra et la détection sont dans miroir.js
// (chargé à la demande). Chiffres : silhouette.json du profil ; photos : stockage PRIVÉ « silhouettes/<id>/ ».
// Jamais depuis le profil d'un autre membre de la famille.
const SILH = { charge: false, enCours: false, donnees: null, occupe: false };
const NIVEAUX_SILH = [["epaules", "Épaules", "largeur"], ["poitrine", "Poitrine", "tour"], ["taille", "Tour de taille", "tour"],
                      ["hanches", "Hanches", "tour"], ["cuisse", "Cuisse", "tour"], ["bras", "Bras", "tour"]];
const silhOk = () => typeof sb !== "undefined" && typeof M !== "undefined" && !!M.moi && !autreProfil();
function chargerSilhouette() {
  if (!silhOk() || SILH.charge || SILH.enCours) return;
  SILH.enCours = true;
  sb.from("fichiers").select("contenu").eq("user_id", M.moi.uid).eq("nom", "silhouette.json").maybeSingle().then(({ data }) => {
    try { SILH.donnees = data && data.contenu ? JSON.parse(data.contenu) : null; } catch (e) { SILH.donnees = null; }
    SILH.charge = true; SILH.enCours = false;
    if (route().vue === "suivi") rendre();
  }, () => { SILH.enCours = false; });
}
async function sauverSilhouette() {
  const { error } = await sb.from("fichiers").upsert({ user_id: M.moi.uid, nom: "silhouette.json", contenu: JSON.stringify(SILH.donnees), maj: new Date().toISOString() });
  if (error) throw new Error("Enregistrement impossible : " + error.message);
}
function chargerMiroir() {
  if (typeof Miroir !== "undefined") return Promise.resolve();
  if (!chargerMiroir.p) chargerMiroir.p = new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "miroir.js"; s.onload = ok;
    s.onerror = () => { chargerMiroir.p = null; ko(new Error("Silhouette indisponible : vérifie ta connexion.")); };
    document.head.appendChild(s);
  });
  return chargerMiroir.p;
}
// iPhone : la voix et l'inclinaison du téléphone ne s'ouvrent que dans le toucher lui-même.
function debloquerMiroir() {
  if (typeof Miroir !== "undefined") return Miroir.deverrouiller();
  try { if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (e) {}
  try { if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {}); } catch (e) {}
}
const enCm = v => v == null || !Number.isFinite(v) ? "—" : `${virgule(Math.round(v * 2) / 2)} cm`;
const ecartCm = d => d == null || !Number.isFinite(d) ? "" : Math.abs(d) < 0.5 ? "stable" : `${d > 0 ? "+" : "−"}${virgule(Math.round(Math.abs(d) * 2) / 2)} cm`;
async function envoyerPhotoSilh(blob, nom) {
  if (!blob) return null;
  const chemin = `${M.moi.uid}/${nom}.jpg`;
  const { error } = await sb.storage.from("silhouettes").upload(chemin, blob, { upsert: true, contentType: "image/jpeg" });
  if (error) { console.warn("photo de silhouette", error.message); return null; }
  return chemin;
}
const URLS_SILH = new Map();                       // chemin -> {url, t} : une adresse signée sert 50 minutes
async function urlPhotoSilh(chemin) {
  if (!chemin) return "";
  const deja = URLS_SILH.get(chemin);
  if (deja && Date.now() - deja.t < 50 * 6e4) return deja.url;
  const { data } = await sb.storage.from("silhouettes").createSignedUrl(chemin, 3600);
  const url = (data && data.signedUrl) || "";
  if (url) URLS_SILH.set(chemin, { url, t: Date.now() });
  return url;
}
// Ce qu'une vue garde : sans la photo (envoyée à part), le contour et les repères pour guider la fois suivante.
const vueGardee = (v, photo) => ({ points: v.points, contour: v.contour, reperes: v.reperes, image: v.image, mesures: v.mesures, photo });

function blocSilhouette() {
  if (!silhOk()) return "";
  chargerSilhouette();
  apresRendu.push(() => chargerMiroir().catch(() => {}));          // prêt pour le toucher (iPhone)
  const d = SILH.donnees, ref = d && d.reference;
  if (!SILH.charge) return `<section class="bloc silh suivi-petit"><h2>${icone("person")}Ma silhouette</h2><p class="petit discret">…</p></section>`;
  if (!ref) return `<section class="bloc silh suivi-petit" aria-labelledby="tSilh"><h2 id="tSilh">${icone("person")}Ma silhouette au miroir</h2>
    <p class="petit discret">Une photo de face et une de profil devant un miroir, une fois. Les jours suivants, l'appli te remet dans la même pose et
      compare : épaules, poitrine, taille, hanches, cuisse, bras.</p>
    <button type="button" class="bouton second" data-silh="debut">${icone("camera")}Commencer</button></section>`;
  const releves = d.releves || [], dernier = releves[releves.length - 1] || null;
  const v = (dernier || ref).valeurs || {};
  return `<section class="bloc silh suivi-petit" aria-labelledby="tSilh">
    <div class="silh-tete"><h2 id="tSilh">${icone("person")}Ma silhouette</h2><button type="button" class="lien" data-silh="histo">Historique</button></div>
    <ul class="silh-mesures">${NIVEAUX_SILH.map(([k, nom]) => `<li><span>${nom}</span><b class="chiffres">${enCm(v[k])}</b>
      ${dernier ? `<small class="chiffres${Math.abs((v[k] ?? 0) - (ref.valeurs[k] ?? 0)) >= 0.5 ? " bouge" : ""}">${ecartCm(v[k] != null && ref.valeurs[k] != null ? v[k] - ref.valeurs[k] : null)}</small>` : ""}</li>`).join("")}</ul>
    <p class="petit discret">${dernier ? `Le ${esc(dateCourte(dernier.date))}, comparé à ta référence du ${esc(dateCourte(ref.date))}` : `Ta référence du ${esc(dateCourte(ref.date))}`}</p>
    <button type="button" class="bouton" data-silh="jour">${icone("camera")}Prendre ma silhouette du jour</button></section>`;
}

// La première fois : les mesures au mètre ruban (elles recalent les tours), puis face et profil.
function silhouetteDebut() {
  const d = $("dialogue"), i = E.profil.identite || {}, ruban = (SILH.donnees && SILH.donnees.reference && SILH.donnees.reference.ruban) || {};
  const champ = (id, nom, aide, v = "") => `<div class="champ"><label for="${id}">${nom}</label><input id="${id}" inputmode="decimal" value="${esc(v)}" autocomplete="off"><small>${aide}</small></div>`;
  d.innerHTML = `<form class="feuille formulaire silh-form" novalidate>
    <h2 id="dialogueTitre">Tes mesures au mètre ruban</h2>
    <p class="petit discret">Une seule fois : elles règlent les calculs de l'appli. Mètre bien à plat, sans serrer. Laisse vide ce que tu n'as pas.</p>
    ${champ("slTaille", "Ta hauteur, en cm", "Elle donne l'échelle des photos.", i.taille_cm || "")}
    <div class="silh-ruban">${champ("slPoitrine", "Poitrine", "Au plus large", ruban.poitrine || "")}${champ("slTour", "Tour de taille", "Au nombril", ruban.taille || "")}
      ${champ("slHanches", "Hanches", "Au plus large", ruban.hanches || "")}${champ("slCuisse", "Cuisse", "Au milieu", ruban.cuisse || "")}
      ${champ("slBras", "Bras", "Au milieu, détendu", ruban.bras || "")}</div>
    <p class="petit discret silh-conseils">Ensuite, devant un miroir où tu te vois en entier : tenue près du corps, pieds à la largeur des
      hanches, un bras un peu écarté, l'autre tient le téléphone (caméra vers le miroir). Une photo de face, puis de profil.</p>
    <small id="eSl" class="erreur" role="alert" style="display:block;color:var(--critique)"></small>
    <div class="actions pied"><button class="bouton second" type="button" value="non">Annuler</button><button class="bouton" type="submit">${icone("camera")}Continuer</button></div></form>`;
  d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
  d.querySelector("form").addEventListener("submit", ev => {
    ev.preventDefault();
    debloquerMiroir();                                           // dans le toucher : voix et inclinaison (iPhone)
    const n = id => { const x = Number(String($(id).value).replace(",", ".")); return x > 0 ? x : null; };
    const taille = n("slTaille");
    if (!taille || taille < 120 || taille > 230) { $("eSl").textContent = "Ta hauteur en cm (entre 120 et 230)."; return; }
    const ruban = { poitrine: n("slPoitrine"), taille: n("slTour"), hanches: n("slHanches"), cuisse: n("slCuisse"), bras: n("slBras") };
    d.close("oui");
    prendreSilhouette({ premiere: true, taille, ruban });
  });
  if (!d.open) d.showModal();
}
// Face puis profil ; la première fois, ils deviennent la référence, ensuite un relevé comparé à elle.
async function prendreSilhouette({ premiere = false, taille, ruban = {} } = {}) {
  if (SILH.occupe) return;
  SILH.occupe = true;
  try {
    await chargerMiroir();
    const ref = premiere ? null : SILH.donnees.reference;
    const tailleCm = premiere ? taille : ref.taille_cm;
    const face = await Miroir.capturer({ vue: "face", reference: ref && ref.face, tailleCm, titre: "De face", etape: "1 sur 2" });
    if (!face) return;
    const profil = await Miroir.capturer({ vue: "profil", reference: ref && ref.profil, tailleCm, titre: "De profil", etape: "2 sur 2 · tourne-toi d'un quart" });
    if (!profil) return;
    dire("Calcul de ta silhouette…");
    const date = isoDuJour(), heure = new Date().toTimeString().slice(0, 5).replace(":", "h");
    const [pf, pp] = await Promise.all([envoyerPhotoSilh(face.photo, `${date}-${heure}-face`), envoyerPhotoSilh(profil.photo, `${date}-${heure}-profil`)]);
    if (premiere) {
      const k = Miroir.calibrer(ruban, face.mesures, profil.mesures);
      const valeurs = { epaules: face.mesures.largeurs.epaules, ...Miroir.tours(face.mesures, profil.mesures, k) };
      // le mètre ruban règle k ; la référence reste l'estimation recalée (= le mètre ruban, sauf recalage borné) :
      // ainsi les jours suivants se comparent à elle sans décalage
      // une nouvelle référence repart de zéro : les relevés d'avant ne se comparent plus
      SILH.donnees = { version: 1, reference: { date, heure, taille_cm: tailleCm, ruban, k, valeurs,
        face: vueGardee(face, pf), profil: vueGardee(profil, pp) }, releves: [] };
      await sauverSilhouette();
      montrerReleve(null, { face, profil });
    } else {
      const valeurs = { epaules: face.mesures.largeurs.epaules, ...Miroir.tours(face.mesures, profil.mesures, ref.k || {}) };
      const releve = { date, heure, valeurs, qualite: Math.min(face.qualite, profil.qualite),
        face: { mesures: face.mesures, reperes: face.reperes, photo: pf }, profil: { mesures: profil.mesures, reperes: profil.reperes, photo: pp } };
      const liste = (SILH.donnees.releves || []).filter(x => x.date !== date);       // un relevé par jour : le dernier
      liste.push(releve);
      SILH.donnees.releves = liste.slice(-400);
      await sauverSilhouette();
      montrerReleve(releve, { face, profil });
    }
    rendre();
  } catch (e) {
    if (typeof Miroir !== "undefined") Miroir.fermer();
    dire(e.message || "Silhouette impossible.");
  } finally { SILH.occupe = false; }
}
// Les chiffres d'un relevé (ou de la référence), avec les photos.
async function montrerReleve(releve, vues) {
  const d = $("dialogue"), ref = SILH.donnees.reference, avant = releve ? (SILH.donnees.releves || []).filter(x => x !== releve && x.date < releve.date).pop() : null;
  const v = releve ? releve.valeurs : ref.valeurs;
  const urls = vues ? [vues.face.photo, vues.profil.photo].map(b => b ? URL.createObjectURL(b) : "")
    : await Promise.all([urlPhotoSilh((releve || ref).face.photo), urlPhotoSilh((releve || ref).profil.photo)]);
  d.innerHTML = `<div class="feuille silh-resultat">
    <h2 id="dialogueTitre">${releve ? `Ta silhouette du ${esc(dateCourte(releve.date))}` : "Ta référence est prête"}</h2>
    <div class="silh-photos">${urls.map((u, i) => u ? `<img src="${u}" alt="${i ? "De profil" : "De face"}">` : "").join("")}</div>
    <ul class="silh-mesures">${NIVEAUX_SILH.map(([k, nom, sorte]) => `<li><span>${nom}<small class="discret"> · ${sorte}</small></span><b class="chiffres">${enCm(v[k])}</b>
      ${releve ? `<small class="chiffres">${ecartCm(v[k] != null && ref.valeurs[k] != null ? v[k] - ref.valeurs[k] : null)}${avant && avant.valeurs[k] != null && v[k] != null
        ? ` <span class="discret">(${ecartCm(v[k] - avant.valeurs[k])} depuis le ${esc(dateCourte(avant.date))})</span>` : ""}</small>` : ""}</li>`).join("")}</ul>
    <p class="petit discret">${releve ? `Comparé à ta référence du ${esc(dateCourte(ref.date))}` : "Les prochaines fois, l'appli te remet dans cette pose et compare"}<br>
      Précision : environ 1 cm. Même tenue, même heure et même lumière pour comparer.</p>
    ${releve && releve.qualite < 1 ? `<p class="petit discret">Prise faite sans la bonne pose : chiffres moins sûrs.</p>` : ""}
    <div class="actions pied"><button class="bouton" type="button" value="ok">Fermer</button></div></div>`;
  d.querySelector("[value=ok]").addEventListener("click", () => d.close("oui"));
  if (!d.open) d.showModal();
}
// Historique (Taha, 28/11/2026 : « silhouette en courbes ») : la courbe d'une mesure au fil des semaines, puis la
// photo de référence et la dernière, l'une sur l'autre, avec un curseur (avant à gauche, après à droite).
function historiqueSilhouette(mesure = "taille", vue = "face") {
  const d = $("dialogue"), D = SILH.donnees, ref = D.reference, liste = (D.releves || []).slice().reverse();
  const dernier = (D.releves || []).length ? D.releves[D.releves.length - 1] : null;
  const resume = r => NIVEAUX_SILH.filter(([k]) => r.valeurs[k] != null && ref.valeurs[k] != null && Math.abs(r.valeurs[k] - ref.valeurs[k]) >= 0.5)
    .slice(0, 3).map(([k, nom]) => `${nom} ${ecartCm(r.valeurs[k] - ref.valeurs[k])}`).join(" · ") || "rien ne bouge";
  const nomMesure = (NIVEAUX_SILH.find(x => x[0] === mesure) || NIVEAUX_SILH[2])[1];
  const points = [ref, ...(D.releves || [])].filter(r => r && r.valeurs && r.valeurs[mesure] != null).map(r => ({ x: r.date, y: r.valeurs[mesure] }));
  d.innerHTML = `<div class="feuille silh-histo">
    <h2 id="dialogueTitre">Silhouette : historique</h2>
    <div class="gouts silh-choix" role="group" aria-label="Mesure">${NIVEAUX_SILH.map(([k, nom]) => `<button type="button" data-silh-mesure="${k}" aria-pressed="${k === mesure}">${nom}</button>`).join("")}</div>
    <div id="gSilh" class="graph silh-graph"></div>
    ${dernier && dernier[vue] && ref[vue] ? `<h3 class="silh-sous">Avant, après</h3>
      <div class="gouts" role="group" aria-label="Vue">${[["face", "De face"], ["profil", "De profil"]].map(([v, nom]) => `<button type="button" data-silh-vue="${v}" aria-pressed="${v === vue}">${nom}</button>`).join("")}</div>
      <div class="silh-comparer" id="silhComparer" style="--x:50%"><img class="silh-avant" alt="Ta référence"><img class="silh-apres" alt="Ton dernier relevé"><i aria-hidden="true"></i></div>
      <input type="range" class="silh-curseur" min="0" max="100" value="50" aria-label="Glisser entre avant et après">
      <p class="petit discret silh-dates"><span>${esc(dateCourte(ref.date))}</span><span>${esc(dateCourte(dernier.date))}</span></p>` : ""}
    <ul class="lignes">${liste.map(r => `<li><button type="button" class="silh-ligne" data-silh="releve" data-date="${r.date}"><b>${esc(dateCourte(r.date))}</b>
        <small class="discret">${esc(resume(r))}</small></button>
        <button type="button" class="effacer" data-silh="oublier" data-date="${r.date}" aria-label="Supprimer le relevé du ${esc(dateCourte(r.date))}">${icone("x")}</button></li>`).join("")}
      <li><button type="button" class="silh-ligne" data-silh="reference"><b>Référence · ${esc(dateCourte(ref.date))}</b><small class="discret">au mètre ruban et en photos</small></button></li></ul>
    <p style="margin:14px 0 0"><button type="button" class="lien" data-silh="refaire">Refaire ma référence</button></p>
    <div class="actions pied"><button class="bouton second" type="button" value="ok">Fermer</button></div></div>`;
  d.querySelector("[value=ok]").addEventListener("click", () => d.close("oui"));
  if (!d.open) d.showModal();
  if (typeof Graph !== "undefined") Graph.courbes($("gSilh"), { unite: "cm", decimales: 1, hauteur: 170, titre: nomMesure,
    videTexte: "La courbe apparaît dès le premier relevé après ta référence.",
    series: points.length >= 2 ? [{ nom: nomMesure, couleur: "var(--s1)", marques: true, points }] : [] });
  d.querySelectorAll("[data-silh-mesure]").forEach(b => b.addEventListener("click", () => historiqueSilhouette(b.dataset.silhMesure, vue)));
  d.querySelectorAll("[data-silh-vue]").forEach(b => b.addEventListener("click", () => historiqueSilhouette(mesure, b.dataset.silhVue)));
  const zone = $("silhComparer");
  if (zone) {
    const curseur = d.querySelector(".silh-curseur");
    curseur.addEventListener("input", () => zone.style.setProperty("--x", `${curseur.value}%`));
    Promise.all([urlPhotoSilh(ref[vue].photo), urlPhotoSilh(dernier[vue].photo)]).then(([a, b]) => {
      if (!d.contains(zone)) return;
      zone.querySelector(".silh-avant").src = a; zone.querySelector(".silh-apres").src = b;
    });
  }
}
document.addEventListener("click", async ev => {
  const b = ev.target.closest && ev.target.closest("[data-silh]");
  if (!b || !silhOk()) return;
  const quoi = b.dataset.silh;
  if (quoi === "debut" || quoi === "refaire") {
    if (quoi === "refaire" && !await confirmer({ titre: "Refaire ta référence ?", oui: "Refaire", non: "Garder",
      texte: "Tu reprends tes mesures au mètre ruban et tes deux photos. Les relevés d'avant ne seront plus comparés." })) return;
    return silhouetteDebut();
  }
  if (quoi === "jour") { debloquerMiroir(); return prendreSilhouette(); }
  if (quoi === "histo") return historiqueSilhouette();
  if (quoi === "reference") return montrerReleve(null);
  if (quoi === "releve") return montrerReleve((SILH.donnees.releves || []).find(x => x.date === b.dataset.date));
  if (quoi === "oublier") {
    if (!await confirmer({ titre: "Supprimer ce relevé ?", oui: "Supprimer", non: "Garder", texte: "Ses chiffres et ses photos sont effacés." })) return;
    const r = (SILH.donnees.releves || []).find(x => x.date === b.dataset.date);
    SILH.donnees.releves = SILH.donnees.releves.filter(x => x !== r);
    const chemins = r ? [r.face.photo, r.profil.photo].filter(Boolean) : [];
    if (chemins.length) await sb.storage.from("silhouettes").remove(chemins);
    await sauverSilhouette().catch(e => dire(e.message));
    rendre(); historiqueSilhouette();
  }
});

/* ------------------------------------------------------------ mon suivi */
// Les mesures « _avant » se prennent quand on veut ; « _apres », juste après une séance, en option (Taha, 19/11/2026).
const MESURES = [["poids", "Poids", "kg"], ["biceps_avant", "Biceps", "cm"], ["tour_avant", "Hanches", "cm"], ["torse_avant", "Torse", "cm"],
                 ["biceps_apres", "Biceps après la séance", "cm"], ["tour_apres", "Hanches après la séance", "cm"], ["torse_apres", "Torse après la séance", "cm"]];
const virgule = v => v == null ? "" : String(v).replace(".", ",");
const isoDuJour = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dateCourte = iso => new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso + "T12:00"));
function vueSuivi({ params }) {
  // Poids chaque jour, biceps et tour de hanches avant et après la séance. Sur iPhone : les chiffres d'abord,
  // une carte pour noter, une courbe à la fois, l'historique en bas (Taha, 19/11/2026).
  barre("");
  // Le suivi reste privé, même en famille (Taha, 27/11/2026) : pas sur le profil d'un autre membre.
  if (autreProfil()) return `<div class="titre"><h1 tabindex="-1">Suivi</h1></div>
    <div class="vide"><h2>Le suivi de ${esc(E.profil.nom)} reste privé</h2><p>Poids, mesures et silhouette ne se voient que sur son propre profil.</p>
    <button type="button" class="bouton second" data-moi>Revenir à moi</button></div>`;
  const m = E.suivi || [], date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") ? params.get("date") : isoDuJour();
  const courbe = ["poids", "biceps", "tour", "torse"].includes(params.get("c")) ? params.get("c") : "poids";
  const ce = m.find(x => x.date === date) || {};
  const poids = m.filter(x => x.poids != null);                       // les plus récents d'abord
  // La date de début choisie dans Réglages : « depuis le début » part de la première pesée à partir de ce jour.
  const debut = E.reglages.date_debut || null;
  const depuisDebut = () => {
    const depuis = poids.filter(x => !debut || x.date >= debut);
    const premier = depuis[depuis.length - 1];
    return premier && premier !== poids[0] ? Math.round((poids[0].poids - premier.poids) * 10) / 10 : null;
  };
  const joursSuivi = debut ? Math.round((new Date(isoDuJour() + "T12:00") - new Date(debut + "T12:00")) / 864e5) : null;
  const ecart = (jours) => {
    if (!poids.length) return null;
    const limite = new Date(poids[0].date + "T12:00") - jours * 864e5;
    const ancien = poids.find(x => new Date(x.date + "T12:00") <= limite) || (jours > 900 ? poids[poids.length - 1] : null);
    return ancien && ancien !== poids[0] ? Math.round((poids[0].poids - ancien.poids) * 10) / 10 : null;
  };
  const signe = v => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${virgule(Math.abs(v))}`;
  const derniere = cle => m.find(x => x[cle] != null);
  const points = cle => m.filter(x => x[cle] != null).map(x => ({ x: x.date, y: x[cle] })).reverse();
  const SERIES = {
    poids: { titre: "Ton poids jour après jour", unite: "kg", series: [{ nom: "Poids", couleur: "var(--s1)", marques: true, points: points("poids") }] },
    biceps: { titre: "Tour de biceps", unite: "cm", series: [
      { nom: "Au repos", couleur: "var(--s2)", marques: true, points: points("biceps_avant") }, { nom: "Après la séance", couleur: "var(--s1)", marques: true, points: points("biceps_apres") }] },
    tour: { titre: "Tour de hanches", unite: "cm", series: [
      { nom: "Au repos", couleur: "var(--s2)", marques: true, points: points("tour_avant") }, { nom: "Après la séance", couleur: "var(--s1)", marques: true, points: points("tour_apres") }] },
    torse: { titre: "Tour de torse", unite: "cm", series: [
      { nom: "Au repos", couleur: "var(--s2)", marques: true, points: points("torse_avant") }, { nom: "Après la séance", couleur: "var(--s1)", marques: true, points: points("torse_apres") }] } };
  const S = SERIES[courbe];
  // Poids : l'axe va de 2 kg sous la pesée la plus basse à 2 kg au-dessus de la plus haute, toujours écrits (Taha, 20/11/2026).
  const kilos = courbe === "poids" ? S.series[0].points.map(p => p.y) : [];
  const bornes = kilos.length ? { yMin: Math.max(0, Math.floor(Math.min(...kilos) - 2)), yMax: Math.ceil(Math.max(...kilos) + 2) } : {};
  apresRendu.push(() => Graph.courbes($("gSuivi"), { unite: S.unite, decimales: 1, hauteur: PETIT.matches ? 190 : 230, titre: S.titre, ...bornes,
    videTexte: "La courbe apparaît dès la deuxième mesure.", series: S.series.every(s => s.points.length < 2) ? [] : S.series }));
  const champ = (cle, libelle, unite) => `<div class="champ" style="margin:0"><label for="su_${cle}">${libelle}</label>
    <div class="avec-unite"><input id="su_${cle}" name="${cle}" type="text" inputmode="decimal" autocomplete="off" value="${virgule(ce[cle])}" placeholder="${unite === "kg" ? "ex. 78,5" : "ex. 35"}"><span>${unite}</span></div></div>`;
  const cellule = (a, b) => a == null && b == null ? "—" : `${a == null ? "—" : virgule(a)} → ${b == null ? "—" : virgule(b)}`;
  const bic = derniere("biceps_avant") || derniere("biceps_apres"), tou = derniere("tour_avant") || derniere("tour_apres"), tor = derniere("torse_avant") || derniere("torse_apres");
  const aujourd = date === isoDuJour();
  return `<div class="m-tete"><div><h1 tabindex="-1">Mon suivi</h1>
      <p class="petit discret">${debut ? `<span>Depuis le ${esc(dateLongueCourte(debut).replace(/^[a-zé]+ /i, ""))}</span>${joursSuivi >= 0 ? `<span>, jour ${joursSuivi + 1}</span>` : ""} · ` : ""}<span>${poids.length ? `Dernière pesée le ${esc(dateCourte(poids[0].date))}` : "Note ton poids chaque jour, à la même heure"}</span></p></div></div>
    <div class="suivi-chiffres suivi-petit">
      <div class="fait"><b>${poids.length ? virgule(poids[0].poids) : "—"}<small> kg</small></b><span>poids</span></div>
      <div class="fait"><b>${signe(ecart(7))}<small>${ecart(7) == null ? "" : " kg"}</small></b><span>en 7 jours</span></div>
      <div class="fait"><b>${signe(depuisDebut())}<small>${depuisDebut() == null ? "" : " kg"}</small></b><span>depuis le début</span></div>
    </div>
    ${bic || tou || tor ? `<p class="petit discret chiffres suivi-mesures">${[bic ? `Biceps ${virgule(bic.biceps_avant ?? bic.biceps_apres)} cm` : "", tou ? `Hanches ${virgule(tou.tour_avant ?? tou.tour_apres)} cm` : "",
      tor ? `Torse ${virgule(tor.torse_avant ?? tor.torse_apres)} cm` : ""].filter(Boolean).join(" · ")}</p>` : ""}
    <section class="bloc suivi-noter suivi-petit" aria-labelledby="tNoter">
      <div class="suivi-noter-tete"><h2 id="tNoter">${aujourd ? "Aujourd'hui" : esc(dateCourte(date))}</h2>
        <label class="date-discrete"><span class="sr">Jour</span><input id="su_date" name="date" type="date" value="${date}" max="${isoDuJour()}" form="formSuivi"></label></div>
      <form id="formSuivi" class="formulaire" novalidate>
        ${champ("poids", "Poids", "kg")}
        <div class="mesures mesures-3">${champ("biceps_avant", "Biceps", "cm")}${champ("tour_avant", "Hanches", "cm")}${champ("torse_avant", "Torse", "cm")}</div>
        <details class="seance"${["biceps_apres", "tour_apres", "torse_apres"].some(k => ce[k] != null) ? " open" : ""}>
          <summary>Après la séance <small class="discret">(facultatif)</small>${icone("caret-right")}</summary>
          <div class="mesures mesures-3">${champ("biceps_apres", "Biceps", "cm")}${champ("tour_apres", "Hanches", "cm")}${champ("torse_apres", "Torse", "cm")}</div>
        </details>
        <small id="eSuivi" class="erreur" role="alert" style="display:block;margin:6px 0;color:var(--critique)"></small>
        <button class="bouton large" type="submit">${icone("check")}Enregistrer</button>
      </form>
    </section>
    ${blocSilhouette()}
    <section class="bloc suivi-courbe suivi-petit" aria-labelledby="tCourbe">
      <h2 id="tCourbe" class="sr">Courbe</h2>
      <nav class="jours" aria-label="Courbe">${[["poids", "Poids"], ["biceps", "Biceps"], ["tour", "Hanches"], ["torse", "Torse"]].map(([c, nom]) =>
        `<a href="#/suivi?c=${c}${aujourd ? "" : `&date=${date}`}"${c === courbe ? ' aria-current="true"' : ""}>${nom}</a>`).join("")}</nav>
      ${courbe !== "poids" ? `<div class="legende"><span><i style="background:var(--s2)"></i>Au repos</span><span><i style="background:var(--s1)"></i>Après la séance</span></div>` : ""}
      <div id="gSuivi"></div>
    </section>
    ${enSuivi() ? "" : `<section class="bloc" aria-labelledby="tHisto"><h2 id="tHisto">Historique</h2>
      ${m.length ? `<ul class="lignes historique">${m.map(x => { const sous = [x.biceps_avant != null || x.biceps_apres != null ? `Biceps ${cellule(x.biceps_avant, x.biceps_apres)} cm` : "",
            x.tour_avant != null || x.tour_apres != null ? `Hanches ${cellule(x.tour_avant, x.tour_apres)} cm` : "",
            x.torse_avant != null || x.torse_apres != null ? `Torse ${cellule(x.torse_avant, x.torse_apres)} cm` : ""].filter(Boolean).join(" · ");
          return `<li><a href="#/suivi?date=${x.date}" aria-label="Modifier les mesures du ${esc(dateCourte(x.date))}"><span><b>${esc(dateCourte(x.date))}</b>${sous ? `<small>${sous}</small>` : ""}</span>
            <span class="q">${x.poids == null ? "—" : virgule(x.poids) + " kg"}</span></a>
            <button type="button" class="effacer" data-action="oublierSuivi" data-date="${x.date}" aria-label="Supprimer les mesures du ${esc(dateCourte(x.date))}">${icone("x")}</button></li>`; }).join("")}</ul>
          <p class="petit discret" style="margin-top:8px">Touche un jour pour le modifier.</p>`
        : `<p class="discret">Rien de noté pour l'instant. Commence par ton poids d'aujourd'hui.</p>`}
    </section>`}`;
}
document.addEventListener("submit", async ev => {
  if (ev.target.id !== "formSuivi") return;
  ev.preventDefault();
  const f = ev.target, corps = { date: f.date.value };
  for (const [cle] of MESURES) corps[cle] = f[cle].value.trim();
  const rep = await appel("/api/suivi/noter", corps);
  if (rep === true) { rendre(); dire("Mesures enregistrées."); }
  else if (rep && rep.erreur) $("eSuivi").textContent = rep.erreur;
});
document.addEventListener("change", ev => {
  if (ev.target.id === "su_date" && ev.target.value) location.hash = `#/suivi?date=${ev.target.value}`;
});
function vueJournal() {
  barre("");
  return `${enSuivi() ? "" : `<a class="retour" href="#/plus">${icone("caret-left")}Plus</a>`}
  <div class="titre"><h1 tabindex="-1">Journal de l'appli</h1><p>Ce qu'il a choisi ou fait, et pourquoi.</p></div>
  ${E.journal.length ? E.journal.concat(journalPlus).map(e => `<article class="entree"><time datetime="${e.date}">${dateHeure(e.date)}</time>
      <h2 style="font-size:17px">${esc(propre(e.titre))}</h2>
      ${e.details.length ? `<ul>${e.details.slice(0, 3).map(d => `<li>${esc(propre(d))}</li>`).join("")}</ul>` : ""}
      ${e.details.length > 3 ? `<details><summary>Tout afficher, ${e.details.length - 3} lignes de plus</summary>
        <ul>${e.details.slice(3).map(d => `<li>${esc(propre(d))}</li>`).join("")}</ul></details>` : ""}</article>`).join("")
      + ((journalSuite === null ? E.journal_suite : journalSuite) ? `<p class="actions" style="margin-top:18px"><button class="bouton second" data-action="journalSuite">Voir la suite</button></p>` : "")
    : vide("Rien pour l'instant", "Le journal se remplit dès que l'appli choisit une semaine ou remplit un panier.", "#/semaine", "Aller à la semaine")}`;
}
// Mes objectifs par période : chacun règle les siens, Claude peut en proposer (Taha, 19/11/2026).
const finDuMois = ym => { const [y, m] = String(ym).split("-").map(Number); const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const lendemain = iso => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function periodesActuelles() {
  if (E.phases_perso) return E.phases.map(p => ({ ...p }));
  // Le programme du profil (par mois) devient des périodes datées, à partir d'aujourd'hui.
  const out = [];
  for (const p of E.phases || []) {
    const au = p.au || finDuMois(p.jusqu_a || "2099-12");
    if (au < isoDuJour()) continue;
    out.push({ nom: p.nom, du: out.length ? lendemain(out[out.length - 1].au) : isoDuJour(), au, kcal: p.kcal, prot: p.prot, glucides: p.glucides, lipides: p.lipides });
  }
  return out;
}
function lignePeriode(x = {}) {
  const v = c => x[c] == null ? "" : esc(x[c]);
  return `<div class="periode">
    <div class="periode-tete"><input class="p-nom" type="text" maxlength="40" placeholder="Nom (ex. Sèche)" value="${v("nom")}" aria-label="Nom de la période">
      <button type="button" class="effacer" data-retirer-periode aria-label="Retirer cette période">${icone("x")}</button></div>
    <div class="periode-dates"><label>Du<input class="p-du" type="date" value="${v("du")}"></label><label>Au<input class="p-au" type="date" value="${v("au")}"></label></div>
    <div class="periode-chiffres">
      <label>kcal<input class="p-kcal" type="text" inputmode="numeric" value="${v("kcal")}"></label>
      <label>Prot. (g)<input class="p-prot" type="text" inputmode="numeric" value="${v("prot")}"></label>
      <label>Gluc. (g)<input class="p-glucides" type="text" inputmode="numeric" value="${v("glucides")}" placeholder="—"></label>
      <label>Lip. (g)<input class="p-lipides" type="text" inputmode="numeric" value="${v("lipides")}" placeholder="—"></label></div>
    <p class="p-vise" aria-live="polite"></p></div>`;
}
// Le poids visé à la fin de chaque période (Taha, 22/11/2026) : à partir du dernier poids, ce que les calories de la
// période font gagner ou perdre par rapport à la dépense du jour (7 700 kcal ≈ 1 kg). Une estimation, recalculée en tapant.
function majPoidsVises() {
  const blocs = [...document.querySelectorAll(".periode")];
  if (!blocs.length) return;
  const dep = E.profil.depense, i = E.profil.identite || {};
  const dernier = (E.suivi || []).find(x => x.poids != null);
  let poids = Number(dernier ? dernier.poids : i.poids_kg);
  const jourMs = 864e5, auj = new Date(isoDuJour() + "T12:00");
  const lignes = blocs.map(b => ({ b, du: b.querySelector(".p-du").value, au: b.querySelector(".p-au").value,
    kcal: Number(String(b.querySelector(".p-kcal").value).replace(",", ".")) })).sort((a, c) => (a.du || "").localeCompare(c.du || ""));
  for (const l of lignes) {
    const sortie = l.b.querySelector(".p-vise");
    if (!dep || !poids || !l.kcal || !l.du || !l.au || l.au < l.du) { sortie.textContent = ""; continue; }
    const debut = new Date(Math.max(new Date(l.du + "T12:00"), auj)), fin = new Date(l.au + "T12:00");
    const jours = Math.max(0, Math.round((fin - debut) / jourMs) + 1);
    const parSemaine = (l.kcal - dep) * 7 / 7700;
    const signe = v => `${v > 0 ? "+" : v < 0 ? "−" : ""}${virgule(Math.abs(Math.round(v * 10) / 10))}`;
    if (jours > 730) { sortie.innerHTML = `Rythme visé : <b>${signe(parSemaine)} kg par semaine</b>`; continue; }
    poids += (l.kcal - dep) * jours / 7700;
    sortie.innerHTML = `Poids visé le ${esc(dateCourte(l.au))} : <b>≈ ${virgule(Math.round(poids * 10) / 10)} kg</b> <small>(${signe(parSemaine)} kg par semaine)</small>`;
  }
}
document.addEventListener("input", ev => { if (ev.target.closest(".periode")) majPoidsVises(); });
// `reglages` : l'ajustement des calories et le début du suivi, enregistrés avec les périodes (Taha, 22/11/2026 :
// « Mon objectif » fusionné dans « Mes objectifs »).
function blocObjectifs(reglages = "", resume = "") {
  apresRendu.push(majPoidsVises);
  return `<section class="bloc" aria-labelledby="tPeriodes"${resume ? ` data-resume="${esc(resume)}"` : ""}><h2 id="tPeriodes">Mes objectifs</h2>
    ${blocObjectifAuto()}
    ${reglages}
    <p class="doux petit sous-titre">${E.phases_perso ? "Tes périodes : l'appli prend celle du jour." : "Ton programme actuel, en périodes : change ce que tu veux, puis enregistre."} Les vitamines suivent tes calories.</p>
    <div id="periodes">${periodesActuelles().map(lignePeriode).join("")}</div>
    <p style="margin:8px 0 14px"><button type="button" class="lien" id="ajoutPeriode">+ Ajouter une période</button></p>
    <details class="claude-objectifs"><summary><span>Demander à Claude ${BADGE_IA}</span>${icone("caret-right")}</summary>
      <div class="champ champ-ia" style="margin-top:10px"><label for="oDemande">Ce que tu veux</label>
        <textarea id="oDemande" rows="2" maxlength="600" placeholder="Ex. : perdre 4 kg d'ici mars, puis prendre du muscle jusqu'à l'été"></textarea></div>
      <button type="button" class="bouton second bouton-ia" id="oProposer">${icone("sparkle")}Proposer des périodes</button>
      <p class="petit discret" id="oExplication" style="margin-top:8px">Il faut avoir branché ton compte Claude (plus bas). Tu vérifies sa proposition avant d'enregistrer.</p>
    </details>
    <small id="ePeriodes" class="erreur" role="alert" style="display:block;margin-top:10px;color:var(--critique)"></small>
    <p class="actions" style="margin-top:12px"><button type="button" class="bouton" id="oEnregistrer">Enregistrer mes objectifs</button>
      ${E.phases_perso ? `<button type="button" class="bouton sobre" id="oAutomatique">Revenir à mon programme de départ</button>` : ""}</p>
  </section>`;
}
document.addEventListener("click", async ev => {
  const t = ev.target.closest("#ajoutPeriode, [data-retirer-periode], #oEnregistrer, #oAutomatique, #oProposer");
  if (!t) return;
  if (t.id === "ajoutPeriode") {
    const tous = [...document.querySelectorAll(".periode .p-au")].map(i => i.value).filter(Boolean).sort();
    $("periodes").insertAdjacentHTML("beforeend", lignePeriode({ du: tous.length ? lendemain(tous[tous.length - 1]) : isoDuJour() }));
    majPoidsVises();
    return;
  }
  if (t.dataset.retirerPeriode !== undefined) { t.closest(".periode").remove(); majPoidsVises(); return; }
  if (t.id === "oProposer") {
    // La même carte d'attente que « L'IA calcule » (27/11/2026).
    $("ePeriodes").textContent = "";
    const d = $("dialogue");
    let annule = false;
    const att = attenteIA(d, { titre: "L'IA réfléchit", sujet: $("oDemande").value.trim(), etapes: ["Ton profil", "Périodes", "Objectifs"],
      annuler: () => { annule = true; d.close("non"); } });
    try {
      const r = await fetch("/api/objectifs/proposer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demande: $("oDemande").value }) });
      const rep = await r.json();
      att.fin();
      if (annule) return;
      d.close("oui");
      if (!r.ok) $("ePeriodes").textContent = rep.erreur || "Claude n'a pas pu proposer.";
      else { $("periodes").innerHTML = rep.proposition.phases.map(lignePeriode).join(""); majPoidsVises(); $("oExplication").textContent = rep.proposition.explication || "Vérifie, puis enregistre."; }
    } catch (e) { att.fin(); if (!annule) { d.close("non"); $("ePeriodes").textContent = "Pas de réponse."; } }
    return;
  }
  const phases = t.id === "oAutomatique" ? [] : [...document.querySelectorAll(".periode")].map(d => Object.fromEntries(
    ["nom", "du", "au", "kcal", "prot", "glucides", "lipides"].map(c => [c, d.querySelector(".p-" + c).value.trim()])));
  const fr = $("rAdj");                                 // les réglages de l'objectif, s'ils sont sur la page
  if (fr && t.id === "oEnregistrer") {
    const r = await appel("/api/reglages", { ...($("rPhase") ? { phase: $("rPhase").value ? Number($("rPhase").value) : null } : {}),
      ajustement: Number(fr.value), date_debut: $("rDebut").value || null });
    if (r !== true) { $("ePeriodes").textContent = (r && r.erreur) || "Réglages non enregistrés."; return; }
  }
  const rep = await appel("/api/objectifs", { phases });
  if (rep === true) { rendre(); dire(phases.length ? "Objectifs enregistrés." : "Retour à ton programme de départ."); }
  else if (rep && rep.erreur) $("ePeriodes").textContent = rep.erreur;
});
function vueReglagesFlemmard() {
  // Réglages du mode flemmard, en blocs les uns sous les autres (Taha, 19/11/2026 : « en désordre, ça se chevauche »).
  barre("");
  const r = E.reglages, phase = E.phase, i = E.profil.identite || {}, fodmap = E.profil.preferences.modes.includes("fodmap");
  const choisie = r.phase ? (E.phases.find(p => p.n === r.phase) || phase) : phase;
  const kcal = choisie.kcal + (r.ajustement || 0);
  const champ = (id, libelle, corps, aide = "") => `<div class="champ"><label for="${id}">${libelle}</label>${corps}${aide ? `<small>${aide}</small>` : ""}</div>`;
  const saisie = (id, nom, v, type = "text", plus = "") => `<input id="${id}" name="${nom}" type="${type}" value="${esc(v ?? "")}" autocomplete="off" ${plus}>`;
  const choix = (id, nom, v, options) => `<select id="${id}" name="${nom}">${options.map(([k, t]) => `<option value="${k}"${String(k) === String(v) ? " selected" : ""}>${t}</option>`).join("")}</select>`;
  const obj = { "Perte de poids": "perte", "Maintien": "maintien", "Prise de muscle": "prise" }[E.profil.programme] || "maintien";
  const autre = autreProfil();
  return `<a class="retour" href="#/profil">${icone("caret-left")}Profil</a>
  <div class="titre"><h1 tabindex="-1">Réglages${autre ? ` de ${esc(E.profil.nom)}` : ""}</h1></div>
  <div class="reglages">
  <section class="bloc" aria-labelledby="tRepas" data-resume="${esc(resumeAlimentation(r, fodmap))}"><h2 id="tRepas">Mon alimentation</h2>
    <div class="options">
      <label class="option"><input type="checkbox" id="rStockSeul"${r.stock_seul ? " checked" : ""}><span><b>Stock uniquement</b><small>Seulement des plats faits avec ce que tu as en stock. Décoché : surtout ton stock, avec un peu de variété.</small></span></label>
      <label class="option"><input type="checkbox" id="rMemePlat"${r.meme_plat !== false ? " checked" : ""}><span><b>Le même plat midi et soir</b><small>Un seul plat par jour, au déjeuner et au dîner. Décoche pour deux plats différents.</small></span></label>
      <label class="option"><input type="checkbox" id="rFodmap"${fodmap ? " checked" : ""}><span><b>Pauvre en FODMAP</b><small>Seulement des plats pauvres en FODMAP.</small></span></label>
    </div>
    <div id="rRegime">${champsRegime(E.regime || {}, true)}</div>
  </section>
  ${blocObjectifs(`<div class="objectif-reglages">
      ${(E.phases || []).length > 1 && !E.phases_perso ? champ("rPhase", "Phase du programme", choix("rPhase", "phase", r.phase || "", [["", "Automatique, selon la date"], ...E.phases.map(p => [p.n, `${p.n}. ${esc(p.nom)}, ${nombre(p.kcal)} kcal`])])) : ""}
      ${champ("rAdj", "Ajustement des calories", choix("rAdj", "ajustement", r.ajustement || 0, [-300, -150, 0, 150, 300].map(v => [v, `${v > 0 ? "+" : ""}${v} kcal`])), "Par paliers de 150 kcal, si ton poids s'écarte de ce que tu vises.")}
      ${champ("rDebut", "Début de mon suivi", saisie("rDebut", "date_debut", r.date_debut, "date", `max="${isoDuJour()}"`), "Le suivi compte ton poids et tes mesures à partir de ce jour.")}
      </div>`, `${nombre(kcal)} kcal · ${choisie.prot} g`)}
  ${autreAvecTelephone() ? "" : `<section class="bloc" aria-labelledby="tInfos" data-resume="${esc([i.nom || E.profil.nom, i.taille_cm ? i.taille_cm + " cm" : "", i.poids_kg ? virgule(i.poids_kg) + " kg" : ""].filter(Boolean).join(" · "))}"><h2 id="tInfos">Mes informations</h2>
    <p class="doux petit sous-titre">${E.profil.calcule ? "Change une valeur : tes calories, tes protéines et tes vitamines sont recalculées." : "Ton programme vient de ton fichier de profil : ces informations ne changent pas tes besoins."}</p>
    <form class="formulaire" id="fMesInfos" novalidate>
      <div class="champs2">${champ("iPrenom", "Prénom", saisie("iPrenom", "prenom", i.nom || E.profil.nom, "text", 'maxlength="40" autocomplete="given-name"'))}
        ${champ("iNom", "Nom", saisie("iNom", "nom_famille", i.nom_famille, "text", 'maxlength="60" autocomplete="family-name"'))}</div>
      <div class="champs2">${champ("iNaissance", "Date de naissance", saisie("iNaissance", "date_naissance", i.date_naissance, "date", `min="${isoPlusAns(-95)}" max="${isoPlusAns(-15)}"`))}
        ${champ("iSexe", "Sexe", choix("iSexe", "sexe", i.sexe || "homme", [["femme", "Femme"], ["homme", "Homme"]]))}</div>
      ${champ("iPays", "Pays", `<select id="iPays" name="pays" autocomplete="country">${optionsPays(i.pays || paysProbable())}</select>`)}
      <div class="champs2">${champ("iTaille", "Taille, en cm", saisie("iTaille", "taille_cm", i.taille_cm, "text", 'inputmode="numeric"'))}
        ${champ("iPoids", "Poids, en kg", saisie("iPoids", "poids_kg", virgule(i.poids_kg), "text", 'inputmode="decimal"'))}</div>
      ${E.profil.calcule ? `<div class="champs2">${champ("iActivite", "Activité", choix("iActivite", "activite", i.activite, [["sedentaire", "Sédentaire"], ["leger", "Sport léger, 1 à 3 fois par semaine"], ["modere", "Sport modéré, 3 à 5 fois par semaine"], ["actif", "Sport intense, 6 à 7 fois par semaine"], ["intense", "Sport très intense ou métier physique"]]))}
        ${champ("iObjectif", "Objectif", choix("iObjectif", "objectif", obj, [["perte", "Perdre du poids"], ["maintien", "Garder mon poids"], ["prise", "Prendre du muscle"]]))}</div>` : ""}
      <p class="petit discret">Identifiant de connexion : <b>${esc(E.profil.id)}</b> (il ne change pas).</p>
      <small id="eMesInfos" class="erreur" role="alert" style="display:block;color:var(--critique)"></small>
      <button class="bouton second" type="submit">Enregistrer mes informations</button>
    </form></section>`}
  ${!autre && typeof blocClaude === "function" ? blocClaude() : ""}
  ${(() => { apresRendu.push(async () => {
      const f = $("fCoord"); if (!f) return;
      try { const r = await fetch("/api/compte/moi"); if (!r.ok) throw 0; const m = await r.json();
        if (m.erreur) throw 0; $("cEmail").value = m.email || ""; telRemplir($("cTel"), m.telephone); }
      catch (e) { f.hidden = true; }                   // sur le PC : pas de compte en ligne
    }); return ""; })()}
  ${blocRappels()}
  ${autre ? "" : `<section class="bloc" aria-labelledby="tLangue" data-resume="${esc((LANGUES.find(x => x[0] === LANGUE) || LANGUES[0])[1])}"><h2 id="tLangue">Langue</h2>
    <p class="doux petit sous-titre">L'appli s'affiche dans cette langue. Au départ, celle de ton téléphone.</p>
    ${choixLangue()}</section>
  <section class="bloc" aria-labelledby="tCompte" data-resume="Email, mot de passe"><h2 id="tCompte">Mon compte</h2>
    <form class="formulaire" id="fCoord" novalidate>
      <div class="champ"><label for="cEmail">Email</label><input id="cEmail" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="120" placeholder="prenom@gmail.com"></div>
      <div class="champ"><label for="cTel">Téléphone</label>${champTel("cTel", "telephone", (E.profil.identite || {}).pays || paysProbable())}</div>
      <small id="eCoord" class="erreur" role="alert" style="display:block;color:var(--critique)"></small>
      <button class="bouton second" type="submit">Enregistrer email et téléphone</button></form>
    <form class="formulaire" id="fMdp" novalidate style="margin-top:18px">
      <input type="text" name="username" autocomplete="username" value="${esc(E.profil.id)}" hidden>
      ${E.utilisateur.admin ? "" : `<div class="champ"><label for="mAncien">Mot de passe actuel</label>
        <input id="mAncien" name="ancien" type="password" autocomplete="current-password" required></div>`}
      <div class="champ"><label for="mNouveau">Nouveau mot de passe</label>${champMdp("mNouveau", "nouveau", "new-password")}
        <small id="eMdpN" class="erreur" role="alert" style="display:block;color:var(--critique)"></small></div>
      <button class="bouton second" type="submit">Changer le mot de passe</button></form>
  </section>
  <p class="reg-fin"><button class="bouton sobre" data-action="deconnexion">${icone("sign-out")}Se déconnecter</button></p>`}
  </div>${(apresRendu.push(plierReglages), "")}`;
}
// Réglages en lignes repliables, comme les réglages du téléphone (Taha, 22/11/2026 : « pas belle, des trucs très
// grands ») : le titre de chaque rubrique et un résumé ; toucher ouvre la rubrique. Ce qui est ouvert le reste.
const REG_OUVERTS = new Set();
function plierReglages() {
  document.querySelectorAll(".reglages > section.bloc:not(.toujours)").forEach(s => {
    const h = s.querySelector(":scope > h2");
    if (!h || h.querySelector(".reg-tete")) return;
    let resume = s.dataset.resume || "";
    if (h.id === "tPeriodes" && !resume) { const n = s.querySelectorAll(".periode").length; resume = n ? `${n > 1 ? `${n} périodes` : `${n} période`}` : ""; }
    if (h.id === "tClaude") resume = typeof M !== "undefined" && M.claude ? (M.claude.partage ? "IA partagée" : "Ta clé") : "À brancher";
    const ouvert = REG_OUVERTS.has(h.id);
    s.classList.add("pliable"); s.classList.toggle("ouvert", ouvert);
    h.innerHTML = `<button type="button" class="reg-tete" aria-expanded="${ouvert}"><span>${esc(h.textContent)}</span>${resume ? `<small>${esc(resume)}</small>` : ""}${icone("caret-right")}</button>`;
  });
}
document.addEventListener("click", ev => {
  const b = ev.target.closest && ev.target.closest(".reg-tete");
  if (!b) return;
  const s = b.closest("section"), id = b.closest("h2").id, ouvert = !s.classList.contains("ouvert");
  s.classList.toggle("ouvert", ouvert); b.setAttribute("aria-expanded", String(ouvert));
  if (ouvert) REG_OUVERTS.add(id); else REG_OUVERTS.delete(id);
});
// La barre du stock (Taha, 22/11/2026) : ce qu'on a acheté, tapé en clair, entre tout de suite dans le stock. Le texte
// clair est lu par l'appli elle-même ; l'IA ne lit que ce qui est flou (« 2 boîtes de thon »).
document.addEventListener("submit", async ev => {
  if (ev.target.id !== "fStockTaper") return;
  ev.preventDefault();
  const champ = $("filtre"), b = ev.target.querySelector("button"), texte = champ.value.trim();
  $("eStockTaper").textContent = "";
  if (!texte) return champ.focus();
  // Ce qui est déjà dans le stock se voit et se modifie dans la liste ; on n'ajoute que le reste (ou une quantité tapée).
  const voulus = motsStock(texte), deja = (E.stock || []).some(l => voulus.every(m => motsStock(l.nom).some(n => n.startsWith(m))));
  if (deja && !/\d/.test(texte)) return champ.blur();
  champ.disabled = true; if (b) { b.disabled = true; b.classList.add("occupe"); }
  const rep = await appel("/api/stock/taper", { texte });
  if (rep === true && E.stock_ajout) {
    const a = E.stock_ajout;
    filtreStock = "";
    rendre();
    dire(`Ajouté : ${a.ajoutes.map(x => { const e = enAffiche(x); return `${x.nom} ${nombre(e.q, e.q % 1 ? 2 : 0).replace(/(,\d*?)0+$/, "$1").replace(/,$/, "")} ${e.u}`; }).join(", ")}${a.incompris.length ? ` · pas compris : ${a.incompris.join(", ")}` : ""}`);
    return;                                          // la page est redessinée avec le stock à jour
  }
  champ.disabled = false; if (b) { b.disabled = false; b.classList.remove("occupe"); }
  if (rep && rep.erreur) $("eStockTaper").textContent = rep.erreur;
});
document.addEventListener("submit", async ev => {
  const f = ev.target;
  if (f.dataset && f.dataset.completer) {
    ev.preventDefault();
    const vit = lireVitamines(`cv${f.dataset.i}_`);
    if (vit.erreur) { $(`eCv${f.dataset.i}`).textContent = vit.erreur; return; }
    const rep = await appel("/api/vitamines/renseigner", { nom: f.dataset.completer, vitamines: vit });
    if (rep === true) { rendre(); dire(`Vitamines de « ${f.dataset.completer} » enregistrées.`); }
    else if (rep && rep.erreur) $(`eCv${f.dataset.i}`).textContent = rep.erreur;
    return;
  }
  if (f.id === "fObjectif") {
    ev.preventDefault();
    const rep = await appel("/api/reglages", { ...(f.phase ? { phase: f.phase.value ? Number(f.phase.value) : null } : {}),
      ajustement: Number(f.ajustement.value), date_debut: f.date_debut.value || null });
    if (rep === true) { rendre(); dire("Réglages enregistrés."); } else if (rep && rep.erreur) $("eObjectif").textContent = rep.erreur;
  }
  if (f.id === "fMesInfos") {
    ev.preventDefault();
    const corps = Object.fromEntries(new FormData(f).entries());
    const rep = await appel("/api/profil/modifier", corps);
    if (rep === true) { rendre(); dire("Informations enregistrées."); } else if (rep && rep.erreur) $("eMesInfos").textContent = rep.erreur;
  }
});
document.addEventListener("click", ev => {
  const b = ev.target.closest && ev.target.closest("#eauCheck");
  if (!b) return;
  // Coché : l'objectif du jour est bu ; décoché : rien. Enregistré sans redessiner la page.
  const fait = b.getAttribute("aria-pressed") !== "true", litres = fait ? E.eau.litres : 0, date = b.dataset.date;
  b.setAttribute("aria-pressed", String(fait));
  E.eau.bu = { ...(E.eau.bu || {}), [date]: litres };
  appel("/api/eau", { date, litres }).then(ok => { if (ok !== true) { dire("L'eau n'a pas pu être enregistrée."); rendre(); } });
});
document.addEventListener("input", ev => {
  if (ev.target.id !== "eauBarre") return;
  const b = ev.target;
  b.style.setProperty("--rempli", `${100 * b.value / b.max}%`);
  if ($("eauBu")) $("eauBu").textContent = virgule(Number(b.value));
});
document.addEventListener("change", async ev => {
  if (ev.target.dataset && ev.target.dataset.photoPlat) {        // ta photo de ton plat (prise ou choisie), avec ou sans Claude
    const f = ev.target.files[0]; if (!f) return;
    let image;
    try { image = await photoReduite(f); } catch (e) { return dire("Photo illisible."); }
    fermerCarte(true);
    agir("/api/plat/photo", { plat: ev.target.dataset.photoPlat, photo: image }, "Photo ajoutée.");
    return;
  }
  if (ev.target.id === "eauBarre") {                // enregistré sans redessiner la page : la barre ne saute pas
    const b = ev.target;
    appel("/api/eau", { date: b.dataset.date, litres: Number(b.value) }).then(ok => { if (ok !== true) { dire("L'eau n'a pas pu être enregistrée."); rendre(); } });
  }
  if (ev.target.id === "rStockSeul") {
    const oui = ev.target.checked;
    appel("/api/reglages", { stock_seul: oui }).then(rep => {
      if (rep !== true) return rendre();
    rendre();
      dire(!oui ? "Des plats variés, ton stock d'abord." : !(E.stock || []).length ? "Stock uniquement : ajoute d'abord ce que tu as dans Stock."
        : E.stock_refaits ? `Stock uniquement : ${E.stock_refaits > 1 ? `${E.stock_refaits} repas refaits` : `${E.stock_refaits} repas refait`} avec ton stock.`
        : "Stock uniquement : rien à changer (déjà faisable, ou aucun plat entièrement faisable).");
    });
  }
  if (ev.target.dataset && ev.target.dataset.regime != null && $("rRegime"))
    agir("/api/regime", lireRegime($("rRegime")), "C'est noté : le catalogue et tes prochains menus en tiennent compte.");
  if (ev.target.id === "rMemePlat") agir("/api/reglages", { meme_plat: ev.target.checked }, ev.target.checked
    ? "Le même plat midi et soir, dès aujourd'hui." : "Deux plats différents midi et soir, dès aujourd'hui.");
  if (ev.target.id === "rFodmap") agir("/api/profil/modifier", { fodmap: ev.target.checked }, ev.target.checked ? "Pauvre en FODMAP : pour les semaines composées." : "FODMAP retiré.");
});
function vueReglages() {
  if (enSuivi()) return vueReglagesFlemmard();
  barre("");
  const r = E.reglages, phase = E.phase, pref = E.profil.preferences, fodmap = pref.modes.includes("fodmap");
  const choisie = r.phase ? (E.phases.find(p => p.n === r.phase) || phase) : phase;
  const kcal = choisie.kcal + (r.ajustement || 0), semaine = r.budget_mois * 7 / 30;
  const modeSuivi = `<section class="bloc mode-suivi" aria-labelledby="tMode"><h2 id="tMode">Mode flemmard</h2>
    <p class="doux">${enSuivi() ? "Activé : l'écran Jour suit ta journée (tes plats prévus, ce que tu ajoutes, ce qu'il te reste). Ni courses, ni préparation à l'avance."
      : "Désactivé : l'appli compose tes semaines, tes courses et ta cuisine à l'avance."}</p>
    ${E.modes.some(m => m.impose) ? `<p class="petit discret">C'est le seul mode pour l'instant : les menus préparés avec courses, « moins cher » et « plus varié » arrivent bientôt.</p>`
      : `<button class="bouton ${enSuivi() ? "second" : ""}" data-action="modeSuivi" data-valeur="${enSuivi() ? "non" : "oui"}">${enSuivi() ? "Revenir aux menus préparés" : "Passer en mode flemmard"}</button>`}</section>`;
  return `<div class="tete">
    <div><h1 tabindex="-1">Réglages</h1><p class="doux">Ils s'appliquent à la prochaine semaine composée.</p></div>
    <div class="ligne"><span class="puce">Phase ${choisie.n}${r.phase ? ", choisie à la main" : ", automatique"}</span><a class="bouton sobre" href="#/plus">${icone("caret-left")}Plus</a></div>
  </div>
  ${modeSuivi}
  <div class="grille accueil">
    <section class="bloc" aria-labelledby="tProg"><h2 id="tProg">Programme et budget</h2>
      <div class="faits">
        <div class="fait"><b>${nombre(kcal)}</b><span>kcal par jour</span></div>
        <div class="fait"><b>${choisie.prot} g</b><span>de protéines par jour</span></div>
        <div class="fait"><b>${euros(semaine)}</b><span>de budget par semaine</span></div>
      </div>
      ${barreDesPhases()}
      <p class="petit doux" style="margin:8px 0 18px">Phase ${choisie.n}${(E.phases || []).length > 1 ? ` sur ${E.phases.length}` : ""} : ${esc(choisie.nom)}.</p>
      <form class="formulaire" id="fReglages" novalidate>
        <div class="champs2">
        <div class="champ"><label for="rPhase">Phase du programme</label>
          <select id="rPhase" name="phase"><option value="">Automatique, selon la date</option>
            ${E.phases.map(p => `<option value="${p.n}"${r.phase === p.n ? " selected" : ""}>${p.n}. ${esc(p.nom)}, ${nombre(p.kcal)} kcal</option>`).join("")}</select></div>
        <div class="champ"><label for="rAdj">Ajustement des calories</label>
          <select id="rAdj" name="ajustement">${[-300, -150, 0, 150, 300].map(v => `<option value="${v}"${(r.ajustement || 0) === v ? " selected" : ""}>${v > 0 ? "+" : ""}${v} kcal</option>`).join("")}</select>
          <small>Par paliers de 150 kcal, si ton poids s'écarte de la courbe du plan.</small></div>
        <div class="champ"><label for="rBudget">Budget par mois, en euros</label>
          <input id="rBudget" name="budget" type="number" inputmode="numeric" min="100" max="2000" step="10" autocomplete="off" value="${r.budget_mois}">
          <small id="eBudget" class="erreur" hidden>Indique un budget entre 100 et 2 000 euros.</small></div>
        <div class="champ"><label for="rSemaines">Semaines composées d'un coup</label>
          <select id="rSemaines" name="semaines">${[1, 2, 3, 4].map(v => `<option${(E.nb_semaines || 1) === v ? " selected" : ""}>${v}</option>`).join("")}</select>
          <small>Un seul panier pour toutes ; le frais s'achète chaque semaine.</small></div>
        <div class="champ"><label for="rPlats">Plats différents par semaine</label>
          <select id="rPlats" name="plats">${[5, 6, 7, 8, 10].map(v => `<option${r.nb_plats === v ? " selected" : ""}>${v}</option>`).join("")}</select>
          <small>Chaque plat se cuisine un soir, en double pour le lendemain midi.</small></div>
        </div>
        <button class="bouton" type="submit">Enregistrer les réglages</button>
      </form>
    </section>

  ${E.profil.calcule ? `<section class="bloc" aria-labelledby="tInfos"><h2 id="tInfos">Mes informations</h2>
    <p class="doux petit sous-titre">Ce que tu avais indiqué à la création. Change une valeur, l'appli recalcule tes calories, tes protéines et tes vitamines.</p>
    <form class="formulaire" id="fInfos" novalidate>
      <div class="champs2">
      ${(() => { const i = E.profil.identite || {}, obj = { "Perte de poids": "perte", "Maintien": "maintien", "Prise de muscle": "prise" }[E.profil.programme] || "maintien";
        const num = (id, libelle, v, min, max, pas) => `<div class="champ"><label for="i_${id}">${libelle}</label><input id="i_${id}" name="${id}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${pas}" autocomplete="off" value="${v ?? ""}" required></div>`;
        const sel = (id, libelle, v, options) => `<div class="champ"><label for="i_${id}">${libelle}</label><select id="i_${id}" name="${id}">${options.map(([k, t]) => `<option value="${k}"${k === v ? " selected" : ""}>${t}</option>`).join("")}</select></div>`;
        return num("poids_kg", "Poids, en kilos", i.poids_kg, 35, 250, 0.1) + num("age", "Âge, en années", i.age, 15, 95, 1) + num("taille_cm", "Taille, en centimètres", i.taille_cm, 130, 220, 1)
          + sel("activite", "Activité", i.activite, [["sedentaire", "Sédentaire"], ["leger", "Sport léger, 1 à 3 fois par semaine"], ["modere", "Sport modéré, 3 à 5 fois par semaine"], ["actif", "Sport intense, 6 à 7 fois par semaine"], ["intense", "Sport très intense ou métier physique"]])
          + sel("objectif", "Objectif", obj, [["perte", "Perdre du poids"], ["maintien", "Garder mon poids"], ["prise", "Prendre du muscle"]]); })()}
      </div>
      <div class="options" style="margin-bottom:18px">
        <label class="option"><input type="checkbox" name="fodmap"${fodmap ? " checked" : ""}><span><b>Régime pauvre en FODMAP</b><small>Coché par défaut quand tu composes une semaine.</small></span></label>
        <label class="option"><input type="checkbox" name="boucher"${E.profil.boucher ? " checked" : ""}><span><b>J'achète ma viande chez le boucher</b><small>La viande n'est jamais mise au panier du supermarché.</small></span></label>
      </div>
      <small id="eInfos" class="erreur" role="alert" style="display:block;margin-bottom:12px;color:var(--accent-texte)"></small>
      <button class="bouton second" type="submit">Recalculer mes besoins</button></form></section>` : ""}

    <div class="pile">
    ${E.profil.chrome ? `<section class="bloc" aria-labelledby="tEns"><h2 id="tEns">Mes enseignes</h2>
      <p class="doux petit sous-titre">L'appli remplit ton panier dans un Chrome qui n'appartient qu'à ce profil. Ouvre-le sur le PC pour te connecter à tes enseignes : ton mot de passe reste entre toi et l'enseigne.</p>
      <button class="bouton second" data-action="enseignes">Ouvrir mes enseignes sur le PC</button></section>` : ""}
    ${E.profil.id !== "defaut" ? `<section class="bloc" aria-labelledby="tMdp"><h2 id="tMdp">Mot de passe de ${esc(E.profil.nom)}</h2>
      <form class="formulaire" id="fMdp" novalidate>
        <input type="text" name="username" autocomplete="username" value="${esc(E.profil.id)}" hidden>
        ${E.utilisateur.admin ? "" : `<div class="champ"><label for="mAncien">Mot de passe actuel</label>
          <input id="mAncien" name="ancien" type="password" autocomplete="current-password" required></div>`}
        <div class="champ"><label for="mNouveau">Nouveau mot de passe</label>
          <input id="mNouveau" name="nouveau" type="password" autocomplete="new-password" minlength="8" required aria-describedby="eMdpN">
          <small id="eMdpN">8 caractères au moins.</small></div>
        <button class="bouton second" type="submit">Changer le mot de passe</button></form></section>` : ""}
    <section class="bloc" aria-labelledby="tSession"><h2 id="tSession">Session</h2>
      <p class="doux petit sous-titre">Connecté en tant que ${esc(E.profil.nom)}. La session dure 30 jours sur cet appareil.</p>
      <button class="bouton sobre" data-action="deconnexion">${icone("sign-out")}Se déconnecter</button></section>
    </div>
  </div>`;
}

/* ------------------------------------------------------------ etats particuliers */
function vide(titre, texte, lien, libelle) {
  return `<div class="vide"><h2>${esc(titre)}</h2><p>${esc(texte)}</p><a class="bouton second" href="${lien}">${esc(libelle)}</a></div>`;
}
function avis(nomIcone, titre, texte) {
  return `<div class="avis" role="status">${icone(nomIcone)}<div><p><strong>${esc(titre)}</strong></p><p>${texte}</p></div></div>`;
}
function vueIntrouvable() {
  barre("");
  return `<div class="titre"><h1 tabindex="-1">Page introuvable</h1></div>${vide("Cette page n'existe pas", "Ce qu'elle montrait a peut-être été retiré, ou l'adresse est incomplète.", "#/semaine", enSuivi() ? "Retour au jour" : "Retour à la semaine")}`;
}
function vuePanne() {
  rendreNavigation("");
  barre("");
  $("contenu").innerHTML = `<div class="vide"><h1 tabindex="-1" style="margin-bottom:8px">L'appli ne répond pas</h1>
    <p>Vérifie ta connexion à internet, puis réessaie.</p>
    <button class="bouton" data-action="reessayer">Réessayer</button></div>`;
}
// Sur un téléphone Android, dans le navigateur (pas dans l'appli) : le lien pour installer l'appli (Taha, 22/11/2026).
const lienAndroid = () => /Android/i.test(navigator.userAgent) && !window.Capacitor
  ? `<p style="margin-top:18px"><a class="bouton second" href="telecharger/mon-meal-prep.apk" download>${icone("arrows-clockwise")}Installer l'appli Android</a></p>
     <p class="petit discret">Android te demandera d'autoriser l'installation depuis ton navigateur, une seule fois.</p>` : "";
// Connexion, inscription, mot de passe oublié : un fond à motifs (haltères, biceps, assiettes, verres…) et une carte
// au centre (Taha, 23/11/2026 : « trop froide, pas accueillante »).
const accueil = (contenu, sous = "") => `<div class="auth"><div class="auth-tete"><img class="auth-logo" src="icone.svg" alt="" width="52" height="52">
    <b>Mon Meal Prep</b>${sous ? `<span>${sous}</span>` : ""}</div>${contenu}</div>`;
function vueConnexion(erreur = "") {
  clearTimeout(minuteur);
  rendreNavigation("");
  barre("");
  $("contenu").innerHTML = accueil(`<div class="auth-carte">
    <h1 tabindex="-1">Bon retour</h1><p class="auth-intro">Tes repas, tes macros et ton suivi t'attendent.</p>
    <form class="formulaire" id="fConnexion" novalidate>
      <div class="champ"><label for="ident">Identifiant ou email</label>
        <input id="ident" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ton identifiant" required></div>
      <div class="champ"><label for="mdp">Mot de passe</label>
        <input id="mdp" name="password" type="password" autocomplete="current-password" spellcheck="false" placeholder="••••••••••" required aria-describedby="eMdp">
        <small id="eMdp" class="erreur" role="alert">${esc(erreur)}</small></div>
      <button class="bouton large" type="submit">Entrer</button>
      <p class="auth-oubli"><button type="button" class="lien" data-action="oubliMdp">Mot de passe oublié ?</button></p>
    </form></div>
    <p class="auth-bas">Pas encore de compte ? <button type="button" class="lien" data-action="versCreation">Créer mon profil</button></p>
    ${lienAndroid()}<p class="auth-langue">${choixLangue()}</p>`, "Cuisine malin, mange juste.");
}

/* ------------------------------------------------------------ rendu */
const VUES = { semaine: vueSemaine, plat: vuePlat, courses: vueCourses, cuisine: a => a.arg ? vueRecette(a) : vueCuisine(a),
               plus: vuePlus, avancement: vueAvancement, budget: vueBudget, vitamines: vueVitamines, profil: vueProfil, profils: vueProfils,
               nouveau: vueNouveau, stock: vueStock, catalogue: vueCatalogue, journal: vueJournal, reglages: vueReglages, suivi: vueSuivi,
               historique: vueHistorique, conso: vueConso, famille: vueFamille };
let derniereAdresse = "", adressePrecedente = "";
// Revenir d'un pas (Taha, 22/11/2026 : « le retour remet à la première page ») : la page d'où l'on vient garde sa
// position, et une page ouverte depuis la carte d'un plat (« Voir la recette ») ramène sur cette carte.
const POSITIONS = new Map();
let PAGE_DEPUIS_CARTE = null, RETOUR_ARRIERE = false;

// Les plats que tu as créés, traduits par l'IA (traductions.json du moteur) : ajoutés au dictionnaire de la page ;
// s'il en manque, on les demande une fois (seulement hors du français).
function i18nPerso() {
  if (LANGUE === "fr" || !E) return;
  for (const [k, v] of Object.entries(E.traductions || {})) if (v && v[LANGUE]) I18N.exact.set(k, v[LANGUE]);
  if (E.a_traduire > 0 && !I18N.demande) {
    I18N.demande = true;
    appel("/api/traductions/completer", {}).then(ok => { if (ok === true && E.traduits) { I18N.demande = false; rendre(); } });   // tant que ça avance, la suite
  }
}
function rendre() {
  i18nPerso();
  if (!E) return;
  let r = route();
  if (["plat", "plus", "journal", "profils", "nouveau"].includes(r.vue)) { history.replaceState(null, "", "#/semaine"); r = route(); }
  const changement = location.hash !== derniereAdresse;
  if (changement && derniereAdresse) POSITIONS.set(derniereAdresse, verrou.actif ? verrou.y : window.scrollY);   // carte ouverte : la page est figée
  const pc = changement ? PAGE_DEPUIS_CARTE : null, revientCarte = !!(pc && location.hash === pc.depuis);
  if (pc && !revientCarte && location.hash !== pc.page) PAGE_DEPUIS_CARTE = null;
  if (revientCarte) { PAGE_DEPUIS_CARTE = null; RETOUR_ARRIERE = true; }
  rendreNavigation(ongletDe(r.vue));
  apresRendu = [];
  const NOMS = { semaine: "", plat: "Plat", courses: "Courses", cuisine: "Cuisine", plus: "Plus", catalogue: "Catalogue", avancement: "Avancement",
                 budget: "Budget", vitamines: "Vitamines", stock: "Stock", journal: "Journal de l'appli", profil: "Mon profil", profils: "Profils",
                 nouveau: "Nouveau profil", reglages: "Réglages", suivi: "Mon suivi", historique: "Historique", conso: "Suivi de conso", famille: "Ma famille" };
  const fin = r.arg && recette(r.arg) ? recette(r.arg).nom : "";
  $("fil").innerHTML = [NOMS[r.vue], fin].filter(Boolean).map(t => `<span>/</span><span>${esc(t)}</span>`).join("");
  $("pucePhase").textContent = `Phase ${E.phase.n} · ${E.phase.nom}`;
  $("pucePhase").hidden = false;
  $("contenu").innerHTML = (E.alertes || []).map(a => `<p class="alerte" role="alert">${icone("warning-circle")}<span>${esc(a)}</span></p>`).join("")
    + (VUES[r.vue] || vueIntrouvable)(r);
  apresRendu.forEach(tracer => tracer());
  const titre = $("contenu").querySelector("h1");
  document.title = (titre ? titre.textContent + " - " : "") + "Mon Meal Prep";
  if (changement) {
    adressePrecedente = derniereAdresse;
    derniereAdresse = location.hash;
    if (RETOUR_ARRIERE) window.scrollTo(0, POSITIONS.get(location.hash) || 0);
    else if (!((r.vue === "semaine" || (r.vue === "cuisine" && !r.arg)) && r.params.has("jour"))) window.scrollTo(0, 0);
    RETOUR_ARRIERE = false;
    if (revientCarte && recette(pc.id)) setTimeout(() => { if (!document.querySelector(".carte-fond") && !$("dialogue").open) ficheRapide(pc.id, pc.ctx, null, pc.vu); }, 0);
    if (titre && matchMedia("(pointer: fine)").matches) titre.focus({ preventScroll: true });
  }
  const suivi = $("suivi");
  if (suivi) suivi.scrollTop = suivi.scrollHeight;
  clearTimeout(minuteur);
  if (E.tache.etat === "en cours") minuteur = setTimeout(async () => { if (await appel("/api/etat") === true) rendre(); }, 3000);
}

/* ------------------------------------------------------------ actions */
const ACTIONS = {
  accueilVu: () => agir("/api/reglages", { accueil: false }, ""),
  coursesFamille: () => coursesFamille(),
  objectifLu: () => agir("/api/objectif/auto", { lu: true }, ""),
  objectifAnnuler: () => agir("/api/objectif/auto", { annuler: true }, "Annulé : tes calories restent comme avant."),
  objectifAuto: b => agir("/api/objectif/auto", { actif: b.checked },
    b.checked ? "Chaque lundi, l'appli regardera ton poids pour régler tes calories." : "Plus d'ajustement : tes calories reviennent à ton objectif."),
  scannerStock: () => scannerProduit("stock"),
  scannerPlat: () => scannerProduit("plat"),
  composer: () => E.mois ? ACTIONS.suivante() : demanderComposition(false),
  recomposer: () => demanderComposition(true),
  ajouterSemaine: () => agir("/api/semaine/generer", { modes: E.semaine.modes || [], semaines: (E.mois ? E.mois.semaines.length : 1) + 1, ajouter: true },
    "Semaine ajoutée à la suite : tes plats déjà choisis ne changent pas."),
  async ecarter(b) {
    const r = recette(b.dataset.plat);
    if (await confirmer({ titre: "Écarter ce plat ?", oui: "Écarter",
      texte: `« ${r.nom} » sort de la semaine, et l'appli la recompose sans lui.` }))
      if (await agir("/api/semaine/remplacer", { plat: r.id }, "Plat écarté, semaine recomposée.")) location.hash = "#/semaine";
  },
  async panier() {
    const refaire = !!(E.courses_mois && E.courses_mois.panier);
    if (await confirmer({ titre: refaire ? "Refaire le panier ?" : "Passer la commande ?", oui: refaire ? "Refaire le panier" : "Passer la commande",
      texte: `L'appli relève les prix et met ${E.mois ? `les produits des ${E.mois.nb - E.mois.rang} semaines` : "les produits"} dans ton panier ${E.magasin.principale}, en une vingtaine de minutes, en lisant les étiquettes${((E.semaine || {}).modes || []).includes("fodmap") ? " (halal et pauvre en FODMAP : ni ail, ni oignon, ni fructose ajouté)" : " (halal)"}. Vide d'abord ce panier sur le site de l'enseigne s'il contient d'anciens produits. L'appli ne paie jamais : tu choisis la livraison et tu paies toi-même.` }))
      agir("/api/panier", {}, "L'appli s'en occupe.");
  },
  async valider() {
    const m = E.mois;
    if (await confirmer({ titre: m && m.nb - m.rang > 1 ? `Valider les ${m.nb - m.rang} semaines ?` : "Valider la semaine ?", oui: "Valider le menu", non: "Pas encore",
      texte: "Le menu est arrêté et la liste de Courses est prête. Rien n'est commandé : le panier ne se remplit que quand tu cliques sur « Passer la commande » dans Courses." }))
      if (await agir("/api/semaine/valider", {}, "Menu validé. Vérifie la liste, puis passe la commande.")) location.hash = "#/courses";
  },
  changer: b => demanderChangement(Number(b.dataset.semaine), Number(b.dataset.jour), b.dataset.moment),
  clonerJour: b => demanderClonage(Number(b.dataset.semaine), Number(b.dataset.jour)),
  retirerJour: b => { const k = Number(b.dataset.semaine), n = Number(b.dataset.jour);
    apercuChangement(k, { type: "retirer_jour", jour: n }, `Retirer ${planDe(k).jours[n].jour.toLowerCase()} de la semaine ?`); },
  creerPlat: b => creerPlatIA(b.dataset.cat || "plat"),
  supprimerPlat: async b => { if (await agir("/api/plat_perso/supprimer", { plat: b.dataset.plat }, "Plat supprimé.")) location.hash = "#/catalogue"; },
  ajuster: b => demanderAjustement(b.dataset.plat),
  actionsJour: b => actionsDuJour(Number(b.dataset.semaine), Number(b.dataset.jour)),
  modeSuivi: async b => { if (await agir("/api/reglages", { mode_suivi: b.dataset.valeur === "oui" },
    b.dataset.valeur === "oui" ? "Mode flemmard : note ce que tu manges." : "Retour aux menus préparés.")) location.hash = "#/semaine"; },
  noterRepas: b => noterRepas({ date: b.dataset.date }),
  ouvrirRepas: b => { const e = E.journal_repas.jours.flatMap(j => j.entrees).find(x => x.id === b.dataset.id); if (e) noterRepas({ date: e.date, entree: e }); },
  reequilibrer: b => { const k = Number(b.dataset.semaine), n = Number(b.dataset.jour);
    apercuChangement(k, { type: "reequilibrer", jour: n, moment: b.dataset.moment, plat: b.dataset.plat },
      `Équilibrer pour la journée`); },
  ajusterJour: b => demanderAjustement(b.dataset.plat, null, { k: Number(b.dataset.semaine), n: Number(b.dataset.jour) }),
  async retirerPlat(b) {
    const r = recette(b.dataset.plat);
    if (!r || !await confirmer({ titre: "Retirer ce plat pour de bon ?", oui: "Retirer définitivement", non: "Annuler",
      texte: `« ${r.nom} » ne reviendra plus dans ton catalogue, tes menus ni tes idées. Cette action est irréversible.` })) return;
    agir("/api/plat/retirer", { plat: r.id }, `« ${r.nom} » retiré.`);
  },
  retirerRepas: b => { const k = Number(b.dataset.semaine), n = Number(b.dataset.jour);
    apercuChangement(k, { type: "retirer", jour: n, moment: b.dataset.moment }, `Retirer « ${(recette(b.dataset.plat) || { nom: "ce repas" }).nom} » ?`); },
  appoint: () => agir("/api/appoint", {}, "Stock mis à jour avec ces produits."),
  async oublierSuivi(b) {
    if (await confirmer({ titre: "Supprimer ces mesures ?", oui: "Supprimer", non: "Garder", texte: `Les mesures du ${dateCourte(b.dataset.date)} seront effacées.` }))
      agir("/api/suivi/oublier", { date: b.dataset.date }, "Mesures supprimées.");
  },
  payer: () => demanderPaiement(false),
  payerMois: () => demanderPaiement(false, "mois"),
  async fruitsSecs() {
    const f = E.courses_mois.fruits_secs;
    if (await confirmer({ titre: "Fruits secs achetés ?", oui: "Oui, c'est acheté", non: "Pas encore",
      texte: `${[f.acheter ? `${nombre(f.acheter)} g de fruits secs` : "", ...f.autres.map(l => l.nom.toLowerCase())].filter(Boolean).join(", ")} : tout entre dans ton stock.` }))
      agir("/api/fruits_secs", {}, "Stock mis à jour.");
  },
  async suivante() {
    const m = E.mois, fin = m.rang + 1 >= m.nb;
    if (await confirmer({ titre: fin ? `Composer les ${m.nb} semaines suivantes ?` : "Passer à la semaine suivante ?", oui: fin ? "Composer" : "Passer à la suivante",
      texte: fin ? `L'appli compose ${m.nb} nouvelles semaines et un nouveau panier.` : `La semaine ${m.rang + 2} devient la semaine en cours. Celle-ci reste dans ton historique.` }))
      if (await agir("/api/semaine/suivante", {}, fin ? "Nouvelles semaines composées." : "Semaine suivante.")) location.hash = "#/semaine";
  },
  corriger: () => demanderPaiement(true),
  async cuisine(b) {
    const r = recette(b.dataset.plat), jour = Number(b.dataset.jour);
    const c = E.semaine.jours[jour].cuisine.find(x => x.id === r.id);
    if (await confirmer({ titre: enSuivi() ? "Tu l'as mangé ?" : "C'est cuisiné ?", oui: enSuivi() ? "Oui, mangé" : "Oui, c'est cuisiné", non: "Pas encore",
      texte: `Les ingrédients de « ${r.nom} » (${pourCombien(c, E.semaine.jours[Number(b.dataset.jour)]) || "ta part"}) sortent de ton stock.` }))
      agir("/api/prepare", { jour, plat: r.id }, enSuivi() ? `« ${r.nom} » : mangé.` : estRepas(r) ? "Stock mis à jour. Tu peux noter le plat." : "Stock mis à jour.");
  },
  async journee(b) {
    const jour = Number(b.dataset.jour), j = E.semaine.jours[jour];
    if (await confirmer({ titre: `${j.jour} : tout mangé comme prévu ?`, oui: "Oui, tout", non: "Pas encore",
      texte: "Tous les repas de ce jour sont cochés, et ce qui restait sort de ton stock. Si tu as mangé autre chose, change d'abord le repas." }))
      agir("/api/prepare", { jour }, enSuivi() ? "Toute la journée : mangée." : "Stock mis à jour.");
  },
  voir: b => agir("/api/profil/voir", { profil: b.dataset.profil }, "Profil affiché.").then(ok => { if (ok) location.hash = "#/semaine"; }),
  enseignes: () => agir("/api/profil/enseignes", {}, "Chrome s'ouvre sur le PC."),
  chercherAlternatives: () => agir("/api/alternatives/chercher", {}, "L'appli cherche de quoi remplacer ce qui manque."),
  async appliquerAlternatives() {
    const choix = {};
    document.querySelectorAll("[data-manquant]").forEach(f => { const v = f.querySelector("input:checked"); if (v && v.value) choix[f.dataset.manquant] = v.value; });
    const noms = Object.keys(choix);
    if (!noms.length) return dire("Choisis d'abord un produit de remplacement.");
    const nb = E.mois ? E.mois.nb - E.mois.rang : 1;
    if (await confirmer({ titre: `Remplacer ${noms.length > 1 ? `ces ${noms.length} produits` : "ce produit"} ?`, oui: "Remplacer",
      texte: `${noms.map(n => `${choix[n]} à la place de ${n.toLowerCase()}`).join(" ; ")}. Les recettes de ${nb > 1 ? `tes ${nb} semaines` : "ta semaine"} changent tout de suite, et l'appli ajoute ${noms.length > 1 ? "ces produits" : "ce produit"} à ton panier ${E.magasin.principale}, sans payer. Tu pourras annuler chaque remplacement ici.` }))
      agir("/api/alternatives/appliquer", { choix }, "Recettes mises à jour. L'appli complète le panier.");
  },
  async annulerRemplacement(b) {
    if (await confirmer({ titre: "Annuler ce remplacement ?", oui: "Annuler le remplacement", non: "Garder",
      texte: `« ${b.dataset.nom} » revient dans tes recettes et dans les produits à acheter toi-même. Le produit de remplacement, s'il est déjà dans ton panier, y reste : retire-le sur le site de ${E.magasin.principale}.` }))
      agir("/api/alternatives/annuler", { nom: b.dataset.nom }, "Remplacement annulé.");
  },
  async deconnexion() {
    if (await confirmer({ titre: "Se déconnecter ?", oui: "Se déconnecter", texte: "Il faudra ton identifiant et ton mot de passe pour revenir." }))
      if (await appel("/api/deconnexion", {}) === true) { location.hash = "#/semaine"; vueConnexion(); }
  },
  versCreation: vueCreation,
  versConnexion: () => vueConnexion(),
  stockTaper: () => {
    const d = $("dialogue");
    d.innerHTML = `<form class="feuille formulaire" novalidate><h2 id="dialogueTitre">Ce que tu as chez toi</h2>
      <div class="champ${E.claude === false ? "" : " champ-ia"}"><label for="stTexte">Tes produits ${E.claude === false ? "" : BADGE_IA}</label>
        <textarea id="stTexte" rows="4" maxlength="800" placeholder="6 œufs, riz basmati 1 kg, lait 1 l, 2 boîtes de thon, poulet 500 g"></textarea>
        <small>Avec les quantités si tu les connais, séparés par des virgules.</small></div>
      <div class="actions pied"><button class="bouton second" type="button" value="non">Annuler</button><button class="bouton" type="submit">Continuer</button></div></form>`;
    d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
    d.querySelector("form").addEventListener("submit", ev => { ev.preventDefault(); ev.stopPropagation();
      const t = $("stTexte").value.trim(); if (t) stockAnalyser({ texte: t }, "texte"); });
    d.returnValue = ""; if (!d.open) d.showModal();
  },
  async stockProposer() {
    const d = $("dialogue");
    d.innerHTML = `<div class="feuille"><h2 id="dialogueTitre">Tes prochains jours avec ton stock</h2><p class="discret" role="status">Je cherche…</p></div>`;
    d.returnValue = ""; if (!d.open) d.showModal();
    let props;
    try { const r = await fetch("/api/stock/propositions", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      props = (await r.json()).propositions || []; } catch (e) { d.close("non"); return dire("L'appli ne répond pas."); }
    const NOM = { pdj: "matin", dej: "midi", din: "soir" };
    d.innerHTML = `<form class="feuille formulaire" novalidate><h2 id="dialogueTitre">Tes prochains jours avec ton stock</h2>
      ${props.length ? `<p class="petit discret" style="margin:-4px 0 10px">À partir de demain. Décoche ce que tu veux garder ; les grammes se règlent sur ton objectif.</p>
        <ul class="stock-props">${props.map((x, k) => `<li><label><input type="checkbox" checked data-k="${k}">
          <span><small>${esc(x.nom_jour)} ${NOM[x.moment]}</small><s>${esc((recette(x.avant) || { nom: "rien" }).nom)}</s><b>${esc(recette(x.apres).nom)}</b>
          <small class="stock-part">${nombre(Math.round(x.part * 100))} % en stock</small></span></label></li>`).join("")}</ul>`
        : `<p class="dujour"><strong>Rien à changer.</strong> Tes prochains repas utilisent déjà ce que tu as, ou ton stock ne couvre pas encore un plat entier.</p>`}
      <div class="actions pied"><button class="bouton second" type="button" value="non">${props.length ? "Annuler" : "Fermer"}</button>${props.length ? `<button class="bouton" type="submit">Refaire ces repas</button>` : ""}</div></form>`;
    d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
    if (props.length) d.querySelector("form").addEventListener("submit", async ev => { ev.preventDefault(); ev.stopPropagation();
      const choix = props.filter((x, k) => d.querySelector(`[data-k="${k}"]`).checked);
      if (!choix.length) return d.close("non");
      d.close("oui");
      agir("/api/stock/appliquer", { choix }, `${choix.length > 1 ? `${choix.length} repas refaits` : `${choix.length} repas refait`} avec ton stock.`); });
  },
  oubliMdp: () => {
    $("contenu").innerHTML = accueil(`<div class="auth-carte">
      <h1 tabindex="-1">Mot de passe oublié</h1><p class="auth-intro">Écris ton identifiant ou ton email : un lien pour en choisir un nouveau part sur ton email.</p>
      <form class="formulaire" id="fOubli" novalidate>
        <div class="champ"><label for="oQui">Identifiant ou email</label><input id="oQui" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
        <small id="eOubli" role="status" style="display:block;margin-bottom:10px"></small>
        <button class="bouton large" type="submit">Envoyer le lien</button></form></div>
      <p class="auth-bas"><button type="button" class="lien" data-action="versConnexion">Retour à la connexion</button></p>`);
  },
  filtreCat(b) {
    const F = filtresCat, v = b.dataset.valeur;
    const bascule = (ens, x) => ens.has(x) ? ens.delete(x) : ens.add(x);
    const cle = b.dataset.cle;
    if (cle === "cat") bascule(F.cats, v);
    else if (cle === "avis") F.avis = F.avis === v ? "" : v;
    else if (cle === "regime") bascule(F.regimes, v);
    else if (cle === "atout") bascule(F.atouts, v);
    else if (cle === "proteine") bascule(F.proteines, v);
    else if (cle === "origine") bascule(F.origines, v);
    else if (cle === "prix") F.prix = F.prix === Number(v) ? 0 : Number(v);
    else if (cle === "temps") F.temps = F.temps === Number(v) ? 0 : Number(v);
    else if (cle === "stock") F.stock = !F.stock;
    else if (cle === "ouvert") F.ouvert = !F.ouvert;
    else if (cle === "groupe") F.groupe = v;
    else if (cle === "sens") F.sens = -F.sens;
    else if (cle === "ing") { if (v) F.ings.add(v); }
    else { [F.cats, F.regimes, F.atouts, F.proteines, F.origines, F.ings].forEach(e => e.clear()); F.avis = ""; F.prix = 0; F.temps = 0; F.stock = false; }
    if (cle !== "ouvert") F.debut = 0;
    rendre();
  },
  async gout(b) {
    const plat = b.dataset.plat, retirer = b.getAttribute("aria-pressed") === "true", gout = retirer ? "" : b.dataset.gout;
    const ok = await agir("/api/gout", { plat, gout },
      retirer ? "Avis retiré." : gout === "tester" ? "Noté : tu veux bien le tester." : "Noté : tu n'aimes pas.");
    // La carte du plat reste ouverte : ses boutons suivent tout de suite (27/11/2026 : un 2e toucher ne retirait pas l'avis).
    if (ok !== false) document.querySelectorAll(`[data-action="gout"][data-plat="${CSS.escape(plat)}"]`)
      .forEach(x => x.setAttribute("aria-pressed", String(!retirer && x.dataset.gout === gout)));
    return ok;
  },
  async journalSuite() {
    try {
      const r = await fetch(`/api/journal?debut=${E.journal.length + journalPlus.length}`);
      const d = await r.json();
      journalPlus = journalPlus.concat(d.entrees); journalSuite = d.suite;
    rendre();
    } catch (e) { dire("L'appli ne répond pas."); }
  },
  ingredient: b => demanderIngredient({ nom: b.dataset.nom }),
  mangerAujourdhui: b => mangerAujourdhui(b.dataset.plat, b.dataset.moment, b.dataset.date || "", b.dataset.vu || ""),
  noter: b => agir("/api/note", { plat: b.dataset.plat, note: Number(b.dataset.note) }, "Note enregistrée."),
  quantite: b => {
    const r = recette(b.dataset.plat), fois = Number(b.dataset.fois), facteur = fois / (Number(b.dataset.avant) || 1), quantites = {};
    const aj = ((planDe(Number(b.dataset.semaine)) || {}).jours || [])[Number(b.dataset.jour)]?.ajustes?.[r.id] || {};
    for (const i of r.ing) if (i.u !== "qs") quantites[i.n] = Math.round((typeof aj[i.n] === "number" ? aj[i.n] : i.q) * facteur * 100) / 100;
    for (const [n, q] of Object.entries(aj)) if (!(n in quantites) && typeof q === "number") quantites[n] = Math.round(q * facteur * 100) / 100;
    fermerCarte(true);
    agir("/api/semaine/modifier", { operation: { type: "ajuster", jour: Number(b.dataset.jour), plat: r.id, quantites }, semaine: Number(b.dataset.semaine), confirme: true },
      `« ${r.nom} » : ×${virgule(fois)}.`);
  },
  manger: b => { const r = recette(b.dataset.plat), annuler = b.dataset.annuler === "1";
    fermerCarte(true);
    agir("/api/prepare", { jour: Number(b.dataset.jour), plat: r.id, ...(annuler ? { annuler: true } : {}) }, annuler ? `« ${r.nom} » : pas encore mangé.` : `« ${r.nom} » : mangé.`); },
  fixer: b => agir("/api/repas/fixer", { plat: b.dataset.plat, moment: b.dataset.moment, fixe: b.dataset.fixe === "1" },
    b.dataset.fixe === "1" ? "Fixé : il revient chaque jour." : "Ce plat n'est plus fixe."),
  reessayer: demarrer,
  // Des pages de 5, ‹ et › (Taha, 23/11/2026 : « voir 5 de plus, c'est lourd »).
  // − / + règlent directement le nombre de produits proposés sur la liste (Taha, 23/11/2026 : « pas de bouton, automatique »).
  lcNb: b => lcViser(lcProposes().length + Number(b.dataset.pas)),
  lcAjouter: b => { filtreCourses = ""; return agir("/api/liste_courses", { nom: b.dataset.nom, unite: b.dataset.unite, quantite: Number(b.dataset.q) }, `${b.dataset.nom} : sur ta liste.`); },
  choisirIng: b => { const n = b.dataset.nom; ING_CHOISIS.has(n) ? ING_CHOISIS.delete(n) : ING_CHOISIS.add(n); rendre(); },
  inventerPlat: () => creerPlatIA("plat", `Une recette avec ${[...ING_CHOISIS].join(", ").toLowerCase()}`),
  // « À finir bientôt » : ce qui a des plats ensemble ; sinon le plus pressé seul.
  platsAFinir: () => {
    const f = (E.a_finir || []).map(x => x.nom).filter(n => (E.stock || []).some(l => l.nom === n && l.quantite > 0));
    ING_CHOISIS.clear();
    for (const n of f) { ING_CHOISIS.add(n); if (!platsAvec(ING_CHOISIS).length && ING_CHOISIS.size > 1) ING_CHOISIS.delete(n); }
    rendre();
  },
  lacherIngs: () => { ING_CHOISIS.clear(); rendre(); },
  ouvrirIng: b => agir("/api/stock/ouvert", { nom: b.dataset.nom }, `${b.dataset.nom} : ouvert aujourd'hui.`),
  voirPlatsIngs: () => { Object.assign(filtresCat, { ings: new Set(ING_CHOISIS), debut: 0 }); ING_CHOISIS.clear(); location.hash = "#/catalogue"; },
  sansIngCat: b => { filtresCat.ings.delete(b.dataset.nom); filtresCat.debut = 0; rendre(); },
  lcRemplir: async () => {
    const i = $("lcNb"); if (i) lcNbGarder(Number(i.value));
    const c = coursesMalines(LC_NB.n, new Set((E.liste_courses || []).map(x => x.nom)));
    if (!c.length) return dire("Rien de plus à proposer avec ton stock.");
    await agir("/api/liste_courses/lot", { items: c.map(x => ({ nom: x.nom, unite: x.unite, quantite: x.q, raison: raisonCourse(x) })) },
      `${c.length > 1 ? `${c.length} produits` : `${c.length} produit`} sur ta liste.`);
  },
  lcRetirer: b => { LC_COCHES.delete(b.dataset.nom); return agir("/api/liste_courses", { nom: b.dataset.nom, unite: b.dataset.unite, retirer: true }, ""); },
  lcValider: async () => {
    const noms = [...LC_COCHES], n = noms.length;
    if (!n) return;
    if (await agir("/api/liste_courses/valider", { noms }, `${n > 1 ? `${n} produits` : `${n} produit`} au stock.`)) LC_COCHES.clear();
  },
  pageCat: b => { filtresCat.debut = Math.max(0, filtresCat.debut + Number(b.dataset.pas)); rendre(); },
  garderPlat: async b => { if (await agir("/api/plat/garder", { plat: b.dataset.plat }, "Ajouté à tes plats.")) fermerCarte(); },
};

PETIT.addEventListener("change", () => rendre());
// Le clavier ouvert : la barre des onglets ne monte pas avec lui, elle se cache (Taha, 23/11/2026).
const AU_CLAVIER = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]):not([type=submit]):not([type=date]), textarea, [contenteditable="true"]';
document.addEventListener("focusin", ev => { if (ev.target.matches && ev.target.matches(AU_CLAVIER)) document.body.classList.add("clavier"); });
document.addEventListener("focusout", () => setTimeout(() => {
  const a = document.activeElement;
  if (!(a && a.matches && a.matches(AU_CLAVIER))) document.body.classList.remove("clavier"); }, 60));
// Une feuille ou la carte d'un plat est ouverte : la page derrière ne bouge plus quand on fait défiler (Taha, 19/11/2026).
// iPhone : un champ activé par le code (sans toucher) n'ouvre pas le clavier, et le toucher ensuite ne l'ouvre plus
// (Taha, 20/11/2026 : « le clavier ne pop plus »). Toucher un champ déjà actif le réactive pendant le geste.
document.addEventListener("touchend", ev => {
  const c = ev.target.closest && ev.target.closest("textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=date]):not([type=button]):not([type=submit])");
  if (c && document.activeElement === c && !c.readOnly && !c.disabled) { c.blur(); c.focus({ preventScroll: true }); }
}, { passive: true });
const verrou = { y: 0, actif: false };
function verrouiller(oui) {
  if (oui === verrou.actif) return;
  verrou.actif = oui;
  const b = document.body.style;
  if (oui) { verrou.y = scrollY; Object.assign(b, { position: "fixed", top: `-${verrou.y}px`, left: "0", right: "0", overflow: "hidden" }); }
  else { Object.assign(b, { position: "", top: "", left: "", right: "", overflow: "" }); scrollTo(0, verrou.y); }
}
const surveillerFenetres = () => verrouiller(!!($("dialogue").open || document.querySelector(".carte-fond")));
new MutationObserver(surveillerFenetres).observe(document.body, { childList: true });
new MutationObserver(surveillerFenetres).observe($("dialogue"), { attributes: true, attributeFilter: ["open"] });
document.addEventListener("click", ev => {
  // Sur le telephone, toucher un plat ouvre sa fiche en fenetre, pas une nouvelle page (Taha, 19/11/2026).
  // « ‹ Profil », « ‹ Aujourd'hui »… : si l'on vient de cette page, on y revient d'un pas (même position), sans en empiler une.
  const ret = ev.target.closest("a.retour[href]:not([data-precedent])");
  if (ret && adressePrecedente && ret.getAttribute("href") === adressePrecedente) { ev.preventDefault(); RETOUR_ARRIERE = true; return history.back(); }
  const pas = ev.target.closest("[data-stock-pas]");
  if (pas) { const l = { quantite: Number(pas.dataset.q), unite: pas.dataset.unite };
    // Un ingrédient ajouté depuis « À ajouter » : 100 g, 100 ml ou 1 pièce, à régler ensuite.
    const premier = l.quantite === 0 && Number(pas.dataset.stockPas) > 0 ? pasStock(l) : null;
    return agir("/api/stock", { nom: pas.dataset.nom, unite: pas.dataset.unite, quantite: premier ?? Math.max(0, Math.round((l.quantite + Number(pas.dataset.stockPas) * pasStock(l)) * 10) / 10) },
      premier ? `${pas.dataset.nom} ajouté : règle sa quantité plus bas.` : ""); }
  const plat = ev.target.closest('a.repas[href^="#/plat/"], a.rp-plat[href^="#/plat/"]');
  if (plat && !ev.target.closest("#dialogue, .carte-fond")) {
    ev.preventDefault();
    const d = plat.dataset;
    const vu = d.kcal != null ? { kcal: +d.kcal, prot: +d.prot, gluc: +d.gluc, lip: +d.lip, quand: d.quand, date: d.date, moment: d.momentVu } : null;    // historique
    return ficheRapide(decodeURIComponent(plat.getAttribute("href").slice(7).split("?")[0]),
      d.jour != null ? { k: Number(d.semaine), n: Number(d.jour), moment: d.moment } : null, plat.closest(".exo") || plat, vu);
  }
  const b = ev.target.closest("[data-action]");
  if (b && !b.disabled && ACTIONS[b.dataset.action]) ACTIONS[b.dataset.action](b);
});
document.addEventListener("submit", async ev => {
  ev.preventDefault();
  const bouton = ev.target.querySelector("[type=submit]");
  if (ev.target.id === "fOubli") {
    bouton.disabled = true;
    try {
      const r = await fetch("/api/compte/oubli", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qui: $("oQui").value.trim() }) });
      const rep = await r.json();
      $("eOubli").textContent = rep.erreur || rep.message || "";
      $("eOubli").style.color = rep.erreur ? "var(--critique)" : "var(--accent)";
    } catch (e) { $("eOubli").textContent = "Le serveur ne répond pas, réessaie."; }
    bouton.disabled = false;
    return;
  }
  if (ev.target.id === "fConnexion") {
    const libelle = bouton.textContent;
    bouton.textContent = "Connexion…";
    const rep = await appel("/api/connexion", { identifiant: $("ident").value.trim().toLowerCase(), mot_de_passe: $("mdp").value });
    bouton.textContent = libelle;
    if (rep === true) return rendre();
    $("eMdp").textContent = (rep && rep.erreur) || "Connexion impossible.";
    $("mdp").focus();
  }
  if (ev.target.id === "fProfil") {
    const f = new FormData(ev.target), corps = Object.fromEntries(f.entries());
    if ($("pEmail") && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(corps.email || "").trim())) { $("eProfil").textContent = "Email : écris une adresse valide."; return $("pEmail").focus(); }
    if ($("pEmail") && !mdpValide(String(corps.mot_de_passe || ""))) { $("eProfil").textContent = "Mot de passe : " + REGLE_MDP; return $("pMdp").focus(); }
    for (const [id, m] of [["sexe", "Choisis ton sexe : il change tes besoins en calories."], ["activite", "Choisis ton niveau d'activité."],
                           ["objectif", "Choisis ton objectif : perdre, garder ou prendre du muscle."]])
      if ($(id) && !$(id).value) { $("eProfil").textContent = m; return $(id).focus(); }
    for (const cle of ["boucher", "fodmap"]) corps[cle] = f.has(cle);
    corps.regime = lireRegime(ev.target);
    for (const cle of ["reg", "allergie", "autres"]) delete corps[cle];
    corps.identifiant = String(corps.identifiant || "").trim().toLowerCase();
    corps.telephone = telComplet($("telephone"));
    const libelle = bouton.textContent;
    bouton.textContent = "Création…"; bouton.disabled = true;
    const rep = await appel("/api/profil/creer", corps);
    bouton.textContent = libelle; bouton.disabled = false;
    if (rep === true && enSuivi()) { location.hash = "#/semaine"; rendre(); return dire("Profil créé : tes deux premières semaines sont prêtes."); }
    if (rep === true) { location.hash = "#/profil"; rendre(); return dire("Profil créé. Connecte-toi à tes enseignes dans le Chrome ouvert sur le PC."); }
    $("eProfil").textContent = (rep && rep.erreur) || "Création impossible.";
    $("eProfil").scrollIntoView({ block: "center" });
  }
  if (ev.target.id === "fInfos") {
    const f = new FormData(ev.target), corps = Object.fromEntries(f.entries());
    for (const cle of ["boucher", "fodmap"]) corps[cle] = f.has(cle);
    const rep = await appel("/api/profil/modifier", corps);
    if (rep === true) { rendre(); return dire("Besoins recalculés. Recompose ta semaine pour les appliquer."); }
    $("eInfos").textContent = (rep && rep.erreur) || "Modification impossible.";
  }
  if (ev.target.id === "fMdp") {
    const nouveau = $("mNouveau").value;
    if (!mdpValide(nouveau)) { $("eMdpN").textContent = REGLE_MDP; return $("mNouveau").focus(); }
    const rep = await appel("/api/mot_de_passe", { ancien: $("mAncien") ? $("mAncien").value : "", nouveau });
    if (rep === true) { ev.target.reset(); rendre(); return dire("Mot de passe changé."); }
    $("eMdpN").textContent = (rep && rep.erreur) || "";
  }
  if (ev.target.id === "fCoord") {
    bouton.disabled = true;
    try {
      const r = await fetch("/api/compte/coordonnees", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: $("cEmail").value.trim(), telephone: telComplet($("cTel")) }) });
      const rep = await r.json();
      $("eCoord").textContent = rep.erreur || "";
      if (!rep.erreur) { $("cEmail").value = rep.email || ""; telRemplir($("cTel"), rep.telephone); dire("Email et téléphone enregistrés."); }
    } catch (e) { $("eCoord").textContent = "Le serveur ne répond pas, réessaie."; }
    bouton.disabled = false;
  }
  if (ev.target.id === "fReglages") {
    const budget = Number($("rBudget").value);
    const faux = !(budget >= 100 && budget <= 2000);
    $("eBudget").hidden = !faux;
    if (faux) return $("rBudget").focus();
    agir("/api/reglages", { phase: $("rPhase").value ? Number($("rPhase").value) : null, ajustement: Number($("rAdj").value),
      budget_mois: budget, nb_plats: Number($("rPlats").value), nb_semaines: Number($("rSemaines").value) }, "Réglages enregistrés.");
  }
});
document.addEventListener("change", ev => {
  const i = ev.target;
  if (i.id === "ingCat") {
    const nom = [...document.querySelectorAll("#ingCatListe option")].map(o => o.value).find(v => v.toLowerCase() === i.value.trim().toLowerCase());
    if (nom) { filtresCat.ings.add(nom); filtresCat.debut = 0; rendre(); } else if (i.value.trim()) dire("Choisis un ingrédient de la liste.");
    return;
  }
  if (i.id === "lcNb") return lcViser(Number(i.value));
  if (i.dataset.lc != null) {
    i.checked ? LC_COCHES.add(i.dataset.lc) : LC_COCHES.delete(i.dataset.lc);
    const b = $("lcValider"); if (b) { b.disabled = !LC_COCHES.size; b.innerHTML = lcTexte(); }
    return;
  }
  if (i.id === "triCat") { Object.assign(filtresCat, { tri: i.value, sens: i.value === "prot" ? -1 : 1, debut: 0 }); rendre(); return; }
  if (i.dataset.coche) {
    const [liste, ...reste] = i.dataset.coche.split("|"), nom = reste.join("|");
    if (liste === "secs") { cocher(i.dataset.coche, i.checked); return; }          // fruits secs : simple pense-bete, garde sur l'appareil
    const cible = liste === "marche" || (liste === "boucher" && E.rythme === "mois") ? "marche" : "panier";
    agir("/api/courses/cocher", { liste: cible, nom, coche: i.checked }, i.checked ? `« ${nom} » : tu en as déjà, l'appli ne l'achète pas.` : `« ${nom} » revient dans la liste.`);
    return;
  }
  if (i.matches(".stock-saisie")) return agir("/api/stock", { nom: i.dataset.nom, unite: i.dataset.unite, quantite: Math.max(0, (Number(String(i.value).replace(",", ".")) || 0) * (Number(i.dataset.facteur) || 1)) }, "");
  if (i.matches("[data-stock-photo]") && i.files && i.files[0]) {
    const sorte = i.dataset.stockPhoto, f = i.files[0]; i.value = "";
    photoReduite(f, sorte === "ticket" ? 2200 : 1600).then(ph => stockAnalyser({ photo: ph }, sorte)).catch(() => dire("Photo illisible."));
    return;
  }
  if (i.matches(".stock-ligne input"))
    agir("/api/stock", { nom: i.dataset.nom, unite: i.dataset.unite, quantite: Math.max(0, Number(i.value) || 0) }, "Stock corrigé.");
});
// La page se redessine quand on lève le doigt, pas à chaque lettre (Taha, 27/11/2026 : « j'ai l'impression que je dois attendre »).
const redessinerSaisie = plusTard(id => {
  const avant = $(id), garde = avant && document.activeElement === avant, p = garde ? avant.selectionStart : 0;
  rendre();
  const c = $(id); if (garde && c) { c.focus(); c.setSelectionRange(p, p); }
});
document.addEventListener("input", ev => {
  if (ev.target.id === "filtreCourses") { filtreCourses = ev.target.value; return redessinerSaisie("filtreCourses"); }
  if (ev.target.id !== "filtre") return;
  if (route().vue === "catalogue") { filtreCatalogue = ev.target.value; filtresCat.debut = 0; }
  else filtreStock = ev.target.value;
  redessinerSaisie("filtre");
});
window.addEventListener("hashchange", rendre);

async function demarrer() {
  if (await appel("/api/etat") === true) { rendre(); traiterPartage(); }
}
// « Partager avec Mon Meal Prep » depuis Instagram, TikTok, YouTube… (Taha, 23/11/2026) : le lien arrive dans l'adresse
// (?texte=, ?lien=, ?titre= : appli Android ou appli installée par Chrome). Gardé le temps de la connexion, puis le plat
// se crée tout seul et sa carte s'ouvre.
(() => {
  try {
    const q = new URLSearchParams(location.search), t = [q.get("titre"), q.get("texte"), q.get("lien")].filter(Boolean).join(" ").trim();
    if (t) { sessionStorage.setItem("mp-partage", t.slice(0, 6000)); history.replaceState(null, "", location.pathname + "#/catalogue"); }
  } catch (e) {}
})();
function traiterPartage() {
  let t = "";
  try { t = sessionStorage.getItem("mp-partage") || ""; } catch (e) { return; }
  if (!t || !E || !E.journal_repas || $("dialogue").open) return;
  try { sessionStorage.removeItem("mp-partage"); } catch (e) {}
  const lien = (t.match(/https?:\/\/[^\s<>"']+/) || [""])[0], description = t.replace(lien, "").trim();
  if (location.hash !== "#/catalogue") location.hash = "#/catalogue";
  noterRepas({ date: E.journal_repas.aujourdhui, remplacer: { texte: "", lien, description, creer: true, auto: true,
    retour: () => creerPlatIA("plat", "", lien, description), main: () => demanderPlatPerso({ cat: "plat" }) } });
}
demarrer();

// Hors ligne : seulement en HTTPS ou sur le PC lui-meme (le navigateur l'exige).
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
