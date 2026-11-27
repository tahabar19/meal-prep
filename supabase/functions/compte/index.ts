// Mon Meal Prep — les comptes (Taha, 22/11/2026 : « création de compte, multi-user, mot de passe solide, email,
// numéro de téléphone, renforce l'appli »). Seule cette fonction crée des comptes (l'inscription directe à
// Supabase est fermée) ; elle vérifie le code d'invitation, la solidité du mot de passe, et bloque les essais en
// rafale à la connexion.
// Actions :
//   "statut"       ce que l'appli peut proposer (les emails partent-ils ?)
//   "inscrire"     code, identifiant, email, téléphone, mot de passe → le compte (le profil est fait par l'appli)
//   "connecter"    identifiant OU email + mot de passe → la session (l'email n'est jamais renvoyé à la page)
//   "oubli"        identifiant ou email → un lien « nouveau mot de passe » par email (si les emails partent)
//   "coordonnees"  (connecté) changer son email et son téléphone
//   "mot_de_passe" (connecté) ancien + nouveau mot de passe
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const public_ = () => createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const EMAILS = Deno.env.get("EMAILS_ACTIFS") === "1";        // un expéditeur (SMTP) est branché dans Supabase
const SITE = Deno.env.get("SITE_URL") || "https://tahabar19.github.io/meal-prep/";
const ANCIEN = (ident: string) => `${ident}@meal-prep.invalid`;   // les comptes d'avant l'email

function egal(a: string, b: string): boolean {               // comparaison en temps constant
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

// ---------- Ce qui est saisi ----------
function emailPropre(brut: unknown): string | null {
  const e = String(brut || "").trim().toLowerCase();
  return e.length <= 120 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && !e.endsWith(".invalid") ? e : null;
}
function telephonePropre(brut: unknown): string | null {
  const t = String(brut || "").replace(/[\s.\-()]/g, "");
  if (/^0[1-9]\d{8}$/.test(t)) return "+33" + t.slice(1);    // 06 12 34 56 78 → +33612345678
  if (/^\+[1-9]\d{7,14}$/.test(t)) return t;
  if (/^00[1-9]\d{7,14}$/.test(t)) return "+" + t.slice(2);
  return null;
}
const COURANTS = ["password", "motdepasse", "azerty", "qwerty", "123456", "soleil", "bonjour", "doudou", "loulou",
                  "chouchou", "marseille", "football", "princesse", "iloveyou", "admin", "mealprep", "bismillah"];
// Un mot de passe solide : 10 caractères, une minuscule, une majuscule, un chiffre ; ni l'identifiant, ni l'email,
// ni un mot de passe courant, ni un mot de passe déjà fuité (Have I Been Pwned, par k-anonymat : seuls les 5
// premiers caractères de son empreinte SHA-1 quittent le serveur).
async function motDePasseFaible(mdp: string, ident = "", email = ""): Promise<string | null> {
  if (mdp.length < 10) return "Mot de passe : 10 caractères au moins.";
  if (mdp.length > 72) return "Mot de passe : 72 caractères au plus.";
  if (!/[a-z]/.test(mdp) || !/[A-Z]/.test(mdp) || !/\d/.test(mdp)) return "Mot de passe : mets au moins une minuscule, une majuscule et un chiffre.";
  const bas = mdp.toLowerCase();
  if ((ident && ident.length >= 3 && bas.includes(ident)) || (email && bas.includes(email.split("@")[0])))
    return "Mot de passe : il ne doit pas contenir ton identifiant ou ton email.";
  if (COURANTS.some((c) => bas.includes(c))) return "Mot de passe : trop facile à deviner, choisis-en un autre.";
  if (/^(.)\1+$/.test(mdp) || /0123|1234|2345|3456|4567|5678|6789|abcd/i.test(mdp) && mdp.length < 14) return "Mot de passe : trop facile à deviner, choisis-en un autre.";
  try {
    const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(mdp))))
      .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const r = await fetch(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(4000) });
    if (r.ok && (await r.text()).split("\n").some((l) => l.startsWith(h.slice(5) + ":") && !l.endsWith(":0")))
      return "Mot de passe : il apparaît dans des fuites de données connues, choisis-en un autre.";
  } catch { /* service injoignable : on n'empêche pas l'inscription */ }
  return null;
}

// ---------- Retrouver un compte par son identifiant ou son email ----------
async function compteDe(qui: string): Promise<{ id: string; identifiant: string; email: string } | null> {
  const q = qui.trim().toLowerCase();
  const filtre = q.includes("@") ? admin.from("profils").select("id, identifiant, email").ilike("email", q)
    : admin.from("profils").select("id, identifiant, email").eq("identifiant", q);
  const { data } = await filtre.maybeSingle();
  if (!data) return null;
  return { id: data.id, identifiant: data.identifiant, email: data.email || ANCIEN(data.identifiant) };
}
// Au-delà de 8 échecs en 15 minutes pour un même identifiant/email, ou 30 depuis une même adresse : on attend.
async function tropDEssais(cles: string[]): Promise<boolean> {
  const depuis = new Date(Date.now() - 15 * 60e3).toISOString();
  for (const [cle, max] of cles.map((c, i) => [c, i === 0 ? 8 : 30] as [string, number])) {
    const { count } = await admin.from("essais_connexion").select("id", { count: "exact", head: true })
      .eq("cle", cle).eq("reussi", false).gte("quand", depuis);
    if ((count ?? 0) >= max) return true;
  }
  return false;
}
const noter = (cles: string[], reussi: boolean) => admin.from("essais_connexion").insert(cles.map((cle) => ({ cle, reussi })));

async function utilisateur(req: Request) {
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data } = await admin.auth.getUser(jwt);
  return data?.user || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const corps = await req.json();
    const action = String(corps.action || "");
    const ip = "ip:" + (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();

    if (action === "statut") return json({ emails: EMAILS });

    // ---------- Créer son compte ----------
    if (action === "inscrire") {
      const code = String(corps.code || "").trim(), attendu = Deno.env.get("CODE_INVITATION") || "";
      if (await tropDEssais([ip])) return json({ erreur: "Trop d'essais : réessaie dans 15 minutes." }, 429);
      if (!attendu || !egal(code, attendu)) {
        await noter([ip], false); await pause(800);
        return json({ erreur: "Code d'invitation incorrect." }, 401);
      }
      const ident = String(corps.identifiant || "").trim().toLowerCase();
      if (!/^[a-z0-9_-]{3,20}$/.test(ident) || ["admin", "defaut", "root", "support"].includes(ident))
        return json({ erreur: "Identifiant : 3 à 20 lettres minuscules, chiffres ou tirets." }, 400);
      const email = emailPropre(corps.email);
      if (!email) return json({ erreur: "Email : écris une adresse valide (exemple : prenom@gmail.com)." }, 400);
      const tel = telephonePropre(corps.telephone);
      if (!tel) return json({ erreur: "Téléphone : écris un numéro valide (06 12 34 56 78 ou +33 6 12 34 56 78)." }, 400);
      const mdp = String(corps.mot_de_passe || "");
      const faible = await motDePasseFaible(mdp, ident, email);
      if (faible) return json({ erreur: faible }, 400);
      const { data: identPris } = await admin.from("profils").select("id").eq("identifiant", ident).maybeSingle();
      if (identPris) return json({ erreur: "Cet identifiant est déjà pris." }, 400);
      const { data: emailPris } = await admin.from("profils").select("id").ilike("email", email).maybeSingle();
      if (emailPris) return json({ erreur: "Cet email a déjà un compte : connecte-toi, ou « Mot de passe oublié ? »." }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password: mdp, email_confirm: !EMAILS,
        user_metadata: { identifiant: ident } });
      if (error || !data?.user) return json({ erreur: /already|registered|exists/i.test(error?.message || "") ? "Cet email a déjà un compte." : "Création impossible, réessaie." }, 400);
      const { error: e2 } = await admin.from("profils").insert({ id: data.user.id, identifiant: ident, email, telephone: tel });
      if (e2) { await admin.auth.admin.deleteUser(data.user.id); return json({ erreur: "Création impossible, réessaie." }, 500); }
      if (EMAILS) {                                          // le lien de confirmation part par email
        await public_().auth.resend({ type: "signup", email, options: { emailRedirectTo: SITE } });
        return json({ ok: true, a_confirmer: true });
      }
      return json({ ok: true });
    }

    // ---------- Se connecter par identifiant ou email ----------
    if (action === "connecter") {
      const qui = String(corps.qui || "").trim().toLowerCase().slice(0, 120);
      const mdp = String(corps.mot_de_passe || "");
      if (!qui || !mdp) return json({ erreur: "Écris ton identifiant (ou ton email) et ton mot de passe." }, 400);
      const cles = ["qui:" + qui, ip];
      if (await tropDEssais(cles)) return json({ erreur: "Trop d'essais : réessaie dans 15 minutes, ou « Mot de passe oublié ? »." }, 429);
      const compte = await compteDe(qui);
      const { data, error } = compte ? await public_().auth.signInWithPassword({ email: compte.email, password: mdp }) : { data: null, error: true };
      if (error || !data?.session) {
        await noter(cles, false); await pause(700);
        const nonConfirme = error && typeof error === "object" && /confirm/i.test((error as any).message || "");
        return json({ erreur: nonConfirme ? "Confirme d'abord ton email : ouvre le lien reçu." : "Identifiant ou mot de passe faux." }, 401);
      }
      await noter(cles, true);
      return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    }

    // ---------- Mot de passe oublié : un lien par email (toujours la même réponse : on ne dit pas qui existe) ----------
    if (action === "oubli") {
      const qui = String(corps.qui || "").trim().toLowerCase().slice(0, 120);
      if (!EMAILS) return json({ erreur: "L'envoi d'emails n'est pas encore branché : demande à Taha de te remettre un mot de passe." }, 400);
      if (await tropDEssais([ip])) return json({ erreur: "Trop d'essais : réessaie dans 15 minutes." }, 429);
      await noter([ip], false);                              // compte comme un essai : pas d'emails en rafale
      const compte = qui ? await compteDe(qui) : null;
      if (compte && !compte.email.endsWith(".invalid"))
        await public_().auth.resetPasswordForEmail(compte.email, { redirectTo: SITE });
      return json({ ok: true, message: "Si ce compte a un email, un lien pour choisir un nouveau mot de passe vient de partir." });
    }

    // ---------- Connecté : ses coordonnées, son mot de passe ----------
    const user = await utilisateur(req);
    if (!user) return json({ erreur: "Reconnecte-toi." }, 401);
    const { data: moi } = await admin.from("profils").select("identifiant, email, telephone").eq("id", user.id).single();
    if (!moi) return json({ erreur: "Profil introuvable." }, 404);

    if (action === "coordonnees") {
      const maj: Record<string, string> = {};
      if (corps.email !== undefined) {
        const email = emailPropre(corps.email);
        if (!email) return json({ erreur: "Email : écris une adresse valide." }, 400);
        if (email !== moi.email) {
          const { data: autre } = await admin.from("profils").select("id").ilike("email", email).neq("id", user.id).maybeSingle();
          if (autre) return json({ erreur: "Cet email a déjà un compte." }, 400);
          const { error } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true });
          if (error) return json({ erreur: "Email refusé, réessaie." }, 400);
          maj.email = email;
        }
      }
      if (corps.telephone !== undefined) {
        const tel = telephonePropre(corps.telephone);
        if (!tel) return json({ erreur: "Téléphone : écris un numéro valide (06 12 34 56 78 ou +33 6 12 34 56 78)." }, 400);
        maj.telephone = tel;
      }
      if (Object.keys(maj).length) await admin.from("profils").update(maj).eq("id", user.id);
      return json({ ok: true, email: maj.email ?? moi.email, telephone: maj.telephone ?? moi.telephone });
    }

    if (action === "mot_de_passe") {
      const cles = ["qui:" + moi.identifiant];
      if (await tropDEssais(cles)) return json({ erreur: "Trop d'essais : réessaie dans 15 minutes." }, 429);
      const { error } = await public_().auth.signInWithPassword({ email: user.email!, password: String(corps.ancien || "") });
      if (error) { await noter(cles, false); await pause(700); return json({ erreur: "Ancien mot de passe faux." }, 400); }
      const nouveau = String(corps.nouveau || "");
      const faible = await motDePasseFaible(nouveau, moi.identifiant, moi.email || "");
      if (faible) return json({ erreur: faible }, 400);
      const { error: e2 } = await admin.auth.admin.updateUserById(user.id, { password: nouveau });
      if (e2) return json({ erreur: "Changement impossible, réessaie." }, 400);
      return json({ ok: true });
    }

    if (action === "moi") return json({ identifiant: moi.identifiant, email: moi.email, telephone: moi.telephone, emails: EMAILS });

    // ---------- Un membre sans téléphone (enfant…), créé par un membre de la famille (Taha, 27/11/2026) ----------
    // Un compte dont personne ne connaît le mot de passe : il s'ouvre depuis le téléphone des autres membres.
    if (action === "membre_famille") {
      const { data: lien } = await admin.from("membres_famille").select("famille_id").eq("user_id", user.id).eq("statut", "membre").maybeSingle();
      if (!lien) return json({ erreur: "Crée ou rejoins d'abord une famille." }, 400);
      const { count } = await admin.from("membres_famille").select("user_id", { count: "exact", head: true }).eq("famille_id", lien.famille_id);
      if ((count ?? 0) >= 12) return json({ erreur: "12 membres au plus dans une famille." }, 400);
      const ident = String(corps.identifiant || "").trim().toLowerCase();
      if (!/^[a-z0-9_-]{3,20}$/.test(ident) || ["admin", "defaut", "root", "support"].includes(ident))
        return json({ erreur: "Identifiant : 3 à 20 lettres minuscules, chiffres ou tirets." }, 400);
      const { data: pris } = await admin.from("profils").select("id").eq("identifiant", ident).maybeSingle();
      if (pris) return json({ erreur: "Cet identifiant est déjà pris : choisis-en un autre." }, 400);
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)), (x) => x.toString(16).padStart(2, "0")).join("");
      const { data, error } = await admin.auth.admin.createUser({ email: `${ident}@meal-prep.invalid`, password: secret + "Aa1",
        email_confirm: true, user_metadata: { identifiant: ident, sans_telephone: true, cree_par: user.id } });
      if (error || !data?.user) return json({ erreur: "Création impossible, réessaie." }, 400);
      const { error: e2 } = await admin.from("profils").insert({ id: data.user.id, identifiant: ident, sans_telephone: true });
      const { error: e3 } = e2 ? { error: e2 } : await admin.from("membres_famille").insert({ famille_id: lien.famille_id, user_id: data.user.id, statut: "membre" });
      if (e2 || e3) { await admin.auth.admin.deleteUser(data.user.id); return json({ erreur: "Création impossible, réessaie." }, 400); }
      return json({ ok: true, id: data.user.id, identifiant: ident });
    }
    // Retirer un membre sans téléphone : son profil disparaît (par la personne qui a créé la famille, ou qui l'a créé).
    if (action === "membre_retirer") {
      const cible = String(corps.membre || "");
      const { data: p } = await admin.from("profils").select("id, identifiant, sans_telephone").eq("id", cible).maybeSingle();
      const { data: lien } = await admin.from("membres_famille").select("famille_id").eq("user_id", cible).maybeSingle();
      const { data: fam } = lien ? await admin.from("familles").select("createur").eq("id", lien.famille_id).maybeSingle() : { data: null };
      const { data: u2 } = p ? await admin.auth.admin.getUserById(cible) : { data: null };
      const createurDuProfil = (u2 as any)?.user?.user_metadata?.cree_par === user.id;
      if (!p || !p.sans_telephone || !fam || (fam.createur !== user.id && !createurDuProfil))
        return json({ erreur: "Seul un profil sans téléphone se retire, par qui l'a créé ou par le créateur de la famille." }, 403);
      const { error } = await admin.auth.admin.deleteUser(cible);
      return error ? json({ erreur: "Suppression impossible, réessaie." }, 400) : json({ ok: true });
    }
    return json({ erreur: "Action inconnue." }, 400);
  } catch (e) {
    console.error(e);
    return json({ erreur: "Le serveur n'a pas pu répondre, réessaie." }, 500);
  }
});
