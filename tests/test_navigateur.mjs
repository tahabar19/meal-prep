// Tests FONCTIONNELS de bout en bout : un vrai Chrome (sans fenêtre, taille iPhone) sur le site en ligne,
// avec le compte d'essai zz-essai. Le compte est sauvé avant et remis en état après (tests/compte_essai.py).
//    node tests/test_navigateur.mjs                (MP_SITE=http://127.0.0.1:8790/ pour essayer une version locale)
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SITE = process.env.MP_SITE || 'https://tahabar19.github.io/meal-prep/';
const CAPTURES = process.env.MP_CAPTURES || join(tmpdir(), 'mp-captures');
const PY = join(homedir(), 'jarvis/jarvis-assistant-vocal/.venv/bin/python');
const MDP = readFileSync(join(homedir(), '.config/meal-prep/essai-mdp'), 'utf8').trim();
const att = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(CAPTURES, { recursive: true });

// ---------------------------------------------------------------- Chrome
async function ouvrir(port = 9431) {
  const prof = mkdtempSync(join(tmpdir(), 'mp-chrome-'));
  const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let cible; for (let i = 0; i < 50 && !cible; i++) { await att(300); try { cible = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {} }
  const ws = new WebSocket(cible.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let n = 0; const attente = new Map(); const erreurs = [], consoleErreurs = [];
  ws.addEventListener('message', m => {
    const d = JSON.parse(m.data);
    if (d.id) attente.get(d.id)?.(d);
    if (d.method === 'Runtime.exceptionThrown') erreurs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consoleErreurs.push(d.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
  });
  const cdp = (method, params = {}) => new Promise(r => { attente.set(++n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const js = async e => { const r = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'erreur JS'); return r.result.result.value; };
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const photo = async nom => writeFileSync(join(CAPTURES, nom + '.png'), Buffer.from((await cdp('Page.captureScreenshot')).result.data, 'base64'));
  return { cdp, js, photo, erreurs, consoleErreurs, fin: () => { chrome.kill(); try { rmSync(prof, { recursive: true, force: true }); } catch {} } };
}

// ---------------------------------------------------------------- petits outils
const resultats = [];
let B;
const attendre = async (expr, max = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { try { if (await B.js(expr)) return Date.now() - t0; } catch {} await att(120); } return -1; };
const toast = async (max = 20000) => { await attendre(`document.getElementById('toast') && document.getElementById('toast').textContent.trim()`, max); return B.js(`document.getElementById('toast').textContent.trim()`); };
const viderToast = () => B.js(`document.getElementById('toast') && (document.getElementById('toast').textContent = '')`);
const vrai = (cond, message) => { if (!cond) throw new Error(message); };
const synchro = () => B.js(`(async () => { await M.file; await new Promise(r => setTimeout(r, 300)); await M.file; return true; })()`);
const pret = () => attendre(`typeof M !== "undefined" && M.prete && typeof E !== "undefined" && E && document.querySelector('main h1, .grille-plats')`, 90000);
const aller = async hash => { await B.js(`location.hash = ${JSON.stringify(hash)}`); await att(700); };
const debordement = () => B.js(`document.documentElement.scrollWidth - window.innerWidth`);
const fermerCarte = () => B.js(`typeof fermerCarte === 'function' && fermerCarte(true)`);

async function test(nom, f) {
  const t0 = Date.now(), avant = B.erreurs.length;
  try {
    await f();
    vrai(B.erreurs.length === avant, `erreur JavaScript : ${B.erreurs.slice(avant).join(' | ').slice(0, 300)}`);
    resultats.push({ nom, ok: true, ms: Date.now() - t0 });
    console.log(`  ok    ${nom} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    resultats.push({ nom, ok: false, ms: Date.now() - t0, erreur: e.message });
    console.log(`  ÉCHEC ${nom} : ${e.message}`);
    try { await B.photo('echec-' + nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase()); } catch {}
    try { await fermerCarte(); await B.js(`document.querySelectorAll('dialog[open]').forEach(d => d.close())`); } catch {}
  }
}

async function connexion(mdp = MDP) {
  await B.cdp('Page.navigate', { url: SITE });
  vrai(await attendre(`!!document.getElementById('fConnexion') || (typeof M !== "undefined" && M.prete)`, 60000) >= 0, "ni écran de connexion ni appli");
  if (await B.js(`!!document.getElementById('fConnexion')`)) {
    await B.js(`document.getElementById('ident').value = 'zz-essai'; document.getElementById('mdp').value = ${JSON.stringify(mdp)}; document.querySelector('#fConnexion [type=submit]').click()`);
  }
}

// ---------------------------------------------------------------- les scénarios
const sauvegarde = join(tmpdir(), `mp-zz-essai-${Date.now()}.json`);
console.log(execFileSync(PY, [join(ICI, 'compte_essai.py'), 'sauver', sauvegarde]).toString().trim());
B = await ouvrir();
try {
  await test('Connexion refusée avec un mauvais mot de passe', async () => {
    await connexion('mauvais-mot-de-passe');
    vrai(await attendre(`(document.querySelector('#fConnexion .erreur, #fConnexion [role=alert]') || {}).textContent`, 20000) >= 0, "aucun message d'erreur");
    vrai(await B.js(`!!document.getElementById('fConnexion')`), "l'appli s'est ouverte");
  });

  await test('Connexion et écran Jour', async () => {
    const t0 = Date.now();
    await connexion();
    vrai(await attendre(`document.querySelector('.grille-plats a.repas')`, 90000) >= 0, "les plats du jour n'apparaissent pas");
    const premier = Date.now() - t0;
    vrai(await pret() >= 0, "le moteur n'est pas prêt");
    console.log(`        plats affichés en ${(premier / 1000).toFixed(1)} s, moteur prêt en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    vrai(premier < 30000, `trop lent : ${premier} ms`);
    await B.photo('jour');
  });

  for (const [hash, titre] of [['#/semaine', null], ['#/catalogue', 'Catalogue'], ['#/avancement', 'Avancement'], ['#/vitamines', 'Vitamines'], ['#/suivi', 'Suivi'], ['#/profil', null]]) {
    await test(`Onglet ${hash} s'affiche sans déborder`, async () => {
      await aller(hash);
      vrai(await attendre(`document.querySelector('main h1')`, 15000) >= 0, 'pas de titre');
      if (titre) vrai((await B.js(`document.querySelector('main h1').textContent`)).toLowerCase().includes(titre.toLowerCase()), `titre inattendu`);
      const d = await debordement();
      vrai(d <= 1, `la page déborde de ${d} px sur un téléphone`);
      await B.photo('onglet-' + hash.slice(2));
    });
  }

  await test('Barre d\'onglets et bouton Profil', async () => {
    await aller('#/semaine');
    const onglets = await B.js(`[...document.querySelectorAll('nav a, .onglets a')].map(a => a.textContent.trim()).filter(Boolean).join('|')`);
    for (const o of ['Jour', 'Catalogue', 'Avancement', 'Vitamines', 'Suivi']) vrai(onglets.includes(o), `onglet ${o} absent`);
    vrai(await B.js(`(document.getElementById('enteteProfil') || {}).textContent || ''`).then(t => t.includes('Profil')), 'bouton Profil absent');
  });

  await test('Changer de jour (Aujourd\'hui, Demain, suivants)', async () => {
    await aller('#/semaine?d=1');
    vrai(await attendre(`(document.querySelector('main h1') || {}).textContent === 'Demain'`, 10000) >= 0, 'Demain ne s\'affiche pas');
    vrai(await B.js(`document.querySelectorAll('.grille-plats a.repas').length`) > 0, 'aucun plat demain');
    await aller('#/semaine');
    vrai(await attendre(`(document.querySelector('main h1') || {}).textContent === "Aujourd'hui"`, 10000) >= 0, 'retour à aujourd\'hui impossible');
  });

  await test('Marquer un plat mangé, puis pas encore mangé', async () => {
    await aller('#/semaine');
    const i = await B.js(`[...document.querySelectorAll('.grille-plats .repas-ligne')].findIndex(x => !x.classList.contains('cuisine-fait'))`);
    vrai(i >= 0, 'aucun plat à marquer');
    const ligne = `document.querySelectorAll('.grille-plats .repas-ligne')[${i}]`;
    await B.js(`${ligne}.querySelector('a.repas').click()`);
    vrai(await attendre(`document.querySelector('.carte-plat [data-action=manger]')`, 10000) >= 0, 'pas de bouton « J\'ai mangé »');
    await B.js(`document.querySelector('.carte-plat [data-action=manger]').click()`);
    vrai(await attendre(`${ligne}.classList.contains('cuisine-fait')`, 20000) >= 0, 'le plat n\'est pas grisé');
    await B.js(`${ligne}.querySelector('a.repas').click()`);
    vrai(await attendre(`(document.querySelector('.carte-plat [data-action=manger]') || {}).textContent.includes('Pas encore')`, 10000) >= 0, 'pas de « Pas encore mangé »');
    await B.js(`document.querySelector('.carte-plat [data-action=manger]').click()`);
    vrai(await attendre(`!${ligne}.classList.contains('cuisine-fait')`, 20000) >= 0, 'le plat reste grisé');
  });

  // le smoothie d'essai a un ingrédient retiré (carotte à 0) : le cas qui divisait le plat par deux
  const kcalPlat = motif => B.js(`(() => { const l = [...document.querySelectorAll('.grille-plats .repas-ligne')].find(x => ${motif}.test(x.textContent)); return l ? parseInt(l.textContent.match(/(\\d+) kcal/)[1]) : null; })()`);
  const ouvrirPlat = motif => B.js(`[...document.querySelectorAll('.grille-plats a.repas')].find(a => ${motif}.test(a.textContent)).click()`);
  await test('Quantité ×1,5 puis retour, ingrédient retiré compris', async () => {
    await aller('#/semaine');
    const avant = await kcalPlat('/smoothie/i');
    vrai(avant > 0, 'pas de smoothie aujourd\'hui');
    await ouvrirPlat('/smoothie/i');
    vrai(await attendre(`document.querySelector('.cp-quantite b')`, 10000) >= 0, 'pas de réglage de quantité');
    const x = await B.js(`document.querySelector('.cp-quantite b').textContent`);
    vrai(x !== '×0', 'la quantité affiche ×0');
    await viderToast();
    await B.js(`document.querySelector('.cp-quantite [aria-label=Plus]').click()`);
    await toast(); await att(500);
    const plus = await kcalPlat('/smoothie/i');
    const attendu = avant * (parseFloat(x.slice(1).replace(',', '.')) + 0.5) / parseFloat(x.slice(1).replace(',', '.'));
    vrai(Math.abs(plus - attendu) <= 0.04 * attendu + 3, `${x} → +0,5 : ${avant} → ${plus} kcal (attendu ~${Math.round(attendu)})`);
    await ouvrirPlat('/smoothie/i');
    await attendre(`document.querySelector('.cp-quantite b')`, 10000);
    await viderToast();
    await B.js(`document.querySelector('.cp-quantite [aria-label=Moins]').click()`);
    await toast(); await att(500);
    const retour = await kcalPlat('/smoothie/i');
    vrai(Math.abs(retour - avant) <= 3, `retour : ${retour} au lieu de ${avant} kcal`);
  });

  await test('Modifier les ingrédients : poubelle et ↺', async () => {
    await aller('#/semaine');
    const i = await B.js(`[...document.querySelectorAll('.grille-plats a.repas')].findIndex(a => /smoothie/i.test(a.textContent))`);
    await B.js(`document.querySelectorAll('.grille-plats a.repas')[${Math.max(i, 0)}].click()`);
    vrai(await attendre(`document.querySelector('.cp-choix [data-action=ajusterJour]')`, 10000) >= 0, 'pas de « Modifier les ingrédients »');
    await B.js(`document.querySelector('.cp-choix [data-action=ajusterJour]').click()`);
    vrai(await attendre(`document.querySelectorAll('.ing-poubelle').length > 1`, 20000) >= 0, 'pas de poubelles');
    const kcal = () => B.js(`parseInt((document.querySelector('#dialogue b') || {}).textContent.replace(/\\s/g, ''))`);
    const avant = await kcal();
    // le premier ingrédient encore présent : on le jette, puis ↺ doit le remettre à sa quantité d'avant
    const nom = await B.js(`document.querySelector('.ing-poubelle').closest('li').querySelector('label').firstChild.textContent.trim()`);
    const ligne = `[...document.querySelectorAll('.reglables > li')].find(l => l.querySelector('label') && l.querySelector('label').firstChild.textContent.trim() === ${JSON.stringify(nom)})`;
    await B.js(`document.querySelector('.ing-poubelle').click()`);
    vrai(await attendre(`${ligne} && ${ligne}.classList.contains('retire')`, 15000) >= 0, `« ${nom} » n'est pas barré`);
    const apres = await kcal();
    vrai(apres < avant, `sans « ${nom} » : calories ${avant} → ${apres}`);
    await B.js(`${ligne}.querySelector('.ing-remettre').click()`);
    vrai(await attendre(`${ligne} && !${ligne}.classList.contains('retire')`, 15000) >= 0, '↺ ne remet pas');
    vrai(await kcal() === avant, `les calories ne reviennent pas (${avant} → ${await kcal()})`);
    await B.js(`document.querySelector('#dialogue [value=non]').click()`);
  });

  await test('Eau : la barre enregistre et tient après rechargement', async () => {
    await aller('#/semaine');
    vrai(await attendre(`document.getElementById('eauBarre')`, 10000) >= 0, 'pas de barre d\'eau');
    await B.js(`(() => { const b = document.getElementById('eauBarre'); b.value = '1.75'; b.dispatchEvent(new Event('input', { bubbles: true })); b.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await att(800); await synchro();
    await B.cdp('Page.reload'); await pret(); await aller('#/semaine');
    vrai(await attendre(`document.getElementById('eauBarre')`, 15000) >= 0, 'barre absente après rechargement');
    const v = await B.js(`document.getElementById('eauBarre').value`);
    vrai(Number(v) === 1.75, `après rechargement : ${v} L au lieu de 1,75`);
  });

  await test('Vitamines : seulement aujourd\'hui, liste « À compléter »', async () => {
    await aller('#/vitamines');
    vrai(await attendre(`document.querySelector('main h1')`, 10000) >= 0, 'pas de titre');
    vrai(!(await B.js(`!!document.querySelector('main a[href*="p=semaine"], main a[href*="p=mois"]')`)), 'les périodes semaine/mois sont encore là');
    // les jours d'avant : ‹ pour hier, puis › pour revenir (Taha, 20/11/2026)
    const hier = await B.js(`(document.querySelector('.jours-vitamines a.fleche[aria-label="Jour d\\'avant"]') || {}).hash || ''`);
    vrai(await B.js(`!!document.querySelector('#vitDate[type=date]')`), 'pas de calendrier sur la date');
    if (hier) {
      await aller(hier);
      vrai(await B.js(`!!document.querySelector('.jours-vitamines a.fleche[href="#/vitamines"]')`), 'pas de › pour revenir à aujourd\'hui');
      await aller('#/vitamines');
    }
    if (await B.js(`E.claude === false && E.vitamines_a_completer.length > 0`))
      vrai(await B.js(`!!document.querySelector('.a-completer')`), 'sans compte Claude, « À compléter » doit apparaître');
  });

  await test('Avancement : courbe et périodes', async () => {
    await aller('#/avancement?p=semaine');
    vrai(await attendre(`document.querySelector('#gMange svg path, #gMange svg polyline')`, 10000) >= 0, 'pas de courbe');
    await aller('#/avancement?p=mois');
    vrai(await attendre(`document.querySelector('main h1')`, 10000) >= 0, 'mois ne s\'affiche pas');
  });

  await test('Catalogue : grille, recherche, fiche', async () => {
    await aller('#/catalogue');
    const n = await B.js(`document.querySelectorAll('.catalogue a.repas').length`);
    vrai(n > 10, `${n} plats seulement`);
    const colonnes = await B.js(`getComputedStyle(document.querySelector('.catalogue')).gridTemplateColumns.split(' ').length`);
    vrai(colonnes === 3, `${colonnes} colonnes au lieu de 3`);
    await B.js(`(() => { const f = document.getElementById('filtre'); f.value = 'poulet'; f.dispatchEvent(new Event('input', { bubbles: true })); })()`); await att(700);
    const m = await B.js(`document.querySelectorAll('.catalogue a.repas').length`);
    vrai(m > 0 && m < n, `recherche « poulet » : ${m} plats`);
    await B.js(`document.querySelector('.catalogue a.repas').click()`);
    vrai(await attendre(`document.querySelector('.carte-plat h2, #cpTitre')`, 10000) >= 0, 'la fiche ne s\'ouvre pas');
    await fermerCarte();
    await B.js(`(() => { const f = document.getElementById('filtre'); f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  });

  await test('Suivi : une mesure s\'enregistre', async () => {
    await aller('#/suivi');
    vrai(await attendre(`document.getElementById('formSuivi')`, 10000) >= 0, 'pas de formulaire');
    await viderToast();
    await B.js(`(() => { const f = document.getElementById('formSuivi'); f.querySelector('[name=poids], #poids').value = '78,1'; f.querySelector('[type=submit]').click(); })()`);
    const t = await toast();
    vrai(!/impossible|erreur/i.test(t), `message : ${t}`);
    await synchro();
    vrai(await B.js(`E.suivi.some(x => x.poids === 78.1)`), 'la mesure n\'est pas dans les données');
  });

  await test('Réglages : blocs présents', async () => {
    await aller('#/profil');
    const t = await B.js(`document.querySelector('main').textContent`);
    for (const mot of ['objectif', 'Claude', 'compte']) vrai(new RegExp(mot, 'i').test(t), `« ${mot} » absent de Profil/Réglages`);
  });

  await test('Réouverture rapide (dernière journée gardée)', async () => {
    await aller('#/semaine');
    const t0 = Date.now();
    await B.cdp('Page.reload');
    vrai(await attendre(`document.querySelector('.grille-plats a.repas')`, 30000) >= 0, 'pas de plats');
    const ms = Date.now() - t0;
    console.log(`        plats affichés en ${(ms / 1000).toFixed(1)} s à la réouverture`);
    vrai(ms < 8000, `réouverture lente : ${ms} ms`);
    await pret();
  });

  await test('Déconnexion', async () => {
    await aller('#/profil');
    await B.js(`document.querySelector('[data-action=deconnexion]').click()`); await att(400);
    await B.js(`document.querySelector('#dialogue [type=submit], #dialogue [value=oui]').click()`);
    vrai(await attendre(`!!document.getElementById('fConnexion')`, 20000) >= 0, 'l\'écran de connexion ne revient pas');
  });

  await test('Aucune erreur dans la console', async () => {
    const e = B.consoleErreurs.filter(x => !/favicon|ERR_INTERNET|Failed to load resource/i.test(x));
    vrai(e.length === 0, e.slice(0, 3).join(' | '));
  });
} finally {
  B.fin();
  console.log(execFileSync(PY, [join(ICI, 'compte_essai.py'), 'restaurer', sauvegarde]).toString().trim());
  rmSync(sauvegarde, { force: true });
}

const echecs = resultats.filter(r => !r.ok);
writeFileSync(join(CAPTURES, 'resultats.json'), JSON.stringify(resultats, null, 1));
console.log(`\n${resultats.length - echecs.length}/${resultats.length} réussis. Captures : ${CAPTURES}`);
process.exit(echecs.length ? 1 : 0);
