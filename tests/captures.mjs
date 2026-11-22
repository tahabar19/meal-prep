// Captures de TOUS les écrans de l'appli, taille iPhone, page entière, avec le compte d'essai zz-essai
// (on ne fait que regarder : rien n'est enregistré). Pour voir ce qu'on veut changer dans l'interface.
//    node tests/captures.mjs [dossier]      (par défaut ~/Bureau/prep_meal/captures-appli ; MP_SITE pour une version locale)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const SITE = process.env.MP_SITE || 'https://tahabar19.github.io/meal-prep/';
const DOSSIER = process.argv[2] || join(homedir(), 'Bureau/prep_meal/captures-appli');
const MDP = readFileSync(join(homedir(), '.config/meal-prep/essai-mdp'), 'utf8').trim();
const LARGEUR = 390, HAUTEUR = 844;
const att = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(DOSSIER, { recursive: true });
for (const f of readdirSync(DOSSIER)) if (f.endsWith('.png')) unlinkSync(join(DOSSIER, f));

const prof = mkdtempSync(join(tmpdir(), 'mp-chrome-'));
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=9433', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
let cible; for (let i = 0; i < 50 && !cible; i++) { await att(300); try { cible = (await (await fetch('http://127.0.0.1:9433/json')).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(cible.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let n = 0; const attente = new Map(), erreurs = [];
ws.addEventListener('message', m => {
  const d = JSON.parse(m.data);
  if (d.id) attente.get(d.id)?.(d);
  if (d.method === 'Runtime.exceptionThrown') erreurs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
});
const cdp = (method, params = {}) => new Promise(r => { attente.set(++n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const js = async e => { const r = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'erreur JS'); return r.result.result.value; };
const ecran = (h = HAUTEUR) => cdp('Emulation.setDeviceMetricsOverride', { width: LARGEUR, height: h, deviceScaleFactor: 2, mobile: true });
const attendre = async (expr, max = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { try { if (await js(expr)) return true; } catch {} await att(150); } return false; };
await cdp('Runtime.enable');
await ecran();
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

let num = 0;
const faites = [];
// Page entière : l'écran est agrandi à la hauteur du contenu, la barre d'onglets reste donc tout en bas.
async function photo(nom, { entiere = true } = {}) {
  await att(500);
  if (entiere) {
    const h = await js(`Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, ${HAUTEUR})`);
    await ecran(Math.min(h, 12000)); await att(400);
  }
  const fichier = `${String(++num).padStart(2, '0')}-${nom}.png`;
  writeFileSync(join(DOSSIER, fichier), Buffer.from((await cdp('Page.captureScreenshot')).result.data, 'base64'));
  if (entiere) { await ecran(); await att(200); }
  faites.push(fichier); console.log('  ' + fichier);
}
const aller = async hash => { await js(`location.hash = ${JSON.stringify(hash)}`); await att(1200); await js('scrollTo(0, 0)'); };
const fermer = () => js(`(typeof fermerCarte === 'function' && fermerCarte(true), document.querySelectorAll('dialog[open]').forEach(d => d.close()), true)`);

try {
  // Écrans de connexion (avant d'être connecté)
  await cdp('Page.navigate', { url: SITE });
  if (await attendre(`!!document.getElementById('fConnexion')`, 60000)) {
    await photo('connexion', { entiere: false });
    if (await js(`(b => (b && b.click(), !!b))(document.querySelector('[data-action=oubliMdp]'))`)) { await att(600); await photo('mot-de-passe-oublie', { entiere: false }); await js(`document.querySelector('[data-action=versConnexion]')?.click()`); await att(400); }
    if (await js(`(b => (b && b.click(), !!b))(document.querySelector('[data-action=versCreation]'))`)) { await att(600); await photo('creer-un-compte'); await js(`document.querySelector('[data-action=versConnexion]')?.click()`); await att(400); }
    await js(`document.getElementById('ident').value = 'zz-essai'; document.getElementById('mdp').value = ${JSON.stringify(MDP)}; document.querySelector('#fConnexion [type=submit]').click()`);
  }
  if (!await attendre(`typeof M !== "undefined" && M.prete && typeof E !== "undefined" && E && document.querySelector('main h1, .grille-plats')`, 120000)) throw new Error("l'appli ne s'est pas ouverte");
  await att(1500);

  // Les onglets et les pages de « Plus »
  await aller('#/semaine'); await photo('jour-aujourdhui');
  await aller('#/semaine?d=1'); await photo('jour-demain');
  // La carte d'un plat (toucher un plat)
  const plat = await js(`(document.querySelector('a.repas[href^="#/plat/"]') || {}).getAttribute?.('href')`);
  if (plat) {
    await aller('#/semaine');
    await js(`document.querySelector('a.repas[href^="#/plat/"]').click()`); await att(1000);
    await photo('carte-d-un-plat', { entiere: false }); await fermer();
  }
  // La feuille « Ajouter un repas »
  await aller('#/semaine');
  if (await js(`(b => (b && b.click(), !!b))(document.querySelector('[data-action=noterRepas]'))`)) { await att(1200); await photo('ajouter-un-repas', { entiere: false }); await fermer(); }

  await aller('#/catalogue'); await photo('catalogue');
  for (const [q, nom] of [['jour', 'aujourdhui'], ['semaine', 'semaine'], ['mois', 'mois']]) { await aller(`#/avancement?p=${q}`); await photo(`avancement-${nom}`); }
  for (const c of ['poids', 'biceps', 'tour']) { await aller(`#/suivi?c=${c}`); await photo(`suivi-${c}`); }
    // (en mode flemmard, « cuisine » sans recette revient au Jour : sautée)
  let derniere = '';
  for (const v of ['historique', 'courses', 'cuisine', 'vitamines', 'stock', 'profil', 'reglages']) {
    await aller(`#/${v}`);
    const empreinte = await js(`location.hash.split('?')[0] + '|' + document.querySelector('main').innerText.slice(0, 400)`);
    if (empreinte.startsWith('#/semaine') || empreinte.split('|')[1] === derniere) { console.log(`  (${v} : même écran qu'une autre page, sautée)`); continue; }
    derniere = empreinte.split('|')[1]; await photo(v);
  }
  // Budget : l'icône n'est montrée qu'à Taha ; on regarde la page comme lui (rien n'est enregistré)
  await js(`(M.identVrai = M.ident, M.ident = 'taha', true)`); await aller('#/budget'); await photo('budget');
  await js(`(M.ident = M.identVrai, true)`); await aller('#/semaine');
  // Une recette en mode cuisine
  const recette = plat && plat.replace('#/plat/', '#/cuisine/');
  if (recette) { await aller(recette); await photo('recette-en-cuisine'); }
  // Contrôle : aucune clé Claude visible dans les Réglages
  await aller('#/reglages');
  if (await js(`/sk-ant-[A-Za-z0-9_-]{8}/.test(document.body.innerText + [...document.querySelectorAll('input')].map(i => i.value).join(' '))`)) console.log('  ATTENTION : une clé est visible dans les Réglages');
} finally {
  if (erreurs.length) console.log('Erreurs JavaScript :\n  ' + [...new Set(erreurs)].join('\n  ').slice(0, 1500));
  console.log(`${faites.length} captures dans ${DOSSIER}`);
  chrome.kill(); try { rmSync(prof, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
