// Mon Meal Prep en ligne — entre la page (app.js, la même que sur le PC) et le moteur (moteur.js, le serveur
// Python dans un Worker). La page croit parler au serveur : ses fetch("/api/…") arrivent ici.
// Comptes : Supabase Auth (identifiant → identifiant@meal-prep.invalid). Fichiers du profil : table « fichiers ».
// Photos de ses plats : stockage « photos/<id de la personne>/ ». Claude : fonction « claude », avec SA clé.
const sb = supabase.createClient(MP.url, MP.anon, { auth: { persistSession: true, autoRefreshToken: true } });
const VERSION = "2026-11-23-092859";                 // change à chaque construction (moteur et catalogue)
const M = { worker: null, pret: null, prete: false, n: 0, attente: new Map(), uid: null, ident: null, claude: null, file: Promise.resolve(),
            versionRecettes: null };
const reponse = (status, corps) => new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });
// Les comptes passent par la fonction « compte » (Taha, 22/11/2026) : inscription avec email, téléphone et mot de passe
// solide ; connexion par identifiant ou email, bloquée après trop d'essais ; mot de passe oublié par email.
async function compte(action, corps = {}) {
  const { data, error } = await sb.functions.invoke("compte", { body: { action, ...corps } });
  let erreur = data && data.erreur;
  if (error && !erreur) { try { erreur = (await error.context.json()).erreur; } catch { erreur = "Le serveur ne répond pas, réessaie."; } }
  return erreur ? { erreur } : data;
}

const PHOTOS_V = "202611230002";                                // change quand les photos du catalogue changent (construire.py)
function urlPhoto(r, largeur) {
  const id = String(r.photo_de || r.id);              // une copie « Banane (2) » a la photo de l'original
  // un plat reçu de la famille : sa photo est rangée chez le membre qui l'a créé (photo_uid)
  if (id.startsWith("perso-")) return `${MP.url}/storage/v1/object/public/photos/${r.photo_uid || M.uid}/${encodeURIComponent(id)}.jpg?v=${r.photo}`;
  const l = [160, 480, 960].reduce((a, b) => (Math.abs(b - largeur) < Math.abs(a - largeur) ? b : a));
  return `photos/${encodeURIComponent(id)}-${l}.jpg?v=${PHOTOS_V}`;      // la version : de nouvelles photos se rechargent
}

function envoyer(message, transferts = []) {
  return new Promise((ok, ko) => {
    const id = ++M.n;
    M.attente.set(id, { ok, ko });
    M.worker.postMessage({ ...message, id }, transferts);
  });
}

// Le Worker part dès l'ouverture de la page : Pyodide et le moteur se chargent pendant qu'on se connecte.
function nouveauMoteur() {
  M.worker = new Worker("moteur.js");
  M.worker.onmessage = (e) => {
    const a = M.attente.get(e.data.id);
    if (!a) return;
    M.attente.delete(e.data.id);
    e.data.erreur ? a.ko(new Error(e.data.erreur)) : a.ok(e.data);
  };
  M.worker.onerror = (e) => { for (const a of M.attente.values()) a.ko(new Error(e.message)); M.attente.clear(); };
  M.worker.postMessage({ type: "prechauffer", version: VERSION });
}
nouveauMoteur();

// La dernière journée connue, gardée sur ce téléphone : l'appli s'affiche tout de suite, puis se met à jour.
const CACHE = "mon-meal-prep-etat";
async function garder(cle, texte) { try { await (await caches.open(CACHE)).put(new Request(`./cache/${cle}`), new Response(texte)); } catch {} }
async function relire(cle) { try { const r = await (await caches.open(CACHE)).match(`./cache/${cle}`); return r ? await r.text() : null; } catch { return null; } }
async function oublier() { try { await caches.delete(CACHE); } catch {} }

async function demarrerMoteur(session) {
  const montrer = setTimeout(() => { const d = document.getElementById("demarrage"); if (d) d.hidden = false; }, 1500);
  const t0 = performance.now();
  M.uid = session.user.id;
  const { data: p, error } = await sb.from("profils").select("identifiant").eq("id", M.uid).single();
  if (error || !p) throw new Error("Ce compte n'a pas encore de profil.");
  M.ident = p.identifiant;
  const [{ data: fichiersPropres }, { data: objets }, { data: infos }, { data: fam }] = await Promise.all([
    sb.from("fichiers").select("nom, contenu").limit(5000),
    sb.storage.from("photos").list(M.uid, { limit: 1000 }),
    sb.functions.invoke("claude", { body: { action: "infos" } }).catch(() => ({ data: null })),
    sb.rpc("famille_etat").then((r) => r, () => ({ data: null })),
  ]);
  // Mode famille : le stock commun remplace le sien (le sien reste de côté, il revient si l'on quitte la famille).
  M.familleEtat = fam || null;
  M.famille = fam && fam.statut === "membre" ? fam : null;
  M.familleMaj = {};
  let fichiers = fichiersPropres || [];
  if (M.famille) {
    const { data: communs } = await sb.from("fichiers_famille").select("nom, contenu, maj").eq("famille_id", M.famille.famille.id);
    for (const f of communs || []) M.familleMaj[f.nom] = f.maj;
    fichiers = fichiers.filter((f) => !PARTAGES.includes(f.nom)).concat((communs || []).map(({ nom, contenu }) => ({ nom, contenu })));
    try { M.familleDerniere = JSON.parse((fichiers.find((f) => f.nom === "famille.json") || {}).contenu || "{}").derniere || 0; } catch { M.familleDerniere = 0; }
  }
  M.claude = infos && infos.propre ? infos.propre : infos && infos.partage ? { partage: true, modele: infos.modele } : null;
  M.temps = { supabase: Math.round(performance.now() - t0) };
  const ri = await envoyer({
    type: "init", version: VERSION, url: MP.url, anon: MP.anon, jeton: session.access_token, identifiant: M.ident,
    reglages: { "repas.plat_perso_ia": !!M.claude,       // sans compte Claude : rien d'automatique, tout à la main
                "repas.famille": M.famille ? (M.famille.famille.createur ? "createur" : "membre") : "" },
    fichiers: fichiers || [],
    photos: (objets || []).filter((o) => o.name.endsWith(".jpg")).map((o) => ({ nom: "photos/" + o.name, maj: Date.parse(o.updated_at || o.created_at) || 0 })),
  });
  Object.assign(M.temps, ri.temps, { total: Math.round(performance.now() - t0) });
  clearTimeout(montrer);
  const d = document.getElementById("demarrage"); if (d) d.hidden = true;
}

function arreterMoteur() {
  if (M.worker) M.worker.terminate();
  M.pret = null; M.prete = false; M.uid = null; M.ident = null; M.claude = null; M.famille = null; M.familleEtat = null;
  nouveauMoteur();
}

// Entrer dans une famille ou en sortir : le moteur repart avec le bon stock et le bon rôle (Taha, 23/11/2026).
async function relancerMoteur() {
  arreterMoteur();
  await moteurPret();
  if (typeof demarrer === "function") await demarrer();
}
// Au retour sur l'appli : le menu et le stock de la famille ont peut-être changé ; une demande a peut-être été acceptée.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !M.prete) return;
  try {
    if (M.familleEtat && M.familleEtat.statut === "attente") {
      const { data } = await sb.rpc("famille_etat");
      if (data && data.statut === "membre") return relancerMoteur();
      M.familleEtat = data;
    } else if (M.famille && Date.now() - M.familleVue > 20000 && typeof demarrer === "function") demarrer();
  } catch (e) { console.warn("famille", e); }
});

async function moteurPret() {
  if (M.pret) return M.pret;
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  M.pret = demarrerMoteur(data.session).then(() => (M.prete = true), (e) => { M.pret = null; throw e; });
  return M.pret;
}

sb.auth.onAuthStateChange((ev, session) => {
  if (session && M.worker) M.worker.postMessage({ type: "jeton", jeton: session.access_token });
  if (ev === "PASSWORD_RECOVERY") setTimeout(nouveauMotDePasse, 300);
});

// L'appli Android (Capacitor, qui ouvre ce site) : le bouton retour ferme d'abord la fenêtre ou la carte ouverte,
// puis revient d'une page, et quitte l'appli depuis l'écran Jour (Taha, 22/11/2026).
const ANDROID = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
if (ANDROID) ANDROID.addListener("backButton", ({ canGoBack }) => {
  const d = document.getElementById("dialogue");
  if (d && d.open) return d.close("non");
  if (document.querySelector(".carte-fond") && typeof fermerCarte === "function") return fermerCarte();
  if (canGoBack && location.hash && !/^#\/?(semaine)?$/.test(location.hash)) return history.back();
  ANDROID.exitApp();
});

// Le lien « mot de passe oublié » reçu par email ramène ici : choisir un nouveau mot de passe (Taha, 22/11/2026).
function nouveauMotDePasse() {
  const d = document.getElementById("dialogue");
  if (!d) return;
  history.replaceState(null, "", location.pathname + "#/semaine");
  d.innerHTML = `<form class="feuille formulaire" id="fNouveauMdp" novalidate>
    <h2 id="dialogueTitre">Nouveau mot de passe</h2>
    <div class="champ"><label for="nmMdp">Nouveau mot de passe</label><input id="nmMdp" type="password" autocomplete="new-password" required>
      <small>10 caractères au moins, avec une minuscule, une majuscule et un chiffre.</small></div>
    <small id="eNm" class="erreur" role="alert" style="display:block;color:var(--critique)"></small>
    <div class="actions pied"><button class="bouton" type="submit">Enregistrer</button></div></form>`;
  d.querySelector("form").addEventListener("submit", async (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const mdp = document.getElementById("nmMdp").value;
    if (mdp.length < 10 || !/[a-z]/.test(mdp) || !/[A-Z]/.test(mdp) || !/\d/.test(mdp)) {
      document.getElementById("eNm").textContent = "10 caractères au moins, avec une minuscule, une majuscule et un chiffre."; return; }
    const { error } = await sb.auth.updateUser({ password: mdp });
    if (error) { document.getElementById("eNm").textContent = /weak|pwned|leaked/i.test(error.message) ? "Mot de passe trop facile, choisis-en un autre." : "Changement impossible, redemande un lien."; return; }
    d.close("oui");
    if (typeof dire === "function") dire("Mot de passe changé.");
    if (typeof demarrer === "function") demarrer();
  });
  if (!d.open) d.showModal();
}

// Ce que le moteur a écrit ou effacé : renvoyé à Supabase avant de répondre à la page.
async function sauver(ch) {
  const lignes = (ch || []).filter((c) => c.journal).map((c) => ({ user_id: M.uid, ...c.journal }));
  if (lignes.length) sb.from("journal").insert(lignes).then(({ error }) => error && console.warn("journal", error.message));
  for (const c of ch || []) {
    if (c.journal) continue;
    if (c.photo) {
      const nom = `${M.uid}/${c.nom.replace(/^photos\//, "")}`;
      const { error } = await sb.storage.from("photos").upload(nom, new Blob([c.octets], { type: "image/jpeg" }), { upsert: true, contentType: "image/jpeg" });
      if (error) console.warn("photo non envoyée", c.nom, error.message);
    } else if (c.retire) {
      if (/\.(jpe?g|png)$/.test(c.nom)) await sb.storage.from("photos").remove([`${M.uid}/${c.nom.replace(/^photos\//, "")}`]);
      else await sb.from("fichiers").delete().eq("user_id", M.uid).eq("nom", c.nom);
    } else if (M.famille && PARTAGES.includes(c.nom)) {          // le stock commun de la famille
      const maj = new Date().toISOString();
      const { error } = await sb.from("fichiers_famille").upsert({ famille_id: M.famille.famille.id, nom: c.nom, contenu: c.texte, maj });
      if (error) throw new Error("Enregistrement du stock commun impossible : " + error.message);
      M.familleMaj[c.nom] = maj;
    } else {
      const { error } = await sb.from("fichiers").upsert({ user_id: M.uid, nom: c.nom, contenu: c.texte, maj: new Date().toISOString() });
      if (error) throw new Error("Enregistrement impossible : " + error.message);
    }
  }
}

// Les tâches laissées « en fond » par le moteur (chercher la photo d'un plat) : après la réponse.
let enFond = false;
async function taches() {
  if (enFond || !M.worker) return;
  enFond = true;
  try {
    let photo = false;
    for (let k = 0; k < 60; k++) {                    // photos, fiches à compléter : une tâche à la fois
      const r = await (M.file = M.file.then(() => envoyer({ type: "apres" })));
      await sauver(r.ch);
      photo = photo || (r.ch || []).some((c) => c.photo);
      if (!r.reste) break;
    }
    if (photo && typeof demarrer === "function") demarrer();       // la photo apparaît
  } catch (e) { console.warn("tâche en fond", e); }
  enFond = false;
}

// ---------- Mode famille (Taha, 23/11/2026) ----------
// Le stock commun est relu s'il a changé chez un autre membre ; les menus partagés par les autres sont appliqués
// chez soi (mêmes plats, ses quantités) ; un menu composé par le créateur, ou un plat changé « pour toute la
// famille », est partagé. Toujours dans la file du moteur, jamais en même temps qu'une requête.
const PARTAGES = ["stock.csv", "mouvements.csv"];
M.familleVue = 0;
async function syncFamille(force) {
  if (!M.famille || (!force && Date.now() - M.familleVue < 20000)) return;
  M.familleVue = Date.now();
  const fid = M.famille.famille.id;
  const { data: f } = await sb.from("fichiers_famille").select("nom, maj").eq("famille_id", fid);
  const neufs = (f || []).filter((x) => x.maj !== M.familleMaj[x.nom]).map((x) => x.nom);
  if (neufs.length) {
    const { data: c } = await sb.from("fichiers_famille").select("nom, contenu, maj").eq("famille_id", fid).in("nom", neufs);
    if (c && c.length) {
      await envoyer({ type: "fichiers", fichiers: c.map(({ nom, contenu }) => ({ nom, contenu })) });
      for (const x of c) M.familleMaj[x.nom] = x.maj;
    }
  }
  let q = sb.from("operations_famille").select("id, auteur, operation").eq("famille_id", fid);
  // Nouveau dans la famille : seulement le dernier menu partagé, pas tout l'historique.
  q = M.familleDerniere ? q.gt("id", M.familleDerniere).order("id").limit(30) : q.order("id", { ascending: false }).limit(1);
  const { data: ops } = await q;
  if (!ops || !ops.length) return;
  for (const o of ops.sort((a, b) => a.id - b.id)) {
    if (o.auteur !== M.uid) {
      const r = await envoyer({ type: "requete", methode: "POST", chemin: "/api/famille/appliquer",
        corps: JSON.stringify({ menu: o.operation, auteur: o.operation.auteur_ident || "" }) });
      await sauver(r.ch);
      if (r.r.status !== 200) console.warn("menu de la famille", r.r.corps);
    }
    M.familleDerniere = o.id;
  }
  await sb.from("fichiers").upsert({ user_id: M.uid, nom: "famille.json", contenu: JSON.stringify({ derniere: M.familleDerniere }), maj: new Date().toISOString() });
  M.familleChange = true;
}
async function partagerMenu(params) {
  if (!M.famille) return;
  const r = await envoyer({ type: "requete", methode: "GET", chemin: "/api/famille/menu?" + new URLSearchParams(params).toString(), corps: "" });
  if (r.r.status !== 200) return console.warn("partage du menu", r.r.corps);
  const menu = { ...JSON.parse(r.r.corps), auteur_ident: M.ident, auteur_uid: M.uid };
  if (!menu.jours.length) return;
  const { data, error } = await sb.from("operations_famille").insert({ famille_id: M.famille.famille.id, operation: menu }).select("id").single();
  if (error) return console.warn("partage du menu", error.message);
  if (data && data.id > (M.familleDerniere || 0)) M.familleDerniere = data.id;
}
const aujourdhuiIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

async function versMoteur(methode, chemin, corps) {
  let partage = null;
  try { partage = methode === "POST" && corps ? (JSON.parse(corps).famille || null) : null; } catch {}
  const r = await (M.file = M.file.catch(() => {}).then(async () => {
    try { await syncFamille(methode === "POST"); } catch (e) { console.warn("famille", e); }
    const rep = await envoyer({ type: "requete", methode, chemin, corps });
    // Ce qui vaut pour toute la famille : une composition du créateur, ou un plat changé « pour toute la famille ».
    if (M.famille && rep.r.status === 200 && (partage || (rep.r.compose && M.famille.famille.createur))) {
      try {
        await sauver(rep.ch); rep.ch = [];
        await partagerMenu(partage && partage.date ? { date: partage.date, moments: (partage.moments || []).join(",") } : { depuis: aujourdhuiIso() });
      } catch (e) { console.warn("famille", e); }
    }
    return rep;
  }));
  (M.mesures = M.mesures || []).push([chemin, r.r.ms]);
  await sauver(r.ch);
  setTimeout(taches, 50);
  if (r.r.status === 200 && r.r.corps) {
    if (chemin === "/api/recettes") garder(`${M.uid}-recettes`, JSON.stringify({ version: M.versionRecettes, corps: r.r.corps }));
    else if (r.r.corps.includes('"recettes_version"')) {
      try { M.versionRecettes = JSON.parse(r.r.corps).recettes_version; garder(`${M.uid}-etat`, r.r.corps); } catch {}
    }
  }
  if (r.r.binaire) return new Response(Uint8Array.from(atob(r.r.binaire), (c) => c.charCodeAt(0)), { status: r.r.status, headers: { "Content-Type": r.r.type } });
  return new Response(r.r.corps, { status: r.r.status, headers: { "Content-Type": "application/json" } });
}

const fetchDuNavigateur = window.fetch.bind(window);
window.fetch = async (entree, options = {}) => {
  const url = typeof entree === "string" ? entree : entree.url;
  if (!url.startsWith("/api/") && !url.startsWith("/export/")) return fetchDuNavigateur(entree, options);
  const methode = (options.method || "GET").toUpperCase(), corps = options.body || "";
  const champs = corps ? JSON.parse(corps) : {};
  try {
    if (url === "/api/connexion") {
      const r = await compte("connecter", { qui: String(champs.identifiant || "").trim().toLowerCase(), mot_de_passe: String(champs.mot_de_passe || "") });
      if (r.erreur) return reponse(401, { erreur: r.erreur });
      const { error } = await sb.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
      if (error) return reponse(401, { erreur: "Connexion impossible, réessaie." });
      await moteurPret();
      return versMoteur("GET", "/api/etat", "");
    }
    if (url === "/api/profil/creer") {               // créer son compte avec le code d'invitation, puis son profil
      const { code, mot_de_passe, ...infos } = champs;
      const ident = String(infos.identifiant || "").trim().toLowerCase();
      const v = await envoyer({ type: "valider", version: VERSION, champs: { ...infos, identifiant: ident } });
      if (v.message) return reponse(400, { erreur: v.message });
      const r = await compte("inscrire", { code, identifiant: ident, email: infos.email, telephone: infos.telephone, mot_de_passe });
      if (r.erreur) return reponse(400, { erreur: r.erreur });
      if (r.a_confirmer) return reponse(400, { erreur: "Compte créé : ouvre le lien reçu par email pour le confirmer, puis connecte-toi.", confirme: true });
      const c = await compte("connecter", { qui: ident, mot_de_passe: String(mot_de_passe || "") });
      if (c.erreur) return reponse(400, { erreur: c.erreur });
      await sb.auth.setSession({ access_token: c.access_token, refresh_token: c.refresh_token });
      await moteurPret();
      return versMoteur("POST", "/api/web/creer_profil", JSON.stringify({ ...infos, identifiant: ident }));
    }
    if (url === "/api/compte/oubli") {
      const r = await compte("oubli", { qui: String(champs.qui || "") });
      return r.erreur ? reponse(400, { erreur: r.erreur }) : reponse(200, { message: r.message });
    }
    if (url === "/api/compte/statut") return reponse(200, await compte("statut"));
    if (url === "/api/deconnexion") {
      await sb.auth.signOut();
      await oublier();
      arreterMoteur();
      return reponse(200, { ok: true });
    }
    // Ouverture : la dernière journée connue tout de suite, la vraie dès que le moteur est prêt.
    if (!M.prete && methode === "GET" && (url === "/api/etat" || url === "/api/recettes")) {
      const { data } = await sb.auth.getSession();
      if (!data.session) return reponse(401, { erreur: "connexion" });
      M.uid = data.session.user.id;
      const garde = await relire(`${M.uid}-${url === "/api/etat" ? "etat" : "recettes"}`);
      if (garde && url === "/api/etat") {
        try { M.versionRecettes = JSON.parse(garde).recettes_version; } catch {}
        moteurPret().then(() => typeof demarrer === "function" && demarrer()).catch((e) => console.warn(e));
        return new Response(garde, { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (garde) {
        const g = JSON.parse(garde);
        if (g.version && g.version === M.versionRecettes) return new Response(g.corps, { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }
    if (!(await moteurPret())) return reponse(401, { erreur: "connexion" });
    if (url === "/api/mot_de_passe") {
      const r = await compte("mot_de_passe", { ancien: String(champs.ancien || ""), nouveau: String(champs.nouveau || "") });
      if (r.erreur) return reponse(400, { erreur: r.erreur });
      return versMoteur("GET", "/api/etat", "");
    }
    if (url === "/api/compte/moi") return reponse(200, await compte("moi"));
    if (url === "/api/compte/coordonnees") {
      const r = await compte("coordonnees", champs);
      return r.erreur ? reponse(400, { erreur: r.erreur }) : reponse(200, r);
    }
    return versMoteur(methode, url, corps);
  } catch (e) {
    console.error(e);
    return reponse(500, { erreur: String(e.message || e) });
  }
};

// ------------------------------------------------------------------ Réglages : le compte Claude (comme Rafiq)
function blocClaude() {
  // Taha, 22/11/2026 : par défaut, l'IA partagée (celle de Taha, Sonnet) ; chacun peut brancher sa propre clé ou un autre modèle.
  const c = M.claude, propre = c && !c.partage;
  const form = `<form id="fClaude" class="formulaire" novalidate style="margin-top:12px"${propre || !c ? "" : " hidden"}>
        <div class="champ"><label for="cleClaude">Clé API</label><input id="cleClaude" type="password" placeholder="sk-…" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
        <div class="champ"><label for="apiClaude">Adresse de l'API <small class="discret">(vide = Anthropic)</small></label><input id="apiClaude" inputmode="url" placeholder="https://api.anthropic.com" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
        <div class="champ"><label for="modeleClaude">Modèle</label><input id="modeleClaude" value="claude-sonnet-5-5" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
        <small id="eClaude" class="erreur" role="alert" style="display:block;color:var(--critique)"></small>
        <p class="actions" style="margin-top:10px"><button class="bouton" type="submit">Connecter</button></p>
        <p class="petit discret" style="margin-top:6px">Ta clé est chiffrée dans la base et ne revient jamais sur ce téléphone.</p>
      </form>`;
  return `<section class="bloc" aria-labelledby="tClaude"><h2 id="tClaude">Intelligence artificielle</h2>
    ${propre ? `<p class="doux">Ta propre clé · <b>${esc(c.modele && c.modele !== "claude-opus-5-5" ? c.modele : "claude-sonnet-5-5")}</b>${c.endpoint ? ` · ${esc(c.endpoint)}` : ""}</p>
      <p class="actions" style="margin-top:10px"><button class="bouton second" type="button" data-claude="oublier">Revenir à l'IA partagée</button></p>`
    : c ? `<p class="doux">IA partagée · <b>${esc(c.modele || "claude-sonnet-5-5")}</b>. Elle calcule tes repas, lit les étiquettes et trouve les photos.</p>
      <p class="actions" style="margin-top:10px"><button class="bouton sobre" type="button" data-claude="propre">Utiliser ma propre clé</button></p>${form}`
    : `<p class="doux">« Calculer » un repas, lire une étiquette ou trouver la photo d'un plat : l'appli le demande à Claude, avec ta clé.</p>${form}`}</section>`;
}
document.addEventListener("click", (ev) => {
  if (!ev.target.closest("[data-claude=propre]")) return;
  const f = document.getElementById("fClaude");
  if (f) { f.hidden = false; ev.target.closest("[data-claude=propre]").hidden = true; }
});
document.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "fClaude") return;
  ev.preventDefault();
  const b = ev.target.querySelector("[type=submit]"), e = document.getElementById("eClaude");
  b.disabled = true; b.textContent = "Vérification…"; e.textContent = "";
  const { data, error } = await sb.functions.invoke("claude", { body: {
    action: "cle", cle: document.getElementById("cleClaude").value.trim(),
    endpoint: document.getElementById("apiClaude").value.trim(), modele: document.getElementById("modeleClaude").value.trim() } });
  b.disabled = false; b.textContent = "Connecter";
  let erreur = data && data.erreur;
  if (error && !erreur) { try { erreur = (await error.context.json()).erreur; } catch { erreur = error.message; } }
  if (erreur) { e.textContent = erreur; return; }
  M.claude = { endpoint: data.endpoint, modele: data.modele };
  M.worker.postMessage({ type: "reglages", reglages: { "repas.plat_perso_ia": true } });
  if (typeof demarrer === "function") demarrer();
  if (typeof dire === "function") dire("Compte Claude connecté.");
});
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-claude=oublier]");
  if (!b) return;
  await sb.rpc("oublier_cle_claude");
  const { data: infos } = await sb.functions.invoke("claude", { body: { action: "infos" } }).catch(() => ({ data: null }));
  M.claude = infos && infos.partage ? { partage: true, modele: infos.modele } : null;
  M.worker.postMessage({ type: "reglages", reglages: { "repas.plat_perso_ia": !!M.claude } });
  if (typeof demarrer === "function") demarrer();
  if (typeof dire === "function") dire(M.claude ? "Tu utilises de nouveau l'IA partagée." : "Clé déconnectée.");
});
