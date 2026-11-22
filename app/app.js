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
const DANS_PLUS = ["plus", "courses", "cuisine", "historique", "budget", "vitamines", "profil", "profils", "nouveau", "stock", "journal", "reglages"];
// Mode flemmard : plus d'onglet « Plus » ; les vitamines ont leur onglet, « Profil » ouvre sa page (Taha, 19/11/2026).
const ONGLETS_FLEMMARD = [
  { id: "semaine", nom: "Jour", icone: "calendar-blank" },
  { id: "catalogue", nom: "Catalogue", icone: "couverts" },
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
                     stock: false, tri: "nom", ouvert: matchMedia("(min-width: 900px)").matches };   // filtres du catalogue

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nombre = (n, d = 0) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const euros = n => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const dateLongue = iso => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const dateHeure = iso => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const recette = id => E.recettes.find(r => r.id === id);
const propre = s => String(s).replace(/\s[\u2014\u2013]\s/g, " : ");     // anciens textes du journal
const dose = q => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: q < 10 ? 2 : 0 }).format(q);   // vitamines
const estRepas = r => r && r.cat !== "fruit" && r.cat !== "rien";                             // les fruits s'ajoutent, ils ne se choisissent pas
// Une semaine commence le jour `debut` (le lendemain du jour ou elle est composee) ; les anciennes, sans date, un lundi.
const debutDe = s => s && s.debut ? new Date(s.debut + "T00:00:00") : null;
const rangDuJour = (s = E && E.semaine) => { const d = debutDe(s); return d ? Math.round((new Date().setHours(0, 0, 0, 0) - d) / 864e5) : (new Date().getDay() + 6) % 7; };
const aujourdhui = () => Math.min(6, Math.max(0, rangDuJour()));           // le jour a montrer : jamais hors de la semaine
const court = j => j.jour.slice(0, 3);
const periode = s => { const d = debutDe(s); if (!d) return ""; const f = new Date(+d + 6 * 864e5), jj = x => x.getDate() + (x.getDate() === 1 ? "er" : "");
  const mois = x => new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(x);
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
const icone = nom => `<span class="ic" aria-hidden="true">${ICONES[nom] || ""}</span>`;
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
    d.addEventListener("close", () => resoudre(d.returnValue === "oui"), { once: true });
    d.returnValue = "non";
    d.showModal();
  });
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
  const [chemin, requete = ""] = (location.hash.replace(/^#\/?/, "") || "semaine").split("?");
  const [vue, arg] = chemin.split("/");
  return { vue, arg: arg ? decodeURIComponent(arg) : "", params: new URLSearchParams(requete) };
}
function ongletDe(vue) {
  if (vue === "plat") return "semaine";
  if (enSuivi()) return vue === "historique" ? "semaine" : ["plus", "profil", "profils", "nouveau", "reglages", "journal"].includes(vue) ? "profil" : vue;
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
  profil.innerHTML = `${icone("user-circle")}<span>Profil</span>`;
  profil.setAttribute("aria-label", E ? `Profil de ${E.profil.nom}` : "Profil");
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
      <div class="segments" role="radiogroup" aria-label="Nombre de semaines à composer">${[1, 2, 3, 4].map(v => `<label class="segment"><input type="radio" name="semaines" value="${v}"${(E.nb_semaines || 1) === v ? " checked" : ""}><span>${v} semaine${v > 1 ? "s" : ""}</span></label>`).join("")}</div>
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
// Un plat tel qu'il se cuisine un jour donne : avec les quantites ajustees pour ce jour seulement.
// Le dejeuner « reste » suit le diner de la veille.
function platDuJour(s, n, id, moment = "") {
  const r = recette(id), j = s.jours[moment === "dej" && s.jours[n].dej_reste && n > 0 ? n - 1 : n];
  const q = (j.ajustes || {})[id];
  if (!q) return r;
  // Comme planification.avec_quantites : 0 retire un ingredient, {q, u, a} en ajoute un qui n'y etait pas.
  const noms = new Set(r.ing.map(i => i.n)), sans = [];
  const ing = r.ing.flatMap(i => i.u === "qs" || typeof q[i.n] !== "number" ? [i] : q[i.n] <= 0 ? (sans.push(i.n), []) : [{ ...i, q: q[i.n] }]);
  const plus = Object.entries(q).filter(([n, v]) => !noms.has(n) && v && typeof v === "object" && v.q > 0).map(([n, v]) => ({ n, q: v.q, u: v.u, a: v.a }));
  const dit = [sans.length ? `sans ${sans.map(x => x.toLowerCase()).join(", ")}` : "", plus.length ? `avec ${plus.map(x => x.n.toLowerCase()).join(", ")}` : ""].filter(Boolean);
  return { ...r, ...((j.ajustes_chiffres || {})[id] || {}), ajusteeCeJour: true, ing: [...ing, ...plus],
           etapes: dit.length ? [`Tes changements : ${dit.join(" ; ")}. Cuis-les comme ce qu'ils remplacent.`, ...(r.etapes || [])] : r.etapes };
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
function repasDuJour(s, k, n, compact = false, sansCollation = false, avecCuire = false, sansIcones = false) {
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
        <div class="exo-texte"><div class="quand">${quand}${cuit ? (enSuivi() ? " · mangé" : " · cuisiné") : estFixe(id, moment) ? " · fixe" : detail ? `, ${detail}` : ""}</div><h3>${esc(r.nom)}</h3>
        <div class="chiffres">${nombre(compte ? compte.kcal : v.kcal * t)} kcal, ${nombre(compte ? compte.prot : v.prot * t)} g de protéines${v.ajusteeCeJour ? " · quantités ajustées ce jour" : ""}</div></div></a>
      ${sansIcones ? "" : `${libre(id, moment) ? `<button class="changer" data-action="changer" data-semaine="${k}" data-jour="${n}" data-moment="${moment}" aria-label="Changer le ${nomMoment(moment)} de ${j.jour.toLowerCase()}" title="Changer">${icone("swap")}</button>` : ""}
      ${avecCuire ? `<a class="changer cuire${reglable(s, k, n, id, moment) ? "" : " haut"}" href="${courante ? `#/cuisine/${id}?jour=${n}` : `#/plat/${id}`}" aria-label="Cuisiner ${esc(r.nom)}" title="Cuisiner">${icone("cooking-pot")}</a>` : ""}
      ${reglable(s, k, n, id, moment) ? `<button class="changer regler" data-action="reequilibrer" data-semaine="${k}" data-jour="${n}" data-moment="${moment}" data-plat="${id}" aria-label="Rééquilibrer ${esc(r.nom)} pour viser l'objectif" title="Rééquilibrer ce plat">${icone("sliders-horizontal")}</button>` : ""}`}</div>`; }).join("")}</div>
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
  const jusqu = fin.length === 2 ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(+fin[0], +fin[1] - 1, 1)) : "";
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
  const date = s.debut ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(new Date(new Date(s.debut + "T12:00").getTime() + n * 864e5)) : "";
  const depasse = s.dans_le_budget === false;
  apresRendu.push(() => {
    const plus = $("mPlus");
    if (!plus) return;
    const donnees = cle => s.jours.map((x, i) => ({ etiquette: court(x), valeur: x[cle] || 0, detail: x.jour, choisi: i === n,
                                                    couleur: i === n ? "var(--accent)" : "var(--s1)" }));
    const tracer = () => { if (!plus.open || plus.dataset.trace) return; plus.dataset.trace = "1";
      Graph.barres($("gKcal"), { donnees: donnees("kcal"), unite: "kcal", cible: o.kcal, hauteur: 190, titre: "Calories prévues chaque jour" });
      Graph.barres($("gProt"), { donnees: donnees("prot"), unite: "g", cible: o.prot, hauteur: 190, titre: "Protéines prévues chaque jour" }); };
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
  ["leger", "Plus léger"], ["aimes", "Tes préférés"]];
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
    aimes: (a, b) => aime(b) - aime(a) || loin(a) - loin(b) };

  const cle = `${k}|${n}|${moment}|${actuelId}`, revient = REMPLACER.cle === cle;
  if (!revient) Object.assign(REMPLACER, { cle, tri: obj.kcal ? "objectif" : "proches", cherche: "", nb: 20, defile: 0 });
  const R = REMPLACER;
  const simple = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").toLowerCase();
  const mots = () => simple(R.cherche).split(/[\s,;+]+/).filter(m => m.length > 1 && !["de", "du", "des", "et", "avec", "au", "aux", "la", "le", "les", "un", "une"].includes(m));
  const passe = r => {
    const m = mots();
    if (!m.length) return r.cat === cat && r.gout !== "non";       // ce que tu n'aimes pas : seulement si tu le cherches
    const t = simple(r.nom + " " + (r.ing || []).map(i => i.n).join(" "));
    return m.every(x => t.includes(x.length > 3 ? x.replace(/[sx]$/, "") : x));
  };
  const carte = r => {
    const x = journee(r), tient = obj.kcal && Math.abs(x.kcal - obj.kcal) <= obj.kcal * 0.05 && x.prot >= obj.prot * 0.95;
    const dp = Math.round(pr(r) - avantP);
    return `<li><button type="button" class="rp-plat" data-plat="${r.id}">${photo(r, 120, "carre")}
      <span class="rp-texte"><b>${esc(r.nom)}</b>
        <span class="rp-macros chiffres"><span><strong>${nombre(Math.round(kc(r)))}</strong> kcal</span><span><strong>${nombre(Math.round(pr(r)))} g</strong> prot.</span>${
          sansRepas || !dp ? "" : `<span class="rp-ecart${dp > 0 ? " plus" : ""}">${dp > 0 ? "+" : "−"}${nombre(Math.abs(dp))} g</span>`}</span></span>
      ${tient ? `<span class="rp-tient" title="Ta journée tient l'objectif">${icone("check")}</span>` : ""}</button></li>`; };
  const maj = () => {
    const liste = tous.filter(passe).sort((a, b) => ORDRES[R.tri](a, b) || a.nom.localeCompare(b.nom, "fr"));
    const texte = R.cherche.trim();
    $("rpEffacer").hidden = !texte;
    $("rpBadge").hidden = !!texte;
    // Le même champ crée ton plat : Claude, l'IA, trouve les aliments, les grammes et les macros de ce que tu as écrit.
    $("rpIA").innerHTML = texte.length >= 2 ? `<button type="button" class="rp-ia" data-ia>${icone("sparkle")}<span>Créer « ${esc(texte.length > 48 ? texte.slice(0, 46) + "…" : texte)} » avec l'IA
        <small>L'IA en fait ton plat : aliments, grammes et macros</small></span>${icone("caret-right")}</button>` : "";
    $("rpCompte").textContent = texte ? (liste.length ? `${liste.length} plat${liste.length > 1 ? "s" : ""} trouvé${liste.length > 1 ? "s" : ""}` : "Aucun plat de ta base")
      : `${liste.length} ${cat === "petitdej" ? "petits-déjeuners" : cat === "plat" ? "plats" : "collations"}`;
    $("rpListe").innerHTML = liste.slice(0, R.nb).map(carte).join("")
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
    noterRepas({ date: dateDuPlan(s, n), remplacer: { texte, place: moment.startsWith("col") ? "col" : moment, retour,
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
    if (x.plat) { sortir(); return apercuChangement(k, operation(x.plat), `${sansRepas ? "Mettre" : "Remplacer par"} « ${recette(x.plat).nom} » ?`, retour); }
    if ("voirPlus" in x) { R.nb += 20; return maj(); }
    if ("effacer" in x) { R.cherche = ""; $("chPlat").value = ""; R.nb = 20; maj(); if (!TACTILE.matches) $("chPlat").focus(); }
  });
  $("rpTri").addEventListener("change", ev => { R.tri = ev.target.value; R.nb = 20; maj(); });
  $("chPlat").addEventListener("input", ev => { R.cherche = ev.target.value; R.nb = 20; maj(); });
  // Entrée : le nom exact d'un plat l'ouvre ; sinon l'IA crée le plat.
  $("chPlat").addEventListener("keydown", ev => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const exact = tous.find(r => simple(r.nom) === simple(R.cherche.trim()));
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
function creerPlatIA(cat = "plat", texte = "") {
  if (E.claude === false) return demanderPlatPerso({ cat });
  const d = $("dialogue");
  d.innerHTML = `<form class="feuille rp creer-plat" novalidate>
    <div class="rp-tete"><div><p class="rp-sur">Catalogue</p><h2 id="dialogueTitre">Créer un plat</h2></div>
      <button type="button" class="rp-fermer" data-fermer aria-label="Fermer">${icone("x")}</button></div>
    <p class="petit discret rp-intro">Écris ton plat ou ce que tu manges. L'IA trouve les aliments, les grammes et les macros ; tu vérifies avant d'enregistrer.</p>
    <div class="rp-recherche champ-ia">${icone("sparkle")}<input id="cpTexte" type="text" enterkeyhint="go" autocomplete="off"
        placeholder="Ex. : 2 œufs, pain pita 70 g" aria-label="Ton plat, ou ce que tu manges" value="${esc(texte)}"><span class="rp-badge-ia">IA</span></div>
    <small class="erreur" id="eCp" role="alert" style="display:block;min-height:1em;margin-top:6px;color:var(--critique)"></small>
    <button class="bouton bouton-ia" type="submit" style="width:100%;margin-top:6px">${icone("sparkle")}Créer avec l'IA</button>
    <p class="petit" style="margin:14px 0 0;text-align:center"><button type="button" class="lien" data-main>Sans l'IA : entrer les ingrédients moi-même</button></p></form>`;
  const f = d.querySelector("form");
  f.querySelector("[data-fermer]").addEventListener("click", () => d.close("non"));
  f.querySelector("[data-main]").addEventListener("click", () => demanderPlatPerso({ cat }));
  f.addEventListener("submit", ev => {
    ev.preventDefault();
    const t = $("cpTexte").value.trim();
    if (t.length < 2) { $("eCp").textContent = "Écris ton plat d'abord."; return; }
    noterRepas({ date: E.journal_repas.aujourdhui, remplacer: { texte: t, creer: true,
      place: cat === "petitdej" ? "pdj" : cat === "collation" ? "col" : undefined,
      retour: () => creerPlatIA(cat, t), main: () => demanderPlatPerso({ cat }) } });
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
  const choisi = ["changer", "ajouter"].includes(operation.type) && !operation.regler_plat && recette(operation.plat)
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
    return liste.length ? `<h3>${operation.type === "reequilibrer" ? "Ta journée" : "Ce que ça change dans ta journée"}</h3>
      ${liste.map(e => { const mesure = (nom, avant, apres, unite, objectif, bonSiPlus) => {
          const delta = apres - avant, pct = Math.min(100, Math.round(100 * apres / objectif));
          return `<div class="mesure"><span class="nom">${nom}</span>
            <span class="valeurs chiffres">${nombre(avant)} <span aria-hidden="true">→</span><span class="sr">devient</span> <b>${nombre(apres)} ${unite}</b></span>
            ${ecartLisible(delta, unite === "g" ? "g" : "kcal", bonSiPlus).replace(" de protéines", "").replace("mêmes protéines", "pareil").replace("mêmes calories", "pareil")}
            <span class="piste" role="img" aria-label="${pct} % de l'objectif de ${nombre(objectif)} ${unite}"><i style="width:${pct}%"></i></span>
            <small>Objectif ${nombre(objectif)} ${unite}${apres < objectif * 0.95 ? `, il manque ${nombre(objectif - apres)} ${unite}` : ""}</small></div>`; };
        return `<div class="jour-change"><h4>${e.jour}</h4>
          ${e.jour !== a.jour ? `<p class="petit discret" style="margin:-4px 0 12px">Le déjeuner de ${e.jour.toLowerCase()} est la seconde part du dîner de ${a.jour.toLowerCase()} : il change donc aussi.</p>` : ""}
          ${mesure("Protéines", e.prot_total - e.prot, e.prot_total, "g", a.objectif.prot, true)}
          ${mesure("Calories", e.kcal_total - e.kcal, e.kcal_total, "kcal", a.objectif.kcal, null)}</div>`; }).join("")}`
      : `<p>Calories et protéines ne changent pas.</p>`;
  };
  d.innerHTML = `<form class="feuille" method="dialog" novalidate>
    <h2 id="dialogueTitre">${esc(titre)}</h2>
    ${choisi ? `<div class="ap-choisi"><div class="cp-quantite"><span>Quantité</span>
        <button type="button" data-ap-fois="-0.5" aria-label="Moins" disabled>−</button><b class="chiffres" id="apFois">×1</b>
        <button type="button" data-ap-fois="0.5" aria-label="Plus">+</button></div>
      <p class="chiffres ap-macros" id="apMacros">${nombre(Math.round(choisi.kcal * tChoisi))} kcal, ${nombre(Math.round(choisi.prot * tChoisi))} g de protéines</p>
      <h3>Ingrédients</h3><div id="apIng">${listeIngredients(choisi, tChoisi)}</div></div>` : ""}
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
    ${a.combler && a.combler.plats.length ? `<h3>Il manque encore ${nombre(a.combler.kcal)} kcal${a.combler.prot > 5 ? ` et ${nombre(a.combler.prot)} g de protéines` : ""}</h3>
      <p class="petit discret" style="margin:-4px 0 6px">${a.combler.moment.startsWith("col") ? "Ajoute une collation" : `Mets un ${nomMoment(a.combler.moment)}`} : ces plats comblent le mieux ce qui manque. L'appli règle ensuite les grammes du plat choisi.</p>
      <ul class="candidats">${a.combler.plats.map(x => `<li><button type="button" class="candidat" data-combler="${x.id}">${photo(recette(x.id), 160, "carre")}
        <span class="texte"><b>${esc(x.nom)}</b><span class="chiffres">${nombre(x.kcal)} kcal, ${nombre(x.prot)} g de protéines</span></span>${icone("caret-right")}</button></li>`).join("")}</ul>` : ""}
    ${a.manque.length && !enSuivi() ? `<h3>${a.achete ? "À acheter toi-même" : "Ajouté à tes courses"}</h3>
      <p class="petit discret" style="margin:-4px 0 6px">${a.achete ? "Tes courses sont déjà faites : ces produits ne sont pas dans ton stock. Achète-les près de chez toi." : "Ces produits s'ajoutent à tes listes de courses."}</p>
      <ul class="lignes">${a.manque.map(m => `<li><span>${esc(m.nom)}</span><span class="q">${q(m)}</span></li>`).join("")}</ul>`
      : (a.achete && !enSuivi() ? `<p class="dujour" style="margin-top:14px"><strong>Rien à racheter.</strong> Ton stock couvre ce changement.</p>` : "")}
    ${a.panier_a_refaire ? `<p class="dujour" style="margin-top:14px"><strong>Panier déjà rempli.</strong> Il ne correspondra plus tout à fait : vide-le et refais-le avant de payer.</p>` : ""}
    ${a.supplements.length ? `<h3>Pour compléter tes protéines</h3>
      <p class="petit discret" style="margin:-4px 0 6px">Ce jour-là, il te manque environ ${nombre(a.deficit_proteines)} g de protéines. Coche une collation à ajouter pour les rattraper.</p>
      <div class="options" style="margin-top:8px">${a.supplements.map(x => `<label class="option"><input type="checkbox" name="supplement" value="${x.id}">
        <span><b>${esc(x.nom)}</b><small>+${x.prot} g de protéines, ${nombre(x.kcal)} kcal. ${x.en_stock ? "Déjà en stock." : "À acheter."}</small></span></label>`).join("")}</div>` : ""}
    ${a.confirmation_requise ? `<div class="options" style="margin-top:18px"><label class="option"><input type="checkbox" id="auCourant" required>
      <span><b>Je suis au courant</b><small>J'ai vu l'écart de calories et de protéines${a.manque.length ? ", et j'achète moi-même ce qui manque" : ""}.</small></span></label></div>
      <small id="eCourant" class="erreur" role="alert" style="display:block;margin-top:8px;color:var(--accent-texte)"></small>` : ""}
    <div class="actions pied"><button class="bouton second" type="button" value="non">${retour ? "Retour" : "Annuler"}</button>
      <button class="bouton" type="submit" value="oui">${operation.type === "reequilibrer" ? "Appliquer" : "Confirmer"}</button></div></form>`;
  d.querySelector("[value=non]").addEventListener("click", () => retour ? retour() : d.close("non"));
  d.querySelectorAll("[data-ap-fois]").forEach(b => b.addEventListener("click", () => {
    fois = Math.min(5, Math.max(0.5, fois + Number(b.dataset.apFois)));
    $("apFois").textContent = `×${virgule(fois)}`;
    d.querySelector('[data-ap-fois="-0.5"]').disabled = fois <= 0.5;
    d.querySelector('[data-ap-fois="0.5"]').disabled = fois >= 5;
    $("apMacros").textContent = `${nombre(Math.round(choisi.kcal * tChoisi * fois))} kcal, ${nombre(Math.round(choisi.prot * tChoisi * fois))} g de protéines`;
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
  d.querySelector("form").addEventListener("submit", ev => {
    ev.preventDefault(); ev.stopPropagation();
    if (a.confirmation_requise && !$("auCourant").checked) { $("eCourant").textContent = "Coche la case pour confirmer que tu as vu les écarts."; return $("auCourant").focus(); }
    const supplements = [...d.querySelectorAll("[name=supplement]:checked")].map(i => i.value);
    d.close("oui");
    const fini = agir("/api/semaine/modifier", { operation, semaine: k, confirme: true, supplements }, choisi && fois !== 1 ? "" : "Changement enregistré.");
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

/* ------------------------------------------------------------ mon propre plat */
// Les plats retirés pour de bon par la personne (Taha, 22/11/2026) : plus au catalogue ni dans les choix.
const estRetire = id => (E.plats_retires || []).includes(id);
function ingredientsConnus() {
  // Les ingredients du site et ceux crees par le profil, pour les listes de saisie.
  return [...new Set(E.recettes.filter(r => !r.perso).flatMap(r => r.ing.filter(i => i.u !== "qs").map(i => i.n))
    .concat(Object.keys(E.ingredients_perso || {})))].sort((a, b) => a.localeCompare(b, "fr"));
}
function lireQuantite(texte) {
  // « poulet 150 g », « 150g de poulet », « riz 0,2 kg » -> { nom, q, u } ; sans quantite : { nom }.
  const t = texte.trim(), nb = x => Number(x.replace(",", "."));
  const unites = "kg|g|gr|grammes?|cl|ml|l|pi[eè]ces?|pcs?";
  let m = t.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${unites})?\\.?$`, "i"));
  if (m) return mesure(m[1], nb(m[2]), m[3]);
  m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${unites})?\\s+(?:de\\s+|d['’]\\s*)?(.+)$`, "i"));
  if (m) return mesure(m[3], nb(m[1]), m[2]);
  return { nom: t };
  function mesure(nom, q, u) {
    u = (u || "").toLowerCase();
    if (u === "kg" || u === "l") q *= 1000;
    if (u === "cl") q *= 10;
    const unite = /^(kg|g|gr|gramme|grammes)$/.test(u) ? "g" : /^(l|cl|ml)$/.test(u) ? "ml" : u ? "pièce" : "";
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
  d.innerHTML = `<form class="feuille formulaire" novalidate>
    <h2 id="dialogueTitre">Mon propre plat</h2>
    <p class="petit discret" style="margin:-4px 0 14px">Écris ce que tu manges, avec les quantités si tu les connais : « café au lait Tassimo », « 2 œufs, pain pita 70 g ». L'appli met exactement ça, rien de plus.</p>
    <div class="champ"><label for="ppNom">Nom du plat <small>(facultatif)</small></label>
      <input id="ppNom" name="nom" type="text" maxlength="80" autocomplete="off" placeholder="Poulet riz de ma mère" value="${esc(saisie.nom)}"></div>
    <div class="champ"><label for="ppIng">Ingrédients</label>
      <div class="ajout"><input id="ppIng" type="text" list="ppConnus" autocomplete="off" placeholder="Café au lait Tassimo, 2 œufs, riz 80 g…">
        <button class="bouton second" type="button" id="ppAjouter">Ajouter</button></div>
      <datalist id="ppConnus">${connus.map(n => `<option value="${esc(n)}">`).join("")}</datalist>
      <small>Un par un, ou plusieurs séparés par des virgules, « et » ou « + ». Sans quantité, l'appli met une portion habituelle, que tu règles à l'écran suivant. La marque ou le magasin ne gênent pas (« Skyr – Lidl »). Un produit inconnu ? Tu pourras le créer avec Claude.</small></div>
    <div class="gouts" id="ppListe" aria-label="Ingrédients choisis">${saisie.ingredients.map((n, i) => `<button type="button" data-oter="${i}" aria-label="Retirer ${esc(n)}">${esc(n)}${qs[n] != null ? ` · ${nombre(qs[n])}${unites[n] && unites[n] !== "pièce" ? " " + unites[n] : ""}` : ""}${icone("x")}</button>`).join("")}</div>
    <div class="options" style="margin-top:14px"><label class="option"><input type="checkbox" id="ppCompleter"${saisie.telQuel ? "" : " checked"}>
      <span><b>L'IA complète la recette ${BADGE_IA}</b><small>Seulement si tu le veux : il ajoute ce qui manque (matière grasse, épices, accompagnement) et règle les quantités sur ${ctx.remplace ? `« ${esc(recette(ctx.remplace).nom)} »` : "ton objectif"}. Il faut alors un nom de plat.</small></span></label></div>
    <small id="ePerso" class="erreur" role="alert" style="display:block;margin-top:12px;color:var(--critique)">${erreur}</small>
    <div class="actions pied"><button class="bouton second" type="button" value="non">${ctx.retour ? "Retour" : "Annuler"}</button>
      <button class="bouton" type="submit">Voir le plat</button></div></form>`;
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
    ev.submitter.disabled = true; if (!s.telQuel) ev.submitter.textContent = "L'IA complète la recette…";      // Claude met une dizaine de secondes
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
    if (!r.ok) return demanderPlatPerso(ctx, saisie, esc(rep.erreur || "L'appli a refusé."));
    p = rep.plat;
  } catch (e) { return dire("L'appli ne répond pas."); }
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
  d.innerHTML = `<form class="feuille formulaire" novalidate>
    <h2 id="dialogueTitre">${o.creer ? "Nouvel ingrédient" : esc(v.nom)}</h2>
    ${o.creer ? `<p class="petit discret" style="margin:-4px 0 12px" id="inOrigine">${origine(v.etiquette)}</p>`
      : `<p class="petit discret" style="margin:-4px 0 12px">${v.nb_plats ? `Utilisé dans ${v.nb_plats} plat${v.nb_plats > 1 ? "s" : ""} : ${v.nb_plats > 1 ? "ils seront recalculés" : "il sera recalculé"} pour toi.` : "Utilisé dans aucun plat pour l'instant."}
        ${v.corrige ? " Tu as déjà corrigé ces valeurs." : v.cree ? " Ingrédient créé par toi." : " Valeurs du site (ordres de grandeur des tables CIQUAL)."}</p>`}
    ${o.creer && (v.deja || []).length ? `<div class="dujour" style="margin-bottom:12px"><strong>Tu l'as peut-être déjà.</strong>
      ${v.deja.map(n => `<span style="display:block;margin-top:6px">${esc(n)} : <button type="button" class="lien" data-deja="${esc(n)}">prendre celui-ci</button>
        · <button type="button" class="lien" data-modifier="${esc(n)}">modifier ses valeurs</button></span>`).join("")}</div>` : ""}
    ${o.creer && v.attention ? `<p class="dujour" style="margin-bottom:12px"><strong>À vérifier :</strong> ${esc(v.attention)}</p>` : ""}
    ${o.creer && (v.etiquettes || []).length ? `<details class="etiquettes" style="margin-bottom:12px"${v.etiquette == null ? " open" : ""}><summary>${v.etiquette == null ? "Produits proches trouvés en ligne" : "Autres produits trouvés en ligne"} (${v.etiquettes.length})${icone("caret-right")}</summary>
      <ul class="lignes">${v.etiquettes.map((e, i) => `<li><span><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.nom)}</a>
        <small class="discret" style="display:block">${esc(e.source)} · pour 100 g : ${nombre(e.kcal)} kcal, ${String(e.prot).replace(".", ",")} g de protéines${e.portion_g ? ` · portion ${nombre(e.portion_g)} g` : ""}${e.attention ? ` · ${esc(e.attention)}` : ""}</small></span>
        <button type="button" class="lien" data-etiquette="${i}">prendre ces valeurs</button></li>`).join("")}</ul></details>` : ""}
    ${o.creer ? `<div class="champ"><label for="inNom">Nom</label><input id="inNom" type="text" maxlength="80" autocomplete="off" value="${esc(v.nom)}" required></div>` : ""}
    ${nouveau ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:14px">
      <div class="champ" style="margin:0"><label for="inU">Unité</label><select id="inU"><option value="g"${u === "g" ? " selected" : ""}>grammes</option><option value="ml"${u === "ml" ? " selected" : ""}>millilitres</option></select></div>
      ${champ("inQ", "Une portion", v.q, u)}
      <div class="champ" style="margin:0"><label for="inA">Rayon</label><select id="inA">${E.rayons.map((n, k) => `<option value="${k}"${k === Number(v.a) ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      ${champ("inPrix", "Prix au kilo (€)", v.prix, "€")}</div>` : ""}
    <h3 style="margin-bottom:8px">Pour 100 ${u}</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px">${MAC.map(([k, nom, un]) => champ("in_" + k, `${nom} (${un})`, val[k], un)).join("")}</div>
    ${nouveau && E.claude === false ? champsVitamines("inV_") : ""}
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
  if ($("inU")) $("inU").addEventListener("change", () => { d.querySelector("h3").textContent = "Pour 100 " + $("inU").value; });
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
    dire(o.creer ? `« ${nom} » créé.` : `Valeurs enregistrées${v.nb_plats ? ` : ${v.nb_plats} plat${v.nb_plats > 1 ? "s" : ""} recalculé${v.nb_plats > 1 ? "s" : ""}` : ""}.`);
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
      <div class="aj-ajout"><div class="rp-recherche${E.claude === false ? "" : " champ-ia"}">${icone(E.claude === false ? "magnifying-glass" : "sparkle")}<input id="ajNouveau" type="search" enterkeyhint="go" autocomplete="off"
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
    const bouton = $("ajAjouter"); bouton.disabled = true; bouton.lastChild.textContent = "L'IA cherche…";
    const candidats = libres().map(n => [n, ressemblance(brut, n)]).sort((x, y) => y[1] - x[1]).slice(0, 30).map(([n]) => n);
    let v;
    try {
      const r = await fetch("/api/ingredient/proposer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nom: brut, candidats }) });
      const rep = await r.json();
      if (!r.ok) { dire(rep.erreur || "L'IA n'a pas pu répondre."); return refaire(actuel); }
      v = rep.ingredient;
    } catch (e) { dire("L'appli ne répond pas."); return refaire(actuel); }
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
  return r.nb_notes ? `<span class="note-lue">${icone("star-fill")}${nombre(r.note, 1)}<span class="discret petit">(${r.nb_notes} note${r.nb_notes > 1 ? "s" : ""})</span></span>`
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
  const libre = ctx && (enSuivi() || !mange) && !(ctx.moment === "dej" && j.dej_reste);
  const reg = ctx && reglable(s, ctx.k, ctx.n, id, ctx.moment);
  // Les ingrédients de l'assiette : le plat ce jour-là (quantités réglées comprises) × la taille de l'assiette.
  // Depuis l'historique : la taille se déduit des calories notées ce jour-là.
  const iciVu = vu && vu.date ? semainePourDate(vu.date) : null;
  const rIng = ctx ? r : iciVu ? platDuJour(iciVu.s, iciVu.n, id, vu.moment || "") : r0;
  const tIng = ctx ? t : vu && rIng.kcal ? vu.kcal / rIng.kcal : 1;
  fermerCarte(true);
  const fond = document.createElement("div");
  fond.className = "carte-fond";
  fond.innerHTML = `<article class="carte-plat" role="dialog" aria-modal="true" aria-labelledby="cpTitre">
    <div class="cp-photo">${photo(r0, 960, "grande", r0.nom)}
      ${r0.perso && !r0.photo_de ? `<label class="cp-ajout-photo">${icone("image")}${r0.photo ? "Changer la photo" : "Prendre une photo"}<input type="file" accept="image/*" hidden data-photo-plat="${id}"></label>` : ""}
      <button type="button" class="cp-fermer" aria-label="Fermer">${icone("x")}</button></div>
    <div class="cp-corps">
      ${quand || vu ? `<p class="petit discret">${esc(vu ? vu.quand : quand)}</p>` : ""}
      <h2 id="cpTitre">${esc(r0.nom)}</h2>
      ${labels.length ? `<p class="cp-etiquettes">${labels.map(x => `<span>${esc(x)}</span>`).join("")}</p>` : ""}
      <div class="cp-chiffres">
        <div><b data-cp-v="${val("kcal")}" data-u="">${nombre(val("kcal"))}</b><span>kcal</span></div><div><b data-cp-v="${val("prot")}" data-u=" g">${nombre(val("prot"))} g</b><span>prot.</span></div>
        <div><b data-cp-v="${val("gluc")}" data-u=" g">${nombre(val("gluc"))} g</b><span>gluc.</span></div><div><b data-cp-v="${val("lip")}" data-u=" g">${nombre(val("lip"))} g</b><span>lip.</span></div>
      </div>
      <p class="petit discret cp-info">${[vu ? "Ce que tu as mangé ce jour-là" : ctx ? (t !== 1 ? `Assiette à ${nombre(Math.round(t * 100))} % de la recette` : "Recette telle quelle") : "Une portion",
        r0.temps ? `${r0.temps} min` : "", r.ajusteeCeJour ? "ajustée ce jour" : ""].filter(Boolean).join(" · ")}</p>
      ${(rIng.ing || []).length ? `<details class="cp-ingredients"${vu ? " open" : ""}><summary>Ingrédients${icone("caret-right")}</summary>
        <div class="cp-ing-liste">${listeIngredients(rIng, tIng)}</div></details>` : ""}
      ${ctx && enSuivi() ? `<div class="cp-mange">${courante && ctx.n <= rangDuJour(s)
          ? `<button class="bouton${mange ? " second" : ""}" data-action="manger" data-jour="${ctx.n}" data-plat="${id}" data-annuler="${mange ? 1 : 0}">${icone("check")}${mange ? "Pas encore mangé" : "J'ai mangé"}</button>` : ""}
        <a class="bouton sobre" href="${courante ? `#/cuisine/${id}?jour=${ctx.n}` : `#/cuisine/${id}`}">${icone("cooking-pot")}Voir la recette</a></div>`
      : enSuivi() ? `${vu && vu.date && vu.date < E.journal_repas.aujourdhui && semainePourDate(E.journal_repas.aujourdhui)
          ? `<button type="button" class="bouton cp-cuisiner" data-action="mangerAujourdhui" data-plat="${id}" data-moment="${esc(vu.moment || "")}">${icone("check")}Manger aujourd'hui</button>` : ""}
        <a class="bouton sobre cp-cuisiner" href="#/cuisine/${id}">${icone("cooking-pot")}Voir la recette</a>`
      : `<a class="bouton cp-cuisiner" href="${courante && ctx ? `#/cuisine/${id}?jour=${ctx.n}` : `#/cuisine/${id}`}">${icone("cooking-pot")}Cuisiner</a>`}
      ${ctx && (libre || reg) ? `<div class="cp-choix">
        ${libre ? `<button type="button" data-action="changer" data-semaine="${ctx.k}" data-jour="${ctx.n}" data-moment="${ctx.moment}">${icone("swap")}
          <span><b>Remplacer par un autre plat</b><small>Du catalogue ou un des tiens</small></span>${icone("caret-right")}</button>` : ""}
        ${(libre || enSuivi()) && !(ctx.moment === "dej" && j.dej_reste) ? `<button type="button" data-action="ajusterJour" data-semaine="${ctx.k}" data-jour="${ctx.n}" data-plat="${id}">${icone("notebook")}
          <span><b>Modifier les ingrédients</b><small>Retirer, ajouter, changer, pour ce jour</small></span>${icone("caret-right")}</button>` : ""}
      </div>` : ctx ? "" : `${estRepas(r0) && !vu ? `<div class="cp-choix"><button type="button" data-action="ajuster" data-plat="${id}">${icone("sliders-horizontal")}
          <span><b>${r0.ajustee ? "Recette ajustée : modifier" : "Ajuster la recette"}</b><small>Les quantités, pour tous les jours</small></span>${icone("caret-right")}</button></div>` : ""}
        <div class="cp-avis">${boutonsGout(r0)}</div>
        ${estRepas(r0) && !vu ? `<p class="cp-equilibrer"><button type="button" class="bouton sobre cp-retirer" data-action="retirerPlat" data-plat="${id}">${icone("poubelle")}Retirer ce plat</button></p>` : ""}`}
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
    const place = (vv ? vv.height : innerHeight) - 32 - carte.offsetHeight;
    carte.style.top = `${Math.max(0, Math.min(30, Math.floor(place / 2)))}px`;
  };
  const caler = () => { if (vv) {
    Object.assign(fond.style, { top: `${vv.offsetTop}px`, height: `${vv.height}px`, bottom: "auto" });
    fond.style.setProperty("--haut-visible", `${vv.height}px`); }
    tenir(); };
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
function vuePlat({ arg }) {
  const r = recette(arg), s = E.semaine;
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
      <a class="bouton" href="#/cuisine/${r.id}">Voir la recette</a>
      ${estRepas(r) ? `<button class="bouton second" data-action="ajuster" data-plat="${r.id}">${icone("sliders-horizontal")}Ajuster ou changer les ingrédients</button>` : ""}
      ${choix && estRepas(r) && !entame ? `<button class="bouton second" data-action="ecarter" data-plat="${r.id}">Écarter ce plat</button>` : ""}
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
  return `<section class="bloc large" aria-labelledby="tHors"><h2 id="tHors">Produits manquants${hors.length ? `<span class="puce">${hors.length} produit${hors.length > 1 ? "s" : ""}</span>` : ""}</h2>
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
          <div><dt>En stock</dt><dd>${fs.jours_en_stock} jour${fs.jours_en_stock > 1 ? "s" : ""}</dd><p>${nombre(fs.stock)} g à la maison.</p></div></dl>
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
function vueCourses() {
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
  if (c.boucher.length && !fini) conseils.push(["", "Boucher", `${c.boucher.length} produit${c.boucher.length > 1 ? "s" : ""} de viande à prendre chez ton boucher : jamais dans le panier.`]);
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
      <div class="exo-texte"><div class="quand">${QUAND[c.quand]}${c.pour_demain ? ", en double pour demain midi" : ""}</div><h3>${esc(r.nom)}</h3>
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
  // La seance demandee (?jour=), sinon la prochaine fois ou ce plat se cuisine.
  let n = params.has("jour") ? jourDemande(params) : -1, seance = null;
  if (s) {
    if (n < 0) n = [...s.jours.keys()].find(i => s.jours[i].cuisine.some(c => c.id === arg && !fait(s, i, arg))) ?? -1;
    seance = n >= 0 ? s.jours[n].cuisine.find(c => c.id === arg) : null;
  }
  if (seance) r = platDuJour(s, n, arg);                   // les quantites de ce jour-la, si elles ont ete ajustees
  const portions = seance ? seance.portions : 1, ok = seance && fait(s, n, arg);
  const k = E.mois ? E.mois.rang : 0;
  const goute = s && Object.keys(s.prepares || {}).some(k => k.endsWith("|" + arg));
  const combien = seance ? pourCombien(seance, s.jours[n]) : "pour 1 repas", facteur = seance ? tailleDe(s.jours[n], arg) : 1;
  barre(seance && !ok ? `<div><b>${s.jours[n].jour}, ${combien}</b><span>Les ingrédients sortiront du stock</span></div>
    <button class="bouton" data-action="cuisine" data-plat="${r.id}" data-jour="${n}">C'est cuisiné</button>` : "");
  // Mode flemmard : pas de page Cuisine ; « Retour » ramène là d'où tu viens (Jour, Catalogue…) (Taha, 22/11/2026).
  if (enSuivi()) apresRendu.push(() => { const a = document.querySelector("a.retour[data-precedent]");
    if (a && adressePrecedente) a.addEventListener("click", ev => { ev.preventDefault(); history.back(); }); });
  return `${enSuivi() ? `<a class="retour" href="#/semaine" data-precedent>${icone("caret-left")}Retour</a>`
    : `<a class="retour" href="#/cuisine${n >= 0 ? `?jour=${n}` : ""}">${icone("caret-left")}Cuisine</a>`}
  <article class="fiche fiche-compacte">
    <div class="fc-tete">${photo(r, 240, "carre", r.nom)}
      <div><h1 tabindex="-1">${esc(r.nom)}</h1>
        <p class="discret chiffres">${[`${nombre(r.kcal * facteur)} kcal`, `${nombre(r.prot * facteur)} g prot.`, r.temps ? `${r.temps} min` : "",
          seance && facteur !== 1 ? `${nombre(facteur * 100)} %` : ""].filter(Boolean).join(" · ")}</p>
        ${goute && estRepas(r) ? `<div class="etoiles fc-note" role="group" aria-label="Ta note, de 1 à 5 : elle décide si ce plat revient" title="Ta note : elle décide si ce plat revient">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-action="noter" data-plat="${r.id}" data-note="${i}"
          class="${r.note && i <= Math.round(r.note) ? "pleine" : ""}" aria-label="${i} étoile${i > 1 ? "s" : ""} sur 5">${icone(r.note && i <= Math.round(r.note) ? "star-fill" : "star")}</button>`).join("")}</div>` : ""}
        ${enSuivi() ? "" : `<p class="discret petit">${seance ? `${s.jours[n].jour}, ` : ""}${combien}${seance && seance.pour_demain ? " : ce soir et demain midi" : ""}.</p>`}</div></div>
    <section class="fc-bloc" aria-labelledby="tIng"><h2 id="tIng">Ingrédients</h2>
      <ul class="ingredients">${r.ing.map(i => `<li><span>${i.u === "qs" ? esc(i.n) : `<button type="button" class="lien" data-action="ingredient" data-nom="${esc(i.n)}"
        aria-label="Valeurs de ${esc(i.n)}">${esc(i.n)}</button>${(E.ingredients_perso || {})[i.n] ? ` <small class="discret">(${E.ingredients_perso[i.n].cree ? "créé" : "corrigé"} par toi)</small>` : ""}`}</span>
        <span>${quantite(i.u === "qs" ? 0 : Math.round(i.q * portions * 10) / 10, i.u)}</span></li>`).join("")}</ul>
</section>
    <section class="fc-bloc" aria-labelledby="tEtapes"><h2 id="tEtapes">Préparation</h2>
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
  const suivi = x.jours_suivis > 0 && !moisTropTot, parJour = p === "jour" ? "" : " par jour, en moyenne";
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
  const court = iso => new Intl.DateTimeFormat("fr-FR", p === "semaine" ? { weekday: "short" } : { day: "numeric" }).format(new Date(iso + "T12:00"));
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
      series: manges.length ? [{ nom: "Mangé", couleur: "var(--s1)", marques: true, points: manges },
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
    <p>Il s'affiche quand 7 journées de ce mois sont finies : encore ${7 - (x.jours_finis || 0)} jour${7 - (x.jours_finis || 0) > 1 ? "s" : ""}. En attendant, regarde « Cette semaine ».</p>
    <a class="bouton second" href="#/avancement?p=semaine">Voir cette semaine</a></div>`
  : !suivi ? `<div class="vide"><h2>${enSuivi() && p !== "jour" ? `Pas encore de journée finie ${p === "semaine" ? "cette semaine" : "ce mois-ci"}` : `Rien de cuisiné ${p === "jour" ? "aujourd'hui" : p === "semaine" ? "cette semaine" : "ce mois-ci"}`}</h2>
    ${enSuivi() ? `<p>${p === "jour" ? "L'avancement se remplit avec les repas que tu notes." : "La semaine et le mois comptent les journées terminées : la moyenne commence demain."}</p>
    <a class="bouton second" href="#/semaine">Noter ce que je mange</a></div>` : `<p>L'avancement se remplit quand tu touches « C'est cuisiné » ou « Journée faite » dans l'onglet Cuisine.</p>
    <a class="bouton second" href="#/cuisine">Aller à la cuisine</a></div>
    <dl class="kpis bloc">${argent}</dl>`}` : `
  ${prevuJour ? `<p class="legende-jauges legende-avancement"><span><i class="mange"></i>mangé</span><span><i></i>prévu</span></p>` : ""}
  <dl class="kpis" style="margin-top:14px">
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
    : new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(date + "T12:00")).replace(/^./, c => c.toUpperCase());
  const lien = d => `#/vitamines${d === a.aujourdhui ? "" : `?j=${d}`}`;
  const nav = `<nav class="jours jours-suivi jours-vitamines" aria-label="Jour">
    ${date > premier ? `<a class="fleche" href="${lien(decaler(date, -1))}" aria-label="Jour d'avant">${icone("caret-left")}</a>` : ""}
    <button type="button" class="date-choix" id="vitDate" aria-current="true" aria-expanded="false" aria-controls="vitCal">${esc(bulle)}${icone("calendar-blank")}</button>
    ${dec > 0 ? `<a class="fleche" href="${lien(decaler(date, 1))}" aria-label="Jour suivant">${icone("caret-right")}</a>` : ""}</nav>
    <div class="cal" id="vitCal" hidden></div>`;
  // Le calendrier : les jours après aujourd'hui (et avant le début du suivi) grisés, un point sous les jours mangés
  // (Taha, 20/11/2026 ; celui de l'iPhone ne grise rien).
  const avecDonnees = new Set([...passes, ...(a.jour.jours_suivis ? [a.aujourdhui] : [])]);
  const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
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
  const aCompleter = manquent.length ? `<details class="bloc a-completer"${completer ? " open" : ""}><summary><span>${icone("warning-circle")}${manquent.length} aliment${manquent.length > 1 ? "s" : ""} sans vitamines : à compléter</span>${icone("caret-right")}</summary>
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
    <p class="petit discret legende-prevu"><span>Moyenne par jour sur les ${n} derniers jours (${dates.length} jour${dates.length > 1 ? "s" : ""} avec des plats mangés)</span></p>
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
      ${i.sexe ? l("Sexe", esc(i.sexe)) : ""}${i.telephone ? l("Téléphone", esc(i.telephone)) : ""}
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
  <section class="bloc" aria-labelledby="tQui"><h2 id="tQui" style="margin-bottom:8px">Mes informations</h2>
    <ul class="lignes">${i.date_naissance ? l("Date de naissance", `${esc(dateLongueCourte(i.date_naissance).replace(/^[a-zé]+ /i, ""))} (${i.age} ans)`) : i.age ? l("Âge", `${i.age} ans`) : ""}
      ${i.sexe ? l("Sexe", esc(i.sexe)) : ""}${i.telephone ? l("Téléphone", esc(i.telephone)) : ""}
      ${i.taille_cm ? l("Taille", `${i.taille_cm} cm`) : ""}${i.poids_kg ? l("Poids", `${nombre(i.poids_kg, 1).replace(",0", "")} kg`) : ""}</ul></section>
  <ul class="menu" style="margin-top:16px">
    ${lien("#/reglages", "sliders-horizontal", "Réglages", "Objectif, date de début, alimentation, informations, compte Claude, mot de passe")}
    ${E.utilisateur.admin ? lien("#/profils", "users", "Profils", "") : ""}
  </ul>
  <p style="margin-top:18px"><button class="bouton sobre" data-action="deconnexion">${icone("sign-out")}Se déconnecter</button></p>`;
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
function formulaireProfil(avecCode) {
  const champ = (id, libelle, corps, aide = "") => `<div class="champ"><label for="${id}">${libelle}</label>${corps}${aide ? `<small>${aide}</small>` : ""}</div>`;
  const nombreChamp = (id, min, max, pas, exemple) => `<input id="${id}" name="${id}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${pas}" autocomplete="off" placeholder="${exemple}…" required>`;
  const choix = (id, options) => `<select id="${id}" name="${id}">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>`;
  const coche = (id, titre, aide, defaut) => `<label class="option"><input type="checkbox" id="${id}" name="${id}"${defaut ? " checked" : ""}><span><b>${titre}</b><small>${aide}</small></span></label>`;
  return `<form class="formulaire" id="fProfil" novalidate>
    ${avecCode ? champ("pCode", "Code d'invitation", `<input id="pCode" name="code" type="text" autocomplete="off" spellcheck="false" autocapitalize="none" required>`, "Demande-le à la personne qui gère le site.") : ""}
    <div class="champs2">
    ${champ("pNom", "Prénom", `<input id="pNom" name="prenom" type="text" autocomplete="given-name" maxlength="40" required>`)}
    ${champ("pFamille", "Nom", `<input id="pFamille" name="nom_famille" type="text" autocomplete="family-name" maxlength="60" required>`)}
    </div>
    ${champ("pIdent", "Identifiant de connexion", `<input id="pIdent" name="identifiant" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required>`, "3 à 20 lettres minuscules, chiffres ou tirets. Il ne pourra plus changer.")}
    ${champ("pMdp", "Mot de passe", `<input id="pMdp" name="mot_de_passe" type="password" autocomplete="new-password" minlength="8" required>`, "8 caractères au moins.")}
    <div class="champs2">
    ${champ("date_naissance", "Date de naissance", `<input id="date_naissance" name="date_naissance" type="date" required>`)}
    ${champ("sexe", "Sexe", choix("sexe", [["femme", "Femme"], ["homme", "Homme"]]))}
    </div>
    ${champ("telephone", "Téléphone", `<input id="telephone" name="telephone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" required>`)}
    ${champ("taille_cm", "Taille, en centimètres", nombreChamp("taille_cm", 130, 220, 1, "170"))}
    ${champ("poids_kg", "Poids, en kilos", nombreChamp("poids_kg", 35, 250, 0.1, "70"))}
    ${champ("activite", "Activité", choix("activite", [["sedentaire", "Sédentaire, peu ou pas de sport"], ["leger", "Sport léger, 1 à 3 fois par semaine"], ["modere", "Sport modéré, 3 à 5 fois par semaine"], ["actif", "Sport intense, 6 à 7 fois par semaine"], ["intense", "Sport très intense ou métier physique"]]))}
    ${champ("objectif", "Objectif", choix("objectif", [["perte", "Perdre du poids"], ["maintien", "Garder mon poids"], ["prise", "Prendre du muscle"]]))}
    <div class="options" style="margin-bottom:18px">
      ${coche("fodmap", "Régime pauvre en FODMAP", "Seulement des plats pauvres en FODMAP dans tes semaines.", false)}
    </div>
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
  $("contenu").innerHTML = `<button class="retour" data-action="versConnexion" style="border:0;background:none;cursor:pointer">${icone("caret-left")}Connexion</button>
    <div class="titre"><h1 tabindex="-1">Créer mon profil</h1><p>Quelques informations pour calculer tes besoins.</p></div>${formulaireProfil(true)}`;
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
  const b = E.budget, c = E.couts, s = E.semaine;
  const mois = new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date(b.mois + "-01"));
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
      ${kpi("Payé ce mois-ci", euros(b.paye), `${b.commandes} commande${b.commandes > 1 ? "s" : ""} payée${b.commandes > 1 ? "s" : ""}, viande comprise.`)}
      ${kpi(depasse ? "Dépassement" : "Reste à dépenser", euros(Math.abs(b.reste)), depasse ? "Tu as dépassé ton budget du mois." : "Ce que tu peux encore acheter ce mois-ci.")}
    </dl>
    <p class="calcul chiffres">${euros(b.budget)} de budget, moins ${euros(b.stock_debut)} de stock au début du mois, moins ${euros(b.paye)} déjà payés : ${depasse ? `${euros(-b.reste)} de trop` : `il reste ${euros(b.reste)}`}.</p>
  </section>

  ${semaine}

  <section class="bloc" aria-labelledby="tStockB"><h2 id="tStockB">Ton stock</h2>
    <dl class="kpis">
      ${kpi("Valeur du stock aujourd'hui", euros(b.stock.valeur), `${b.stock.produits} produit${b.stock.produits > 1 ? "s" : ""}${b.stock.sans_prix ? `, dont ${b.stock.sans_prix} sans prix connu` : ""}.`)}
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
function vueCatalogue({ params }) {
  barre("");
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
  const repas = E.recettes.filter(r => estRepas(r) && !estRetire(r.id)), F = filtresCat, couvre = E.stock_couvre || {};
  const cherche = filtreCatalogue.trim().toLowerCase();
  const ordre = { nom: (a, b) => a.nom.localeCompare(b.nom, "fr"), prix: (a, b) => a.cout - b.cout, prot: (a, b) => b.prot - a.prot,
                  kcal: (a, b) => a.kcal - b.kcal, temps: (a, b) => (a.temps || 0) - (b.temps || 0) };
  const lignes = repas.filter(r => (!F.cats.size || F.cats.has(r.cat)) && (!F.avis || (F.avis === "sans" ? !r.gout : r.gout === F.avis)) && r.nom.toLowerCase().includes(cherche)
      && [...F.regimes].every(x => r.filtres.regimes.includes(x)) && [...F.atouts].every(x => r.filtres.atouts.includes(x))
      && (!F.proteines.size || F.proteines.has(r.filtres.proteine)) && (!F.origines.size || F.origines.has(r.filtres.origine))
      && (!F.prix || r.cout < F.prix) && (!F.temps || (r.temps && r.temps < F.temps)) && (!F.stock || couvre[r.id] === 1))
    .sort((a, b) => ordre[F.tri](a, b) || ordre.nom(a, b));
  const nb = gout => repas.filter(r => r.gout === gout).length;
  const puce = (cle, valeur, texte, actif) => `<button type="button" data-action="filtreCat" data-cle="${cle}" data-valeur="${esc(valeur)}" aria-pressed="${actif}">${texte}</button>`;
  const actifs = F.cats.size + (F.avis ? 1 : 0) + F.regimes.size + F.atouts.size + F.proteines.size + F.origines.size + (F.prix ? 1 : 0) + (F.temps ? 1 : 0) + (F.stock ? 1 : 0);
  // Seules les cuisines et les proteines presentes dans cette categorie sont proposees.
  const ici = repas.filter(r => !F.cats.size || F.cats.has(r.cat));
  const origines = [...new Set(ici.map(r => r.filtres.origine).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const proteines = PROTEINES.filter(([id]) => ici.some(r => r.filtres.proteine === id));
  const groupe = (nom, puces) => puces ? `<div class="filtre-groupe"><span class="filtre-nom">${nom}</span><div class="gouts" role="group" aria-label="${nom}">${puces}</div></div>` : "";
  return `<div class="titre"><h1 tabindex="-1">Catalogue</h1>
    <p>${repas.length} recettes. Dis ce que tu veux bien tester et ce que tu n'aimes pas : l'appli en tient compte quand il compose ta semaine. ${nb("tester")} à tester, ${nb("non")} que tu n'aimes pas.</p></div>
  <p class="actions" style="margin:-6px 0 14px"><button class="bouton second" data-action="creerPlat" data-cat="${F.cats.size === 1 ? [...F.cats][0] : "plat"}">${icone("cooking-pot")}Créer mon propre plat</button></p>
  <section class="filtres" aria-labelledby="tFiltres">
    <h2 id="tFiltres"><button type="button" class="filtres-bascule" data-action="filtreCat" data-cle="ouvert" data-valeur="" aria-expanded="${F.ouvert}">${icone("sliders-horizontal")}Filtres${actifs ? ` <span class="puce accent">${actifs}</span>` : ""}${icone("caret-right")}</button>
      ${actifs ? `<button type="button" class="bouton sobre" data-action="filtreCat" data-cle="raz" data-valeur="">Tout enlever</button>` : ""}</h2>
    ${F.ouvert ? `${groupe("Repas", CATS.map(([id, nom]) => puce("cat", id, nom, F.cats.has(id))).join(""))}
    ${groupe("Ton avis", AVIS.filter(([id]) => id).concat([["sans", "Pas encore d'avis"]]).map(([id, nom]) => puce("avis", id, nom, F.avis === id)).join(""))}
    ${groupe("Régime", REGIMES.map(x => puce("regime", x, x, F.regimes.has(x))).join(""))}
    ${groupe("Protéine", proteines.map(([id, nom]) => puce("proteine", id, nom, F.proteines.has(id))).join(""))}
    ${groupe("Cuisine", origines.map(x => puce("origine", x, x, F.origines.has(x))).join(""))}
    ${groupe("Temps", TEMPS.map(([v, t]) => puce("temps", v, t, F.temps === v)).join(""))}
    ${groupe("Atouts", ATOUTS.map(x => puce("atout", x, x, F.atouts.has(x))).join(""))}
    ${groupe("Prix", PRIX.map(([v, t]) => puce("prix", v, t, F.prix === v)).join(""))}
    ${groupe("Stock", puce("stock", "", "Faisable avec mon stock", F.stock))}` : ""}
    <div class="champ formulaire tri"><label for="triCat">Trier par</label>
      <select id="triCat" name="tri">${TRIS.map(([id, nom]) => `<option value="${id}"${F.tri === id ? " selected" : ""}>${nom}</option>`).join("")}</select></div>
  </section>
  <div class="champ formulaire"><label for="filtre">Chercher une recette</label>
    <input id="filtre" name="filtre" type="search" autocomplete="off" placeholder="Poulet, curry…" value="${esc(filtreCatalogue)}"></div>
  <p class="discret petit" role="status" style="margin:-6px 0 8px">${lignes.length} recette${lignes.length > 1 ? "s" : ""}${F.stock && !E.stock.length ? ". Ton stock est vide : ce filtre servira après ta première commande payée" : ""}.</p>
  ${lignes.length ? `<ul class="rp-liste cat-liste">${lignes.slice(0, 80).map(r => `<li><a class="rp-plat" href="#/plat/${r.id}">${photo(r, 120, "carre")}
      <span class="rp-texte"><b>${esc(r.nom)}</b>${macrosLigne(r.kcal, r.prot).replace("</span></span>", `</span><span>${euros(r.cout)}</span>${r.gout === "tester" ? `<span class="rp-ecart plus">À tester</span>` : r.gout === "non" ? `<span>J'aime pas</span>` : ""}</span>`)}</span></a></li>`).join("")}</ul>`
    : `<p class="discret">Aucune recette ne correspond.</p>`}
  ${lignes.length > 80 ? `<p class="discret petit" style="margin-top:14px">Les 80 premières sur ${lignes.length} : précise avec un filtre ou la recherche pour voir les autres.</p>` : ""}`;
}
function vueStock() {
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
const dateLongueCourte = iso => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso + "T12:00"));
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
  const nomJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(new Date(date + "T12:00")).replace(/^./, c => c.toUpperCase());
  const bulle = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" }).format(new Date(date + "T12:00")).replace(/^./, c => c.toUpperCase());
  const j = J.jours.find(x => x.date === date) || { entrees: [], repas: [], kcal: 0, prot: 0, gluc: 0, lip: 0, reste: { kcal: J.objectif.kcal, prot: J.objectif.prot } };
  // Aujourd'hui, la barre illustre aussi ce qui est déjà mangé ; les chiffres restent ceux du prévu (Taha, 20/11/2026).
  const mangeJour = dec === 0 && E.avancement ? E.avancement.jour : null;
  const o = J.objectif, r = j.reste || {}, ici = semainePourDate(date);
  const m = E.mois, courante = ici && (!m || ici.k === m.rang);
  const reste = r.kcal > 0 ? `Il te reste <b>${nombre(r.kcal)} kcal</b>${r.prot > 0 ? ` et <b>${nombre(r.prot)} g de protéines</b>` : ", protéines atteintes"}.`
    : `Objectif de calories atteint${r.kcal < -100 ? ` (+${nombre(-r.kcal)} kcal)` : ""}${r.prot > 0 ? `, il manque ${nombre(r.prot)} g de protéines` : ""}.`;
  const jp = ici ? ici.s.jours[ici.n] : null;
  // Après demain, « Pour finir la journée » se calcule à la demande (0,2 s par jour), une fois par état.
  E.ideesLoin = E.ideesLoin || {};
  if (dec >= 2 && !(date in E.ideesLoin)) {
    E.ideesLoin[date] = null;
    const etat = E;
    fetch(`/api/repas/idees?date=${date}`).then(r => r.ok ? r.json() : null).then(rep => {
      if (!rep || etat !== E || !rep.idees) return;
      E.ideesLoin[date] = rep.idees;
      if (route().vue === "semaine" && location.hash.includes(`d=${dec}`)) rendre();
    }).catch(() => {});
  }
  const idees = dec >= 2 ? E.ideesLoin[date] : (J.idees || {})[date];
  apresRendu.push(() => document.querySelectorAll("[data-idee]").forEach(b => b.addEventListener("click", () => {
    const x = idees.plats[Number(b.dataset.idee)];
    apercuChangement(idees.semaine, { ...x.operation, regler_plat: true }, `Ajouter « ${x.nom} » ?`);
  })));
  return `<div class="rubrique-jour"><div class="m-tete">
      <div><h1 tabindex="-1">${dec === 0 ? "Aujourd'hui" : demain ? "Demain" : dec === -1 ? "Hier" : esc(nomJour)}</h1><p class="petit discret">${esc(dateLongueCourte(date))}</p></div>
      <div class="ligne-boutons"><a class="bouton sobre rond" href="#/historique" aria-label="Historique des repas">${icone("notebook")}</a>
</div>
    </div>
    <nav class="jours jours-suivi" aria-label="Jour">${dec > dmin ? `<a class="fleche" href="#/semaine?d=${Math.min(dec, 0) - 1}" aria-label="Jour d'avant">${icone("caret-left")}</a>` : ""}
      ${dec < 0 ? `<a href="#/semaine?d=${dec}" aria-current="true">${dec === -1 ? "Hier" : esc(bulle)}</a>` : ""}
      ${dec < -1 ? `<a class="fleche" href="#/semaine?d=${dec + 1}" aria-label="Jour suivant">${icone("caret-right")}</a>` : ""}
      <a href="#/semaine"${dec ? "" : ' aria-current="true"'}>Aujourd'hui</a>
      <a href="#/semaine?d=1"${demain ? ' aria-current="true"' : ""}>Demain</a></nav>
    ${dec === 1 ? `<p class="petit discret" style="margin:-2px 0 12px">Provisoire : les quantités de demain se règlent demain matin, d'après ce que tu auras vraiment mangé aujourd'hui.</p>` : ""}
    ${jaugesDuJour(j, o, mangeJour)}
    <p class="reste-jour">${reste}</p>
    ${(E.vitamines_a_completer || []).length && dec === 0 ? `<a class="rappel" href="#/vitamines?completer=1">${icone("warning-circle")}<span>${E.vitamines_a_completer.length} aliment${E.vitamines_a_completer.length > 1 ? "s" : ""} sans vitamines : complète-les</span>${icone("caret-right")}</a>` : ""}
    ${E.eau && dec === 0 ? (() => {
      // L'eau : un seul bouton, coché = l'objectif du jour est bu (Taha, 21/11/2026 : « juste un bouton check »).
      const fait = eauCochee(date);
      return `<div class="eau" title="${esc(E.eau.selon)}">${icone("goutte")}<span class="eau-txt">Eau <small class="chiffres">${virgule(E.eau.litres)} L</small></span>
        <button type="button" class="eau-check" id="eauCheck" data-date="${date}" aria-pressed="${fait}" aria-label="${virgule(E.eau.litres)} L d'eau bus aujourd'hui">${icone("check")}</button></div>`; })() : ""}
    ${o.gluc || o.lip ? `<p class="petit discret chiffres" style="margin:-4px 0 12px">Glucides ${nombre(Math.round(j.gluc || 0))}${o.gluc ? ` / ${nombre(o.gluc)}` : ""} g · Lipides ${nombre(Math.round(j.lip || 0))}${o.lip ? ` / ${nombre(o.lip)}` : ""} g</p>` : ""}
    ${ici && (!m || ici.k >= m.rang) ? `<section class="m-repas grille-plats" aria-label="Les plats prévus">${repasDuJour(ici.s, ici.k, ici.n, true, true, false, true)}</section>`
      : dec < 0 && (j.repas || []).length ? `<section class="grille-plats histo-plats" aria-label="Les plats de ce jour"><div class="exos">${j.repas.map(x => platDHistorique(x, date)).join("")}</div></section>`
      : dec < 0 ? `<div class="dujour"><strong>Pas de menu ce jour-là.</strong> Ajoute ce que tu as mangé.</div>`
      : `<div class="dujour"><strong>Pas de menu prévu ce jour-là.</strong> Note ce que tu manges, ou compose la suite.
        <p style="margin-top:8px"><button class="bouton second" data-action="suivante">Composer la suite</button></p></div>`}
    ${j.entrees.length ? `<h2 class="titre-section">En plus</h2><div class="liste-notes">${j.entrees.map(ligneRepasNote).join("")}</div>` : ""}
    <button class="ajout-ligne" data-action="noterRepas" data-date="${date}">${icone("cooking-pot")}<span><b>Ajouter un repas</b><small>Un de tes plats, une description, une photo ou un ticket</small></span></button></div>
    <div class="rubrique-fin">
    ${idees && idees.plats.length ? `<details class="bloc idees idees-ligne"><summary><span><b>Pour finir la journée</b><small>${idees.plats.length} idée${idees.plats.length > 1 ? "s" : ""} ${idees.moment.startsWith("col") ? "en collation" : `pour le ${nomMoment(idees.moment)}`}, réglée${idees.plats.length > 1 ? "s" : ""} sur ton objectif</small></span>${icone("caret-right")}</summary>
      <ul class="rp-liste">${idees.plats.map((x, i) => `<li><button type="button" class="rp-plat" data-idee="${i}">${photo(recette(x.id), 120, "carre")}
        <span class="rp-texte"><b>${esc(x.nom)}</b>${macrosLigne(x.kcal, x.prot)}</span>
        ${o.kcal && Math.abs(x.kcal_jour - o.kcal) <= o.kcal * 0.05 && x.prot_jour >= o.prot * 0.95 ? `<span class="rp-tient" title="Ta journée tient l'objectif">${icone("check")}</span>` : ""}</button></li>`).join("")}</ul></details>` : ""}
    ${ici && courante && !jp.retire && ici.n <= rangDuJour(ici.s) && jp.cuisine.some(c => !fait(ici.s, ici.n, c.id)) ? `<div class="m-actions bas">
      <button class="bouton second" data-action="journee" data-jour="${ici.n}">${icone("check")}Tout mangé</button></div>` : ""}</div>`;
}
// Un plat de l'historique, en carte comme sur l'écran Jour : le toucher ouvre sa carte avec les chiffres de CE jour-là.
function platDHistorique(x, date) {
  const r = recette(x.id), place = x.moment.startsWith("col") ? (x.au_repas || "col") : x.moment;
  const quand = (MOMENTS_REPAS.find(([m]) => m === place) || [, "Collation"])[1];
  const texte = `<div class="exo-texte"><div class="quand">${quand}</div><h3>${esc(x.nom)}</h3>
    <div class="chiffres">${nombre(x.kcal)} kcal, ${nombre(x.prot)} g de protéines</div></div>`;
  if (!r) return `<div class="exo repas-ligne"><div class="repas">${photo({}, 480)}${texte}</div></div>`;     // plat supprimé depuis
  return `<div class="exo repas-ligne"><a class="repas" href="#/plat/${x.id}" data-date="${date}" data-moment-vu="${esc(x.moment)}" data-kcal="${x.kcal}" data-prot="${x.prot}" data-gluc="${x.gluc || 0}"
    data-lip="${x.lip || 0}" data-quand="${esc(`${quand} · ${dateLongueCourte(date)}`)}">${photo(r, 480)}${texte}</a>
    ${date < E.journal_repas.aujourdhui && semainePourDate(E.journal_repas.aujourdhui) ? `<button type="button" class="histo-manger" data-action="mangerAujourdhui" data-plat="${x.id}" data-moment="${esc(place)}">Manger aujourd'hui</button>` : ""}</div>`;
}
// « Manger aujourd'hui » sur un plat de l'historique (Taha, 21/11/2026) : au même repas aujourd'hui s'il n'est pas
// encore mangé (le plat prévu est remplacé), sinon en plus ; l'aperçu montre ce que ça change avant d'enregistrer.
function mangerAujourdhui(id, moment) {
  const ici = semainePourDate(E.journal_repas.aujourdhui), r = recette(id);
  if (!ici || !r) return dire("Pas de menu aujourd'hui.");
  const jp = ici.s.jours[ici.n], place = ["pdj", "dej", "din"].includes(moment) ? moment : null;
  const libre = place && !(place === "dej" && jp.dej_reste) && (jp[place] === "rien" || !fait(ici.s, ici.n, jp[place]));
  if (libre && jp[place] === id) return dire(`« ${r.nom} » est déjà au menu aujourd'hui.`);
  const op = libre ? { type: "changer", jour: ici.n, moment: place, plat: id } : { type: "ajouter", jour: ici.n, plat: id, ...(place ? { moment: place } : {}) };
  apercuChangement(ici.k, op, libre && jp[place] !== "rien" ? `Aujourd'hui, « ${r.nom} » à la place de « ${recette(jp[place]).nom} » ?` : `Ajouter « ${r.nom} » aujourd'hui ?`);
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
      <summary><span><b>${esc(new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(j.date + "T12:00")).replace(/^./, c => c.toUpperCase()))}</b>
        <small>${[j.repas && j.repas.length ? `${j.repas.length} plat${j.repas.length > 1 ? "s" : ""} prévu${j.repas.length > 1 ? "s" : ""}` : "", j.entrees.length ? `${j.entrees.length} noté${j.entrees.length > 1 ? "s" : ""} en plus` : ""].filter(Boolean).join(" · ")}</small>
        ${E.eau ? `<small class="histo-eau${eauCochee(j.date) ? " coche" : ""}">${icone("goutte")}${virgule((E.eau.bu || {})[j.date] || 0)} L${eauCochee(j.date) ? ` ${icone("check")}` : " · pas coché"}</small>` : ""}</span>
        <span class="chiffres histo-chiffres"><span>${nombre(Math.round(j.kcal))} kcal <i class="mini-piste"><i style="width:${pct(j.kcal, o.kcal)}%"></i></i></span>
          <span>${nombre(Math.round(j.prot))} g <i class="mini-piste"><i style="width:${pct(j.prot, o.prot)}%"></i></i></span></span>${icone("caret-right")}</summary>
      ${(j.repas || []).length ? `<section class="grille-plats histo-plats" aria-label="Les plats de ce jour"><div class="exos">${j.repas.map(x => platDHistorique(x, j.date)).join("")}</div></section>` : ""}
      ${j.entrees.length ? `<div class="liste-notes" style="margin-top:8px">${j.entrees.map(ligneRepasNote).join("")}</div>` : ""}
      <p class="actions" style="margin-top:8px"><button class="bouton sobre" data-action="noterRepas" data-date="${j.date}">${icone("cooking-pot")}Ajouter un repas ce jour-là</button></p>
    </details>`).join("")}</div>` : `<p class="discret">Rien pour l'instant : les jours apparaissent ici dès que tu notes tes repas.</p>`}`;
}
async function photoReduite(fichier) {
  // L'iPhone donne des photos de plusieurs Mo : on les réduit (1600 px, JPEG) avant l'envoi.
  const url = await new Promise((ok, ko) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = ko; l.readAsDataURL(fichier); });
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
  const echelle = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * echelle); c.height = Math.round(img.naturalHeight * echelle);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}
function noterRepas({ date, entree = null, remplacer = null }) {
  // 1. décrire (texte, photo, chiffres) ; 2. vérifier ce que Claude a compris, corriger, enregistrer.
  // remplacer = { texte, place, k, operation(plat), titre(nom), retour(), main() } : le champ IA de « Remplacer un plat »
  // (Taha, 21/11/2026) ; l'IA calcule tout de suite, puis le plat créé passe par l'aperçu du changement.
  const d = $("dialogue"), heure = new Date().getHours();
  let moment = remplacer ? remplacer.place : entree ? entree.moment : heure < 11 ? "pdj" : heure < 15 ? "dej" : heure < 18 ? "col" : "din";
  let photoJointe = null, texte = remplacer ? remplacer.texte : "", photoPlat;      // photoPlat : la photo qui deviendra celle du plat
  // Un nouveau repas : plus de Matin / Midi / Soir à choisir, l'IA le dit d'après le plat (Taha, 21/11/2026).
  // Ils restent pour changer un repas déjà noté.
  const puces = () => !entree ? "" : `<div class="gouts" role="group" aria-label="Repas">${MOMENTS_REPAS.map(([m, nom]) => `<button type="button" data-moment="${m}" aria-pressed="${m === moment}">${nom}</button>`).join("")}</div>`;
  const brancherPuces = () => d.querySelectorAll("[data-moment]").forEach(b => b.addEventListener("click", () => {
    moment = b.dataset.moment; d.querySelectorAll("[data-moment]").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
  // Taper le nom d'un plat de ta base le retrouve (Taha, 19/11/2026) : sans accents, « oe » pour « œ »,
  // début de mot suffisant (« crep nut »), petits mots ignorés, pluriels comme singuliers.
  const sansAccent = x => String(x).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
  const PETITS = new Set(["de", "du", "des", "la", "le", "les", "et", "au", "aux", "un", "une", "avec", "en", "a", "d", "l"]);
  const motsDe = x => sansAccent(x).split(/[^a-z0-9]+/).filter(m => m && !PETITS.has(m)).map(m => m.length > 3 ? m.replace(/[sx]$/, "") : m);
  const tous = E.recettes.filter(r => (["plat", "petitdej", "collation"].includes(r.cat) || (r.cat === "fruit" && r.sec)) && !estRetire(r.id));
  const chercherPlats = t => {
    const mots = motsDe(t);
    if (!mots.length) return [];
    return tous.map(r => { const siens = motsDe(r.nom);
        const pris = mots.filter(m => siens.some(n => n.startsWith(m) || (m.length >= 4 && m.startsWith(n) && n.length >= 4))).length;
        return { r, score: pris / mots.length, exact: siens.join(" ") === mots.join(" ") }; })
      .filter(x => x.score >= (mots.length === 1 ? 1 : 0.6))
      .sort((a, b) => b.exact - a.exact || b.score - a.score || (b.r.perso ? 1 : 0) - (a.r.perso ? 1 : 0) || a.r.nom.length - b.r.nom.length);
  };
  const proposerPlats = () => {
    // Un plat de ta base (les tiens d'abord) s'ajoute au menu du jour, avec sa photo et ses réglages ;
    // le reste (un kebab, un ticket…) est calculé par Claude puis devient un plat du menu.
    const mots = motsDe(texte);
    const trouves = mots.length ? chercherPlats(texte).slice(0, 6).map(x => x.r) : tous.filter(r => r.perso).slice(0, 6);
    const zone = $("nrPlats");
    if (!zone) return;
    zone.innerHTML = trouves.length ? `<p class="petit discret" style="margin:2px 0 6px">${mots.length ? "Un de ces plats ?" : "Tes plats"}</p>
      <ul class="candidats">${trouves.map(r => `<li><button type="button" class="candidat" data-plat-connu="${r.id}">${photo(r, 160, "carre")}
        <span class="texte"><b>${esc(r.nom)}</b><span class="chiffres">${nombre(r.kcal)} kcal, ${nombre(r.prot)} g de protéines</span>
        <small class="discret ing-courts">${esc(ingredientsCourts(r))}</small></span>${icone("caret-right")}</button></li>`).join("")}</ul>` : "";
    zone.querySelectorAll("[data-plat-connu]").forEach(b => b.addEventListener("click", () => ajouterPlatConnu(recette(b.dataset.platConnu))));
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
  const saisie = () => {
    d.innerHTML = `<form class="feuille formulaire" novalidate>
      <h2 id="dialogueTitre">${date === E.journal_repas.aujourdhui ? "Ajouter" : esc(dateLongueCourte(date).replace(/^./, c => c.toUpperCase()))}</h2>
      ${puces()}
      <div class="champ champ-ia" style="margin-top:14px"><label for="nrTexte">Un plat, ou ce que tu as mangé, comme tu veux ${BADGE_IA}</label>
        <textarea id="nrTexte" rows="4" placeholder="Ex. : 2 œufs, 70 g de pain pita et mon café Tassimo. Ou : un kebab frites. Ou : shake, 30 g de protéines, 150 kcal">${esc(texte)}</textarea>
        <small>Claude, l'IA, trouve les aliments, les grammes et les macros. Tes plats se retrouvent dès que tu tapes leur nom.</small></div>
      <div id="nrPlats" class="nr-plats"></div>
      <div class="photo-ajout">
        <label class="bouton second" for="nrPhoto">${icone("image")}${photoJointe ? "Changer la photo" : "Ajouter une photo"}</label>
        <input id="nrPhoto" type="file" accept="image/*" hidden>
        ${photoJointe ? `<img src="${photoJointe}" alt="Photo jointe" class="apercu-photo"><button type="button" class="lien" id="nrSansPhoto">Retirer la photo</button>` : `<small class="discret">Ton assiette, une étiquette ou un ticket de caisse.</small>`}
      </div>
      <small id="eNr" class="erreur" role="alert" style="display:block;margin-top:10px;color:var(--critique)"></small>
      <p class="petit" style="margin-top:10px"><button type="button" class="lien" id="nrMain">Entrer les chiffres moi-même</button></p>
      <div class="actions pied"><button class="bouton second" type="button" value="non">Annuler</button>
        <button class="bouton bouton-ia" type="submit">${icone("sparkle")}Calculer avec l'IA</button></div></form>`;
    brancherPuces();
    d.querySelector("[value=non]").addEventListener("click", () => d.close("non"));
    $("nrTexte").addEventListener("input", ev => { texte = ev.target.value; proposerPlats(); });
    proposerPlats();
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
      const ok = d.querySelector("[type=submit]"), libelle = ok.innerHTML; ok.disabled = true; ok.innerHTML = `${icone("sparkle")}L'IA calcule…`;
      $("eNr").textContent = "";
      try {
        const r = await fetch("/api/repas/analyser", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texte, photo: photoJointe, date, ...(date === E.journal_repas.aujourdhui ? { heure } : {}) }) });
        const rep = await r.json();
        if (!r.ok) { $("eNr").textContent = rep.erreur || "Claude n'a pas pu calculer."; ok.disabled = false; ok.innerHTML = libelle; return; }
        moment = rep.proposition.moment || moment;
        verifier(rep.proposition, false, true);
      } catch (e) { $("eNr").textContent = "L'appli ne répond pas."; ok.disabled = false; ok.innerHTML = libelle; }
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
    const recalc = i => { if (i.pour100 && i.g) MAC.forEach(m => { i[m] = Math.round(i.pour100[m] * i.g) / 100; }); };
    const somme = m => items.reduce((t, i) => t + (Number(i[m]) || 0), 0);
    const rendreListe = () => {
      $("nrItems").innerHTML = items.map((i, k) => `<li class="item-note">
        <input type="text" class="nr-nom" data-k="${k}" value="${esc(i.nom)}" aria-label="Aliment">
        ${i.g != null || i.pour100 ? `<label class="nr-g"><input type="text" inputmode="decimal" data-k="${k}" data-champ="g" value="${i.g == null ? "" : virgule(i.g)}" aria-label="Grammes de ${esc(i.nom)}"><span>g</span></label>` : ""}
        <span class="nr-chiffres">${["kcal", "prot", "gluc", "lip"].map(m => `<label><input type="text" inputmode="decimal" data-k="${k}" data-champ="${m}" value="${virgule(Math.round(i[m] * 10) / 10)}" ${i.pour100 && i.g ? "readonly" : ""}><span>${{ kcal: "kcal", prot: "prot.", gluc: "gluc.", lip: "lip." }[m]}</span></label>`).join("")}</span>
        <small class="discret">${esc(i.source || "")}${i.url ? ` · <a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">étiquette</a>` : ""}</small>
        <button type="button" class="effacer" data-retirer="${k}" aria-label="Retirer ${esc(i.nom)}">${icone("x")}</button></li>`).join("");
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
      <div class="champ" style="margin-top:12px"><label for="nrNom">${remplacer && remplacer.creer ? "Nom du plat" : "Nom du repas"}</label><input id="nrNom" type="text" maxlength="80" value="${esc(p.nom || "")}"></div>
      <p class="petit discret nr-titre-macros">Les macros du plat</p>
      <div class="cp-chiffres nr-macros" id="nrTotal" aria-live="polite"></div>
      ${!aLaMain && E.claude !== false ? `<div class="champ champ-ia nr-repondre"><label for="nrCorrection">Répondre à Claude ${BADGE_IA}</label>
        <textarea id="nrCorrection" rows="2" placeholder="Ex. : ajoute 20 g de whey · enlève la banane · vise 600 kcal et 40 g de protéines"></textarea>
        <button type="button" class="bouton second bouton-ia" id="nrCorriger">${icone("sparkle")}Corriger avec l'IA</button></div>` : ""}
      <ul class="lignes items-note" id="nrItems"></ul>
      <p style="margin:6px 0 0"><button type="button" class="lien" id="nrAjout">+ Ajouter un aliment</button></p>
      ${semainePourDate(date) ? `<div class="photo-ajout nr-photo-plat">
        ${photoPlat ? `<img src="${photoPlat}" alt="Photo du plat" class="apercu-photo">` : ""}
        <label class="bouton second" for="nrPhotoPlat">${icone("image")}${photoPlat ? "Changer la photo du plat" : "Prendre une photo du plat"}</label>
        <input id="nrPhotoPlat" type="file" accept="image/*" hidden>
        ${photoPlat ? `<button type="button" class="lien" id="nrSansPhotoPlat">Retirer la photo</button>` : `<small class="discret">Facultatif : sans photo, l'appli en trouve une.</small>`}</div>` : ""}
      <small id="eNr" class="erreur" role="alert" style="display:block;margin-top:8px;color:var(--critique)"></small>
      ${entree && semainePourDate(date) ? `<p style="margin:10px 0 0"><button type="button" class="bouton second" id="nrAuMenu" style="width:100%">${icone("cooking-pot")}Mettre dans le menu du jour</button></p>` : ""}
      <div class="actions pied">${entree ? `<button class="bouton second" type="button" id="nrSuppr">Supprimer</button>` : `<button class="bouton second" type="button" id="nrRetour">Retour</button>`}
        <button class="bouton" type="submit">${remplacer ? (remplacer.creer ? "Créer le plat" : "Continuer") : !entree && semainePourDate(date) ? "Ajouter au menu" : "Enregistrer"}</button></div></form>`;
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
      const b = ev.currentTarget, libelle = b.innerHTML;
      b.disabled = true; b.innerHTML = `${icone("sparkle")}L'IA corrige…`; $("eNr").textContent = "";
      try {
        const r = await fetch("/api/repas/analyser", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texte, photo: photoJointe, moment, date, correction, precedent: items }) });
        const rep = await r.json();
        if (!r.ok) { $("eNr").textContent = rep.erreur || "Claude n'a pas pu corriger."; b.disabled = false; b.innerHTML = libelle; return; }
        verifier(rep.proposition, false, true);
      } catch (e) { $("eNr").textContent = "L'appli ne répond pas."; b.disabled = false; b.innerHTML = libelle; }
    });
    if ($("nrSuppr")) $("nrSuppr").addEventListener("click", async () => {
      if (await appel("/api/repas/oublier", { id: entree.id }) === true) { d.close("oui"); rendre(); dire("Repas supprimé."); } });
    // Un repas nouveau devient un plat du menu du jour, au repas choisi (Taha, 19/11/2026 : pas une rubrique à part) ;
    // sans menu ce jour-là, il est noté comme avant.
    const auMenu = async bouton => {
      bouton.disabled = true;
      const nom = $("nrNom").value.trim();
      if (remplacer) {                               // le plat est créé ; le menu change après l'aperçu
        const rep = await appel("/api/repas/au_menu", { date, moment: moment || "dej", nom, items, seulement_plat: true, ...(photoPlat ? { photo: photoPlat } : {}) });
        bouton.disabled = false;
        if (rep === true && remplacer.creer) { d.close("oui"); rendre(); return dire(`« ${(recette(E.au_menu && E.au_menu.plat) || { nom }).nom} » est dans tes plats.`); }
        if (rep === true && E.au_menu && E.au_menu.plat) return apercuChangement(remplacer.k, remplacer.operation(E.au_menu.plat),
          remplacer.titre((recette(E.au_menu.plat) || { nom }).nom), remplacer.retour);
        if (rep && rep.erreur) $("eNr").textContent = rep.erreur;
        return;
      }
      const rep = await appel("/api/repas/au_menu", { id: entree ? entree.id : "", date, moment, nom, items, ...(photoPlat ? { photo: photoPlat } : {}) });
      bouton.disabled = false;
      if (rep === true) { d.close("oui"); rendre(); dire(E.au_menu && E.au_menu.note ? "Repas noté." : `Ajouté au menu : « ${(recette(E.au_menu.plat) || { nom }).nom} ».`); }
      else if (rep && rep.erreur) $("eNr").textContent = rep.erreur;
    };
    if ($("nrAuMenu")) $("nrAuMenu").addEventListener("click", ev => auMenu(ev.currentTarget));
    d.querySelector("form").addEventListener("submit", async ev => {
      ev.preventDefault(); ev.stopPropagation();
      if (!entree) return auMenu(d.querySelector("[type=submit]"));
      const rep = await appel("/api/repas/noter", { id: entree.id, date, moment, nom: $("nrNom").value.trim(), items });
      if (rep === true) { d.close("oui"); rendre(); dire("Repas noté."); }
      else if (rep && rep.erreur) $("eNr").textContent = rep.erreur;
    });
    if (!d.open) d.showModal();
    d.scrollTop = 0;
  };
  if (entree) return verifier(entree);
  if (!remplacer) return saisie();
  // Depuis « Remplacer un plat » : l'IA calcule ce qui a été écrit, sans repasser par la saisie.
  // Sans compte Claude branché : les ingrédients à la main, comme « Mon propre plat ».
  if (E.claude === false && remplacer.main) return remplacer.main();
  d.innerHTML = `<div class="feuille"><h2 id="dialogueTitre">${icone("sparkle")} L'IA calcule…</h2>
    <p class="discret" role="status">« ${esc(texte)} » : Claude cherche les aliments, les grammes et les macros.</p>
    <p class="petit" style="margin-top:14px"><button type="button" class="lien" id="nrAnnulerIA">Annuler</button></p></div>`;
  let annule = false;
  $("nrAnnulerIA").addEventListener("click", () => { annule = true; remplacer.retour(); });
  (async () => {
    let rep, r;
    try {
      r = await fetch("/api/repas/analyser", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texte, moment, date }) });
      rep = await r.json();
    } catch (e) { if (!annule) { remplacer.retour(); dire("L'appli ne répond pas."); } return; }
    if (annule) return;
    if (!r.ok) { remplacer.retour(); dire(rep.erreur || "Claude n'a pas pu calculer."); return; }
    if (remplacer.creer) moment = rep.proposition.moment || moment;      // depuis le catalogue : l'IA dit le repas
    verifier(rep.proposition, false, true);
  })();
}

/* ------------------------------------------------------------ mon suivi */
// Les mesures « _avant » se prennent quand on veut ; « _apres », juste après une séance, en option (Taha, 19/11/2026).
const MESURES = [["poids", "Poids", "kg"], ["biceps_avant", "Biceps", "cm"], ["tour_avant", "Hanches", "cm"], ["torse_avant", "Torse", "cm"],
                 ["biceps_apres", "Biceps après la séance", "cm"], ["tour_apres", "Hanches après la séance", "cm"], ["torse_apres", "Torse après la séance", "cm"]];
const virgule = v => v == null ? "" : String(v).replace(".", ",");
const isoDuJour = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dateCourte = iso => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso + "T12:00"));
function vueSuivi({ params }) {
  // Poids chaque jour, biceps et tour de hanches avant et après la séance. Sur iPhone : les chiffres d'abord,
  // une carte pour noter, une courbe à la fois, l'historique en bas (Taha, 19/11/2026).
  barre("");
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
    <div class="avec-unite"><input id="su_${cle}" name="${cle}" type="text" inputmode="decimal" autocomplete="off" value="${virgule(ce[cle])}" placeholder="${unite === "kg" ? "78,5" : "35"}"><span>${unite}</span></div></div>`;
  const cellule = (a, b) => a == null && b == null ? "—" : `${a == null ? "—" : virgule(a)} → ${b == null ? "—" : virgule(b)}`;
  const bic = derniere("biceps_avant") || derniere("biceps_apres"), tou = derniere("tour_avant") || derniere("tour_apres"), tor = derniere("torse_avant") || derniere("torse_apres");
  const aujourd = date === isoDuJour();
  return `<div class="m-tete"><div><h1 tabindex="-1">Mon suivi</h1>
      <p class="petit discret">${debut ? `Depuis le ${esc(dateLongueCourte(debut).replace(/^[a-zé]+ /i, ""))}${joursSuivi >= 0 ? `, jour ${joursSuivi + 1}` : ""} · ` : ""}${poids.length ? `Dernière pesée le ${esc(dateCourte(poids[0].date))}` : "Note ton poids chaque jour, à la même heure"}</p></div></div>
    <div class="suivi-chiffres">
      <div class="fait"><b>${poids.length ? virgule(poids[0].poids) : "—"}<small> kg</small></b><span>poids</span></div>
      <div class="fait"><b>${signe(ecart(7))}<small>${ecart(7) == null ? "" : " kg"}</small></b><span>en 7 jours</span></div>
      <div class="fait"><b>${signe(depuisDebut())}<small>${depuisDebut() == null ? "" : " kg"}</small></b><span>depuis le début</span></div>
    </div>
    ${bic || tou || tor ? `<p class="petit discret chiffres suivi-mesures">${[bic ? `Biceps ${virgule(bic.biceps_avant ?? bic.biceps_apres)} cm` : "", tou ? `Hanches ${virgule(tou.tour_avant ?? tou.tour_apres)} cm` : "",
      tor ? `Torse ${virgule(tor.torse_avant ?? tor.torse_apres)} cm` : ""].filter(Boolean).join(" · ")}</p>` : ""}
    <section class="bloc suivi-noter" aria-labelledby="tNoter">
      <div class="suivi-noter-tete"><h2 id="tNoter">${aujourd ? "Aujourd'hui" : esc(dateCourte(date))}</h2>
        <label class="date-discrete"><span class="sr">Jour</span><input id="su_date" name="date" type="date" value="${date}" max="${isoDuJour()}" form="formSuivi"></label></div>
      <form id="formSuivi" class="formulaire" novalidate>
        ${champ("poids", "Poids", "kg")}
        <div class="mesures mesures-3">${champ("biceps_avant", "Biceps", "cm")}${champ("tour_avant", "Hanches", "cm")}${champ("torse_avant", "Torse", "cm")}</div>
        <p class="petit discret" style="margin:-2px 0 10px">Quand tu veux, pas besoin de séance. Toujours au même endroit : le biceps contracté au plus large, les hanches, le torse sous les bras.</p>
        <details class="seance"${["biceps_apres", "tour_apres", "torse_apres"].some(k => ce[k] != null) ? " open" : ""}>
          <summary>Après la séance <small class="discret">(facultatif)</small>${icone("caret-right")}</summary>
          <div class="mesures mesures-3">${champ("biceps_apres", "Biceps", "cm")}${champ("tour_apres", "Hanches", "cm")}${champ("torse_apres", "Torse", "cm")}</div>
        </details>
        <small id="eSuivi" class="erreur" role="alert" style="display:block;margin:6px 0;color:var(--critique)"></small>
        <button class="bouton large" type="submit">${icone("check")}Enregistrer</button>
      </form>
    </section>
    <section class="bloc suivi-courbe" aria-labelledby="tCourbe">
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
      <label>Protéines (g)<input class="p-prot" type="text" inputmode="numeric" value="${v("prot")}"></label>
      <label>Glucides (g)<input class="p-glucides" type="text" inputmode="numeric" value="${v("glucides")}" placeholder="—"></label>
      <label>Lipides (g)<input class="p-lipides" type="text" inputmode="numeric" value="${v("lipides")}" placeholder="—"></label></div></div>`;
}
function blocObjectifs() {
  return `<section class="bloc" aria-labelledby="tPeriodes"><h2 id="tPeriodes">Mes objectifs</h2>
    <p class="doux petit sous-titre">${E.phases_perso ? "Tes périodes : l'appli prend celle du jour." : "Ton programme actuel, en périodes : change ce que tu veux, puis enregistre."} Les vitamines suivent tes calories.</p>
    <div id="periodes">${periodesActuelles().map(lignePeriode).join("")}</div>
    <p style="margin:8px 0 14px"><button type="button" class="lien" id="ajoutPeriode">+ Ajouter une période</button></p>
    <details class="claude-objectifs"><summary><span>Demander à Claude ${BADGE_IA}</span>${icone("caret-right")}</summary>
      <div class="champ champ-ia" style="margin-top:10px"><label for="oDemande">Ce que tu veux</label>
        <textarea id="oDemande" rows="2" placeholder="Ex. : perdre 4 kg d'ici mars, puis prendre du muscle jusqu'à l'été"></textarea></div>
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
    return;
  }
  if (t.dataset.retirerPeriode !== undefined) { t.closest(".periode").remove(); return; }
  if (t.id === "oProposer") {
    t.disabled = true; t.innerHTML = `${icone("sparkle")}L'IA réfléchit…`; $("ePeriodes").textContent = "";
    try {
      const r = await fetch("/api/objectifs/proposer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demande: $("oDemande").value }) });
      const rep = await r.json();
      if (!r.ok) $("ePeriodes").textContent = rep.erreur || "Claude n'a pas pu proposer.";
      else { $("periodes").innerHTML = rep.proposition.phases.map(lignePeriode).join(""); $("oExplication").textContent = rep.proposition.explication || "Vérifie, puis enregistre."; }
    } catch (e) { $("ePeriodes").textContent = "Pas de réponse."; }
    t.disabled = false; t.innerHTML = `${icone("sparkle")}Proposer des périodes`;
    return;
  }
  const phases = t.id === "oAutomatique" ? [] : [...document.querySelectorAll(".periode")].map(d => Object.fromEntries(
    ["nom", "du", "au", "kcal", "prot", "glucides", "lipides"].map(c => [c, d.querySelector(".p-" + c).value.trim()])));
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
  return `<a class="retour" href="#/profil">${icone("caret-left")}Profil</a>
  <div class="titre"><h1 tabindex="-1">Réglages</h1><p>Mode flemmard : l'écran Jour suit ta journée. Les autres modes arrivent bientôt.</p></div>
  <div class="reglages">
  <section class="bloc" aria-labelledby="tObj"><h2 id="tObj">Mon objectif</h2>
    <div class="faits"><div class="fait"><b>${nombre(kcal)}</b><span>kcal par jour</span></div><div class="fait"><b>${choisie.prot} g</b><span>de protéines par jour</span></div></div>
    <form class="formulaire" id="fObjectif" novalidate>
      ${(E.phases || []).length > 1 && !E.phases_perso ? champ("rPhase", "Phase du programme", choix("rPhase", "phase", r.phase || "", [["", "Automatique, selon la date"], ...E.phases.map(p => [p.n, `${p.n}. ${esc(p.nom)}, ${nombre(p.kcal)} kcal`])])) : ""}
      ${champ("rAdj", "Ajustement des calories", choix("rAdj", "ajustement", r.ajustement || 0, [-300, -150, 0, 150, 300].map(v => [v, `${v > 0 ? "+" : ""}${v} kcal`])), "Par paliers de 150 kcal, si ton poids s'écarte de ce que tu vises.")}
      ${champ("rDebut", "Début de mon suivi", saisie("rDebut", "date_debut", r.date_debut, "date", `max="${isoDuJour()}"`), "Le suivi compte ton poids et tes mesures à partir de ce jour.")}
      <small id="eObjectif" class="erreur" role="alert" style="display:block;color:var(--critique)"></small>
      <button class="bouton second" type="submit">Enregistrer</button>
    </form></section>
  ${blocObjectifs()}
  <section class="bloc" aria-labelledby="tRepas"><h2 id="tRepas">Mon alimentation</h2>
    <div class="options">
      <label class="option"><input type="checkbox" id="rFodmap"${fodmap ? " checked" : ""}><span><b>Pauvre en FODMAP</b><small>Seulement des plats pauvres en FODMAP dans les semaines composées.</small></span></label>
    </div>
  </section>
  <section class="bloc" aria-labelledby="tInfos"><h2 id="tInfos">Mes informations</h2>
    <p class="doux petit sous-titre">${E.profil.calcule ? "Change une valeur : tes calories, tes protéines et tes vitamines sont recalculées." : "Ton programme vient de ton fichier de profil : ces informations ne changent pas tes besoins."}</p>
    <form class="formulaire" id="fMesInfos" novalidate>
      <div class="champs2">${champ("iPrenom", "Prénom", saisie("iPrenom", "prenom", i.nom || E.profil.nom, "text", 'maxlength="40" autocomplete="given-name"'))}
        ${champ("iNom", "Nom", saisie("iNom", "nom_famille", i.nom_famille, "text", 'maxlength="60" autocomplete="family-name"'))}</div>
      <div class="champs2">${champ("iNaissance", "Date de naissance", saisie("iNaissance", "date_naissance", i.date_naissance, "date"))}
        ${champ("iSexe", "Sexe", choix("iSexe", "sexe", i.sexe || "homme", [["femme", "Femme"], ["homme", "Homme"]]))}</div>
      ${champ("iTel", "Téléphone", saisie("iTel", "telephone", i.telephone, "tel", 'inputmode="tel" maxlength="20" autocomplete="tel"'))}
      <div class="champs2">${champ("iTaille", "Taille, en cm", saisie("iTaille", "taille_cm", i.taille_cm, "text", 'inputmode="numeric"'))}
        ${champ("iPoids", "Poids, en kg", saisie("iPoids", "poids_kg", virgule(i.poids_kg), "text", 'inputmode="decimal"'))}</div>
      ${E.profil.calcule ? `<div class="champs2">${champ("iActivite", "Activité", choix("iActivite", "activite", i.activite, [["sedentaire", "Sédentaire"], ["leger", "Sport léger, 1 à 3 fois par semaine"], ["modere", "Sport modéré, 3 à 5 fois par semaine"], ["actif", "Sport intense, 6 à 7 fois par semaine"], ["intense", "Sport très intense ou métier physique"]]))}
        ${champ("iObjectif", "Objectif", choix("iObjectif", "objectif", obj, [["perte", "Perdre du poids"], ["maintien", "Garder mon poids"], ["prise", "Prendre du muscle"]]))}</div>` : ""}
      <p class="petit discret">Identifiant de connexion : <b>${esc(E.profil.id)}</b> (il ne change pas).</p>
      <small id="eMesInfos" class="erreur" role="alert" style="display:block;color:var(--critique)"></small>
      <button class="bouton second" type="submit">Enregistrer mes informations</button>
    </form></section>
  ${typeof blocClaude === "function" ? blocClaude() : ""}
  <section class="bloc" aria-labelledby="tCompte"><h2 id="tCompte">Mon compte</h2>
    <form class="formulaire" id="fMdp" novalidate>
      <input type="text" name="username" autocomplete="username" value="${esc(E.profil.id)}" hidden>
      ${E.utilisateur.admin ? "" : `<div class="champ"><label for="mAncien">Mot de passe actuel</label>
        <input id="mAncien" name="ancien" type="password" autocomplete="current-password" required></div>`}
      <div class="champ"><label for="mNouveau">Nouveau mot de passe</label>
        <input id="mNouveau" name="nouveau" type="password" autocomplete="new-password" minlength="8" required aria-describedby="eMdpN">
        <small id="eMdpN">8 caractères au moins.</small></div>
      <button class="bouton second" type="submit">Changer le mot de passe</button></form>
    <p style="margin-top:16px"><button class="bouton sobre" data-action="deconnexion">${icone("sign-out")}Se déconnecter</button></p>
  </section>
  </div>`;
}
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
  return `<div class="titre"><h1 tabindex="-1">Page introuvable</h1></div>${vide("Ce plat n'existe pas", "Il a peut-être été retiré.", "#/semaine", "Retour à la semaine")}`;
}
function vuePanne() {
  rendreNavigation("");
  barre("");
  $("contenu").innerHTML = `<div class="vide"><h1 tabindex="-1" style="margin-bottom:8px">L'appli ne répond pas</h1>
    <p>Vérifie ta connexion à internet, puis réessaie.</p>
    <button class="bouton" data-action="reessayer">Réessayer</button></div>`;
}
function vueConnexion(erreur = "") {
  clearTimeout(minuteur);
  rendreNavigation("");
  barre("");
  $("contenu").innerHTML = `<div class="titre" style="margin-top:24px"><h1 tabindex="-1">Connexion</h1><p>Chaque personne a son identifiant et ne voit que son profil.</p></div>
    <form class="formulaire" id="fConnexion" novalidate>
      <div class="champ"><label for="ident">Identifiant</label>
        <input id="ident" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="champ"><label for="mdp">Mot de passe</label>
        <input id="mdp" name="password" type="password" autocomplete="current-password" spellcheck="false" required aria-describedby="eMdp">
        <small id="eMdp" class="erreur" role="alert">${esc(erreur)}</small></div>
      <button class="bouton large" type="submit">Entrer</button>
    </form>
    <p style="margin-top:22px"><button class="bouton sobre" data-action="versCreation">Créer mon profil</button></p>`;
}

/* ------------------------------------------------------------ rendu */
const VUES = { semaine: vueSemaine, plat: vuePlat, courses: vueCourses, cuisine: a => a.arg ? vueRecette(a) : vueCuisine(a),
               plus: vuePlus, avancement: vueAvancement, budget: vueBudget, vitamines: vueVitamines, profil: vueProfil, profils: vueProfils,
               nouveau: vueNouveau, stock: vueStock, catalogue: vueCatalogue, journal: vueJournal, reglages: vueReglages, suivi: vueSuivi,
               historique: vueHistorique };
let derniereAdresse = "", adressePrecedente = "";

function rendre() {
  if (!E) return;
  const r = route();
  const changement = location.hash !== derniereAdresse;
  rendreNavigation(ongletDe(r.vue));
  apresRendu = [];
  const NOMS = { semaine: "", plat: "Plat", courses: "Courses", cuisine: "Cuisine", plus: "Plus", catalogue: "Catalogue", avancement: "Avancement",
                 budget: "Budget", vitamines: "Vitamines", stock: "Stock", journal: "Journal de l'appli", profil: "Mon profil", profils: "Profils",
                 nouveau: "Nouveau profil", reglages: "Réglages", suivi: "Mon suivi", historique: "Historique" };
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
    if (!((r.vue === "semaine" || (r.vue === "cuisine" && !r.arg)) && r.params.has("jour"))) window.scrollTo(0, 0);
    if (titre && matchMedia("(pointer: fine)").matches) titre.focus({ preventScroll: true });
  }
  const suivi = $("suivi");
  if (suivi) suivi.scrollTop = suivi.scrollHeight;
  clearTimeout(minuteur);
  if (E.tache.etat === "en cours") minuteur = setTimeout(async () => { if (await appel("/api/etat") === true) rendre(); }, 3000);
}

/* ------------------------------------------------------------ actions */
const ACTIONS = {
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
    if (await confirmer({ titre: "C'est cuisiné ?", oui: "Oui, c'est cuisiné", non: "Pas encore",
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
    else { [F.cats, F.regimes, F.atouts, F.proteines, F.origines].forEach(e => e.clear()); F.avis = ""; F.prix = 0; F.temps = 0; F.stock = false; }
    rendre();
  },
  gout: b => agir("/api/gout", { plat: b.dataset.plat, gout: b.getAttribute("aria-pressed") === "true" ? "" : b.dataset.gout },
    b.getAttribute("aria-pressed") === "true" ? "Avis retiré." : b.dataset.gout === "tester" ? "Noté : tu veux bien le tester." : "Noté : tu n'aimes pas."),
  async journalSuite() {
    try {
      const r = await fetch(`/api/journal?debut=${E.journal.length + journalPlus.length}`);
      const d = await r.json();
      journalPlus = journalPlus.concat(d.entrees); journalSuite = d.suite;
      rendre();
    } catch (e) { dire("L'appli ne répond pas."); }
  },
  ingredient: b => demanderIngredient({ nom: b.dataset.nom }),
  mangerAujourdhui: b => mangerAujourdhui(b.dataset.plat, b.dataset.moment),
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
};

PETIT.addEventListener("change", () => rendre());
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
  const plat = ev.target.closest('a.repas[href^="#/plat/"], a.rp-plat[href^="#/plat/"]');
  if (plat && PETIT.matches && !ev.target.closest("#dialogue, .carte-fond")) {
    ev.preventDefault();
    const d = plat.dataset;
    const vu = d.kcal != null ? { kcal: +d.kcal, prot: +d.prot, gluc: +d.gluc, lip: +d.lip, quand: d.quand, date: d.date, moment: d.momentVu } : null;    // historique
    return ficheRapide(decodeURIComponent(plat.getAttribute("href").slice(7)),
      d.jour != null ? { k: Number(d.semaine), n: Number(d.jour), moment: d.moment } : null, plat.closest(".exo") || plat, vu);
  }
  const b = ev.target.closest("[data-action]");
  if (b && !b.disabled && ACTIONS[b.dataset.action]) ACTIONS[b.dataset.action](b);
});
document.addEventListener("submit", async ev => {
  ev.preventDefault();
  const bouton = ev.target.querySelector("[type=submit]");
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
    for (const cle of ["boucher", "fodmap"]) corps[cle] = f.has(cle);
    corps.identifiant = String(corps.identifiant || "").trim().toLowerCase();
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
    if (nouveau.length < 8) { $("eMdpN").textContent = "8 caractères au moins."; return $("mNouveau").focus(); }
    if (await agir("/api/mot_de_passe", { ancien: $("mAncien") ? $("mAncien").value : "", nouveau }, "Mot de passe changé.")) ev.target.reset();
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
  if (i.id === "triCat") { filtresCat.tri = i.value; rendre(); return; }
  if (i.dataset.coche) {
    const [liste, ...reste] = i.dataset.coche.split("|"), nom = reste.join("|");
    if (liste === "secs") { cocher(i.dataset.coche, i.checked); return; }          // fruits secs : simple pense-bete, garde sur l'appareil
    const cible = liste === "marche" || (liste === "boucher" && E.rythme === "mois") ? "marche" : "panier";
    agir("/api/courses/cocher", { liste: cible, nom, coche: i.checked }, i.checked ? `« ${nom} » : tu en as déjà, l'appli ne l'achète pas.` : `« ${nom} » revient dans la liste.`);
    return;
  }
  if (i.matches(".stock-ligne input"))
    agir("/api/stock", { nom: i.dataset.nom, unite: i.dataset.unite, quantite: Math.max(0, Number(i.value) || 0) }, "Stock corrigé.");
});
document.addEventListener("input", ev => {
  if (ev.target.id !== "filtre") return;
  if (route().vue === "catalogue") filtreCatalogue = ev.target.value;
  else filtreStock = ev.target.value;
  const position = ev.target.selectionStart;
  rendre();
  const champ = $("filtre");
  champ.focus();
  champ.setSelectionRange(position, position);
});
window.addEventListener("hashchange", rendre);

async function demarrer() {
  if (await appel("/api/etat") === true) rendre();
}
demarrer();

// Hors ligne : seulement en HTTPS ou sur le PC lui-meme (le navigateur l'exige).
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
