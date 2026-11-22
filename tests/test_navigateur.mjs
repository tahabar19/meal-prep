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

  await test('Changer de jour (Aujourd\'hui, Demain, rien après)', async () => {
    await aller('#/semaine?d=1');
    vrai(await attendre(`(document.querySelector('main h1') || {}).textContent === 'Demain'`, 10000) >= 0, 'Demain ne s\'affiche pas');
    vrai(await B.js(`document.querySelectorAll('.grille-plats a.repas').length`) > 0, 'aucun plat demain');
    // le jour se calcule à J-1 (Taha, 20/11/2026) : rien après demain
    vrai(!(await B.js(`!!document.querySelector('.jours-suivi a.fleche[aria-label="Jour suivant"]')`)), 'des jours après demain sont proposés');
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
  // Taha, 21/11/2026 : revenir sur les jours d'avant, voir les ingrédients, régler la quantité en voyant les chiffres bouger.
  await test('Jours d\'avant : Hier, puis retour', async () => {
    await aller('#/semaine?d=-1');
    vrai(await attendre(`(document.querySelector('main h1') || {}).textContent === 'Hier'`, 10000) >= 0, 'Hier ne s\'affiche pas');
    vrai(await B.js(`!!document.querySelector('.jours-suivi a.fleche[aria-label^="Jour d"]')`), 'pas de flèche vers le jour d\'avant');
    vrai(await B.js(`!!document.querySelector('.grille-plats, .dujour')`), 'ni plats ni message pour hier');
    const d = await debordement();
    vrai(d <= 1, `la page déborde de ${d} px`);
    await B.photo('hier');
    await aller('#/semaine?d=-3');
    vrai(await attendre(`!!document.querySelector('.jours-suivi a.fleche[aria-label="Jour suivant"]')`, 10000) >= 0, 'pas de flèche vers le jour suivant');
    await aller('#/semaine');
  });

  // Taha, 22/11/2026 : plus de barre « Quantité » sur la carte (Modifier les ingrédients suffit), et pas de défilement.
  await test('Carte d\'un plat : ingrédients, sans barre de quantité, sans défiler', async () => {
    await aller('#/semaine');
    await B.js(`document.querySelector('.grille-plats a.repas').click()`);
    vrai(await attendre(`document.querySelectorAll('.carte-plat .cp-ingredients li').length > 0`, 10000) >= 0, 'pas d\'ingrédients sur la carte');
    vrai(await B.js(`!document.querySelector('.carte-plat .cp-quantite')`), 'la barre Quantité est encore là');
    await att(500);
    const d = await B.js(`(() => { const c = document.querySelector('.carte-plat'); return c.scrollHeight - c.clientHeight; })()`);
    console.log(`        carte : ${await B.js(`document.querySelector('.carte-plat').scrollHeight`)} px de haut`);
    vrai(d <= 1, `la carte défile de ${d} px`);
    await B.photo('carte-plat');
    await fermerCarte();
  });

  await test('Choisir un plat : ingrédients et quantité avant de valider', async () => {
    await aller('#/semaine');
    await B.js(`document.querySelector('.grille-plats a.repas').click()`);
    vrai(await attendre(`document.querySelector('.carte-plat [data-action=changer]')`, 10000) >= 0, 'pas de bouton Remplacer');
    await B.js(`document.querySelector('.carte-plat [data-action=changer]').click()`);
    vrai(await attendre(`document.querySelectorAll('#dialogue .rp-plat').length > 0`, 10000) >= 0, 'pas de plats proposés');
    await B.js(`document.querySelector('#dialogue .rp-plat').click()`);
    vrai(await attendre(`document.querySelector('#dialogue [data-ensemble], #dialogue #apIng li')`, 20000) >= 0, 'pas d\'aperçu');
    if (await B.js(`!!document.querySelector('#dialogue [data-ensemble]')`)) {
      await B.js(`document.querySelector('#dialogue [data-ensemble="0"]').click()`);
      vrai(await attendre(`document.querySelector('#dialogue #apIng li')`, 20000) >= 0, 'pas d\'ingrédients dans l\'aperçu');
    }
    const avant = await B.js(`document.getElementById('apEcarts').textContent + document.getElementById('apMacros').textContent`);
    await B.js(`document.querySelector('#dialogue [data-ap-fois="0.5"]').click()`);
    vrai(await B.js(`document.getElementById('apFois').textContent`) === '×1,5', 'la quantité ne passe pas à ×1,5');
    vrai(await B.js(`document.getElementById('apEcarts').textContent + document.getElementById('apMacros').textContent`) !== avant, 'les chiffres ne bougent pas');
    await B.photo('choisir-quantite');
    await B.js(`document.getElementById('dialogue').close()`);                // rien n'est enregistré
  });

  await test('Carte d\'un plat : « Retirer ce repas » au-dessus d\'« Équilibrer »', async () => {
    await aller('#/semaine');
    await B.js(`document.querySelector('.grille-plats .repas-ligne:not(.cuisine-fait) a.repas').click()`);
    vrai(await attendre(`document.querySelector('.carte-plat .cp-equilibrer [data-action=retirerRepas]')`, 10000) >= 0, 'pas de bouton Retirer ce repas');
    vrai(await B.js(`(() => { const b = [...document.querySelectorAll('.carte-plat .cp-equilibrer .bouton')]; const r = b.find(x => x.dataset.action === 'retirerRepas');
      return b.every(x => x === r || x.getBoundingClientRect().top > r.getBoundingClientRect().bottom - 1); })()`), 'Retirer n\'est pas au-dessus des autres boutons');
    await B.photo('carte-retirer');
    await B.js(`document.querySelector('.carte-plat [data-action=retirerRepas]').click()`);
    vrai(await attendre(`/Retirer/.test((document.getElementById('dialogueTitre') || {}).textContent || '')`, 20000) >= 0, 'pas d\'aperçu du retrait');
    await B.js(`document.getElementById('dialogue').close()`);                // rien n'est enregistré
  });

  await test('Remplacer un plat : compact, un champ IA, pas de filtres, retour', async () => {
    await aller('#/semaine');
    await B.js(`document.querySelector('.grille-plats .repas-ligne:not(.cuisine-fait) a.repas').click()`);
    vrai(await attendre(`document.querySelector('.carte-plat [data-action=changer]')`, 10000) >= 0, 'pas de bouton Remplacer');
    await B.js(`document.querySelector('.carte-plat [data-action=changer]').click()`);
    vrai(await attendre(`document.querySelectorAll('#rpListe .rp-plat').length > 0`, 10000) >= 0, 'pas de plats proposés');
    vrai(await B.js(`!document.querySelector('.rp [data-retirer], .rp [data-perso], .rp [data-filtre], .rp [data-type], .rp-raccourcis')`), 'il reste Retirer, Mon propre plat ou des filtres');
    vrai(await B.js(`!document.querySelector('.rp [data-ajuster], .rp-modifier')`), 'il reste « Modifier » sur le plat');
    vrai(await B.js(`document.querySelector('#rpListe .rp-plat').getBoundingClientRect().height`) <= 80, 'les lignes de plats sont trop hautes');
    await B.photo('remplacer');
    // le tri, dans un menu
    await B.js(`(() => { const t = document.getElementById('rpTri'); t.value = 'leger'; t.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const kcal = await B.js(`[...document.querySelectorAll('#rpListe .rp-macros strong')].filter((_, i) => i % 2 === 0).slice(0, 5).map(x => +x.textContent.replace(/\\D/g, ''))`);
    vrai(kcal.every((v, i) => !i || v >= kcal[i - 1]), `« Plus léger » mal trié : ${kcal}`);
    // le champ IA : cherche dans tous les plats et propose de créer le plat
    await B.js(`(() => { const i = document.getElementById('chPlat'); i.value = 'poulet'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    vrai(await B.js(`document.querySelectorAll('#rpListe .rp-plat').length`) > 0, 'aucun plat au poulet');
    vrai(await B.js(`!!document.querySelector('#rpIA [data-ia]')`), 'pas de « Créer avec l\'IA »');
    vrai(await B.js(`!document.getElementById('rpEffacer').hidden`), 'pas de bouton pour effacer');
    await B.photo('remplacer-recherche');
    // aperçu puis Retour : la recherche est gardée
    await B.js(`document.querySelector('#rpListe .rp-plat').click()`);
    if (await attendre(`document.querySelector('#dialogue [data-ensemble], #dialogue [value=non]') && !document.getElementById('rpListe')`, 20000) >= 0) {
      await B.js(`document.querySelector('#dialogue [value=non]').click()`);
      vrai(await attendre(`document.getElementById('chPlat') && document.getElementById('chPlat').value === 'poulet'`, 10000) >= 0, 'la recherche est perdue au retour');
    }
    // Créer avec l'IA : l'IA calcule (ou, sans Claude, les ingrédients à la main), et Retour revient ici
    await B.js(`(() => { const i = document.getElementById('chPlat'); i.value = '2 oeufs et 70 g de pain pita'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await B.js(`document.querySelector('#rpIA [data-ia]').click()`);
    vrai(await attendre(`!document.getElementById('rpListe')`, 5000) >= 0, '« Créer avec l\'IA » ne fait rien');
    vrai(await attendre(`document.getElementById('nrItems') || document.getElementById('ppIng')`, 90000) >= 0, 'ni vérification de l\'IA ni saisie à la main');
    const ia = await B.js(`document.getElementById('nrItems') ? 'IA' : 'à la main'`);
    console.log('        créer avec l\'IA : ' + ia);
    await B.photo('remplacer-ia');
    vrai(await B.js(`document.documentElement.scrollWidth - window.innerWidth`) <= 1, 'la page déborde');
    await B.js(`document.getElementById('dialogue').close()`);                // rien n'est enregistré
  });

  await test('Vitamines : le besoin d\'un jour est écrit', async () => {
    await aller('#/vitamines');
    vrai(await attendre(`document.querySelector('main h1')`, 10000) >= 0, 'pas de page');
    if (await B.js(`!!document.querySelector('.barres .v')`)) {
      vrai(await B.js(`document.querySelector('.barres .v').textContent.includes('/')`), 'le besoin par jour n\'est pas écrit');
      vrai(await B.js(`!!document.querySelector('.barres-legende')`), 'pas de légende');
    }
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
    // ajouter : tous les ingrédients connus se trouvent en tapant ; un inconnu se crée avec l'IA (21/11/2026)
    vrai(!(await B.js(`!!document.querySelector('#dialogue datalist')`)), 'encore la liste limitée (datalist)');
    const taper = t => B.js(`(() => { const i = document.getElementById('ajNouveau'); i.value = ${JSON.stringify(t)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await taper('riz');
    vrai(await B.js(`document.querySelectorAll('#ajSuggestions [data-ing]').length`) > 0, 'rien pour « riz »');
    vrai(await B.js(`[...document.querySelectorAll('#ajSuggestions [data-ing]')].every(b => /riz/i.test(b.textContent))`), 'des ingrédients sans « riz »');
    await taper('licorne des bois');
    vrai(await B.js(`!!document.querySelector('#ajSuggestions [data-ing-ia]')`), 'pas de « Créer avec l\'IA » pour un inconnu');
    await B.js(`document.getElementById('ajNouveau').scrollIntoView({ block: 'start' })`);
    await B.photo('ingredients-recherche');
    await taper('riz');
    const ajoute = await B.js(`document.querySelector('#ajSuggestions [data-ing]').textContent.trim()`);
    const nb = await B.js(`document.querySelectorAll('.reglables > li').length`);
    await B.js(`document.querySelector('#ajSuggestions [data-ing]').click()`);
    vrai(await attendre(`document.querySelectorAll('.reglables > li').length === ${nb + 1}`, 15000) >= 0, `« ${ajoute} » n'est pas ajouté`);
    await B.js(`document.querySelector('#dialogue [value=non]').click()`);
  });

  await test('Ajouter un repas : pas de Matin / Midi / Soir à choisir', async () => {
    await aller('#/semaine');
    await B.js(`document.querySelector('[data-action=noterRepas]').click()`);
    vrai(await attendre(`document.getElementById('nrTexte')`, 10000) >= 0, 'pas de saisie');
    vrai(!(await B.js(`!!document.querySelector('#dialogue [data-moment]')`)), 'les tags Matin / Midi / Soir sont encore là');
    await B.js(`document.getElementById('dialogue').close()`);
  });

  await test('Historique : « Manger aujourd\'hui » sur les plats', async () => {
    await aller('#/historique');
    vrai(await attendre(`document.querySelector('main h1')`, 10000) >= 0, 'pas d\'historique');
    if (!(await B.js(`!!document.querySelector('.jour-histo .histo-plats')`))) return console.log('        (pas de plat dans l\'historique du compte d\'essai)');
    await B.js(`document.querySelector('.jour-histo').open = true`);
    vrai(await B.js(`!!document.querySelector('.jour-histo .histo-manger')`), 'pas de bouton « Manger aujourd\'hui »');
    await B.photo('historique-manger');
    // un plat qui n'est pas déjà au menu aujourd'hui (sinon l'appli le dit, sans aperçu)
    const ok = await B.js(`(() => { const auj = new Set([...document.querySelectorAll('.jour-histo')].length && E.semaine ? (() => { const x = semainePourDate(E.journal_repas.aujourdhui); return x ? [x.s.jours[x.n].pdj, x.s.jours[x.n].dej, x.s.jours[x.n].din, ...x.s.jours[x.n].collations] : []; })() : []);
      document.querySelectorAll('.jour-histo').forEach(d => d.open = true);
      const b = [...document.querySelectorAll('.histo-manger')].find(b => !auj.has(b.dataset.plat));
      if (b) b.click(); return !!b; })()`);
    if (!ok) return console.log('        (tous les plats de l\'historique sont déjà au menu aujourd\'hui)');
    const vu = await attendre(`/aujourd'hui/i.test((document.getElementById('dialogueTitre') || {}).textContent || '') || document.querySelector('#dialogue [data-ensemble]')`, 20000) >= 0;
    vrai(vu, `pas d'aperçu (${await B.js(`(document.getElementById('toast') || {}).textContent + ' | ' + ((document.getElementById('dialogueTitre') || {}).textContent || '')`)})`);
    await B.js(`document.getElementById('dialogue').close()`);                // rien n'est enregistré
  });

  await test('Eau : le bouton se coche et tient après rechargement', async () => {
    await aller('#/semaine');
    vrai(await attendre(`document.getElementById('eauCheck')`, 10000) >= 0, 'pas de bouton d\'eau');
    const avant = await B.js(`document.getElementById('eauCheck').getAttribute('aria-pressed')`);
    await B.js(`document.getElementById('eauCheck').click()`);
    await att(800); await synchro();
    await B.cdp('Page.reload'); await pret(); await aller('#/semaine');
    vrai(await attendre(`document.getElementById('eauCheck')`, 15000) >= 0, 'bouton absent après rechargement');
    const apres = await B.js(`document.getElementById('eauCheck').getAttribute('aria-pressed')`);
    vrai(apres !== avant, `après rechargement : ${apres} (avant le toucher : ${avant})`);
    await aller('#/historique');
    vrai(await attendre(`document.querySelector('main h1')`, 10000) >= 0, 'pas d\'historique');
    vrai(await B.js(`!document.querySelector('.jour-histo') || !!document.querySelector('.jour-histo .histo-eau')`), 'l\'eau n\'apparaît pas dans l\'historique');
  });

  await test('Vitamines : seulement aujourd\'hui, liste « À compléter »', async () => {
    await aller('#/vitamines');
    vrai(await attendre(`document.querySelector('main h1')`, 10000) >= 0, 'pas de titre');
    vrai(!(await B.js(`!!document.querySelector('main a[href*="p=semaine"], main a[href*="p=mois"]')`)), 'les périodes semaine/mois sont encore là');
    // les jours d'avant : ‹ pour hier, puis › pour revenir (Taha, 20/11/2026)
    const hier = await B.js(`(document.querySelector('.jours-vitamines a.fleche[aria-label="Jour d\\'avant"]') || {}).hash || ''`);
    await B.js(`document.getElementById('vitDate').click()`); await att(200);
    vrai(await B.js(`!document.getElementById('vitCal').hidden && !!document.querySelector('#vitCal .cal-jours button')`), 'le calendrier ne s\'ouvre pas');
    vrai(await B.js(`[...document.querySelectorAll('#vitCal [data-jour]')].every(b => b.disabled === (b.dataset.jour > E.avancement.aujourdhui || b.disabled && b.dataset.jour < E.avancement.aujourdhui))`), 'des jours à venir ne sont pas grisés');
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
