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

// MP_SEUL=« motif » : seulement les essais dont le nom y répond (plus la connexion), pour aller vite pendant un travail.
const SEUL = process.env.MP_SEUL ? new RegExp(process.env.MP_SEUL, 'i') : null;
async function test(nom, f) {
  if (SEUL && !SEUL.test(nom) && nom !== 'Connexion et écran Jour') return;
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
    // Taha, 22/11/2026 : identifiant OU email ; mot de passe oublié ; inscription avec email et mot de passe solide
    vrai(await B.js(`/email/i.test(document.querySelector('label[for=ident]').textContent)`), 'pas « Identifiant ou email »');
    await B.js(`document.querySelector('[data-action=oubliMdp]').click()`);
    vrai(await attendre(`!!document.getElementById('fOubli')`, 5000) >= 0, 'pas de page « Mot de passe oublié »');
    await B.js(`document.getElementById('oQui').value = 'zz-essai'; document.querySelector('#fOubli [type=submit]').click()`);
    vrai(await attendre(`document.getElementById('eOubli').textContent.length > 5`, 20000) >= 0, 'pas de réponse au mot de passe oublié');
    await B.js(`document.querySelector('[data-action=versConnexion]').click()`);
    await B.js(`document.querySelector('[data-action=versCreation]').click()`);
    vrai(await attendre(`!!document.getElementById('pEmail') && !!document.getElementById('pMdpJauge')`, 5000) >= 0, 'inscription sans email ou sans jauge');
    await B.js(`(() => { const i = document.getElementById('pMdp'); i.value = 'abc'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    vrai(await B.js(`/faible/i.test(document.getElementById('pMdpForce').textContent)`), 'la jauge ne dit pas « faible »');
    await B.js(`(() => { const i = document.getElementById('pMdp'); i.value = 'Lune-Verte-Kiwi-48'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    vrai(await B.js(`/solide/i.test(document.getElementById('pMdpForce').textContent)`), 'la jauge ne dit pas « solide »');
    // 28/11/2026 : sexe, activité et objectif ne sont plus choisis d'office ; envoyer sans eux le dit clairement
    vrai(await B.js(`['sexe', 'activite', 'objectif'].every(id => document.getElementById(id).value === '')`), 'un choix est encore fait d\'office');
    await B.js(`(() => { const f = document.getElementById('fProfil'), v = (id, x) => { const e = document.getElementById(id); e.value = x; };
      v('pCode', 'x'); v('pNom', 'Zz'); v('pFamille', 'Essai'); v('pIdent', 'zz-jamais'); v('pEmail', 'zz@exemple.fr');
      f.requestSubmit(); })()`);
    vrai(await attendre(`/Choisis ton sexe/.test(document.getElementById('eProfil').textContent) && document.activeElement.id === 'sexe'`, 5000) >= 0,
      `pas de « Choisis ton sexe » : ${await B.js(`document.getElementById('eProfil').textContent`)}`);
    await B.js(`document.querySelector('[data-action=versConnexion]').click()`);
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

  // Taha, 22/11/2026 : les plats du jour restent en grille (pas en liste).
  await test('Jour : les plats restent en grille', async () => {
    await aller('#/semaine');
    vrai(await attendre(`document.querySelectorAll('.grille-plats .repas-ligne').length > 1`, 10000) >= 0, 'pas de plats');
    vrai(await B.js(`!document.querySelector('.liste-plats, .grille-plats .rp-macros')`), 'les plats du jour sont en liste');
    const idees = await B.js(`document.querySelectorAll('.idees .candidat').length`);
    vrai(idees === 0, '« Pour finir la journée » encore en anciennes cartes');
    if (await B.js(`!!document.querySelector('details.idees')`)) {
      await B.js(`(() => { const d = document.querySelector('details.idees'); d.open = true; d.scrollIntoView(); })()`);
      vrai(await B.js(`document.querySelectorAll('.idees .rp-plat').length > 0`), 'pas de liste dans « Pour finir la journée »');
      await att(300); await B.photo('idees-liste');
    }
  });

  // Taha, 22/11/2026 : plus de barre « Quantité » sur la carte (Modifier les ingrédients suffit), et pas de défilement.
  // Taha, 22/11/2026 (soir) : plus d'ingrédients sur la carte du Jour, « Voir la recette » les donne.
  await test('Carte d\'un plat : sans ingrédients ni barre de quantité, sans défiler', async () => {
    await aller('#/semaine');
    await B.js(`document.querySelector('.grille-plats a.repas').click()`);
    vrai(await attendre(`!!document.querySelector('.carte-plat .cp-mange a[href^="#/cuisine/"]')`, 10000) >= 0, 'pas de « Voir la recette » sur la carte');
    vrai(await B.js(`!document.querySelector('.carte-plat .cp-ingredients')`), 'les ingrédients sont encore sur la carte');
    vrai(await B.js(`!document.querySelector('.carte-plat .cp-quantite')`), 'la barre Quantité est encore là');
    await att(500);
    const d = await B.js(`(() => { const c = document.querySelector('.carte-plat'); return c.scrollHeight - c.clientHeight; })()`);
    console.log(`        carte : ${await B.js(`document.querySelector('.carte-plat').scrollHeight`)} px de haut`);
    vrai(d <= 1, `la carte défile de ${d} px`);
    const ec = await B.js(`(() => { const r = document.querySelector('.carte-plat').getBoundingClientRect(); return Math.round(r.top - (innerHeight - r.bottom)); })()`);
    vrai(Math.abs(ec - 60) <= 2, `la carte n'est pas 0,8 cm sous le centre (${ec} px d'écart haut/bas au lieu de 60)`);   // Taha, 22/11/2026
    await B.photo('carte-plat');
    await fermerCarte();
    // Taha, 22/11/2026 : jamais de barre pour monter et descendre, même sur un petit écran
    await B.cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 600, deviceScaleFactor: 2, mobile: true });
    await att(300);
    await B.js(`document.querySelector('.grille-plats a.repas').click()`);
    await attendre(`document.querySelector('.carte-plat')`, 10000); await att(500);
    const p = await B.js(`(() => { const c = document.querySelector('.carte-plat'); return c.scrollHeight - c.clientHeight; })()`);
    await B.photo('carte-plat-petit');
    await fermerCarte();
    await B.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await att(300);
    vrai(p <= 1, `petit écran : la carte défile de ${p} px`);
  });

  // Taha, 22/11/2026 : « Voir la recette » sur un écran, sans « Ajuster » ; « Ajuster la recette » depuis le catalogue
  await test('Recette : sur un écran, sans Ajuster ; Ajuster depuis le catalogue', async () => {
    await aller('#/semaine');
    const id = await B.js(`document.querySelector('.grille-plats a.repas').getAttribute('href').slice(7)`);
    await aller(`#/cuisine/${id}`);
    vrai(await attendre(`document.querySelector('.fiche-compacte')`, 10000) >= 0, 'pas de page recette');
    vrai(await B.js(`!document.querySelector('.fiche [data-action=ajuster], .fiche [data-action=ajusterJour]')`), 'il reste « Ajuster » sur la recette');
    await B.photo('recette');
    // Taha, 22/11/2026 : pas de page Cuisine en mode flemmard ; « Retour » ramène d'où on vient
    if (await B.js(`enSuivi()`)) {
      vrai(await B.js(`!/Cuisine/.test(document.querySelector('a.retour').textContent)`), 'le retour mène encore à « Cuisine »');
      await B.js(`document.querySelector('a.retour').click()`); await att(800);
      vrai(await B.js(`location.hash === '#/semaine'`), `retour vers ${await B.js('location.hash')} au lieu du Jour`);
      await aller('#/cuisine'); await att(500);
      vrai(await B.js(`location.hash === '#/semaine'`), 'la page Cuisine existe encore');
    }
    await aller('#/catalogue');
    await B.js(`document.querySelector('.cat-liste a.rp-plat').click()`);
    vrai(await attendre(`document.querySelector('.carte-plat [data-action=ajuster]')`, 10000) >= 0, 'pas de « Ajuster la recette » dans la carte du catalogue');
    vrai(await B.js(`(() => { const c = document.querySelector('.carte-plat'); return c.scrollHeight - c.clientHeight <= 1; })()`), 'la carte du catalogue défile');
    await B.photo('catalogue-carte-ajuster');
    await B.js(`document.querySelector('.carte-plat [data-action=ajuster]').click()`);
    vrai(await attendre(`document.querySelector('#dialogue[open] #ajNouveau')`, 10000) >= 0, '« Ajuster la recette » n\'ouvre rien');
    await B.js(`document.getElementById('dialogue').close()`);
  });

  // Taha, 22/11/2026 : « Créer mon propre plat » comme « Remplacer » (champ IA), et plus de « Jarvis » à l'écran
  await test('Catalogue : créer un plat avec l\'IA, sans « Jarvis »', async () => {
    await aller('#/catalogue');
    vrai(await B.js(`!/Jarvis/.test(document.querySelector('main').innerText)`), '« Jarvis » dans le catalogue');
    await B.js(`document.querySelector('[data-action=creerPlat]').click()`);
    vrai(await attendre(`document.querySelector('#dialogue[open] .creer-plat #cpTexte, #dialogue[open] #ppIng, #dialogue[open] form')`, 10000) >= 0, 'rien ne s\'ouvre');
    if (await B.js(`E.claude !== false`)) vrai(await B.js(`!!document.querySelector('#dialogue .creer-plat #cpTexte')`), 'pas le champ IA');
    vrai(await B.js(`!/Jarvis/.test(document.getElementById('dialogue').innerText)`), '« Jarvis » dans « Créer un plat »');
    await B.photo('creer-plat');
    await B.js(`document.getElementById('dialogue').close()`);
    await aller('#/semaine');
    vrai(await B.js(`!/Jarvis/.test(document.querySelector('main').innerText)`), '« Jarvis » sur l\'écran Jour');
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
      vrai(await B.js(`!!document.querySelector('.barres-legende') || /besoin par jour/.test(document.querySelector('.vit-jour').textContent)`), 'pas de légende');
    }
  });

  await test('Modifier les ingrédients : poubelle et ↺', async () => {
    await aller('#/semaine');
    // un plat d'au moins 3 ingrédients (le smoothie s'il est là) : les plats du jour changent d'un jour à l'autre
    const i = await B.js(`(() => { const l = [...document.querySelectorAll('.grille-plats a.repas')];
      const ings = a => ((recette(decodeURIComponent(a.getAttribute('href').slice(7))) || {}).ing || []).filter(x => x.u !== 'qs').length;
      const s = l.findIndex(a => /smoothie/i.test(a.textContent) && ings(a) >= 3);
      return s >= 0 ? s : l.findIndex(a => ings(a) >= 3); })()`);
    await B.js(`document.querySelectorAll('.grille-plats a.repas')[${Math.max(i, 0)}].click()`);
    vrai(await attendre(`document.querySelector('.cp-choix [data-action=ajusterJour]')`, 10000) >= 0, 'pas de « Modifier les ingrédients »');
    await B.js(`document.querySelector('.cp-choix [data-action=ajusterJour]').click()`);
    // Taha, 22/11/2026 : chiffres comme sur la carte, sans texte d'explication ni « Plus de protéines / Moins de glucides »
    vrai(await attendre(`document.querySelector('#dialogue[open] .aj-chiffres')`, 10000) >= 0, 'pas les chiffres façon carte');
    vrai(await B.js(`!document.querySelector('#dialogue .macros, #dialogue [data-role]') && !/UN repas|Chiffres d'un repas/.test(document.getElementById('dialogue').innerText)`), 'il reste les gros blocs, les boutons rapides ou le texte');
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
    // Taha, 22/11/2026 : plus de « Créer X avec l'IA » ; le bouton Ajouter prend l'icône violette
    vrai(await B.js(`!document.querySelector('#ajSuggestions [data-ing-ia]')`), 'encore « Créer avec l\'IA » dans la liste');
    if (await B.js(`E.claude !== false`)) vrai(await B.js(`document.getElementById('ajAjouter').classList.contains('bouton-ia')`), 'pas d\'icône IA sur Ajouter pour un inconnu');
    await B.js(`document.getElementById('ajNouveau').scrollIntoView({ block: 'start' })`);
    await B.photo('ingredients-recherche');
    await taper('riz');
    const ajoute = await B.js(`document.querySelector('#ajSuggestions [data-ing]').textContent.trim()`);
    const nb = await B.js(`document.querySelectorAll('.reglables > li').length`);
    await B.js(`document.querySelector('#ajSuggestions [data-ing]').click()`);
    vrai(await attendre(`document.querySelectorAll('.reglables > li').length === ${nb + 1}`, 15000) >= 0, `« ${ajoute} » n'est pas ajouté`);
    // Taha, 22/11/2026 : « Ajouter » à côté du champ ; la journée en haut ; « Valider » enregistre sans fenêtre d'aperçu
    vrai(await B.js(`!!document.getElementById('ajAjouter') && !!document.querySelector('#dialogue .aj-jour')`), 'pas de bouton Ajouter ou pas de chiffres du jour');
    const autre = await B.js(`ingredientsConnus().find(n => /^(œufs?|oeufs?|tomate|oignon)/i.test(n) && ![...document.querySelectorAll('.reglables label')].some(l => l.textContent.includes(n)))`);
    if (autre) {
      const nb2 = await B.js(`document.querySelectorAll('.reglables > li').length`);
      await taper(autre); await B.js(`document.getElementById('ajAjouter').click()`);
      vrai(await attendre(`document.querySelectorAll('.reglables > li').length === ${nb2 + 1}`, 15000) >= 0, `« ${autre} » : le bouton Ajouter ne l'ajoute pas`);
    }
    // une faute de frappe : « Tu veux dire … ? », sans IA
    const cible = await B.js(`ingredientsConnus().find(n => n.length > 7 && /^[a-z ]+$/i.test(n) && ![...document.querySelectorAll('.reglables label')].some(l => l.textContent.includes(n)))`);
    if (cible) {
      await taper(cible.slice(0, -1)); await B.js(`document.getElementById('ajAjouter').click()`);
      vrai(await attendre(`[...document.querySelectorAll('#ajSuggestions [data-ing]')].some(b => b.textContent.trim() === ${JSON.stringify(cible)}) && !!document.querySelector('.aj-veux-dire')`, 5000) >= 0, `faute de frappe « ${cible.slice(0, -1)} » : pas de « Tu veux dire ${cible} »`);
    }
    vrai(await B.js(`/Valider/.test(document.querySelector('#dialogue [type=submit]').textContent)`), 'le bouton n\'est pas « Valider »');
    await viderToast();
    await B.js(`document.querySelector('#dialogue [type=submit]').click()`);
    const msg = await toast();
    vrai(/modifié/.test(msg), `pas enregistré directement : « ${msg} »`);
    vrai(await B.js(`!document.getElementById('dialogue').open`), 'une fenêtre reste ouverte après Valider');
  });

  // Taha, 22/11/2026 : « Annuler » ramène un pas en arrière (la carte du plat), pas tout en haut
  await test('Annuler revient à la carte du plat', async () => {
    await aller('#/semaine');
    await B.js(`document.querySelector('.grille-plats a.repas').click()`);
    vrai(await attendre(`document.querySelector('.carte-plat [data-action=ajusterJour]')`, 10000) >= 0, 'pas de carte');
    await B.js(`document.querySelector('.carte-plat [data-action=ajusterJour]').click()`);
    vrai(await attendre(`document.querySelector('#dialogue[open] [value=non]')`, 10000) >= 0, 'pas de fenêtre');
    await B.js(`document.querySelector('#dialogue [value=non]').click()`);
    vrai(await attendre(`!!document.querySelector('.carte-plat') && !document.getElementById('dialogue').open`, 5000) >= 0, 'Annuler ne ramène pas à la carte');
    await B.js(`document.querySelector('.carte-plat [data-action=changer]').click()`);
    vrai(await attendre(`document.querySelector('#dialogue[open] [data-fermer]')`, 10000) >= 0, 'pas de Remplacer');
    await B.js(`document.querySelector('#dialogue [data-fermer]').click()`);
    vrai(await attendre(`!!document.querySelector('.carte-plat')`, 5000) >= 0, 'la croix de Remplacer ne ramène pas à la carte');
    await fermerCarte();
  });

  // Taha, 22/11/2026 : « Retirer ce plat » du catalogue, avec confirmation
  await test('Catalogue : retirer un plat pour de bon', async () => {
    await aller('#/catalogue');
    const nom = await B.js(`document.querySelector('.cat-liste a.rp-plat b').textContent`);
    await B.js(`document.querySelector('.cat-liste a.rp-plat').click()`);
    vrai(await attendre(`document.querySelector('.carte-plat [data-action=retirerPlat]')`, 10000) >= 0, 'pas de « Retirer ce plat »');
    await B.js(`document.querySelector('.carte-plat [data-action=retirerPlat]').click()`);
    vrai(await attendre(`document.getElementById('dialogue').open && /irréversible/.test(document.getElementById('dialogue').textContent)`, 5000) >= 0, 'pas de confirmation « irréversible »');
    await B.js(`document.querySelector('#dialogue [value=non]').click()`);
    vrai(await attendre(`!!document.querySelector('.carte-plat')`, 5000) >= 0, 'Annuler ne ramène pas à la carte');
    await B.js(`document.querySelector('.carte-plat [data-action=retirerPlat]').click()`);
    await attendre(`document.getElementById('dialogue').open`, 5000);
    await viderToast();
    await B.js(`document.querySelector('#dialogue [value=oui]').click()`);
    vrai(/retiré/.test(await toast()), 'pas de message « retiré »');
    await att(500);
    vrai(await B.js(`![...document.querySelectorAll('.cat-liste a.rp-plat b')].some(b => b.textContent === ${JSON.stringify(nom)})`), `« ${nom} » est encore au catalogue`);
  });

  // Taha, 22/11/2026 : « Voir la recette » puis Retour → la carte du plat, au même endroit (pas la première page)
  await test('Retour de la recette : la carte du plat revient', async () => {
    await aller('#/semaine');
    await B.js(`window.scrollTo(0, 300)`); await att(200);
    const y = await B.js(`window.scrollY`);
    await B.js(`document.querySelector('.grille-plats a.repas').click()`);
    vrai(await attendre(`document.querySelector('.carte-plat a[href^="#/cuisine/"]')`, 10000) >= 0, 'pas de « Voir la recette »');
    await B.js(`document.querySelector('.carte-plat a[href^="#/cuisine/"]').click()`);
    vrai(await attendre(`!!document.querySelector('.fiche-compacte')`, 10000) >= 0, 'la recette ne s\'ouvre pas');
    await B.js(`document.querySelector('a.retour').click()`);
    vrai(await attendre(`location.hash === '#/semaine' && !!document.querySelector('.carte-plat')`, 5000) >= 0, `retour : ${await B.js('location.hash')}, carte ${await B.js("!!document.querySelector('.carte-plat')")}`);
    await fermerCarte(); await att(300);
    vrai(Math.abs(await B.js(`window.scrollY`) - y) <= 5, `la page Jour n'est pas revenue au même endroit (${await B.js('window.scrollY')} au lieu de ${y})`);
    // Profil → Réglages → « ‹ Profil » : un pas en arrière
    await aller('#/profil'); await aller('#/reglages');
    const avant = await B.js('history.length');
    await B.js(`document.querySelector('a.retour').click()`); await att(600);
    vrai(await B.js(`location.hash === '#/profil'`), 'Réglages ne revient pas au Profil');
  });

  // Taha, 22/11/2026 : le stock à la maison (saisie → vérification → stock ; −/+ ; propositions)
  await test('Stock : saisir, vérifier, ajouter, −/+, propositions', async () => {
    await aller('#/stock');
    vrai(await attendre(`!!document.querySelector('.stock-ajout') && !!document.querySelector('.nav-bas a[href="#/stock"]')`, 10000) >= 0, 'pas d\'onglet ou de page Stock');
    await B.photo('stock-vide');
    // Taha, 22/11/2026 (soir) : UNE barre sous Photo / Ticket : elle cherche dans le stock ; ce qui n'y est pas s'ajoute
    vrai(await B.js(`!!document.querySelector('#fStockTaper #filtre') && document.querySelectorAll('#filtre').length === 1`), 'pas une seule barre chercher / ajouter');
    await viderToast();
    await B.js(`document.getElementById('filtre').value = '6 œufs, riz 1 kg, lait 1 l'; document.getElementById('fStockTaper').requestSubmit()`);
    vrai(/Ajouté/.test(await toast(30000)), 'pas ajouté au stock');
    vrai(await attendre(`!!document.querySelector('.stock-liste li') && document.getElementById('filtre').value === ''`, 10000) >= 0, 'la barre ne se vide pas après l\'ajout');
    const taper = async v => { await B.js(`(f => { f.value = ${JSON.stringify(v)}; f.dispatchEvent(new Event('input', { bubbles: true })); })(document.getElementById('filtre'))`); await att(400); };
    await taper('oeufs');
    vrai(await B.js(`[...document.querySelectorAll('.stock-liste .stock-nom')].every(n => /Œuf/i.test(n.textContent)) && document.querySelectorAll('.stock-liste li').length >= 1`), 'la recherche « oeufs » ne montre pas l\'œuf seul');
    vrai(await B.js(`document.getElementById('stockAide').textContent.trim() === ''`), 'un aliment trouvé propose quand même de l\'ajouter');
    await taper('quinoa');
    vrai(await B.js(`/pas dans ton stock/.test(document.getElementById('stockAide').textContent) || !!document.querySelector('.stock-proposes .stock-puce')`), 'taper un produit absent ne propose rien');
    await taper('');
    vrai(await attendre(`document.querySelectorAll('.stock-liste li').length >= 3`, 10000) >= 0, 'le stock ne montre pas les produits');
    const avant = await B.js(`document.querySelector('.stock-saisie').value`);
    vrai(await B.js(`!document.querySelector('details.stock-tous')`), '« Tous les produits » encore dans Mon stock');
    // Un produit choisi dans Chez moi → les plats qui en ont, dans le catalogue (Taha, 23/11/2026).
    await B.js(`document.querySelector('button.stock-nom').click()`); await att(300);
    vrai(await B.js(`/plat/.test(document.getElementById('barre').textContent)`), 'pas de barre « N plats avec ça »');
    await B.photo('stock-choisi');
    // Deux produits sans plat commun : la carte propose « Inventer un plat ».
    await B.js(`(() => { const ns = [...document.querySelectorAll('button.stock-nom')]; for (const b of ns.slice(1)) { b.click(); if (document.querySelector('[data-action=inventerPlat]')) break; } })()`); await att(300);
    if (await B.js(`!!document.querySelector('.bi-vide')`)) await B.photo('stock-aucun-plat');
    await B.js(`document.querySelector('[data-action=lacherIngs]').click()`); await att(200);
    await B.js(`document.querySelector('button.stock-nom').click()`); await att(300);
    if (await B.js(`!!document.querySelector('[data-action=voirPlatsIngs]')`)) {
      await B.js(`document.querySelector('[data-action=voirPlatsIngs]').click()`); await att(800);
      vrai(await B.js(`!!document.querySelector('.cat-ings button')`), 'le catalogue ne montre pas l\'ingrédient choisi');
      await B.js(`document.querySelector('.cat-ings button').click()`); await att(300);
    }
    await aller('#/stock?v=courses');
    // « Tous les produits » est dans Courses : un toucher met le produit sur la liste (Taha, 23/11/2026).
    vrai(await B.js(`!!document.querySelector('details.stock-tous .stock-puce[data-action=lcAjouter]')`), 'pas de « Tous les produits » dans Courses');
    // Ma liste de courses : « Remplir ma liste » (N au choix), cocher, « Ajouter au stock » (Taha, 23/11/2026).
    await B.js(`document.querySelector('.liste-courses') && document.querySelector('.liste-courses').scrollIntoView()`); await att(200); await B.photo('stock-liste-vide');
    // − / + règlent directement le nombre de produits proposés (Taha, 23/11/2026) : + en ajoute un, − en retire un.
    if (await B.js(`!!document.querySelector('[data-action=lcNb][data-pas="1"]')`)) {
      vrai(await B.js(`!document.querySelector('[data-action=lcRemplir]')`), 'le bouton « Ajouter à ma liste » est encore là');
      for (let k = 0; k < 3; k++) { await B.js(`document.querySelector('[data-action=lcNb][data-pas="1"]').click()`); await synchro(); await attendre(`document.querySelectorAll('.liste-courses li').length === ${k + 1}`, 10000); }
      vrai(await attendre(`document.querySelectorAll('.liste-courses li').length > 0`, 10000) >= 0, 'la liste ne se remplit pas');
      let nLc = await B.js(`document.querySelectorAll('.liste-courses li').length`);
      vrai(nLc <= 3 && Number(await B.js(`document.getElementById('lcNb').value`)) === nLc, `${nLc} produits pour 3 touchers de +`);
      await B.js(`document.querySelector('[data-action=lcNb][data-pas="-1"]').click()`); await synchro();
      vrai(await attendre(`document.querySelectorAll('.liste-courses li').length === ${nLc - 1}`, 10000) >= 0, '− ne retire pas un produit');
      nLc -= 1;
      await B.js(`document.querySelector('.liste-courses').scrollIntoView({ block: 'start' })`); await att(200); await B.photo('stock-liste');
      vrai(await B.js(`!!document.querySelector('.liste-courses li small')`), 'pas de raison en clair');
      await B.js(`document.querySelector('.liste-courses input[data-lc]').click()`); await att(100);
      vrai(await B.js(`!document.getElementById('lcValider').disabled`), 'Ajouter au stock reste grisé');
      await B.js(`document.getElementById('lcValider').click()`); await synchro();
      vrai(await attendre(`document.querySelectorAll('.liste-courses li').length === ${nLc - 1}`, 10000) >= 0, 'le produit coché ne quitte pas la liste');
      for (let k = 0; k < nLc - 1; k++) { await B.js(`document.querySelector('.lc-x').click()`); await synchro(); }
    }
    // Ajouter à la main un produit à la liste.
    await B.js(`(() => { const f = document.getElementById('filtreCourses'); f.value = 'riz'; f.dispatchEvent(new Event('input', { bubbles: true })); })()`); await att(300);
    vrai(await B.js(`!!document.querySelector('[data-action=lcAjouter]')`), 'taper « riz » ne propose rien');
    await B.js(`document.querySelector('[data-action=lcAjouter]').click()`); await synchro();
    vrai(await attendre(`document.querySelectorAll('.liste-courses li').length === 1`, 10000) >= 0, 'le produit tapé ne va pas sur la liste');
    await B.photo('stock-courses');
    await B.js(`document.querySelector('.lc-x').click()`); await synchro();
    await aller('#/stock'); await attendre(`document.querySelector('.stock-saisie')`, 10000);
    await B.js(`document.querySelector('.stock-liste [data-stock-pas="1"]').click()`);
    vrai(await attendre(`document.querySelector('.stock-saisie') && document.querySelector('.stock-saisie').value !== ${JSON.stringify(avant)}`, 10000) >= 0, '+ ne change rien');
    await B.photo('stock-plein');
    if (await B.js(`!!document.querySelector('[data-action=stockProposer]')`)) {
      await B.js(`document.querySelector('[data-action=stockProposer]').click()`);
      vrai(await attendre(`document.getElementById('dialogue').open && !/cherche/.test(document.getElementById('dialogue').textContent)`, 20000) >= 0, 'pas de propositions');
      await B.photo('stock-propositions');
      await B.js(`document.querySelector('#dialogue [value=non]').click()`);
    }
  });

  await test('Ajouter un repas : pas de Matin / Midi / Soir à choisir', async () => {
    await aller('#/semaine');
    await B.js(`document.querySelector('[data-action=noterRepas]').click()`);
    vrai(await attendre(`document.getElementById('nrTexte')`, 10000) >= 0, 'pas de saisie');
    vrai(!(await B.js(`!!document.querySelector('#dialogue [data-moment]')`)), 'les tags Matin / Midi / Soir sont encore là');
    await B.js(`document.getElementById('dialogue').close()`);
  });

  // Taha, 28/11/2026 : « je veux pouvoir ajouter un ingrédient comme un repas, skyr nature, pomme… mais seul »
  await test('Ajouter un repas : un aliment seul (skyr nature), sans IA', async () => {
    await aller('#/semaine');
    await B.js(`document.querySelector('[data-action=noterRepas]').click()`);
    vrai(await attendre(`document.getElementById('nrTexte')`, 10000) >= 0, 'pas de saisie');
    await B.js(`(() => { const t = document.getElementById('nrTexte'); t.value = 'skyr natur'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    vrai(await attendre(`!!document.querySelector('#nrPlats [data-aliment="Skyr nature"]')`, 15000) >= 0, 'pas de « Skyr nature » en aliment seul (une faute tapée)');
    await B.js(`document.querySelector('#nrPlats [data-aliment="Skyr nature"]').click()`);
    vrai(await attendre(`!!document.querySelector('#nrItems [data-champ=g]')`, 10000) >= 0, "pas d'écran de vérification");
    await B.js(`(() => { const g = document.querySelector('#nrItems [data-champ=g]'); g.value = '175'; g.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    vrai(await attendre(`/^105\\b/.test(document.querySelector('#nrTotal b').textContent.trim())`, 5000) >= 0,
      `175 g de skyr ne font pas 105 kcal : ${await B.js(`document.querySelector('#nrTotal b').textContent`)}`);
    const avant = await B.js(`E.semaine.jours.map(j => [j.pdj, j.dej, j.din, ...(j.collations || [])]).flat().filter(i => i === 'perso-skyr-nature').length`);
    await B.js(`document.querySelector('#dialogue [type=submit]').click()`);
    vrai(await attendre(`!document.getElementById('dialogue').open || !!document.querySelector('#dialogue .ap')`, 20000) >= 0, "l'ajout ne se fait pas");
    if (await B.js(`!!document.querySelector('#dialogue .ap')`)) await B.js(`document.querySelector('#dialogue [type=submit]').click()`);
    vrai(await attendre(`E.semaine.jours.map(j => [j.pdj, j.dej, j.din, ...(j.collations || [])]).flat().filter(i => i === 'perso-skyr-nature').length > ${avant}`, 20000) >= 0,
      "le skyr n'est pas au menu");
    vrai(await B.js(`E.semaine.jours.some(j => j.ajustes && j.ajustes['perso-skyr-nature'] && j.ajustes['perso-skyr-nature']['Skyr nature'] === 175)`),
      "la dose du jour n'est pas 175 g");
  });

  // Taha, 28/11/2026 : scanner un code-barres. Une vraie image de code EAN-13 (Nutella, 3017620422003) dessinée sur une
  // toile remplace la caméra ; le lecteur (ZXing, chargé depuis jsDelivr, clé d'intégrité vérifiée) doit la lire,
  // Open Food Facts donne le produit, il entre au stock.
  await test('Stock : scanner un code-barres, le produit entre au stock', async () => {
    await aller('#/stock');
    vrai(await attendre(`!!document.querySelector('[data-action=scannerStock]')`, 10000) >= 0, 'pas de bouton « Scanner » dans le stock');
    await B.js(`chargerScanner().then(() => {
      const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
      const R = L.map(c => c.replace(/./g, b => b === '0' ? '1' : '0')), G = R.map(c => c.split('').reverse().join(''));
      const PAR = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
      const d = '3017620422003'.split('').map(Number); let bits = '101';
      for (let i = 1; i <= 6; i++) bits += (PAR[d[0]][i - 1] === 'L' ? L : G)[d[i]];
      bits += '01010'; for (let i = 7; i <= 12; i++) bits += R[d[i]]; bits += '101';
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const x = c.getContext('2d');
      const dessiner = () => { x.fillStyle = '#fff'; x.fillRect(0, 0, 1280, 720); x.fillStyle = '#000';
        for (let i = 0; i < bits.length; i++) if (bits[i] === '1') x.fillRect(307 + i * 7, 220, 7, 280); };
      dessiner(); window.__scanMinuteur = setInterval(dessiner, 100);
      Scanner.source = async () => c.captureStream(15);
      return true; })`);
    const avant = await B.js(`JSON.stringify((E.stock || []).map(l => [l.nom, l.quantite]))`);
    await B.js(`document.querySelector('[data-action=scannerStock]').click()`);
    vrai(await attendre(`!!document.querySelector('dialog.scan[open]')`, 10000) >= 0, "l'écran du scanner ne s'ouvre pas");
    vrai(await attendre(`!document.querySelector('dialog.scan') && !!document.querySelector('#dialogue .scan-res')`, 60000) >= 0,
      `le code n'est pas lu : ${await B.js(`(document.querySelector('.scan-aide') || {}).textContent || ''`)}`);
    vrai(await attendre(`!!document.querySelector('#dialogue form.scan-res') && !/Je cherche/.test(document.getElementById('dialogueTitre').textContent)`, 40000) >= 0, 'pas de réponse pour le produit');
    if (await B.js(`!document.querySelector('#dialogue .scan-res [type=submit]')`)) {
      console.log(`        (Open Food Facts ne répond pas : ${await B.js(`document.querySelector('#dialogue .scan-res').textContent.replace(/\\s+/g, ' ').slice(0, 160)`)})`);
      return B.js(`(clearInterval(window.__scanMinuteur), document.getElementById('dialogue').close(), true)`);
    }
    vrai(await B.js(`/Nutella/i.test(document.getElementById('dialogueTitre').textContent)`), `pas « Nutella » : ${await B.js(`document.getElementById('dialogueTitre').textContent`)}`);
    vrai(await B.js(`Number(document.getElementById('scanQ').value) === 400 || document.getElementById('scanU').textContent.startsWith('pièce')`), 'le pot de 400 g ne se propose pas');
    const nom = await B.js(`(document.querySelector('[name=scanAl]:checked') || {}).value || ''`);
    await B.js(`document.querySelector('#dialogue .scan-res [type=submit]').click()`);
    vrai(await attendre(`!document.getElementById('dialogue').open`, 40000) >= 0, `pas ajouté : ${await B.js(`(document.getElementById('eScan') || {}).textContent || ''`)}`);
    const apres = await B.js(`JSON.stringify((E.stock || []).map(l => [l.nom, l.quantite]))`);
    vrai(apres !== avant && (nom ? apres.includes(JSON.stringify(nom)) : /Nutella/.test(apres)), `le stock ne bouge pas (${nom || 'nouvel aliment'})`);
    // la fois d'après, le code est reconnu tout de suite (codes_barres.json)
    vrai(await B.js(`fetch('/api/produit?code=3017620422003').then(r => r.json()).then(r => !!r.aliment)`), "le code n'est pas gardé");
    await B.js(`(clearInterval(window.__scanMinuteur), Scanner.source = null, true)`);
  });

  // Taha, 28/11/2026 : mode restaurant. La réponse de l'IA est simulée (le compte d'essai n'a pas de clé) : la carte en
  // photo → « il te reste » et les plats proposés → en toucher un ouvre la vérification.
  await test('Ajouter un repas : au restaurant, la carte en photo (réponse simulée)', async () => {
    await aller('#/semaine');
    await B.js(`(window.__claudeAvant = E.claude, E.claude = true, true)`);
    await B.js(`document.querySelector('[data-action=noterRepas]').click()`);
    vrai(await attendre(`!!document.getElementById('nrResto')`, 10000) >= 0, 'pas de bouton « Au restaurant »');
    await B.js(`(() => { const avant = window.fetch; window.__fetchAvant = avant;
      window.fetch = (u, o) => String(u).includes('/api/repas/restaurant') ? Promise.resolve(new Response(JSON.stringify({ restaurant: { reste: { kcal: 750, prot: 40 }, moment: 'dej',
        plats: [{ nom: 'Pavé de saumon', kcal: 620, prot: 42, gluc: 30, lip: 30, pourquoi: 'Beaucoup de protéines.', conseil: 'Sauce à part.' },
                { nom: 'Salade de poulet', kcal: 450, prot: 38, gluc: 20, lip: 20, pourquoi: 'Légère.', conseil: '' }] } }), { status: 200, headers: { 'Content-Type': 'application/json' } })) : avant(u, o);
      const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0, 0, 20, 20);
      return new Promise(ok => c.toBlob(b => { const dt = new DataTransfer(); dt.items.add(new File([b], 'carte.png', { type: 'image/png' }));
        const i = document.getElementById('nrResto'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); ok(true); }, 'image/png')); })()`);
    vrai(await attendre(`document.querySelectorAll('#dialogue .resto-plat').length === 2`, 15000) >= 0, 'pas de plats proposés');
    vrai(await B.js(`/750 kcal/.test(document.querySelector('.resto-reste').textContent)`), 'pas de « il te reste »');
    await B.js(`document.querySelector('#dialogue .resto-plat').click()`);
    vrai(await attendre(`!!document.getElementById('nrItems') && /620/.test(document.getElementById('nrTotal').textContent)`, 10000) >= 0, "le plat choisi ne s'ouvre pas à vérifier");
    await B.js(`(window.fetch = window.__fetchAvant, E.claude = window.__claudeAvant, document.getElementById('dialogue').close(), true)`);
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

  await test('Historique : la recette de CE jour-là (quantités réglées), pas celle de base', async () => {
    // Taha, 28/11/2026 : « je trouve pas kaki quand je clique sur Voir la recette… j'ai jamais mis du miel ». Un plat d'un
    // jour passé, réglé ce jour-là (un ingrédient retiré, du kaki ajouté, assiette à 110 %), posé dans l'historique.
    await aller('#/historique');
    vrai(await attendre(`document.querySelector('main h1')`, 10000) >= 0, 'pas d\'historique');
    const p = await B.js(`(() => {
      const J = E.journal_repas; window.__journalAvant = JSON.parse(JSON.stringify(J));
      const r = E.recettes.find(x => (x.ing || []).filter(i => i.u !== "qs").length >= 2 && x.kcal > 0 && !x.tel_quel);
      const a = r.ing.filter(i => i.u !== "qs"), d = new Date(J.aujourdhui + "T12:00"); d.setDate(d.getDate() - 3);
      const date = d.toISOString().slice(0, 10), ajustes = { [a[0].n]: 0, Kaki: { q: 90, u: "g", a: 1 } };
      let j = J.jours.find(x => x.date === date);
      if (!j) { j = { date, source: "menu prévu", entrees: [], repas: [], kcal: 432, prot: 20, gluc: 50, lip: 10, fib: 5, reste: {} }; J.jours.push(j); J.jours.sort((x, y) => y.date.localeCompare(x.date)); }
      j.repas = [{ moment: "pdj", id: r.id, nom: "Plat du jour au kaki", au_repas: "", kcal: 432, prot: 20, gluc: 50, lip: 10, taille: 1.1, ajustes }, ...(j.repas || []).filter(x => x.moment !== "pdj")];
      rendre(); return { id: r.id, nom: r.nom, date, sans: a[0].n, garde: a[1].n, q: a[1].q };
    })()`);
    await att(300);
    // la tuile de ce jour : « quantités ajustées ce jour », puis sa carte
    const ouvert = await B.js(`(() => { const a = [...document.querySelectorAll('.jour-histo a.repas')].find(a => a.dataset.date === ${JSON.stringify(p.date)} && a.dataset.momentVu === 'pdj');
      if (!a) return 'pas de tuile'; a.closest('details').open = true;
      if (!/ajustées ce jour/.test(a.textContent)) return 'pas de « quantités ajustées ce jour »'; a.click(); return ''; })()`);
    vrai(!ouvert, ouvert);
    vrai(await attendre(`!!document.querySelector('.carte-plat .cp-ing-liste')`, 5000) >= 0, 'la carte ne s\'ouvre pas');
    const carte = await B.js(`(() => { const c = document.querySelector('.carte-plat'), l = [...c.querySelectorAll('.cp-ing-liste li')].map(li => [...li.children].map(s => s.textContent.trim()).join(' ').replace(/\\s+/g, ' '));
      return { l, ceJour: (c.querySelector('.cp-ce-jour') || {}).textContent || '', lien: (c.querySelector('a.cp-cuisiner') || {}).getAttribute?.('href') || '',
        titre: c.querySelector('#cpTitre').textContent, dapres: (c.querySelector('.cp-d-apres') || {}).textContent || '' }; })()`);
    vrai(carte.titre === 'Plat du jour au kaki' && carte.dapres.includes(p.nom), `la carte n'a pas le nom de ce jour-là : « ${carte.titre} » / ${carte.dapres}`);
    vrai(carte.l.some(x => /^Kaki 99 g$/.test(x)), `pas « Kaki 99 g » dans la carte : ${carte.l.join(' | ')}`);
    vrai(!carte.l.some(x => x.startsWith(p.sans + ' ')), `${p.sans} (retiré ce jour-là) est dans la carte`);
    vrai(new RegExp('sans ' + p.sans.toLowerCase()).test(carte.ceJour) && /avec kaki/.test(carte.ceJour), `pas de « Ce jour-là : sans… avec kaki » : ${carte.ceJour}`);
    vrai(carte.lien === '#/cuisine/' + p.id + '?date=' + p.date + '&moment=pdj', `« Voir la recette » ne garde pas le jour : ${carte.lien}`);
    // « Manger aujourd'hui » : la même assiette (quantités et taille de ce jour-là), vue dans l'aperçu
    const op = await B.js(`(() => { const b = document.querySelector('.carte-plat [data-action=mangerAujourdhui]'); if (!b) return null;
      const avant = apercuChangement; let vu = null; apercuChangement = (k, o) => { vu = o; }; b.click(); apercuChangement = avant; return vu; })()`);
    if (op) vrai(op.taille === 1.1 && op.quantites && op.quantites.Kaki && op.quantites.Kaki.q === 90 && op.quantites[p.sans] === 0, `« Manger aujourd'hui » ne reprend pas l'assiette : ${JSON.stringify(op)}`);
    else console.log('        (pas de menu aujourd\'hui : « Manger aujourd\'hui » absent)');
    // « Voir la recette » : les ingrédients de ce jour-là, à la taille de l'assiette, et les calories notées
    await fermerCarte(); await aller(carte.lien);
    vrai(await attendre(`!!document.querySelector('.fiche .ingredients')`, 5000) >= 0, 'la recette ne s\'ouvre pas');
    const page = await B.js(`(() => ({ l: [...document.querySelectorAll('.fiche .ingredients li')].map(li => [...li.children].map(s => s.textContent.trim()).join(' ').replace(/\\s+/g, ' ')),
      tete: document.querySelector('.fiche .fc-tete').textContent.replace(/\\s+/g, ' '), etapes: document.querySelector('.fiche .etapes').textContent,
      titre: document.querySelector('.fiche h1').textContent, dapres: (document.querySelector('.fiche .fc-d-apres') || {}).textContent || '' }))()`);
    vrai(page.titre === 'Plat du jour au kaki' && page.dapres.includes(p.nom), `la recette n'a pas le nom de ce jour-là : « ${page.titre} » / ${page.dapres}`);
    vrai(page.l.some(x => /^Kaki 99 g$/.test(x)) && !page.l.some(x => x.startsWith(p.sans + ' ')), `la recette n'est pas celle de ce jour-là : ${page.l.join(' | ')}`);
    vrai(/432 kcal/.test(page.tete) && /Ce que tu as mangé/.test(page.tete), `en-tête : ${page.tete}`);
    vrai(/Tes changements/.test(page.etapes), 'les étapes ne disent pas les changements');
    await B.photo('historique-recette-du-jour');
    await B.js(`(E.journal_repas = window.__journalAvant, true)`);
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
    // Taha, 22/11/2026 : les 10 vitamines sur un écran, sans défiler
    if (await B.js(`!document.getElementById('vitCal').hidden`)) { await B.js(`document.getElementById('vitDate').click()`); await att(200); }
    if (await B.js(`!!document.querySelector('.barres li')`)) {
      const bas = await B.js(`(() => { const l = [...document.querySelectorAll('.barres li')].pop().getBoundingClientRect(), n = document.querySelector('.nav-bas'); return Math.round(l.bottom - (n ? n.getBoundingClientRect().top : innerHeight)); })()`);
      vrai(bas <= 0, `la dernière vitamine est ${bas} px sous l'écran`);
    }
    await B.photo('vitamines-jour');
  });

  // Taha, 22/11/2026 : pas de barre de défilement quand tout tient (Profil…)
  await test('Pas de défilement pour rien (Profil, Vitamines)', async () => {
    for (const h of ['#/profil', '#/vitamines']) {
      await aller(h); await att(500);
      const d = await B.js(`document.documentElement.scrollHeight - innerHeight`);
      vrai(d <= 1, `${h} défile de ${d} px`);
    }
  });

  await test('Vitamines : Jour, Semaine, Mois', async () => {
    await aller('#/vitamines?vue=semaine');
    vrai(await attendre(`document.querySelectorAll('.vit-onglets a').length === 3`, 10000) >= 0, 'pas les 3 onglets Jour / Semaine / Mois');
    vrai(await B.js(`!!document.querySelector('.vit-onglets a[aria-current][href*="semaine"]') && !document.querySelector('.vit-periodes')`), 'l\'onglet Semaine n\'est pas actif');
    if (await B.js(`document.querySelectorAll('.barres li').length`)) {
      vrai(await B.js(`document.querySelectorAll('.barres li').length === Object.keys(E.vitamines.noms).length`), 'il manque des vitamines');
      const moy = await B.js(`[...document.querySelectorAll('.barres .v b')].map(b => parseInt(b.textContent))`);
      vrai(moy.every((v, i) => !i || v >= moy[i - 1]), `pas triées du plus bas au plus haut : ${moy}`);
    }
    await aller('#/vitamines?vue=mois');
    vrai(await B.js(`!!document.querySelector('.vit-onglets a[aria-current][href*="mois"]')`), 'Mois pas choisi');
    await B.photo('vitamines-duree');
    await aller('#/vitamines');
  });

  await test('Avancement : courbe et périodes', async () => {
    await aller('#/avancement?p=semaine');
    // une courbe, ou (semaine sans journée finie : lundi, juste après minuit…) le message qui le dit (27/11/2026)
    vrai(await attendre(`document.querySelector('#gMange svg path, #gMange svg polyline') || /Pas encore de journée finie/.test(document.querySelector('main').textContent)`, 10000) >= 0,
      'ni courbe, ni « Pas encore de journée finie »');
    await aller('#/avancement?p=mois');
    vrai(await attendre(`document.querySelector('main h1')`, 10000) >= 0, 'mois ne s\'affiche pas');
  });

  // Taha, 28/11/2026 : la carte d'accueil d'un nouveau compte (une fois) ; « Compris » l'efface pour de bon.
  await test('Jour : carte d\'accueil d\'un nouveau compte, puis « Compris »', async () => {
    await aller('#/semaine');
    vrai(await B.js(`!document.querySelector('.accueil-carte')`), "la carte d'accueil s'affiche pour un ancien compte");
    await B.js(`(E.reglages.accueil = true, rendre(), true)`); await att(400);
    vrai(await attendre(`!!document.querySelector('.accueil-carte [data-action=accueilVu]')`, 5000) >= 0, "pas de carte d'accueil");
    await B.js(`document.querySelector('.accueil-carte [data-action=accueilVu]').click()`);
    vrai(await attendre(`!document.querySelector('.accueil-carte') && !E.reglages.accueil`, 15000) >= 0, '« Compris » ne la retire pas');
  });

  // Taha, 28/11/2026 : l'objectif qui s'ajuste chaque semaine : la carte du lundi (phrase faite par la page, traduisible),
  // « Compris » la range ; dans Réglages → Mes objectifs, l'interrupteur est là, actif par défaut.
  await test('Objectif de la semaine : la carte, puis « Compris » ; l\'interrupteur dans Mes objectifs', async () => {
    await aller('#/semaine');
    await B.js(`(E.reglages.ajustement_auto = { code: 'baisse', pas: -100, lu: false, chiffres: { pente: 0.02, delta: -100 }, vue: 'x' }, rendre(), true)`);
    await att(300);
    const t = await B.js(`(document.querySelector('.objectif-semaine') || {}).textContent || ''`);
    vrai(/100 kcal de moins/.test(t) && /\+0 kg par semaine/.test(t), `carte absente ou fausse : ${t.replace(/\s+/g, ' ').slice(0, 160)}`);
    vrai(await B.js(`!!document.querySelector('.objectif-semaine [data-action=objectifAnnuler]')`), 'pas de « Annuler »');
    await B.js(`document.querySelector('.objectif-semaine [data-action=objectifLu]').click()`);
    vrai(await attendre(`!document.querySelector('.objectif-semaine') && E.reglages.ajustement_auto && E.reglages.ajustement_auto.lu === true`, 15000) >= 0, '« Compris » ne la range pas');
    await aller('#/reglages');
    vrai(await attendre(`!!document.querySelector('#tPeriodes') && !!document.querySelector('[data-action=objectifAuto]')`, 10000) >= 0, "pas d'interrupteur dans Mes objectifs");
    vrai(await B.js(`document.querySelector('[data-action=objectifAuto]').checked`), "l'ajustement n'est pas actif par défaut");
  });

  // Taha, 22/11/2026 : le catalogue en liste, comme « Remplacer par un autre plat ».
  await test('Catalogue : liste, recherche, fiche', async () => {
    await aller('#/catalogue');
    // 5 à la fois (Taha, 23/11/2026).
    const n5 = await B.js(`document.querySelectorAll('.cat-liste a.rp-plat').length`);
    vrai(n5 === 5, `${n5} plats au départ, 5 attendus`);
    // Pages de 5 : › puis ‹ (Taha, 23/11/2026).
    const decale = await B.js(`Math.max(...[...document.querySelectorAll('.cat-pages button')].map(b => { const r = b.getBoundingClientRect(), i = b.querySelector('.ic').getBoundingClientRect();
      return Math.max(Math.abs(r.left + r.width / 2 - i.left - i.width / 2), Math.abs(r.top + r.height / 2 - i.top - i.height / 2)); }))`);
    vrai(decale <= 1.5, `flèche décalée de ${decale} px dans son cercle`);
    await B.js(`document.querySelector('.filtres-bascule').click()`); await att(300);
    await B.js(`document.querySelector('.ft-choix button').click()`); await att(300); await B.photo('catalogue-filtres');
    await B.js(`document.querySelector('[data-cle=raz]') && document.querySelector('[data-cle=raz]').click()`); await att(200);
    if (await B.js(`!!document.querySelector('.ft-choix')`)) { await B.js(`document.querySelector('.filtres-bascule').click()`); await att(300); }
    // « Créer un plat » avec un lien de recette (Taha, 23/11/2026) : le champ du lien, la description qui apparaît.
    await B.js(`(() => { const c = E.claude; E.claude = true; creerPlatIA(); E.claude = c; const l = document.getElementById('cpLien'); l.value = 'https://www.tiktok.com/@chef/video/1'; l.dispatchEvent(new Event('input')); })()`); await att(300);
    vrai(await B.js(`!!document.getElementById('cpLien') && !document.getElementById('cpDesc').hidden`), 'pas de champ pour le lien de recette');
    await B.photo('creer-plat-lien');
    await B.js(`document.getElementById('dialogue').close()`); await att(200);
    const premier = await B.js(`document.querySelector('.cat-liste b').textContent`);
    await B.js(`document.querySelector('[data-action="pageCat"][data-pas="5"]').click()`); await att(300);
    const suivant = await B.js(`document.querySelector('.cat-liste b').textContent`);
    vrai(suivant !== premier && await B.js(`document.querySelectorAll('.cat-liste a.rp-plat').length`) === 5, `page suivante : ${suivant}`);
    await B.js(`document.querySelector('[data-action="pageCat"][data-pas="-5"]').click()`); await att(300);
    vrai(await B.js(`document.querySelector('.cat-liste b').textContent`) === premier, 'page précédente');
    await B.js(`document.querySelector('.tri-sens').click()`); await att(300);
    const premierInverse = await B.js(`document.querySelector('.cat-liste b').textContent`);
    vrai(premier !== premierInverse && await B.js(`document.querySelectorAll('.cat-liste a.rp-plat').length`) === 5, `décroissant : ${premier} / ${premierInverse}`);
    await B.js(`document.querySelector('.tri-sens').click()`); await att(300);
    const n = await B.js(`parseInt(document.querySelector('#contenu p.petit[role=status]').textContent)`);
    // Le clavier ouvert cache la barre des onglets.
    await B.js(`(() => { const f = document.getElementById('filtre'); f.focus(); f.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); })()`); await att(150);
    vrai(await B.js(`getComputedStyle(document.getElementById('navBas')).display`) === 'none', 'la barre des onglets reste avec le clavier');
    await B.js(`(() => { const f = document.getElementById('filtre'); f.blur(); f.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); })()`); await att(200);
    vrai(await B.js(`getComputedStyle(document.getElementById('navBas')).display`) !== 'none', 'la barre des onglets ne revient pas');
    const h = await B.js(`Math.max(...[...document.querySelectorAll('.cat-liste a.rp-plat')].map(x => x.getBoundingClientRect().height))`);
    vrai(h <= 80, `une ligne fait ${h} px`);
    const d = await debordement();
    vrai(d <= 1, `la page déborde de ${d} px`);
    await B.js(`(() => { const f = document.getElementById('filtre'); f.value = 'poulet'; f.dispatchEvent(new Event('input', { bubbles: true })); })()`); await att(700);
    const m = await B.js(`parseInt(document.querySelector('#contenu p.petit[role=status]').textContent)`);
    vrai(m > 0 && m < n, `recherche « poulet » : ${m} plats sur ${n}`);
    await B.js(`document.querySelector('.cat-liste a.rp-plat').click()`);
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

  // Taha, 28/11/2026 : les rappels (pesée, eau, dîner, silhouette) se cochent dans Réglages et vont dans la table « rappels »
  // Taha, 28/11/2026 : la silhouette en courbes (une mesure au fil des relevés) et l'avant / après avec un curseur
  await test('Silhouette : courbe d\'une mesure, avant / après au curseur', async () => {
    await aller('#/suivi');
    await B.js(`(() => { SILH.charge = true; SILH.donnees = { reference: { date: '2026-11-01', valeurs: { taille: 86, hanches: 98 }, face: { photo: 'zz/a.jpg' }, profil: { photo: 'zz/b.jpg' } },
      releves: [{ date: '2026-11-08', valeurs: { taille: 85.4, hanches: 97.6 }, face: { photo: 'zz/c.jpg' }, profil: { photo: 'zz/d.jpg' }, qualite: 1 },
                { date: '2026-11-15', valeurs: { taille: 84.9, hanches: 97.1 }, face: { photo: 'zz/e.jpg' }, profil: { photo: 'zz/f.jpg' }, qualite: 1 }] };
      historiqueSilhouette(); return true; })()`);
    vrai(await attendre(`!!document.querySelector('#gSilh svg path, #gSilh svg polyline')`, 5000) >= 0, 'pas de courbe du tour de taille');
    await B.js(`document.querySelector('[data-silh-mesure=hanches]').click()`);
    vrai(await attendre(`document.querySelector('[data-silh-mesure=hanches]').getAttribute('aria-pressed') === 'true' && !!document.querySelector('#gSilh svg path, #gSilh svg polyline')`, 5000) >= 0,
      'la courbe ne passe pas aux hanches');
    await B.js(`(() => { const c = document.querySelector('.silh-curseur'); c.value = 20; c.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    vrai(await B.js(`document.getElementById('silhComparer').style.getPropertyValue('--x') === '20%'`), 'le curseur avant / après ne bouge pas');
    await B.js(`(document.getElementById('dialogue').close(), SILH.charge = false, SILH.donnees = null, true)`);
  });

  await test('Réglages : rappels cochés puis décochés', async () => {
    await aller('#/reglages');
    vrai(await attendre(`document.querySelectorAll('#rappelsChoix [data-rappel]').length === 4`, 15000) >= 0, 'pas de rubrique Rappels');
    await B.js(`(() => { const s = document.getElementById('tRappels').closest('section'); s.querySelector('[data-rappel=pesee]').click(); return true; })()`);
    vrai(await attendre(`sb.from('rappels').select('types, fuseau').eq('user_id', M.moi.uid).maybeSingle().then(r => !!r.data && r.data.types.includes('pesee') && r.data.fuseau.length > 2)`, 15000) >= 0,
      "la pesée n'est pas enregistrée");
    await B.js(`document.querySelector('#rappelsChoix [data-rappel=pesee]').click()`);
    vrai(await attendre(`sb.from('rappels').select('types').eq('user_id', M.moi.uid).maybeSingle().then(r => !!r.data && !r.data.types.length)`, 15000) >= 0, "décocher ne l'enlève pas");
    await B.js(`sb.from('rappels').delete().eq('user_id', M.moi.uid).then(() => true)`);
  });

  await test('Réglages : blocs présents', async () => {
    // Taha, 22/11/2026 (soir) : dans Profil, juste « Réglages » ; la page en lignes repliables, avec un résumé
    await aller('#/profil');
    vrai(await B.js(`document.querySelector('a[href="#/reglages"]').textContent.trim() === 'Réglages'`), 'le lien de Profil ne dit pas juste « Réglages »');
    await aller('#/reglages');
    const t = await B.js(`document.querySelector('main').textContent`);
    for (const mot of ['objectif', 'compte', 'même plat midi et soir']) vrai(new RegExp(mot, 'i').test(t), `« ${mot} » absent des Réglages`);
    vrai(await B.js(`document.querySelectorAll('.reglages .bloc.pliable:not(.ouvert)').length >= 4`), 'les rubriques ne sont pas repliées');
    vrai(await B.js(`document.documentElement.scrollHeight < 1400`), 'la page Réglages est encore trop longue');
    // « Mon alimentation » se replie ; « autre chose à éviter » : un aliment avec +, une pastille qu'on retire (Taha, 23/11/2026).
    vrai(await B.js(`!!document.querySelector('#tRepas .reg-tete')`), '« Mon alimentation » ne se replie pas');
    await B.js(`document.querySelector('#tRepas .reg-tete').click()`); await att(200);
    await B.js(`(i => { i.value = 'kiwi'; document.querySelector('.regime-plus').click(); })(document.querySelector('.regime-ajout input'))`);
    vrai(await attendre(`[...document.querySelectorAll('.regime-autre')].some(b => /Kiwi/.test(b.textContent))`, 15000) >= 0, 'l\'aliment à éviter n\'apparaît pas');
    await B.photo('reglages-alimentation');
    await B.js(`[...document.querySelectorAll('.regime-autre')].find(b => /Kiwi/.test(b.textContent)).click()`);
    vrai(await attendre(`![...document.querySelectorAll('.regime-autre')].some(b => /Kiwi/.test(b.textContent))`, 15000) >= 0, 'l\'aliment à éviter ne se retire pas');
    await B.js(`document.querySelectorAll('.reg-tete').forEach(b => b.closest('section').classList.contains('ouvert') || b.click())`); await att(300);
    vrai(await debordement() <= 0, 'la page Réglages déborde sur le côté');
    vrai(await attendre(`!!document.getElementById('fCoord') && !document.getElementById('fCoord').hidden`, 10000) >= 0, 'pas d\'email / téléphone dans Mon compte');
    vrai(await B.js(`/Intelligence artificielle/i.test(document.querySelector('main').textContent)`), 'pas de bloc IA');
    vrai(await B.js(`!!document.getElementById('mNouveauJauge')`), 'pas de jauge sur le nouveau mot de passe');
    // Taha, 22/11/2026 : le poids visé à la fin de chaque période
    if (await B.js(`!!document.querySelector('.periode')`)) {
      await att(300);
      vrai(await B.js(`[...document.querySelectorAll('.p-vise')].some(p => /kg/.test(p.textContent))`), 'pas de poids visé sous les périodes');
      await B.js(`document.querySelector('.periode').scrollIntoView({ block: 'center' })`); await B.photo('periodes-poids');
    }
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

  await test('Manquants : « Je l\'ai » met la quantité au stock', async () => {
    await aller('#/semaine'); await att(800);
    if (!(await B.js(`!!document.querySelector('.manque[data-manque]')`))) return;       // aucun plat avec des manquants aujourd'hui
    await B.js(`document.querySelector('.manque[data-manque]').click()`); await att(300);
    vrai(await B.js(`!!document.querySelector('.manque-feuille [data-manque-ai]')`), 'pas de bouton « Je l\'ai »');
    await B.js(`document.querySelector('.manque-feuille [data-manque-ai]').click()`); await att(200);
    await B.photo('manque-je-l-ai');
    await B.js(`document.querySelector('.manque-feuille [data-manque-ok]').click()`);
    vrai(await attendre(`!!document.querySelector('.manque-lignes li.fait')`, 15000) >= 0, 'la quantité ne va pas au stock');
    await B.js(`document.querySelector('[data-manque-fermer]').click()`); await att(200);
  });

  await test('Langues : anglais, puis arabe de droite à gauche', async () => {
    // (Taha, 23/11/2026) Le choix est gardé sur le téléphone ; la page se recharge dans la langue.
    for (const [l, mot, sens] of [['en', /Progress/, 'ltr'], ['ar', /[\u0600-\u06FF]/, 'rtl']]) {
      await B.js(`localStorage.setItem('mp-langue', '${l}'); location.hash = '#/semaine'; location.reload()`);
      vrai(await attendre(`typeof I18N !== 'undefined' && I18N.pret === true && I18N.exact.size > 500 && !!document.querySelector('.nav-bas')`, 60000) >= 0, `${l} : la traduction ne se charge pas`);
      await attendre(`!document.querySelector('.ouverture:not(.fini)')`, 15000); await att(1200);
      const nav = await B.js(`document.querySelector('.nav-bas').innerText`);
      vrai(mot.test(nav) && !/Avancement/.test(nav), `${l} : les onglets ne sont pas traduits (${nav.replace(/\n/g, ' ')})`);
      vrai(await B.js(`document.documentElement.dir`) === sens, `${l} : mauvais sens de lecture`);
      await B.photo(`langue-${l}`);
    }
    await B.js(`localStorage.setItem('mp-langue', 'fr'); location.reload()`);
    vrai(await attendre(`!!document.querySelector('.nav-bas') && /Avancement/.test(document.querySelector('.nav-bas').innerText)`, 60000) >= 0, 'le retour au français ne marche pas');
  });

  await test('Partage : un lien reçu ouvre la création du plat', async () => {
    // « Partager avec Mon Meal Prep » (Taha, 23/11/2026) : ?texte=… est gardé, l'adresse nettoyée, la création lancée.
    await B.js(`location.href = location.pathname + '?texte=' + encodeURIComponent('Regarde ça https://www.tiktok.com/@chef/video/1')`);
    vrai(await attendre(`!location.search && document.getElementById('dialogue') && document.getElementById('dialogue').open`, 60000) >= 0, 'le partage n\'ouvre rien');
    vrai(await B.js(`!sessionStorage.getItem('mp-partage') && location.hash === '#/catalogue'`), 'le partage reste en attente');
    await B.js(`document.getElementById('dialogue').close()`); await att(200);
  });

  await test('Famille : le profil de chacun, les doses de tous, un membre sans téléphone', async () => {
    // (Taha, 27/11/2026) Tout le monde ouvre le profil de tout le monde sur un téléphone ; « Tous » montre les doses de
    // chacun ; un membre sans téléphone se crée et se retire. Famille d'essai : zz-essai (créateur) et zz-essai2.
    const URL_SB = /url:\s*"([^"]+)/.exec(readFileSync(join(ICI, '../app/config.js'), 'utf8'))[1];
    const ANON = readFileSync(join(homedir(), '.config/meal-prep/anon-key'), 'utf8').trim();
    const MDP2 = readFileSync(join(homedir(), '.config/meal-prep/essai2-mdp'), 'utf8').trim();
    // trois essais : une coupure passagère du réseau ne doit pas faire échouer (ni laisser une famille d'essai)
    const appelSb = async (chemin, corps, jeton) => {
      for (let k = 1; ; k++) {
        try { return await (await fetch(URL_SB + chemin, { method: 'POST', body: JSON.stringify(corps),
          headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + (jeton || ANON) } })).json(); }
        catch (e) { if (k >= 3) throw e; await att(1500 * k); }
      }
    };
    const jetonDe = async (qui, mdp) => (await appelSb('/functions/v1/compte', { action: 'connecter', qui, mot_de_passe: mdp })).access_token;
    const j1 = await jetonDe('zz-essai', MDP), j2 = await jetonDe('zz-essai2', MDP2);
    const rpc = (nom, args, j) => appelSb('/rest/v1/rpc/' + nom, args, j);
    await rpc('famille_quitter', {}, j2); await rpc('famille_quitter', {}, j1);      // un essai d'avant resté en route
    let lina = '';
    try {
      const f = await rpc('famille_creer', { p_nom: 'Famille essai', p_stock: '', p_mouvements: '' }, j1);
      await rpc('famille_rejoindre', { p_code: f.famille.code }, j2);
      const demande = (await rpc('famille_etat', {}, j1)).membres.find(m => m.statut === 'attente');
      await rpc('famille_repondre', { p_user: demande.id, p_accepter: true }, j1);
      await B.js(`relancerMoteur().then(() => true)`);
      await aller('#/semaine');
      vrai(await attendre(`document.querySelectorAll('.fam-profils button').length === 3`, 40000) >= 0, 'pas de puces de profils');
      await B.js(`document.querySelector('.fam-profils [data-fam-profil]:not([aria-current])').click()`);
      vrai(await attendre(`M.ident === 'zz-essai2' && E.profil.id === 'zz-essai2' && !document.getElementById('bandeauProfil').hidden`, 40000) >= 0,
        "le profil de zz-essai2 ne s'ouvre pas");
      await aller('#/suivi');
      vrai(await attendre(`document.querySelector('main').textContent.includes('reste privé')`, 15000) >= 0,
        "le suivi d'un autre membre n'est pas privé : " + await B.js(`(document.querySelector('main h1') || {}).textContent + ' / ' + (M.ident || '?') + ' / ' + location.hash`));
      await B.js(`document.querySelector('[data-moi]').click()`);
      vrai(await attendre(`M.uid === M.moi.uid && E.profil.id === 'zz-essai'`, 30000) >= 0, 'pas de retour à soi');
      await aller('#/semaine');
      await B.js(`document.querySelector('[data-fam-tous]').click()`);
      vrai(await attendre(`document.querySelectorAll('.dose-membre').length === 2 && document.querySelectorAll('.dose-plat').length > 0`, 60000) >= 0,
        'pas de doses pour toute la famille');
      await B.photo('famille-tous');
      // 28/11/2026 : les courses de toute la famille, sur 3 jours, puis « Mettre sur ma liste »
      vrai(await B.js(`!!document.querySelector('[data-action=coursesFamille]')`), 'pas de « Les courses de la famille »');
      await B.js(`document.querySelector('[data-action=coursesFamille]').click()`);
      vrai(await attendre(`!!document.querySelector('#cfCorps [data-cf=liste]') || /Rien à acheter/.test((document.getElementById('cfCorps') || {}).textContent || '')`, 90000) >= 0,
        `les courses de la famille ne se calculent pas : ${await B.js(`(document.getElementById('cfCorps') || {}).textContent || ''`)}`);
      if (await B.js(`!!document.querySelector('#cfCorps [data-cf=liste]')`)) {
        const n = await B.js(`document.querySelectorAll('#cfCorps [data-cf-ligne]:checked').length`);
        await B.js(`document.querySelector('#cfCorps [data-cf=liste]').click()`);
        vrai(await attendre(`(E.liste_courses || []).filter(x => x.raison === 'famille, 3 jours').length >= Math.min(${n}, 100)`, 20000) >= 0,
          "les produits ne vont pas sur la liste");
        vrai(await B.js(`location.hash.startsWith('#/stock')`), "l'appli ne montre pas la liste");
        await aller('#/semaine');
      } else console.log('        (rien à acheter : le stock commun couvre tout)');
      await B.js(`(VUE_TOUS = false, true)`);
      // « Pour qui ? » → « Toute la famille » : le changement part aux autres (27/11/2026 : le choix était ignoré, la
      // fermeture de l'aperçu répondait « Seulement moi » à sa place).
      await B.js(`rendre(), true`); await att(500);
      await B.js(`(document.querySelector('.grille-plats a.repas[data-moment="din"]') || document.querySelector('.grille-plats a.repas[data-moment="dej"]')).click()`); await att(1200);
      vrai(await B.js(`(() => { const b = [...document.querySelectorAll('.carte-fond button')].find(x => /Retirer ce repas/.test(x.textContent)); if (!b) return false; b.click(); return true; })()`), 'pas de « Retirer ce repas »');
      // 28/11/2026 : « Seulement moi » et « Toute la famille » sont dans l'aperçu lui-même (plus de seconde fenêtre)
      vrai(await attendre(`document.getElementById('dialogue').open && !!document.querySelector('#dialogue [type=submit][data-qui=tous]')`, 15000) >= 0,
        "pas de « Toute la famille » dans l'aperçu");
      vrai(await B.js(`!document.querySelector('#dialogue [type=submit][value=oui]') && document.querySelector('#dialogue [type=submit]').dataset.qui === 'moi'`),
        "« Confirmer » reste, ou Entrée ne vaut pas « Seulement moi »");
      await B.js(`document.querySelector('#dialogue [data-qui=tous]').click()`);
      await att(800);
      vrai(await B.js(`!document.getElementById('dialogue').open || !/Pour qui/.test(document.getElementById('dialogue').textContent.replace('Pour qui ? Chacun garde ses quantités.', ''))`),
        'une seconde fenêtre « Pour qui ? » est encore ouverte');
      vrai(await attendre(`sb.from('operations_famille').select('id').then(r => (r.data || []).length > 0)`, 20000) >= 0, "« Toute la famille » n'est pas partagé");
      const ident = 'zz-m' + String(Date.now()).slice(-6);
      await B.js(`ajouterMembreSansTelephone({ prenom: 'Lina', nom_famille: 'Essai', date_naissance: '2008-05-14', sexe: 'femme', taille_cm: '158',
        poids_kg: '49', activite: 'leger', objectif: 'maintien', identifiant: '${ident}', pays: 'FR' }).then(() => true)`);
      lina = await B.js(`(M.familleEtat.membres.find(m => m.identifiant === '${ident}') || {}).id || ''`);
      vrai(!!lina, "le membre sans téléphone n'est pas dans la famille");
      await B.js(`afficherProfil('${lina}').then(() => true)`);
      vrai(await B.js(`E.profil.nom === 'Lina' && !!E.semaine`), "son profil ne s'ouvre pas, ou n'a pas de menu");
      await B.js(`afficherProfil(M.moi.uid).then(() => retirerMembreSansTelephone('${lina}')).then(() => true)`);
      vrai(await B.js(`!M.familleEtat.membres.some(m => m.id === '${lina}')`), "le membre sans téléphone n'est pas retiré");
      lina = '';
    } finally {
      if (lina) await appelSb('/functions/v1/compte', { action: 'membre_retirer', membre: lina }, j1);
      await rpc('famille_quitter', {}, j2); await rpc('famille_quitter', {}, j1);
      await B.js(`(VUE_TOUS = false, relancerMoteur().then(() => true))`).catch(() => {});
      await attendre(`M.prete && !M.famille && !!document.querySelector('.nav-bas')`, 60000);
    }
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
