// Mon Meal Prep — Claude, avec la clé de la personne qui demande (comme Rafiq).
// Actions :
//   "cle"      connecter sa clé (+ adresse d'API compatible + modèle), vérifiée par un vrai essai
//   "messages" une question à Claude (texte, photo) avec SA clé ; renvoie le texte de la réponse
//   "web"      lire une page ou une image publique (étiquettes Open Food Facts / auchan.fr, banques de photos) :
//              le moteur de l'appli, qui tourne dans le navigateur, ne peut pas lire ces sites lui-même.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MODELE = "claude-opus-5-5"; // Opus par défaut (Taha, 19/11/2026) ; chacun peut en choisir un autre

// Une adresse publique en https, jamais le réseau interne
function adressePublique(brut: unknown, message = "Cette adresse n'est pas autorisée."): URL {
  const t = String(brut || "").trim();
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(t) ? t : "https://" + t); } catch { throw new Error("Adresse invalide."); }
  if (u.protocol !== "https:") throw new Error("L'adresse doit commencer par https://");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost") || h === "metadata.google.internal" ||
      /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || /^(::1?|f[cd][0-9a-f]{2}:|fe80:)/.test(h) || /^\d+$/.test(h))
    throw new Error(message);
  return u;
}
// Adresse d'API donnée par la personne : le SDK ajoute lui-même /v1/messages
function adresseApi(brut: unknown): string | null {
  if (!String(brut || "").trim()) return null;
  const u = adressePublique(brut, "Cette adresse d'API n'est pas autorisée.");
  const chemin = u.pathname.replace(/\/+$/, "").replace(/\/v1(\/messages)?$/, "");
  if (u.hostname === "api.anthropic.com" && !chemin) return null;
  return `${u.origin}${chemin}`;
}
type Connexion = { cle: string; endpoint: string | null; modele: string | null; bearer: boolean };
const client = (k: Connexion) => new Anthropic({
  ...(k.bearer ? { apiKey: null, authToken: k.cle } : { apiKey: k.cle }),
  ...(k.endpoint ? { baseURL: k.endpoint } : {}),
  maxRetries: 1,
});

function erreurClaude(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Clé refusée par le service.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Cette clé n'a pas accès à ce modèle.";
  if (e instanceof Anthropic.NotFoundError) return "Modèle ou adresse d'API introuvable (vérifie le nom du modèle et l'adresse).";
  if (e instanceof Anthropic.RateLimitError) return "Claude est saturé ou la limite est atteinte, réessaie dans un moment.";
  if (e instanceof Anthropic.APIConnectionError) return "Impossible de joindre l'adresse d'API.";
  if (e instanceof Anthropic.APIError) {
    if ((e as any).type === "billing_error" || e.status === 402) return "Plus de crédit sur ce compte.";
    return "Claude : " + e.message;
  }
  return (e as Error)?.message || String(e);
}

// Le contenu envoyé par l'appli : du texte et, au plus, une photo (JPEG ou PNG en base64)
function contenu(brut: any): any[] {
  const blocs: any[] = [];
  for (const b of Array.isArray(brut) ? brut.slice(0, 4) : []) {
    if (b?.type === "text" && typeof b.text === "string") blocs.push({ type: "text", text: b.text.slice(0, 60000) });
    else if (b?.type === "image" && typeof b.data === "string" && blocs.filter((x) => x.type === "image").length < 1) {
      const type = b.media_type === "image/png" ? "image/png" : "image/jpeg";
      if (b.data.length > 8_000_000) throw new Error("Photo trop lourde.");
      blocs.push({ type: "image", source: { type: "base64", media_type: type, data: b.data } });
    }
  }
  if (!blocs.some((x) => x.type === "text")) throw new Error("Question vide.");
  return blocs;
}

async function lire(url: string, binaire: boolean) {
  const u = adressePublique(url);
  const r = await fetch(u, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; mon-meal-prep/1.0)", "Accept-Language": "fr-FR,fr;q=0.9" },
    redirect: "follow", signal: AbortSignal.timeout(20000),
  });
  const octets = new Uint8Array(await r.arrayBuffer());
  if (octets.length > 8_000_000) throw new Error("Page trop lourde.");
  if (!binaire) return { status: r.status, texte: new TextDecoder().decode(octets) };
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return { status: r.status, type: r.headers.get("content-type") || "", base64: btoa(s) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(jwt);
    const user = u?.user;
    if (!user) return json({ erreur: "Reconnecte-toi." }, 401);
    const corps = await req.json();

    if (corps.action === "web") {
      try { return json(await lire(String(corps.url || ""), !!corps.binaire)); }
      catch (e) { return json({ erreur: (e as Error).message }, 400); }
    }

    // ---------- Connecter son compte : on vérifie la clé avant de l'enregistrer ----------
    if (corps.action === "cle") {
      const cle = String(corps.cle || "").trim();
      let endpoint: string | null;
      try { endpoint = adresseApi(corps.endpoint); } catch (e) { return json({ erreur: (e as Error).message }, 400); }
      const modele = String(corps.modele || "").trim() || MODELE;
      if (!/^[\w.:@\/-]{1,100}$/.test(modele)) return json({ erreur: "Nom de modèle invalide." }, 400);
      if (cle.length < 8) return json({ erreur: "Colle ta clé." }, 400);
      if (!endpoint && !/^sk-ant-/.test(cle)) return json({ erreur: "Ce n'est pas une clé Anthropic (elle commence par sk-ant-). Pour un autre service, remplis aussi l'adresse de l'API." }, 400);
      const essai = (bearer: boolean) => client({ cle, endpoint, modele, bearer }).messages.create({
        model: modele, max_tokens: 64, messages: [{ role: "user", content: "Réponds juste : OK" }],
      });
      let bearer = false;
      try { await essai(false); } catch (e) {
        if (!(e instanceof Anthropic.AuthenticationError) || !endpoint) return json({ erreur: erreurClaude(e) }, 400);
        try { await essai(true); bearer = true; } catch (e2) { return json({ erreur: erreurClaude(e2) }, 400); }
      }
      const { error } = await admin.from("cles_claude").upsert({ user_id: user.id, cle, endpoint, modele, bearer, maj: new Date().toISOString() });
      if (error) return json({ erreur: error.message }, 500);
      return json({ ok: true, endpoint, modele });
    }

    if (corps.action === "messages") {
      const { data: k } = await admin.from("cles_claude").select("cle, endpoint, modele, bearer").eq("user_id", user.id).maybeSingle();
      if (!k) return json({ erreur: "Connecte d'abord ton compte Claude (Plus → Réglages).", sans_cle: true }, 400);
      let blocs: any[];
      try { blocs = contenu(corps.contenu); } catch (e) { return json({ erreur: (e as Error).message }, 400); }
      const modele = k.modele || MODELE;
      const demande: any = {
        model: modele, max_tokens: Math.min(16000, Math.max(256, Number(corps.max_tokens) || 8000)),
        messages: [{ role: "user", content: blocs }],
        ...(typeof corps.system === "string" && corps.system ? { system: corps.system.slice(0, 20000) } : {}),
      };
      try {
        const c = client(k as Connexion);
        // Sur l'API Anthropic, un refus d'Opus passe à un autre modèle plutôt que d'échouer.
        const r: any = !k.endpoint && modele === "claude-opus-5-5"
          ? await c.beta.messages.create({ ...demande, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as any)
          : await c.messages.create(demande);
        if (r.stop_reason === "refusal") return json({ erreur: "Claude a refusé de répondre à cette demande." }, 400);
        const texte = (r.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        return json({ texte, modele: r.model, stop_reason: r.stop_reason });
      } catch (e) {
        return json({ erreur: erreurClaude(e) }, 502);
      }
    }
    return json({ erreur: "Action inconnue." }, 400);
  } catch (e) {
    return json({ erreur: (e as Error).message || String(e) }, 500);
  }
});
