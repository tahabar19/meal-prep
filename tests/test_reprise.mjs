// Reprise d'un appel à l'IA après une coupure (27/11/2026) : le Worker (moteur.js) sans Pyodide, avec un faux
// XMLHttpRequest qui coupe, répond 504 ou « calcule encore », puis répond. La MÊME demande doit repartir.
//    node tests/test_reprise.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code = readFileSync(process.env.HOME + '/Bureau/meal-prep/app/moteur.js', 'utf8');
const envois = [], messages = [];
let scenario = [];
class FauxXHR {
  open(m, u, a) { this.u = u; this.sync = a === false; }
  setRequestHeader() {}
  send(corps) {
    const quoi = scenario.shift() || 'ok';
    envois.push(JSON.parse(corps).demande);
    if (quoi === 'coupe') { const e = new Error('Network'); e.name = 'NetworkError'; throw e; }
    if (quoi === '504') { this.status = 504; this.responseText = '<html>gateway</html>'; return; }
    if (quoi === 'encore') { this.status = 409; this.responseText = '{"erreur":"L\'IA calcule encore","encore":true}'; return; }
    this.status = 200; this.responseText = '{"texte":"{\\"items\\":[]}"}';
  }
}
let echecs = 0;
const ctx = { self: {}, importScripts() {}, XMLHttpRequest: FauxXHR, postMessage: (m) => messages.push(m), console, Date, Math, JSON, crypto: globalThis.crypto };
ctx.self = ctx; ctx.self.crypto = globalThis.crypto; ctx.self.postMessage = ctx.postMessage;
vm.createContext(ctx);
vm.runInContext(code + '\nthis.versFonction = versFonction; this.cfgPoser = (c) => { cfg = c; };', ctx);
ctx.cfgPoser({ url: 'https://x.supabase.co', anon: 'a', jeton: 'j' });
for (const [nom, sc] of [['coupure puis réponse', ['coupe', 'ok']], ['504 puis réponse', ['504', 'ok']], ['encore puis réponse', ['encore', 'ok']], ['4 coupures', ['coupe', 'coupe', 'coupe', 'coupe']], ['tout va bien', ['ok']]]) {
  envois.length = 0; messages.length = 0; scenario = [...sc];
  const t0 = Date.now(); const r = ctx.versFonction('messages', { contenu: [] });
  const attendu = nom === '4 coupures' ? [4, /La connexion a coupé/, "Appel à l'IA coupé"] : nom === 'tout va bien' ? [1, /items/, ''] : [2, /items/, "Appel à l'IA repris après une coupure"];
  const ok = envois.length === attendu[0] && new Set(envois).size === 1 && attendu[1].test(r) && messages.map(m => m.journal.titre).join(', ') === attendu[2];
  if (!ok) echecs++;
  console.log((ok ? '  ok    ' : '  ÉCHEC ') + nom.padEnd(22), '| essais :', envois.length, '| journal :', messages.map(m => m.journal.titre).join(', ') || '—', `| ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
process.exit(echecs ? 1 : 0);
