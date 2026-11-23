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
    const i = await B.js(`[...document.querySelectorAll('.grille-plats a.repas')].findIndex(a => /smoothie/i.test(a.textContent))`);
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
    vrai(await B.js(`/pas dans ton stock/.test(document.getElementById('stockAide').textContent)`), 'pas de « n\'est pas dans ton stock »');
    await taper('');
    vrai(await attendre(`document.querySelectorAll('.stock-liste li').length >= 3`, 10000) >= 0, 'le stock ne montre pas les produits');
    const avant = await B.js(`document.querySelector('.stock-saisie').value`);
    // « À acheter » : une pastille va sur ma liste ; cochée puis validée, elle entre au stock (Taha, 23/11/2026).
    if (await B.js(`!!document.querySelector('.malin-puce')`)) {
      const nomMalin = await B.js(`document.querySelector('.malin-puce').dataset.nom`);
      await B.js(`document.querySelector('.malin-puce').click()`); await synchro();
      vrai(await attendre(`[...document.querySelectorAll('.liste-courses .lc-nom')].some(x => x.textContent === ${JSON.stringify(nomMalin)})`, 10000) >= 0, 'pas sur ma liste');
      await B.js(`document.querySelector('.liste-courses input[data-lc]').click()`); await att(100);
      vrai(await B.js(`!document.getElementById('lcValider').disabled`), 'Valider reste grisé');
      await B.js(`document.getElementById('lcValider').click()`); await synchro();
      vrai(await attendre(`!document.querySelector('.liste-courses')`, 10000) >= 0, 'la liste ne se vide pas');
    }
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
    vrai(await attendre(`document.querySelector('#gMange svg path, #gMange svg polyline')`, 10000) >= 0, 'pas de courbe');
    await aller('#/avancement?p=mois');
    vrai(await attendre(`document.querySelector('main h1')`, 10000) >= 0, 'mois ne s\'affiche pas');
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

  await test('Réglages : blocs présents', async () => {
    // Taha, 22/11/2026 (soir) : dans Profil, juste « Réglages » ; la page en lignes repliables, avec un résumé
    await aller('#/profil');
    vrai(await B.js(`document.querySelector('a[href="#/reglages"]').textContent.trim() === 'Réglages'`), 'le lien de Profil ne dit pas juste « Réglages »');
    await aller('#/reglages');
    const t = await B.js(`document.querySelector('main').textContent`);
    for (const mot of ['objectif', 'compte', 'même plat midi et soir']) vrai(new RegExp(mot, 'i').test(t), `« ${mot} » absent des Réglages`);
    vrai(await B.js(`document.querySelectorAll('.reglages .bloc.pliable:not(.ouvert)').length >= 4`), 'les rubriques ne sont pas repliées');
    vrai(await B.js(`document.documentElement.scrollHeight < 1400`), 'la page Réglages est encore trop longue');
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
