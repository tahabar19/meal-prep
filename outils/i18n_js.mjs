// Les littéraux d'un fichier JavaScript, lus par acorn (un vrai analyseur) : [["str", texte] | ["tpl", [morceaux]]].
// Utilisé par i18n_extraire.py. ACORN : chemin du module acorn (sinon cherché à quelques endroits connus).
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
const essais = [process.env.ACORN, `${process.env.HOME}/.hermes/hermes-agent/node_modules/acorn/dist/acorn.mjs`,
  `${process.env.HOME}/Bureau/chaine-video/node_modules/.pnpm/acorn@8.19.0/node_modules/acorn/dist/acorn.mjs`].filter(Boolean);
const chemin = essais.find(existsSync);
if (!chemin) { console.error("acorn introuvable : ACORN=/chemin/acorn.mjs"); process.exit(1); }
const acorn = await import(pathToFileURL(chemin).href);
const src = readFileSync(process.argv[2], "utf8");
const arbre = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script", allowHashBang: true });
const out = [];
(function marcher(n) {
  if (!n || typeof n.type !== "string") return;
  if (n.type === "Literal" && typeof n.value === "string") out.push(["str", n.value]);
  if (n.type === "TemplateLiteral") out.push(["tpl", n.quasis.map(q => q.value.cooked ?? q.value.raw)]);
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (Array.isArray(v)) v.forEach(marcher); else if (v && typeof v.type === "string") marcher(v);
  }
})(arbre);
process.stdout.write(JSON.stringify(out));
