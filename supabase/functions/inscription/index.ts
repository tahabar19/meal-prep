// Mon Meal Prep — créer son compte avec le code d'invitation (donné par Taha). Le profil lui-même (calories,
// protéines, premières semaines) est fabriqué ensuite par l'appli, avec le même code que sur le PC.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function egal(a: string, b: string): boolean {               // comparaison en temps constant
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const corps = await req.json();
    const code = String(corps.code || "").trim(), attendu = Deno.env.get("CODE_INVITATION") || "";
    if (!attendu || !egal(code, attendu)) {
      await new Promise((r) => setTimeout(r, 800));       // pas d'essais en rafale
      return json({ erreur: "Code d'invitation incorrect." }, 401);
    }
    const ident = String(corps.identifiant || "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,20}$/.test(ident) || ["admin", "defaut"].includes(ident))
      return json({ erreur: "Identifiant : 3 à 20 lettres minuscules, chiffres ou tirets." }, 400);
    const mdp = String(corps.mot_de_passe || "");
    if (mdp.length < 8) return json({ erreur: "Mot de passe : 8 caractères au moins." }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: pris } = await admin.from("profils").select("id").eq("identifiant", ident).maybeSingle();
    if (pris) return json({ erreur: "Cet identifiant est déjà pris." }, 400);
    const { data, error } = await admin.auth.admin.createUser({ email: `${ident}@meal-prep.invalid`, password: mdp, email_confirm: true });
    if (error || !data?.user) return json({ erreur: /already/i.test(error?.message || "") ? "Cet identifiant est déjà pris." : (error?.message || "Création impossible.") }, 400);
    const { error: e2 } = await admin.from("profils").insert({ id: data.user.id, identifiant: ident });
    if (e2) { await admin.auth.admin.deleteUser(data.user.id); return json({ erreur: e2.message }, 500); }
    return json({ ok: true });
  } catch (e) {
    return json({ erreur: (e as Error).message || String(e) }, 500);
  }
});
