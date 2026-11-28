// Mon Meal Prep — les notifications sur le téléphone, même appli fermée (Web Push). Taha, 27/11/2026 : « le
// responsable ne reçoit jamais la notif ». Le texte est fait ICI, d'après la base, jamais par la page.
// Actions :
//   "cle"         la clé publique VAPID (pour s'abonner)
//   "abonner"     {abonnement: {endpoint, keys: {p256dh, auth}}, appareil} : cet appareil reçoit les notifications du compte
//   "desabonner"  {endpoint}
//   "envoyer"     {type: "demande"}             à la personne qui a créé la famille : quelqu'un demande à entrer
//                 {type: "accepte", membre}     au nouveau membre : sa demande est acceptée
//                 {type: "menu", date, moments} aux autres membres : un plat changé pour toute la famille
//   "essai"       une notification à soi-même
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const SUJET = "https://tahabar19.github.io/meal-prep/";
const PAR_HEURE = 30;                                      // envois au plus, par personne et par heure

// ---------- Web Push (RFC 8291 : chiffrement aes128gcm ; RFC 8292 : VAPID) avec WebCrypto seulement ----------
const enc: any = new TextEncoder();
const b64url = (u8) => { let s = ""; for (const x of u8) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const deb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...a) => { const t = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { t.set(x, o); o += x.length; } return t; };
async function hkdf(sel, ikm, info, n) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sel, info }, k, n * 8));
}
async function chiffrerPush(abonnement, texte) {
  const uaPub = deb64url(abonnement.keys.p256dh), secret = deb64url(abonnement.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaCle = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const commun = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaCle }, local.privateKey, 256));
  const ikm = await hkdf(secret, commun, concat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sel, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sel, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const cle = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cle, concat(enc.encode(texte), new Uint8Array([2]))));
  const entete = new Uint8Array(21 + asPub.length);
  entete.set(sel, 0); new DataView(entete.buffer).setUint32(16, 4096); entete[20] = asPub.length; entete.set(asPub, 21);
  return concat(entete, chiffre);
}
async function enteteVapid(endpoint, jwk, publique, sujet) {
  const tete = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corps = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujet })));
  const cle = await crypto.subtle.importKey("jwk", { ...jwk, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle, enc.encode(`${tete}.${corps}`)));
  return `vapid t=${tete}.${corps}.${b64url(sig)}, k=${publique}`;
}
async function pousser(a: any, message: unknown, vapid: any): Promise<number> {
  const r = await fetch(a.endpoint, {
    method: "POST", signal: AbortSignal.timeout(15000),
    headers: { Authorization: await enteteVapid(a.endpoint, vapid.jwk, vapid.publique, SUJET), "Content-Encoding": "aes128gcm",
               "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal" },
    body: await chiffrerPush({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(message)),
  });
  await r.body?.cancel();
  return r.status;                                         // 201 : reçu ; 404 / 410 : abonnement mort
}

const MOMENTS: Record<string, string> = { pdj: "le petit-déjeuner", dej: "le déjeuner", din: "le dîner", col: "une collation" };
function quand(iso: string): string {
  const jour = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);
  const auj = new Date();
  if (iso === jour(auj)) return "aujourd'hui";
  if (iso === jour(new Date(auj.getTime() + 864e5))) return "demain";
  const d = new Date(iso + "T12:00:00Z");
  return isNaN(d.getTime()) ? "" : "le " + new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

// ---- Les rappels (Taha, 28/11/2026) : pg_cron appelle la fonction chaque heure (en-tête x-rappels = secret
// RAPPELS_JETON). Un rappel part à son heure, dans le fuseau de la personne, seulement s'il sert encore (pas pesé
// aujourd'hui, eau pas cochée, dîner pas coché, pas de silhouette ce lundi), une fois par jour au plus.
const RAPPELS: Record<string, { heure: number; lundi?: boolean; titre: string; texte: string; url: string }> = {
  pesee: { heure: 8, titre: "Pèse-toi ce matin", texte: "À jeun, après les toilettes : c'est la mesure la plus juste.", url: "#/suivi" },
  eau: { heure: 16, titre: "Pense à boire", texte: "Ton eau du jour n'est pas encore cochée.", url: "#/semaine" },
  diner: { heure: 21, titre: "Note ton dîner", texte: "Coche ce que tu as mangé ce soir : demain se règle dessus.", url: "#/semaine" },
  silhouette: { heure: 9, lundi: true, titre: "Ta silhouette du lundi", texte: "Une minute devant le miroir : on compare avec la semaine dernière.", url: "#/suivi" },
};
function ici(fuseau: string, d = new Date()) {
  let parts;
  try { parts = new Intl.DateTimeFormat("en-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d); }
  catch { parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d); }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) % 24, lundi: p.weekday === "Mon" };
}
function utile(type: string, l: { date: string }, lire: (nom: string) => any): boolean {
  if (type === "pesee") return !((lire("suivi.json") || {}).mesures || []).some((m: any) => m && m.date === l.date && m.poids);
  if (type === "eau") return !((lire("eau.json") || {}).jours || {})[l.date];
  if (type === "silhouette") return !((lire("silhouette.json") || {}).releves || []).some((r: any) => r && r.date === l.date);
  if (type === "diner") {
    const s = lire("semaine.json");
    if (!s || !s.debut || !Array.isArray(s.jours)) return false;
    const n = Math.round((Date.parse(l.date + "T12:00:00Z") - Date.parse(s.debut + "T12:00:00Z")) / 864e5);
    if (!(n >= 0 && n <= 6) || !s.jours[n]) return false;
    const din = s.jours[n].din;
    if (din && din !== "rien") return !(s.prepares || {})[`${n}|${din}`];
    return !((lire("journal_repas.json") || {}).entrees || []).some((e: any) => e && e.date === l.date && e.moment === "din");
  }
  return false;
}
async function envoyerRappels(admin: any, vapid: any, corps: any) {
  const essai = corps && corps.essai ? corps.essai : null;        // {user, ici: {date, heure, lundi}} : rien n'est envoyé
  let q = admin.from("rappels").select("user_id, types, fuseau");
  if (essai) q = q.eq("user_id", String(essai.user || ""));
  const { data: lignes } = await q;
  const dus: any[] = [];
  for (const l of lignes || []) {
    const t = essai && essai.ici ? { ...ici(l.fuseau || "Europe/Paris"), ...essai.ici } : ici(l.fuseau || "Europe/Paris");
    for (const type of l.types || []) {
      const r = RAPPELS[type];
      if (r && t.heure === r.heure && (!r.lundi || t.lundi)) dus.push({ user: l.user_id, type, ici: t });
    }
  }
  if (!dus.length) return { ok: true, rappels: [] };
  const users = [...new Set(dus.map((x) => x.user))];
  const { data: deja } = essai ? { data: [] } : await admin.from("notifications").select("pour, type").in("pour", users)
    .like("type", "rappel-%").gte("quand", new Date(Date.now() - 20 * 3600e3).toISOString());
  const { data: fichiers } = await admin.from("fichiers").select("user_id, nom, contenu").in("user_id", users)
    .in("nom", ["suivi.json", "eau.json", "semaine.json", "journal_repas.json", "silhouette.json"]);
  const lire = (u: string, nom: string) => { try { return JSON.parse((fichiers || []).find((f: any) => f.user_id === u && f.nom === nom)?.contenu || "null"); } catch { return null; } };
  const a_envoyer = dus.filter((x) => !(deja || []).some((d: any) => d.pour === x.user && d.type === "rappel-" + x.type) && utile(x.type, x.ici, (n) => lire(x.user, n)));
  if (essai) return { ok: true, rappels: a_envoyer.map((x) => x.type) };
  let envoyees = 0;
  for (const x of a_envoyer) {
    const r = RAPPELS[x.type];
    const { data: abos } = await admin.from("abonnements_push").select("endpoint, p256dh, auth").eq("user_id", x.user);
    let n = 0;
    await Promise.all((abos || []).map(async (a: any) => {
      try {
        const st = await pousser(a, { titre: r.titre, corps: r.texte, url: r.url, tag: "rappel-" + x.type }, vapid);
        if (st === 404 || st === 410) await admin.from("abonnements_push").delete().eq("endpoint", a.endpoint);
        else if (st >= 200 && st < 300) n++;
      } catch (e) { console.warn("rappel", (e as Error).message); }
    }));
    envoyees += n;
    await admin.from("notifications").insert({ de: null, pour: x.user, type: "rappel-" + x.type, titre: r.titre, envoyees: n });
  }
  return { ok: true, rappels: a_envoyer.length, envoyees };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jeton = Deno.env.get("RAPPELS_JETON") || "";
    if (jeton.length >= 32 && req.headers.get("x-rappels") === jeton) {        // pg_cron, chaque heure
      let v: any = null;
      try { v = JSON.parse(Deno.env.get("VAPID") || "null"); } catch { v = null; }
      if (!v) return json({ erreur: "VAPID absent." }, 503);
      return json(await envoyerRappels(admin, v, await req.json().catch(() => ({}))));
    }
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(jwt);
    const user = u?.user;
    if (!user) return json({ erreur: "Reconnecte-toi." }, 401);
    const corps = await req.json();
    const action = String(corps.action || "");
    let vapid: any = null;
    try { vapid = JSON.parse(Deno.env.get("VAPID") || "null"); } catch { vapid = null; }
    if (!vapid) return json({ erreur: "Les notifications ne sont pas encore prêtes." }, 503);

    if (action === "cle") return json({ publique: vapid.publique });
    if (action === "abonner") {
      const a = corps.abonnement || {};
      const endpoint = String(a.endpoint || ""), p256dh = String(a.keys?.p256dh || ""), auth = String(a.keys?.auth || "");
      if (!/^https:\/\/[\w.-]+(:\d+)?\/\S{8,900}$/.test(endpoint) || !/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,30}$/.test(auth))
        return json({ erreur: "Abonnement invalide." }, 400);
      const { error } = await admin.from("abonnements_push").upsert({ endpoint, user_id: user.id, p256dh, auth,
        appareil: String(corps.appareil || "").slice(0, 80), cree: new Date().toISOString() });
      return error ? json({ erreur: error.message }, 500) : json({ ok: true });
    }
    if (action === "desabonner") {
      await admin.from("abonnements_push").delete().eq("endpoint", String(corps.endpoint || "")).eq("user_id", user.id);
      return json({ ok: true });
    }

    const { count } = await admin.from("notifications").select("id", { count: "exact", head: true })
      .eq("de", user.id).gte("quand", new Date(Date.now() - 3600e3).toISOString());
    if ((count ?? 0) >= PAR_HEURE) return json({ erreur: "Trop de notifications pour l'instant." }, 429);

    let pour: string[] = [], titre = "Mon Meal Prep", texte = "", url = "#/semaine", type = action;
    if (action === "essai") { pour = [user.id]; texte = "Les notifications marchent sur cet appareil."; }
    else if (action === "envoyer") {
      type = String(corps.type || "");
      const { data: moi } = await admin.from("profils").select("identifiant").eq("id", user.id).maybeSingle();
      const { data: lien } = await admin.from("membres_famille").select("famille_id, statut").eq("user_id", user.id).maybeSingle();
      if (!moi || !lien) return json({ erreur: "Pas de famille." }, 400);
      const { data: fam } = await admin.from("familles").select("id, nom, createur").eq("id", lien.famille_id).single();
      titre = fam.nom;
      if (type === "demande" && lien.statut === "attente") {
        pour = [fam.createur]; texte = `${moi.identifiant} veut rejoindre ta famille.`; url = "#/famille";
      } else if (type === "accepte" && fam.createur === user.id) {
        const { data: m } = await admin.from("membres_famille").select("user_id").eq("famille_id", fam.id)
          .eq("user_id", String(corps.membre || "")).eq("statut", "membre").maybeSingle();
        if (!m) return json({ erreur: "Ce membre n'est pas dans ta famille." }, 400);
        pour = [m.user_id]; texte = "Ta demande est acceptée : tu fais partie de la famille."; url = "#/famille";
      } else if (type === "menu" && lien.statut === "membre") {
        const { data: ms } = await admin.from("membres_famille").select("user_id").eq("famille_id", fam.id).eq("statut", "membre");
        pour = (ms || []).map((m: any) => m.user_id).filter((x: string) => x !== user.id);
        const moments = (Array.isArray(corps.moments) ? corps.moments : []).map((m: string) => MOMENTS[String(m).replace(/\d+$/, "")]).filter(Boolean);
        const quoi = moments.length === 1 ? moments[0] : moments.length ? "des repas" : "le menu";
        texte = `${moi.identifiant} a changé ${quoi}${quand(String(corps.date || "")) ? " " + quand(String(corps.date || "")) : ""} pour toute la famille.`;
      } else return json({ erreur: "Rien à envoyer." }, 400);
    } else return json({ erreur: "Action inconnue." }, 400);

    if (!pour.length) return json({ ok: true, envoyees: 0 });
    const { data: abos } = await admin.from("abonnements_push").select("endpoint, p256dh, auth, user_id").in("user_id", pour);
    let envoyees = 0;
    await Promise.all((abos || []).map(async (a: any) => {
      try {
        const st = await pousser(a, { titre, corps: texte, url, tag: type }, vapid);
        if (st === 404 || st === 410) await admin.from("abonnements_push").delete().eq("endpoint", a.endpoint);
        else if (st >= 200 && st < 300) envoyees++;
        else console.warn("push", st, a.endpoint.slice(0, 40));
      } catch (e) { console.warn("push", (e as Error).message); }
    }));
    await admin.from("notifications").insert(pour.map((p) => ({ de: user.id, pour: p, type, titre: texte.slice(0, 200), envoyees })));
    return json({ ok: true, envoyees, appareils: (abos || []).length });
  } catch (e) {
    return json({ erreur: (e as Error).message || String(e) }, 500);
  }
});
