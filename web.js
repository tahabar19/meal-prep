// Mon Meal Prep en ligne — entre la page (app.js, la même que sur le PC) et le moteur (moteur.js, le serveur
// Python dans un Worker). La page croit parler au serveur : ses fetch("/api/…") arrivent ici.
// Comptes : Supabase Auth (identifiant → identifiant@meal-prep.invalid). Fichiers du profil : table « fichiers ».
// Photos de ses plats : stockage « photos/<id de la personne>/ ». Claude : fonction « claude », avec SA clé.
const sb = supabase.createClient(MP.url, MP.anon, { auth: { persistSession: true, autoRefreshToken: true } });
const VERSION = "2026-11-19-202913";                 // change à chaque construction (moteur et catalogue)
const M = { worker: null, pret: null, prete: false, n: 0, attente: new Map(), uid: null, ident: null, claude: null, file: Promise.resolve(),
            versionRecettes: null };
const email = (ident) => `${ident}@meal-prep.invalid`;
const reponse = (status, corps) => new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json" } });

function urlPhoto(r, largeur) {
  const id = String(r.photo_de || r.id);              // une copie « Banane (2) » a la photo de l'original
  if (id.startsWith("perso-")) return `${MP.url}/storage/v1/object/public/photos/${M.uid}/${encodeURIComponent(id)}.jpg?v=${r.photo}`;
  const l = [160, 480, 960].reduce((a, b) => (Math.abs(b - largeur) < Math.abs(a - largeur) ? b : a));
  return `photos/${encodeURIComponent(id)}-${l}.jpg`;
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
  const [{ data: fichiers }, { data: objets }, { data: infos }] = await Promise.all([
    sb.from("fichiers").select("nom, contenu").limit(5000),
    sb.storage.from("photos").list(M.uid, { limit: 1000 }),
    sb.rpc("infos_claude"),
  ]);
  M.claude = infos || null;
  M.temps = { supabase: Math.round(performance.now() - t0) };
  const ri = await envoyer({
    type: "init", version: VERSION, url: MP.url, anon: MP.anon, jeton: session.access_token, identifiant: M.ident,
    fichiers: fichiers || [],
    photos: (objets || []).filter((o) => o.name.endsWith(".jpg")).map((o) => ({ nom: "photos/" + o.name, maj: Date.parse(o.updated_at || o.created_at) || 0 })),
  });
  Object.assign(M.temps, ri.temps, { total: Math.round(performance.now() - t0) });
  clearTimeout(montrer);
  const d = document.getElementById("demarrage"); if (d) d.hidden = true;
}

function arreterMoteur() {
  if (M.worker) M.worker.terminate();
  M.pret = null; M.prete = false; M.uid = null; M.ident = null; M.claude = null;
  nouveauMoteur();
}

async function moteurPret() {
  if (M.pret) return M.pret;
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  M.pret = demarrerMoteur(data.session).then(() => (M.prete = true), (e) => { M.pret = null; throw e; });
  return M.pret;
}

sb.auth.onAuthStateChange((ev, session) => {
  if (session && M.worker) M.worker.postMessage({ type: "jeton", jeton: session.access_token });
});

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
    for (let k = 0; k < 6; k++) {
      const r = await (M.file = M.file.then(() => envoyer({ type: "apres" })));
      await sauver(r.ch);
      photo = photo || (r.ch || []).some((c) => c.photo);
      if (!r.reste) break;
    }
    if (photo && typeof demarrer === "function") demarrer();       // la photo apparaît
  } catch (e) { console.warn("tâche en fond", e); }
  enFond = false;
}

async function versMoteur(methode, chemin, corps) {
  const r = await (M.file = M.file.catch(() => {}).then(() => envoyer({ type: "requete", methode, chemin, corps })));
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
      const ident = String(champs.identifiant || "").trim().toLowerCase();
      const { error } = await sb.auth.signInWithPassword({ email: email(ident), password: String(champs.mot_de_passe || "") });
      if (error) return reponse(401, { erreur: /invalid/i.test(error.message) ? "Identifiant ou mot de passe faux." : error.message });
      await moteurPret();
      return versMoteur("GET", "/api/etat", "");
    }
    if (url === "/api/profil/creer") {               // créer son compte avec le code d'invitation, puis son profil
      const { code, mot_de_passe, ...infos } = champs;
      const ident = String(infos.identifiant || "").trim().toLowerCase();
      const v = await envoyer({ type: "valider", version: VERSION, champs: { ...infos, identifiant: ident } });
      if (v.message) return reponse(400, { erreur: v.message });
      const { data, error } = await sb.functions.invoke("inscription", { body: { code, identifiant: ident, mot_de_passe } });
      let erreur = data && data.erreur;
      if (error && !erreur) { try { erreur = (await error.context.json()).erreur; } catch { erreur = error.message; } }
      if (erreur) return reponse(400, { erreur });
      const { error: e2 } = await sb.auth.signInWithPassword({ email: email(ident), password: String(mot_de_passe || "") });
      if (e2) return reponse(400, { erreur: e2.message });
      await moteurPret();
      return versMoteur("POST", "/api/web/creer_profil", JSON.stringify({ ...infos, identifiant: ident }));
    }
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
      const { error: e1 } = await sb.auth.signInWithPassword({ email: email(M.ident), password: String(champs.ancien || "") });
      if (e1) return reponse(400, { erreur: "Ancien mot de passe faux." });
      const { error: e2 } = await sb.auth.updateUser({ password: String(champs.nouveau || "") });
      if (e2) return reponse(400, { erreur: e2.message });
      return versMoteur("GET", "/api/etat", "");
    }
    return versMoteur(methode, url, corps);
  } catch (e) {
    console.error(e);
    return reponse(500, { erreur: String(e.message || e) });
  }
};

// ------------------------------------------------------------------ Réglages : le compte Claude (comme Rafiq)
function blocClaude() {
  const c = M.claude;
  return `<section class="bloc" aria-labelledby="tClaude"><h2 id="tClaude">Compte Claude</h2>
    ${c ? `<p class="doux">Connecté · <b>${esc(c.modele || "claude-opus-5-5")}</b>${c.endpoint ? ` · ${esc(c.endpoint)}` : ""}</p>
      <p class="actions" style="margin-top:10px"><button class="bouton second" type="button" data-claude="oublier">Déconnecter</button></p>`
    : `<p class="doux">« Calculer » un repas, lire une étiquette ou trouver la photo d'un plat : l'appli le demande à Claude, avec ta clé.</p>
      <form id="fClaude" class="formulaire" novalidate style="margin-top:12px">
        <div class="champ"><label for="cleClaude">Clé API</label><input id="cleClaude" type="password" placeholder="sk-…" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
        <div class="champ"><label for="apiClaude">Adresse de l'API <small class="discret">(vide = Anthropic)</small></label><input id="apiClaude" inputmode="url" placeholder="https://api.anthropic.com" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
        <div class="champ"><label for="modeleClaude">Modèle</label><input id="modeleClaude" value="claude-opus-5-5" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
        <small id="eClaude" class="erreur" role="alert" style="display:block;color:var(--critique)"></small>
        <p class="actions" style="margin-top:10px"><button class="bouton" type="submit">Connecter</button></p>
      </form>`}</section>`;
}
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
  if (typeof rendre === "function") rendre();
  if (typeof dire === "function") dire("Compte Claude connecté.");
});
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-claude=oublier]");
  if (!b) return;
  await sb.rpc("oublier_cle_claude");
  M.claude = null;
  if (typeof rendre === "function") rendre();
  if (typeof dire === "function") dire("Compte Claude déconnecté.");
});
