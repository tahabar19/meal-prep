// Mon Meal Prep en ligne — entre la page (app.js, la même que sur le PC) et le moteur (moteur.js, le serveur
// Python dans un Worker). La page croit parler au serveur : ses fetch("/api/…") arrivent ici.
// Comptes : Supabase Auth (identifiant → identifiant@meal-prep.invalid). Fichiers du profil : table « fichiers ».
// Photos de ses plats : stockage « photos/<id de la personne>/ ». Claude : fonction « claude », avec SA clé.
const sb = supabase.createClient(MP.url, MP.anon, { auth: { persistSession: true, autoRefreshToken: true } });
const VERSION = "2026-11-28-072443";                 // change à chaque construction (moteur et catalogue)
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
    // Une coupure pendant un appel à l'IA (reprise ou abandon) : notée au journal, pour en trouver la cause (27/11/2026).
    if (e.data.type === "journal") {
      if (M.uid) sb.from("journal").insert({ user_id: M.uid, ...e.data.journal, details: [...e.data.journal.details,
        `écran ${document.visibilityState}, ${navigator.onLine ? "en ligne" : "hors ligne"}`] }).then(() => {}, () => {});
      return;
    }
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
  M.moi = { uid: M.uid, ident: M.ident };         // le compte connecté ; M.uid / M.ident : le profil affiché
  const [{ data: fichiersPropres }, { data: objets }, { data: infos }, { data: fam }] = await Promise.all([
    sb.from("fichiers").select("nom, contenu, maj").eq("user_id", M.uid).limit(5000),     // en famille, on lit aussi ceux des autres
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
    reglages: reglagesDe(M.uid), fichiers: fichiers || [], photos: photosDe(objets),
  });
  M.profils = { [M.uid]: { uid: M.uid, ident: M.ident, charge: Date.now(), derniere: M.familleDerniere || 0,
                           majVue: Math.max(0, ...(fichiersPropres || []).map((f) => Date.parse(f.maj) || 0)) } };
  Object.assign(M.temps, ri.temps, { total: Math.round(performance.now() - t0) });
  clearTimeout(montrer);
  const d = document.getElementById("demarrage"); if (d) d.hidden = true;
}

function arreterMoteur() {
  if (M.worker) M.worker.terminate();
  M.pret = null; M.prete = false; M.uid = null; M.ident = null; M.claude = null; M.famille = null; M.familleEtat = null;
  M.moi = null; M.profils = {};
  nouveauMoteur();
}

// ---------- Les profils de la famille sur ce téléphone (Taha, 27/11/2026 : « on peut changer de profil facilement sur
// un téléphone, ça donne les doses de tous les membres dans un seul téléphone ») ----------
// Le Worker garde chaque profil ouvert dans son dossier ; une requête dit pour qui elle est (M.ident = le profil
// affiché) ; ce qui change est enregistré chez ce profil-là. Le suivi (poids, mesures, silhouette) reste privé.
const photosDe = (objets) => (objets || []).filter((o) => o.name.endsWith(".jpg"))
  .map((o) => ({ nom: "photos/" + o.name, maj: Date.parse(o.updated_at || o.created_at) || 0 }));
const createurId = () => (M.famille && M.famille.famille.createur_id) || "";
function reglagesDe(uid) {
  const createur = M.moi && uid === M.moi.uid ? !!(M.famille && M.famille.famille.createur) : uid === createurId();
  return { "repas.plat_perso_ia": !!M.claude,             // sans compte Claude : rien d'automatique, tout à la main
           "repas.famille": M.famille ? (createur ? "createur" : "membre") : "" };
}
const uidDe = (ident) => (Object.values(M.profils || {}).find((p) => p.ident === ident) || {}).uid || M.uid;
const membresFamille = () => (M.famille && M.familleEtat && M.familleEtat.membres || []).filter((m) => m.statut === "membre");
const estMoi = () => !M.moi || M.uid === M.moi.uid;

// Les fichiers d'un autre membre, relus s'ils ont plus de 30 s (il a pu changer sa journée sur son téléphone).
// À appeler dans la file du moteur.
async function chargerProfil(uid, force) {
  const m = membresFamille().find((x) => x.id === uid);
  if (!m) throw new Error("Ce profil n'est pas dans ta famille.");
  const p = (M.profils[uid] = M.profils[uid] || { uid, ident: m.identifiant });
  if (!force && p.charge && Date.now() - p.charge < 30000) return p;
  const [{ data: propres, error }, { data: objets }, { data: communs }] = await Promise.all([
    sb.from("fichiers").select("nom, contenu, maj").eq("user_id", uid).limit(5000),
    sb.storage.from("photos").list(uid, { limit: 1000 }),
    sb.from("fichiers_famille").select("nom, contenu, maj").eq("famille_id", M.famille.famille.id),
  ]);
  if (error) throw new Error("Profil illisible : " + error.message);
  for (const f of communs || []) M.familleMaj[f.nom] = f.maj;
  const fichiers = (propres || []).filter((f) => !PARTAGES.includes(f.nom)).map(({ nom, contenu }) => ({ nom, contenu }))
    .concat((communs || []).map(({ nom, contenu }) => ({ nom, contenu })));
  p.majVue = Math.max(0, ...(propres || []).map((f) => Date.parse(f.maj) || 0));
  try { p.derniere = JSON.parse((fichiers.find((f) => f.nom === "famille.json") || {}).contenu || "{}").derniere || 0; } catch { p.derniere = 0; }
  await envoyer({ type: "charger", identifiant: p.ident, fichiers, photos: photosDe(objets), reglages: reglagesDe(uid) });
  p.charge = Date.now();
  return p;
}
// Afficher le profil d'un membre (ou revenir au sien) : sa journée, ses plats, ses doses.
async function afficherProfil(uid) {
  if (!M.prete || uid === M.uid) return;
  if (M.moi && uid !== M.moi.uid) {
    await (M.file = M.file.catch(() => {}).then(async () => {
      await chargerProfil(uid);
      await syncFamille(true, uid);                 // les menus partagés qu'il n'a pas encore reçus
    }));
  }
  M.uid = uid;
  M.ident = M.profils[uid].ident;
  M.familleDerniere = M.profils[uid].derniere || 0;
  if (typeof demarrer === "function") await demarrer();
}
// Un membre sans téléphone (Taha, 27/11/2026) : son compte (fonction « compte »), son profil fait ici par le moteur
// (calories, protéines, ses deux premières semaines), puis le dernier menu de la famille. Le stock commun n'est jamais
// réécrit pendant la création.
async function ajouterMembreSansTelephone(champs) {
  const r = await compte("membre_famille", { identifiant: champs.identifiant });
  if (r.erreur) throw new Error(r.erreur);
  const { data: fam } = await sb.rpc("famille_etat");
  if (fam) { M.familleEtat = fam; if (fam.statut === "membre") M.famille = fam; }
  const uid = r.id, ident = r.identifiant;
  await (M.file = M.file.catch(() => {}).then(async () => {
    M.profils[uid] = { uid, ident, charge: 0, derniere: 0 };
    await envoyer({ type: "charger", identifiant: ident, fichiers: [], photos: [], reglages: { ...reglagesDe(uid), "repas.famille": "" } });
    const rep = await envoyer({ type: "requete", methode: "POST", chemin: "/api/web/creer_profil", profil: ident,
      corps: JSON.stringify({ ...champs, identifiant: ident, sans_telephone: true }) });
    if (rep.r.status !== 200) {
      await compte("membre_retirer", { membre: uid });
      delete M.profils[uid];
      throw new Error((() => { try { return JSON.parse(rep.r.corps).erreur; } catch { return ""; } })() || "Profil impossible à créer.");
    }
    await sauver((rep.ch || []).filter((c) => !PARTAGES.includes(c.nom)), uid);
    await chargerProfil(uid, true);                 // relu avec le stock commun et son rôle de membre
    await syncFamille(true, uid);                    // le menu de la famille
  }));
  return { uid, ident };
}
async function retirerMembreSansTelephone(uid) {
  const r = await compte("membre_retirer", { membre: uid });
  if (r.erreur) throw new Error(r.erreur);
  delete M.profils[uid];
  if (M.uid === uid && M.moi) await afficherProfil(M.moi.uid);
  const { data: fam } = await sb.rpc("famille_etat");
  if (fam) { M.familleEtat = fam; if (fam.statut === "membre") M.famille = fam; }
}

// Les doses du jour de chaque membre : chacun chargé, ses menus reçus, puis ses assiettes avec leurs quantités.
async function dosesFamille(date) {
  const out = [];
  for (const m of membresFamille()) {
    try {
      const d = await (M.file = M.file.catch(() => {}).then(async () => {
        if (M.moi && m.id !== M.moi.uid) { await chargerProfil(m.id); await syncFamille(false, m.id); }
        const p = M.profils[m.id];
        const r = await envoyer({ type: "requete", methode: "GET", chemin: "/api/famille/doses?date=" + encodeURIComponent(date), corps: "", profil: p.ident });
        await sauver(r.ch, uidDe(r.profil));
        return r.r.status === 200 ? JSON.parse(r.r.corps) : null;
      }));
      if (d) out.push({ ...d, uid: m.id, identifiant: m.identifiant, moi: !!m.moi, sans_telephone: !!m.sans_telephone });
    } catch (e) { console.warn("doses", m.identifiant, e); out.push({ uid: m.id, identifiant: m.identifiant, erreur: String(e.message || e), repas: [] }); }
  }
  return out;
}

// Entrer dans une famille ou en sortir : le moteur repart avec le bon stock et le bon rôle (Taha, 23/11/2026).
async function relancerMoteur() {
  arreterMoteur();
  await moteurPret();
  if (typeof demarrer === "function") await demarrer();
}
// Au retour sur l'appli, et chaque minute : le menu et le stock de la famille ont peut-être changé, une demande a
// peut-être été acceptée, ou quelqu'un demande à entrer (Taha, 27/11/2026 : le créateur ne voyait jamais les demandes).
async function majFamilleEtat(force) {
  if (!M.prete || (!force && Date.now() - (M.familleEtatVu || 0) < 15000)) return;
  M.familleEtatVu = Date.now();
  const { data } = await sb.rpc("famille_etat");
  if (!data) return;
  const avant = M.familleEtat, statut = (f) => (f && f.famille ? f.statut : "");
  // entré dans la famille, ou famille dissoute : le moteur repart avec le bon stock et le bon rôle
  if ((statut(avant) === "membre") !== (statut(data) === "membre")) { M.familleEtat = data; return relancerMoteur(); }
  M.familleEtat = data;
  if (M.famille && data.statut === "membre") M.famille = data;
  const cle = (f) => JSON.stringify([statut(f), ((f && f.membres) || []).map((m) => [m.id, m.statut])]);
  if (cle(avant) !== cle(data) && typeof familleChange === "function") familleChange();
}
// Un autre membre a peut-être changé la journée affichée depuis son téléphone : relue si elle a bougé.
async function aJour(uid) {
  const p = M.profils[uid];
  if (!M.famille || !p) return false;
  const { data } = await sb.from("fichiers").select("maj").eq("user_id", uid).order("maj", { ascending: false }).limit(1);
  const maj = data && data[0] ? Date.parse(data[0].maj) || 0 : 0;
  if (maj <= (p.majVue || 0) + 1500) return false;
  await (M.file = M.file.catch(() => {}).then(() => chargerProfil(uid, true)));
  return true;
}
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !M.prete) return;
  try {
    await majFamilleEtat(true);                      // au retour sur l'appli : toujours (une petite requête)
    const change = await aJour(M.uid);
    if (M.famille && (change || Date.now() - M.familleVue > 20000) && typeof demarrer === "function") demarrer();
  } catch (e) { console.warn("famille", e); }
});
setInterval(() => { if (document.visibilityState === "visible") majFamilleEtat().catch(() => {}); }, 60000);

async function moteurPret() {
  if (M.pret) return M.pret;
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  M.pret = demarrerMoteur(data.session).then(() => { M.prete = true; setTimeout(rafraichirAbonnement, 4000); return true; }, (e) => { M.pret = null; throw e; });
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

// Ce que le moteur a écrit ou effacé : renvoyé à Supabase avant de répondre à la page, chez le profil concerné
// (le sien, ou celui d'un membre de la famille ouvert sur ce téléphone).
async function sauver(ch, uid = M.uid) {
  const lignes = (ch || []).filter((c) => c.journal).map((c) => ({ user_id: uid, ...c.journal }));
  if (lignes.length) sb.from("journal").insert(lignes).then(({ error }) => error && console.warn("journal", error.message));
  for (const c of ch || []) {
    if (c.journal) continue;
    if (c.photo) {
      const nom = `${uid}/${c.nom.replace(/^photos\//, "")}`;
      const { error } = await sb.storage.from("photos").upload(nom, new Blob([c.octets], { type: "image/jpeg" }), { upsert: true, contentType: "image/jpeg" });
      if (error) console.warn("photo non envoyée", c.nom, error.message);
    } else if (c.retire) {
      if (/\.(jpe?g|png)$/.test(c.nom)) await sb.storage.from("photos").remove([`${uid}/${c.nom.replace(/^photos\//, "")}`]);
      else await sb.from("fichiers").delete().eq("user_id", uid).eq("nom", c.nom);
    } else if (M.famille && PARTAGES.includes(c.nom)) {          // le stock commun de la famille
      const maj = new Date().toISOString();
      const { error } = await sb.from("fichiers_famille").upsert({ famille_id: M.famille.famille.id, nom: c.nom, contenu: c.texte, maj });
      if (error) throw new Error("Enregistrement du stock commun impossible : " + error.message);
      M.familleMaj[c.nom] = maj;
    } else {
      const maj = new Date();
      const { error } = await sb.from("fichiers").upsert({ user_id: uid, nom: c.nom, contenu: c.texte, maj: maj.toISOString() });
      if (error) throw new Error("Enregistrement impossible : " + error.message);
      if (M.profils && M.profils[uid]) M.profils[uid].majVue = Math.max(M.profils[uid].majVue || 0, maj.getTime());
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
      await sauver(r.ch, uidDe(r.profil));
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
// Depuis le 27/11/2026, pour chaque profil ouvert sur ce téléphone (uid) : chacun a son « dernier menu reçu ».
const PARTAGES = ["stock.csv", "mouvements.csv"];
M.familleVue = 0;
M.profils = {};
async function syncFamille(force, uid = M.uid) {
  const p = M.profils[uid];
  if (!M.famille || !p || (!force && Date.now() - (p.vue || 0) < 20000)) return;
  p.vue = M.familleVue = Date.now();
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
  q = p.derniere ? q.gt("id", p.derniere).order("id").limit(30) : q.order("id", { ascending: false }).limit(1);
  const { data: ops } = await q;
  if (!ops || !ops.length) return;
  for (const o of ops.sort((a, b) => a.id - b.id)) {
    // déjà chez le profil qui l'a faite (auteur_uid : le profil affiché quand le menu a été partagé)
    if ((o.operation.auteur_uid || o.auteur) !== uid) {
      const r = await envoyer({ type: "requete", methode: "POST", chemin: "/api/famille/appliquer", profil: p.ident,
        corps: JSON.stringify({ menu: o.operation, auteur: o.operation.auteur_ident || "" }) });
      await sauver(r.ch, uidDe(r.profil));
      if (r.r.status !== 200) console.warn("menu de la famille", r.r.corps);
    }
    p.derniere = o.id;
  }
  if (uid === M.uid) M.familleDerniere = p.derniere;
  await sb.from("fichiers").upsert({ user_id: uid, nom: "famille.json", contenu: JSON.stringify({ derniere: p.derniere }), maj: new Date().toISOString() });
  M.familleChange = true;
}
async function partagerMenu(params, uid = M.uid) {
  const p = M.profils[uid];
  if (!M.famille || !p) return null;
  const r = await envoyer({ type: "requete", methode: "GET", chemin: "/api/famille/menu?" + new URLSearchParams(params).toString(), corps: "", profil: p.ident });
  if (r.r.status !== 200) return console.warn("partage du menu", r.r.corps);
  const menu = { ...JSON.parse(r.r.corps), auteur_ident: p.ident, auteur_uid: uid };
  if (!menu.jours.length) return null;
  const { data, error } = await sb.from("operations_famille").insert({ famille_id: M.famille.famille.id, operation: menu }).select("id").single();
  if (error) return console.warn("partage du menu", error.message);
  if (data && data.id > (p.derniere || 0)) p.derniere = data.id;
  if (uid === M.uid) M.familleDerniere = p.derniere;
  return menu;
}
const aujourdhuiIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// L'écran reste allumé pendant un calcul de plus d'une seconde (Taha, 27/11/2026) : un iPhone qui se verrouille coupe
// la connexion de l'appli. Le verrou tombe seul si l'appli passe en arrière-plan.
const ECRAN = { n: 0, verrou: null };
async function ecranAllume(oui) {
  if (!("wakeLock" in navigator)) return;
  try {
    if (oui) {
      if (ECRAN.n++ || document.visibilityState !== "visible") return;
      const v = await navigator.wakeLock.request("screen");
      if (ECRAN.n) ECRAN.verrou = v; else v.release().catch(() => {});
    } else if (ECRAN.n > 0 && --ECRAN.n === 0 && ECRAN.verrou) { const v = ECRAN.verrou; ECRAN.verrou = null; await v.release(); }
  } catch {}
}

async function versMoteur(methode, chemin, corps) {
  let allume = false;
  const minuteur = setTimeout(() => { allume = true; ecranAllume(true); }, 1000);
  try { return await versMoteurSansVeille(methode, chemin, corps); }
  finally { clearTimeout(minuteur); if (allume) ecranAllume(false); }
}
async function versMoteurSansVeille(methode, chemin, corps) {
  let partage = null;
  try { partage = methode === "POST" && corps ? (JSON.parse(corps).famille || null) : null; } catch {}
  const uid = M.uid, profil = M.ident;                 // le profil affiché quand on a demandé
  const r = await (M.file = M.file.catch(() => {}).then(async () => {
    try { await syncFamille(methode === "POST", uid); } catch (e) { console.warn("famille", e); }
    const rep = await envoyer({ type: "requete", methode, chemin, corps, profil });
    // Ce qui vaut pour toute la famille : une composition du créateur, ou un plat changé « pour toute la famille ».
    const createur = M.famille && (M.moi && uid === M.moi.uid ? M.famille.famille.createur : uid === createurId());
    if (M.famille && rep.r.status === 200 && (partage || (rep.r.compose && createur))) {
      try {
        await sauver(rep.ch, uidDe(rep.profil)); rep.ch = [];
        const menu = await partagerMenu(partage && partage.date ? { date: partage.date, moments: (partage.moments || []).join(",") } : { depuis: aujourdhuiIso() }, uid);
        if (menu && partage && typeof notifier === "function") notifier("menu", { date: partage.date || "", moments: partage.moments || [], profil: profil });
      } catch (e) { console.warn("famille", e); }
    }
    return rep;
  }));
  (M.mesures = M.mesures || []).push([chemin, r.r.ms]);
  await sauver(r.ch, uidDe(r.profil));
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
      await couperNotifications();                   // ce téléphone ne reçoit plus les notifications de ce compte
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

// ---------- Notifications sur ce téléphone, même appli fermée (Taha, 27/11/2026 : « le responsable ne reçoit jamais
// la notif ») ----------
// iPhone : seulement l'appli installée sur l'écran d'accueil (iOS 16.4 et plus). L'APK Android ne les a pas encore.
const pushPossible = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const deb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function abonnementPush() {
  if (!pushPossible()) return null;
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
}
async function notificationsActives() {
  return pushPossible() && Notification.permission === "granted" && !!(await abonnementPush());
}
async function activerNotifications() {
  if (!pushPossible()) {
    const iphone = /iphone|ipad/i.test(navigator.userAgent);
    throw new Error(iphone ? "Sur iPhone : installe d'abord l'appli sur l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvre-la de là."
      : window.Capacitor ? "Pas encore dans l'appli Android : ouvre le site dans Chrome pour les notifications." : "Ce navigateur ne reçoit pas de notifications.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications refusées : autorise-les dans les réglages du téléphone.");
  const reg = await navigator.serviceWorker.ready;
  let ab = await reg.pushManager.getSubscription();
  if (!ab) {
    const { data, error } = await sb.functions.invoke("notifier", { body: { action: "cle" } });
    if (error || !data || !data.publique) throw new Error("Les notifications ne sont pas encore prêtes.");
    ab = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deb64url(data.publique) });
  }
  const { data, error } = await sb.functions.invoke("notifier", { body: { action: "abonner", abonnement: ab.toJSON(), appareil: navigator.userAgent.slice(0, 80) } });
  if (error || (data && data.erreur)) throw new Error((data && data.erreur) || "Abonnement impossible, réessaie.");
  return true;
}
async function couperNotifications() {
  const ab = await abonnementPush();
  if (!ab) return;
  await sb.functions.invoke("notifier", { body: { action: "desabonner", endpoint: ab.endpoint } }).catch(() => {});
  await ab.unsubscribe().catch(() => {});
}
// Le texte est fait par la fonction, d'après la base : la page dit seulement ce qui s'est passé.
function notifier(type, extra = {}) {
  return sb.functions.invoke("notifier", { body: { action: "envoyer", type, ...extra } }).catch(() => {});
}
// Cet appareil reste lié au compte connecté (un autre compte a pu s'y connecter avant).
async function rafraichirAbonnement() {
  try { if (await notificationsActives()) { const ab = await abonnementPush();
    await sb.functions.invoke("notifier", { body: { action: "abonner", abonnement: ab.toJSON(), appareil: navigator.userAgent.slice(0, 80) } }); } } catch {}
}
// Toucher une notification avec l'appli ouverte : on va au bon écran.
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => {
  if (e.data && e.data.type === "aller" && typeof e.data.url === "string" && e.data.url.startsWith("#/")) location.hash = e.data.url;
});
