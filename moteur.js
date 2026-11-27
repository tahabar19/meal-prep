// Mon Meal Prep — le moteur : le serveur Python du PC, lancé dans ce Worker avec Pyodide (voir py/web.py).
// Messages reçus : init, requete, apres, jeton. Chaque réponse dit aussi quels fichiers du profil ont changé,
// pour que la page les renvoie à Supabase.
importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js");

let py = null, web = null, cfg = null, dossier = "";

// Claude, étiquettes et photos : un appel SYNCHRONE à la fonction Supabase « claude » (permis dans un Worker).
// Le Python l'appelle comme une fonction ordinaire (web._pont).
self.pont_sync = (action, corpsJson) => {
  const corps = JSON.parse(corpsJson);
  // Open Food Facts refuse les serveurs (Supabase) mais répond aux navigateurs, et permet l'appel direct (CORS).
  if (action === "web" && !corps.binaire && /^https:\/\/[a-z.]*openfoodfacts\.org\//.test(corps.url || "")) {
    const d = new XMLHttpRequest();
    d.open("GET", corps.url, false);
    try { d.send(); } catch (e) { return JSON.stringify({ erreur: "Open Food Facts ne répond pas." }); }
    return JSON.stringify({ status: d.status, texte: d.responseText });
  }
  // Une photo du catalogue (fichier de l'appli) : la photo de secours d'un de tes plats.
  if (action === "local") {
    if (!/^photos\/[\w%.-]+-(160|480|960)\.jpg$/.test(corps.chemin || "")) return JSON.stringify({ erreur: "Chemin refusé." });
    const d = new XMLHttpRequest();
    d.open("GET", corps.chemin, false);
    d.responseType = "arraybuffer";
    try { d.send(); } catch (e) { return JSON.stringify({ erreur: "Photo introuvable." }); }
    if (d.status !== 200) return JSON.stringify({ erreur: `Photo introuvable (${d.status}).` });
    const o = new Uint8Array(d.response);
    let s = "";
    for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000));
    return JSON.stringify({ base64: btoa(s) });
  }
  return versFonction(action, corps);
};

// Une coupure ne perd plus le calcul (Taha, 28/11/2026 : « Pas de réseau » à chaque fois). Sur iPhone, la connexion
// tombe dès que l'appli passe en arrière-plan ou que l'écran se verrouille pendant que l'IA calcule. La même demande
// repart (même numéro, jusqu'à 4 essais) : la fonction rend la réponse qu'elle a gardée, sans refaire l'appel.
const pause = (ms) => { const fin = Date.now() + ms; while (Date.now() < fin) {} };     // un Worker ne peut pas dormir autrement
const numero = () => (self.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 14));
const noter = (titre, details) => self.postMessage({ type: "journal", journal: { type: "erreur", titre, details } });
function versFonction(action, corps) {
  const demande = numero(), t0 = Date.now(), coupures = [];
  for (let essai = 1; essai <= 4; essai++) {
    const x = new XMLHttpRequest();
    x.open("POST", cfg.url + "/functions/v1/claude", false);
    try { x.timeout = 150000; } catch (e) {}           // sinon Safari abandonne parfois au bout de 60 s
    x.setRequestHeader("Content-Type", "application/json");
    x.setRequestHeader("apikey", cfg.anon);
    x.setRequestHeader("Authorization", "Bearer " + cfg.jeton);
    const debut = Date.now();
    let panne = "";
    try { x.send(JSON.stringify({ action, demande, ...corps })); }
    catch (e) { panne = `${(e && e.name) || "coupure"} après ${Math.round((Date.now() - debut) / 1000)} s`; }
    if (!panne && (x.status === 0 || (x.status >= 500 && !/"erreur"/.test(x.responseText || "")))) panne = `réponse ${x.status}`;
    if (!panne && x.status === 409 && /"encore"/.test(x.responseText || "")) panne = "calcul encore en cours";
    if (!panne) {
      if (coupures.length) noter("Appel à l'IA repris après une coupure", [`${action} : ${coupures.join(" ; ")}`, `réponse au bout de ${Math.round((Date.now() - t0) / 1000)} s`]);
      return x.responseText || JSON.stringify({ erreur: `Réponse vide (${x.status})` });
    }
    coupures.push(panne);
    if (essai < 4) pause(essai * 1500);
  }
  noter("Appel à l'IA coupé", [`${action} : ${coupures.join(" ; ")}`, `abandon au bout de ${Math.round((Date.now() - t0) / 1000)} s`]);
  return JSON.stringify({ erreur: "La connexion a coupé pendant le calcul. Garde l'appli ouverte et réessaie." });
}

const ecrire = (chemin, donnees, date) => {
  py.FS.mkdirTree(chemin.slice(0, chemin.lastIndexOf("/")));
  py.FS.writeFile(chemin, donnees);
  if (date) py.FS.utime(chemin, date, date);
};

const temps = {};
const marque = (nom, t0) => { temps[nom] = Math.round(performance.now() - t0); };
let prechauffage = null, pillow = null;

// Dès l'ouverture de la page, avant même la connexion : Pyodide, le moteur et le catalogue.
function prechauffer(version) {
  if (prechauffage) return prechauffage;
  prechauffage = (async () => {
    let t0 = performance.now();
    py = await loadPyodide();
    marque("pyodide", t0); t0 = performance.now();
    const [, code, cat] = await Promise.all([
      py.loadPackage(["pyyaml"]),
      fetch("py.json?v=" + version).then((r) => r.json()),
      fetch("catalogue.json?v=" + version).then((r) => r.json()),
    ]);
    marque("paquets+fichiers", t0); t0 = performance.now();
    for (const [nom, texte] of Object.entries(code)) ecrire("/py/" + nom, texte);
    ecrire("/py/repas/site/recettes.json", cat["recettes.json"]);
    ecrire("/py/repas/site/nutriments.json", cat["nutriments.json"]);
    ecrire("/mp/repas.json", cat["repas.json"]);
    ecrire("/mp/ponderation.yaml", cat["ponderation.yaml"]);
    const vide = new Uint8Array(0), date = Date.parse("2026-11-19T12:00:00Z");
    for (const d of cat.photos) ecrire(`/mp/${d}/photo.jpg`, vide, date);   // le moteur voit qu'elles existent
    py.FS.mkdirTree("/commun");
    py.runPython('import sys\nsys.path.insert(0, "/py")\nimport web\nweb.preparer()');
    web = py.pyimport("web");
    marque("import", t0);
  })();
  return prechauffage;
}

// Pillow (photos) : seulement pour ce qui touche aux photos, chargé en fond après le démarrage.
const avecPillow = () => (pillow = pillow || py.loadPackage(["pillow"]));
const AVEC_PHOTOS = ["/api/repas/au_menu", "/api/plat_perso", "/api/repas/analyser", "/api/plat/photo"];

async function init(m) {
  cfg = { url: m.url, anon: m.anon, jeton: m.jeton };
  await prechauffer(m.version);
  const t0 = performance.now();
  dossier = `/mp/profils/${m.identifiant}`;
  py.FS.mkdirTree(dossier);
  const vide = new Uint8Array(0);
  for (const f of m.fichiers) ecrire(`${dossier}/${f.nom}`, f.contenu);
  for (const p of m.photos) ecrire(`${dossier}/${p.nom}`, vide, p.maj);     // les photos de ses plats sont dans Supabase
  web.demarrer(m.identifiant, py.toPy(m.reglages || {}));
  marque("profil", t0);
  setTimeout(avecPillow, 3000);
}

function changements(avant) {
  const ch = JSON.parse(web.changements(avant));
  for (const l of JSON.parse(web.journaux())) ch.push({ journal: l });
  const transferts = [];
  for (const c of ch) if (c.photo) { c.octets = py.FS.readFile(`${dossier}/${c.nom}`); transferts.push(c.octets.buffer); }
  return [ch, transferts];
}

const file = [];
let occupe = false;
async function suite() {
  if (occupe || !file.length) return;
  occupe = true;
  const m = file.shift();
  try {
    if (m.type === "prechauffer") await prechauffer(m.version);
    else if (m.type === "valider") { await prechauffer(m.version); postMessage({ id: m.id, message: web.valider_profil(JSON.stringify(m.champs)) }); }
    else if (m.type === "init") { await init(m); postMessage({ id: m.id, ok: true, temps }); }
    else if (m.type === "jeton") cfg.jeton = m.jeton;
    else if (m.type === "reglages") web.regler(JSON.stringify(m.reglages));      // compte Claude branché ou non
    else if (m.type === "fichiers") {            // le stock commun de la famille, changé par un autre membre
      for (const f of m.fichiers) ecrire(`${dossier}/${f.nom}`, f.contenu);
      postMessage({ id: m.id, ok: true });
    }
    else if (m.type === "requete") {
      if (AVEC_PHOTOS.some((c) => m.chemin.startsWith(c))) await avecPillow();
      const avant = web.instantane_json();
      const t0 = performance.now();
      const r = JSON.parse(web.traiter(m.methode, m.chemin, m.corps || ""));
      r.ms = Math.round(performance.now() - t0);
      r.compose = web.compose_recente();
      const [ch, t] = changements(avant);
      postMessage({ id: m.id, r, ch }, t);
    } else if (m.type === "apres") {
      await avecPillow();
      const avant = web.instantane_json();
      const reste = web.apres();
      const [ch, t] = changements(avant);
      postMessage({ id: m.id, reste, ch }, t);
    }
  } catch (e) {
    postMessage({ id: m.id, erreur: String(e && e.message || e) });
  }
  occupe = false;
  suite();
}
onmessage = (e) => { file.push(e.data); suite(); };
