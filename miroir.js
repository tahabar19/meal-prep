// Mon Meal Prep — la silhouette au miroir (Taha, 27/11/2026 : « chaque jour je me mets devant le miroir, l'appli
// dessine une silhouette en pointillés pour la forme où je dois être, elle dit lève un peu la tête, bouge le tel à
// droite… jusqu'à matcher la photo initiale, ensuite la photo se prend et l'appli fait les calculs, par exemple elle
// remarque que les épaules sont 1 cm plus larges »).
//
// Chargé seulement quand on s'en sert (Suivi → Silhouette). La détection du corps (MediaPipe Pose Landmarker : 33
// points et le masque du corps) tourne DANS le téléphone : aucune image ne part à un service pour être analysée.
// L'appli (app.js) garde les photos dans le stockage privé « silhouettes » et les chiffres dans silhouette.json.
//
// Mesures : la hauteur du corps sur la photo (du haut de la tête aux pieds) donne l'échelle, grâce à la taille de la
// personne ; les largeurs (de face) et les profondeurs (de profil) se lisent sur le masque, à des hauteurs fixées par
// les points du corps (épaules, hanches, genoux). Un tour = le périmètre de l'ellipse largeur × profondeur, recalé une
// fois pour toutes sur le mètre ruban (la première fois). Précision : environ 1 cm, si la pose, la tenue et la lumière
// sont les mêmes ; c'est l'évolution sur plusieurs jours qui compte.
const Miroir = (() => {
  const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const MODELE = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
  const RAFALE = 7;                     // images mesurées à la prise (médiane : moins de bruit)
  const TENUE_MS = 1200;                // la bonne pose tenue ce temps-là avant la prise
  let vision = null, fichiers = null, detecteur = null, delegue = "GPU", enCharge = null;

  // ---------- Le détecteur, chargé une fois (≈ 19 Mo la première fois, ensuite en cache) ----------
  const options = (d) => ({
    baseOptions: { modelAssetPath: MODELE, delegate: d }, runningMode: "VIDEO", numPoses: 1, outputSegmentationMasks: true,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  function charger() {
    if (detecteur) return Promise.resolve(detecteur);
    if (!enCharge) enCharge = (async () => {
      vision = vision || await import(VISION + "/vision_bundle.mjs");
      fichiers = fichiers || await vision.FilesetResolver.forVisionTasks(VISION + "/wasm");
      try { detecteur = await vision.PoseLandmarker.createFromOptions(fichiers, options(delegue)); }
      catch (e) { delegue = "CPU"; detecteur = await vision.PoseLandmarker.createFromOptions(fichiers, options("CPU")); }
      return detecteur;
    })().catch((e) => { enCharge = null; throw e; });
    return enCharge;
  }
  async function passerAuCPU() {            // certains téléphones refusent le calcul sur la puce graphique
    if (delegue === "CPU") return false;
    delegue = "CPU";
    try { detecteur && detecteur.close(); } catch (e) {}
    detecteur = await vision.PoseLandmarker.createFromOptions(fichiers, options("CPU"));
    return true;
  }

  // ---------- Petits calculs ----------
  const moy = (a, b) => (a + b) / 2;
  const borne = (v, a, b) => Math.max(a, Math.min(b, v));
  const mediane = (t) => {
    const s = t.filter(Number.isFinite).sort((a, b) => a - b);
    if (!s.length) return NaN;
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const arrondi = (v, n = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** n) / 10 ** n : null);
  // Périmètre d'une ellipse (Ramanujan) : largeur et profondeur en cm.
  const ellipse = (l, p) => { const a = l / 2, b = p / 2; return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); };

  // Les points utiles du corps, en pixels de l'image ; v = visibilité (0 à 1).
  function corps(p, w, h) {
    const P = (i) => ({ x: p[i].x * w, y: p[i].y * h, v: p[i].visibility == null ? 1 : p[i].visibility });
    const nez = P(0), epG = P(11), epD = P(12), coG = P(13), coD = P(14), poG = P(15), poD = P(16), haG = P(23), haD = P(24),
      geG = P(25), geD = P(26), chG = P(27), chD = P(28);
    const S = { x: moy(epG.x, epD.x), y: moy(epG.y, epD.y) }, H = { x: moy(haG.x, haD.x), y: moy(haG.y, haD.y) };
    const K = { x: moy(geG.x, geD.x), y: moy(geG.y, geD.y) }, A = { x: moy(chG.x, chD.x), y: moy(chG.y, chD.y) };
    const T = Math.max(1, Math.hypot(H.x - S.x, H.y - S.y));          // longueur du tronc
    // le bras libre : celui dont le poignet est le plus bas (l'autre tient le téléphone)
    const libre = poG.y > poD.y ? { ep: epG, co: coG } : { ep: epD, co: coD };
    const angleBras = Math.atan2(Math.abs(libre.co.x - libre.ep.x), Math.max(1, libre.co.y - libre.ep.y)) * 180 / Math.PI;
    const xs = [nez, epG, epD, coG, coD, poG, poD, haG, haD, geG, geD, chG, chD].map((q) => q.x);
    return { nez, epG, epD, haG, haD, geG, geD, chG, chD, S, H, K, A, T, libre, angleBras,
      xmin: Math.min(...xs) - 0.35 * T, xmax: Math.max(...xs) + 0.35 * T,
      epaules: Math.hypot(epD.x - epG.x, epD.y - epG.y), bassin: Math.max(1, Math.abs(haD.x - haG.x)),
      pieds: Math.abs(chD.x - chG.x), hauteur: A.y - S.y };          // des épaules aux chevilles : la tête n'y joue pas
  }

  // ---------- Le masque du corps ----------
  // Une ligne du masque autour de x0 : [bord gauche, bord droit], au dixième de pixel (seuil 0,5), ou null.
  function bords(m, w, h, y, x0) {
    y = Math.round(y);
    if (y < 0 || y >= h) return null;
    const L = y * w;
    let x = Math.round(borne(x0, 0, w - 1));
    if (m[L + x] < 0.5) {                     // le point de départ tombe à côté : le plus proche dans le corps
      let trouve = -1;
      for (let r = 1; r < w * 0.04 && trouve < 0; r++) {
        if (x - r >= 0 && m[L + x - r] >= 0.5) trouve = x - r;
        else if (x + r < w && m[L + x + r] >= 0.5) trouve = x + r;
      }
      if (trouve < 0) return null;
      x = trouve;
    }
    let g = x, d = x;
    while (g > 0 && m[L + g - 1] >= 0.5) g--;
    while (d < w - 1 && m[L + d + 1] >= 0.5) d++;
    const fg = g > 0 ? (m[L + g] - 0.5) / Math.max(1e-6, m[L + g] - m[L + g - 1]) : 0;
    const fd = d < w - 1 ? (m[L + d] - 0.5) / Math.max(1e-6, m[L + d] - m[L + d + 1]) : 0;
    return [g - fg, d + fd, g === 0 || d === w - 1];
  }
  // La largeur au niveau y (médiane sur une petite bande : moins sensible au bruit du masque).
  function largeur(m, w, h, y, x0, bande) {
    const t = [];
    for (let k = -bande; k <= bande; k++) { const b = bords(m, w, h, y + k, x0); if (b && !b[2]) t.push(b[1] - b[0]); }
    return t.length >= Math.max(1, bande) ? mediane(t) : NaN;
  }
  // La largeur d'un membre, perpendiculairement à son axe (le bras n'est jamais tout à fait vertical).
  function travers(m, w, h, a, b, part) {
    const cx = a.x + (b.x - a.x) * part, cy = a.y + (b.y - a.y) * part, n = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / n, ny = (b.x - a.x) / n;
    const val = (t) => {
      const x = cx + nx * t, y = cy + ny * t, x0 = Math.floor(x), y0 = Math.floor(y);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) return 0;
      const fx = x - x0, fy = y - y0, i = y0 * w + x0;
      return m[i] * (1 - fx) * (1 - fy) + m[i + 1] * fx * (1 - fy) + m[i + w] * (1 - fx) * fy + m[i + w + 1] * fx * fy;
    };
    const R = n * 0.9, pas = 0.5;
    let t0 = 0;
    if (val(0) < 0.5) { t0 = NaN; for (let t = pas; t < n * 0.3; t += pas) { if (val(t) >= 0.5) { t0 = t; break; } if (val(-t) >= 0.5) { t0 = -t; break; } } }
    if (!Number.isFinite(t0)) return NaN;
    let g = t0, d = t0;
    while (g > -R && val(g - pas) >= 0.5) g -= pas;
    while (d < R && val(d + pas) >= 0.5) d += pas;
    if (g <= -R || d >= R) return NaN;       // le bras touche le corps : pas de mesure
    return d - g + pas;
  }
  // Du haut de la tête aux pieds, sur le masque (dans la zone du corps).
  function hauteurMasque(m, w, h, xmin, xmax) {
    const a = Math.max(0, Math.floor(xmin)), b = Math.min(w - 1, Math.ceil(xmax));
    const pleine = (y) => { let n = 0; const L = y * w; for (let x = a; x <= b; x++) if (m[L + x] >= 0.5 && ++n >= 3) return true; return false; };
    let haut = 0; while (haut < h && !pleine(haut)) haut++;
    let bas = h - 1; while (bas > haut && !pleine(bas)) bas--;
    return { haut, bas, px: bas - haut, coupee: haut <= 1 || bas >= h - 2 };
  }
  // Le contour de la silhouette (bords gauche et droit, ligne par ligne), en coordonnées 0 à 1 : la silhouette en
  // pointillés des jours suivants.
  function contour(m, w, h, c) {
    const hm = hauteurMasque(m, w, h, c.xmin, c.xmax);
    const a = Math.max(0, Math.floor(c.xmin)), b = Math.min(w - 1, Math.ceil(c.xmax));
    const pas = Math.max(2, Math.round(hm.px / 110)), gauche = [], droite = [];
    for (let y = hm.haut; y <= hm.bas; y += pas) {
      const L = y * w;
      let g = -1, d = -1;
      for (let x = a; x <= b; x++) if (m[L + x] >= 0.5) { g = x; break; }
      for (let x = b; x >= a; x--) if (m[L + x] >= 0.5) { d = x; break; }
      if (g >= 0) { gauche.push([arrondi(g / w, 4), arrondi(y / h, 4)]); droite.push([arrondi(d / w, 4), arrondi(y / h, 4)]); }
    }
    return gauche.concat(droite.reverse());
  }

  // ---------- Les mesures d'une image (en cm) ----------
  // face : largeurs (épaules, poitrine, taille, hanches, cuisse, bras) ; profil : profondeurs (poitrine, taille,
  // hanches, cuisse). Les niveaux suivent les points du corps : les mêmes d'un jour à l'autre.
  function mesurer(vue, p, m, w, h, tailleCm) {
    const c = corps(p, w, h), hm = hauteurMasque(m, w, h, c.xmin, c.xmax);
    if (hm.coupee || hm.px < h * 0.3) return null;
    const s = tailleCm / hm.px, bande = Math.max(1, Math.round(0.012 * c.T));
    const axe = (y) => c.S.x + (c.H.x - c.S.x) * ((y - c.S.y) / ((c.H.y - c.S.y) || 1));      // le milieu du tronc à ce niveau
    const niveau = { epaules: c.S.y + 0.06 * c.T, poitrine: c.S.y + 0.28 * c.T, taille: c.S.y + 0.62 * c.T, hanches: c.H.y + 0.1 * c.T,
      cuisse: c.H.y + 0.3 * (c.K.y - c.H.y) };
    const L = (cle, x) => largeur(m, w, h, niveau[cle], x, bande) * s;
    const out = { echelle: s, hauteur_px: hm.px };
    if (vue === "face") {
      const epaules = L("epaules", c.S.x);
      const tronc = (cle) => { const v = L(cle, axe(niveau[cle])); return v < epaules * 0.97 ? v : NaN; };   // bras collés : pas de mesure
      const cuisses = [[c.haG, c.geG], [c.haD, c.geD]].map(([a, b]) => {
        const x = a.x + (b.x - a.x) * 0.3, bd = bords(m, w, h, niveau.cuisse, x);
        if (!bd || bd[2]) return NaN;
        const autre = a === c.haG ? c.haD.x + (c.geD.x - c.haD.x) * 0.3 : c.haG.x + (c.geG.x - c.haG.x) * 0.3;
        const ensemble = autre > bd[0] && autre < bd[1];        // jambes qui se touchent : la moitié
        return (bd[1] - bd[0]) * (ensemble ? 0.5 : 1) * s;
      });
      out.largeurs = { epaules, poitrine: tronc("poitrine"), taille: tronc("taille"), hanches: L("hanches", c.H.x),
        cuisse: mediane(cuisses), bras: travers(m, w, h, c.libre.ep, c.libre.co, 0.5) * s };
    } else {
      out.profondeurs = { poitrine: L("poitrine", axe(niveau.poitrine)), taille: L("taille", axe(niveau.taille)),
        hanches: L("hanches", c.H.x), cuisse: L("cuisse", c.H.x + (c.K.x - c.H.x) * 0.3) };
    }
    return out;
  }
  // Plusieurs images : la médiane de chaque mesure.
  function reunir(liste, cle) {
    const out = {};
    for (const k of Object.keys((liste[0] || {})[cle] || {})) out[k] = arrondi(mediane(liste.map((x) => x[cle][k])), 1);
    return out;
  }
  // Les tours (cm) : ellipse largeur × profondeur, puis le recalage du mètre ruban (k) ; le bras : un cercle.
  function tours(face, profil, k = {}) {
    const L = face.largeurs || {}, P = profil.profondeurs || {}, out = {};
    for (const cle of ["poitrine", "taille", "hanches", "cuisse"])
      out[cle] = Number.isFinite(L[cle]) && Number.isFinite(P[cle]) ? arrondi(ellipse(L[cle], P[cle]) * (k[cle] || 1), 1) : null;
    out.bras = Number.isFinite(L.bras) ? arrondi(Math.PI * L.bras * (k.bras || 1), 1) : null;
    return out;
  }
  // Le recalage, une fois, sur les mesures au mètre ruban : k = ruban ÷ estimation (borné).
  function calibrer(ruban, face, profil) {
    const brut = tours(face, profil), k = {};
    for (const [cle, v] of Object.entries(brut)) if (v && ruban[cle] > 0) k[cle] = arrondi(borne(ruban[cle] / v, 0.7, 1.4), 4);
    return k;
  }

  // ---------- Les consignes : de la pose actuelle à celle de la référence ----------
  // Chaque écart a sa tolérance ; la première consigne non tenue s'affiche (et se dit). Sans référence (la première
  // fois), des repères simples : tout le corps dans l'écran, au milieu, de face (ou de profil), bras libre écarté.
  function consignes(p, w, h, ref, vue, inclinaison) {
    if (!p) return { ok: false, texte: "Mets-toi en entier dans le miroir", score: 0 };
    const c = corps(p, w, h), vis = (i, j) => Math.max(p[i].visibility ?? 1, j == null ? 0 : (p[j].visibility ?? 1));
    const tete = p[0].y, pieds = Math.max(p[27].y, p[28].y, p[29] ? p[29].y : 0, p[30] ? p[30].y : 0);
    if (vis(0) < 0.4 || tete < 0.05) return { ok: false, texte: "Recule un peu : ta tête doit être dans l'écran", score: 5 };
    if (vis(27, 28) < 0.4 || pieds > 0.97) return { ok: false, texte: "Recule un peu : tes pieds doivent être dans l'écran", score: 5 };
    if (vis(11, 12) < 0.5 || vis(23, 24) < 0.5) return { ok: false, texte: "Mets-toi en entier dans le miroir", score: 5 };
    const r = ref && ref.reperes, ici = reperes(p, w, h, inclinaison);
    const regles = [];
    const ecart = (d, tol, plus, moins) => regles.push({ d, tol, texte: d > 0 ? plus : moins });
    if (r) {
      ecart(ici.hauteur / r.hauteur - 1, 0.03, "Recule d'un petit pas", "Approche-toi un peu du miroir");
      ecart(ici.cx - r.cx, 0.03, "Bouge le téléphone un peu vers la droite", "Bouge le téléphone un peu vers la gauche");
      ecart(ici.cy - r.cy, 0.03, "Baisse un peu le téléphone", "Monte un peu le téléphone");
      if (ici.inclinaison != null && r.inclinaison != null)
        ecart(ici.inclinaison - r.inclinaison, 4, "Penche le haut du téléphone vers le miroir", "Penche le haut du téléphone vers toi");
    } else {
      ecart(ici.hauteur < 0.45 ? ici.hauteur - 0.45 : ici.hauteur > 0.7 ? ici.hauteur - 0.7 : 0, 0.001, "Recule d'un petit pas", "Approche-toi un peu du miroir");
      ecart(ici.cx - 0.5, 0.07, "Bouge le téléphone un peu vers la droite", "Bouge le téléphone un peu vers la gauche");
      if (ici.inclinaison != null) ecart(ici.inclinaison - 90, 8, "Penche le haut du téléphone vers le miroir", "Penche le haut du téléphone vers toi");
    }
    if (vue === "face") {
      if (r) ecart(ici.face - r.face, 0.06, "Mets-toi face au miroir, comme la première fois", "Mets-toi bien de face au miroir");
      else ecart(ici.face < 0.5 ? ici.face - 0.5 : 0, 0.001, "", "Mets-toi bien de face au miroir");
      if (r) ecart(ici.bras - r.bras, 8, "Rapproche un peu le bras libre du corps", "Écarte un peu le bras libre du corps");
      else ecart(ici.bras < 14 ? ici.bras - 14 : 0, 0.001, "", "Écarte un peu le bras libre du corps");
      if (r) ecart(ici.pieds - r.pieds, 0.25, "Rapproche un peu les pieds", "Écarte un peu les pieds");
      else ecart(ici.pieds < 0.6 ? ici.pieds - 0.6 : 0, 0.001, "", "Écarte les pieds, à la largeur des hanches");
    } else {
      if (r) ecart(ici.face - r.face, 0.08, "Tourne-toi encore un peu : bien de profil", "Tourne-toi un peu moins");
      else ecart(ici.face > 0.35 ? ici.face - 0.35 : 0, 0.001, "Tourne-toi d'un quart : bien de profil", "");
    }
    if (r) ecart(ici.tete - r.tete, 0.05, "Lève un peu la tête", "Baisse un peu la tête");
    let score = 0;
    for (const x of regles) score += borne(1 - Math.abs(x.d) / (2 * Math.max(x.tol, 0.02)), 0, 1);
    score = Math.round((100 * score) / Math.max(1, regles.length));
    const faux = regles.find((x) => Math.abs(x.d) > x.tol);
    return faux ? { ok: false, texte: faux.texte, score: Math.min(score, 94) } : { ok: true, texte: "Parfait, ne bouge plus", score: 100 };
  }
  // Ce qui se compare d'un jour à l'autre (sans unité) : taille du corps dans l'image, place, inclinaison, rotation,
  // bras, pieds, tête.
  function reperes(p, w, h, inclinaison) {
    const c = corps(p, w, h);
    return { hauteur: c.hauteur / h, cx: c.H.x / w, cy: c.H.y / h, inclinaison: inclinaison == null ? null : arrondi(inclinaison, 1),
      face: c.epaules / c.T, bras: c.angleBras, pieds: c.pieds / c.bassin, tete: (c.nez.y - c.S.y) / c.T };
  }

  // ---------- L'écran de la caméra ----------
  let ecran = null;
  function fermer() {
    if (!ecran) return;
    const e = ecran; ecran = null;
    e.fini = true;
    try { e.flux && e.flux.getTracks().forEach((t) => t.stop()); } catch (x) {}
    window.removeEventListener("deviceorientation", e.surOrientation);
    try { speechSynthesis.cancel(); } catch (x) {}
    e.racine.remove();
    document.body.classList.remove("miroir-ouvert");
  }
  // Dire une consigne (pas plus d'une toutes les 2,5 s, et pas deux fois la même de suite).
  function dire(e, texte) {
    if (!e.voix || !("speechSynthesis" in window) || !texte || texte === e.dit || Date.now() - e.ditA < 2500) return;
    e.dit = texte; e.ditA = Date.now();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texte);
      u.lang = (typeof LOCALE === "string" && LOCALE) || "fr-FR"; u.rate = 1.05;
      speechSynthesis.speak(u);
    } catch (x) {}
  }
  // Image (coordonnées 0 à 1) → écran, comme la vidéo affichée en « cover ».
  function versEcran(e) {
    const v = e.video, cw = e.dessin.clientWidth, ch = e.dessin.clientHeight, vw = v.videoWidth || 1, vh = v.videoHeight || 1;
    const k = Math.max(cw / vw, ch / vh), ox = (cw - vw * k) / 2, oy = (ch - vh * k) / 2;
    return (x, y) => [ox + x * vw * k, oy + y * vh * k];
  }
  function dessiner(e, p, ref, ok) {
    const cv = e.dessin, dpr = window.devicePixelRatio || 1, cw = cv.clientWidth, ch = cv.clientHeight;
    if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const ec = versEcran(e);
    if (ref && ref.contour && ref.contour.length > 2) {          // la silhouette de référence, en pointillés
      g.beginPath();
      ref.contour.forEach(([x, y], i) => { const [a, b] = ec(x, y); i ? g.lineTo(a, b) : g.moveTo(a, b); });
      g.closePath();
      g.setLineDash([7, 7]); g.lineWidth = 2.5; g.strokeStyle = ok ? "rgba(200,240,75,.95)" : "rgba(255,255,255,.85)";
      g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 4; g.stroke(); g.shadowBlur = 0; g.setLineDash([]);
    }
    if (p) {                                                       // où l'on est : le squelette, discret
      const traits = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]];
      g.lineWidth = 3; g.lineCap = "round"; g.strokeStyle = ok ? "rgba(200,240,75,.9)" : "rgba(167,139,250,.75)";
      g.beginPath();
      for (const [a, b] of traits) { const [x1, y1] = ec(p[a].x, p[a].y), [x2, y2] = ec(p[b].x, p[b].y); g.moveTo(x1, y1); g.lineTo(x2, y2); }
      g.stroke();
    }
  }
  function creerEcran(titre, etape) {
    const racine = document.createElement("div");
    racine.className = "miroir";
    racine.setAttribute("role", "dialog"); racine.setAttribute("aria-modal", "true"); racine.setAttribute("aria-label", titre);
    racine.innerHTML = `<video playsinline muted autoplay></video><canvas class="miroir-dessin" aria-hidden="true"></canvas>
      <div class="miroir-haut"><button type="button" class="miroir-fermer" aria-label="Fermer">${typeof icone === "function" ? icone("x") : "×"}</button>
        <div class="miroir-titre"><b></b><small></small></div><button type="button" class="miroir-voix" aria-pressed="true">Voix</button></div>
      <div class="miroir-bas"><div class="miroir-anneau" aria-hidden="true"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="jauge" cx="22" cy="22" r="19"/></svg><span>0</span></div>
        <p class="miroir-consigne" role="status" aria-live="polite">Chargement…</p>
        <button type="button" class="miroir-prendre" hidden>Prendre quand même</button></div>
      <div class="miroir-flash"></div>`;
    racine.querySelector(".miroir-titre b").textContent = titre;
    racine.querySelector(".miroir-titre small").textContent = etape || "";
    document.body.appendChild(racine);
    document.body.classList.add("miroir-ouvert");
    return racine;
  }

  // ---------- Prendre une vue (face ou profil) ----------
  // → { points, contour, reperes, image: [w, h], mesures, photo (Blob JPEG), qualite } ; null si on ferme.
  async function capturer({ vue = "face", reference = null, tailleCm, titre, etape }) {
    fermer();
    const racine = creerEcran(titre || (vue === "face" ? "De face" : "De profil"), etape);
    const e = ecran = { racine, video: racine.querySelector("video"), dessin: racine.querySelector(".miroir-dessin"), voix: true,
      dit: "", ditA: 0, inclinaison: null, fini: false };
    const consigne = racine.querySelector(".miroir-consigne"), anneau = racine.querySelector(".miroir-anneau");
    const montrer = (texte, score) => {
      consigne.textContent = texte;
      anneau.querySelector("span").textContent = score == null ? "" : String(score);
      anneau.querySelector(".jauge").style.strokeDashoffset = String(119.4 * (1 - (score || 0) / 100));
      anneau.classList.toggle("ok", score === 100);
    };
    return new Promise(async (resoudre) => {
      const fin = (r) => { if (ecran === e) fermer(); resoudre(r); };
      racine.querySelector(".miroir-fermer").addEventListener("click", () => fin(null));
      const bVoix = racine.querySelector(".miroir-voix");
      bVoix.addEventListener("click", () => { e.voix = !e.voix; bVoix.setAttribute("aria-pressed", String(e.voix)); if (!e.voix) try { speechSynthesis.cancel(); } catch (x) {} });
      e.surOrientation = (ev) => { if (ev.beta != null) e.inclinaison = ev.beta; };
      window.addEventListener("deviceorientation", e.surOrientation);
      try {
        montrer("Préparation de la caméra…", null);
        e.flux = Miroir.source ? await Miroir.source(vue) : await navigator.mediaDevices.getUserMedia({ audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1080 }, height: { ideal: 1920 } } });
        if (e.fini) { e.flux.getTracks().forEach((t) => t.stop()); return resoudre(null); }
        e.video.srcObject = e.flux;
        await e.video.play().catch(() => {});
        montrer(detecteur ? "Un instant…" : "Chargement de la détection du corps (la première fois, quelques secondes)…", null);
        await charger();
      } catch (err) {
        montrer(err && err.name === "NotAllowedError" ? "L'appli n'a pas accès à la caméra : autorise-la dans les réglages du téléphone."
          : "Caméra ou détection impossible sur ce téléphone.", null);
        return;
      }
      if (e.fini) return resoudre(null);
      const prendre = racine.querySelector(".miroir-prendre");
      let dernier = 0, okDepuis = 0, rafale = null, debut = performance.now(), forcer = false, dernierTemps = 0;
      prendre.addEventListener("click", () => { forcer = true; });
      const boucle = async (t) => {
        if (e.fini) return;
        if (e.video.readyState < 2 || t - dernier < 66) return requestAnimationFrame(boucle);
        dernier = t;
        const w = e.video.videoWidth, h = e.video.videoHeight;
        let res;
        try { res = detecteur.detectForVideo(e.video, dernierTemps = Math.max(dernierTemps + 1, performance.now())); }
        catch (err) {
          if (await passerAuCPU().catch(() => false)) return requestAnimationFrame(boucle);
          montrer("La détection du corps ne marche pas sur ce téléphone.", null); return;
        }
        const p = res.landmarks && res.landmarks[0];
        const masque = res.segmentationMasks && res.segmentationMasks[0];
        const c = consignes(p, w, h, reference, vue, e.inclinaison);
        const ok = c.ok || forcer;
        if (rafale) {
          if (p && masque && (ok || rafale.forcee)) {
            const m = masque.getAsFloat32Array();
            const mesure = mesurer(vue, p, m, w, h, tailleCm);
            if (mesure) rafale.mesures.push(mesure);
            if (rafale.mesures.length === Math.ceil(RAFALE / 2)) {          // l'image du milieu : photo et contour
              rafale.points = p.map((q) => [arrondi(q.x, 4), arrondi(q.y, 4), arrondi(q.z, 4), arrondi(q.visibility ?? 1, 2)]);
              rafale.contour = contour(m, w, h, corps(p, w, h));
              rafale.reperes = reperes(p, w, h, e.inclinaison);
              const toile = document.createElement("canvas"); toile.width = w; toile.height = h;
              toile.getContext("2d").drawImage(e.video, 0, 0, w, h);
              rafale.photo = await new Promise((r) => toile.toBlob(r, "image/jpeg", 0.86));
            }
          } else if (!ok) { rafale = null; okDepuis = 0; }               // il a bougé : on recommence
        }
        try { res.segmentationMasks && res.segmentationMasks.forEach((x) => x.close()); res.close && res.close(); } catch (x) {}
        dessiner(e, p, reference, c.ok);
        if (rafale && rafale.mesures.length >= RAFALE && rafale.photo) {
          racine.classList.add("flash");
          dire(e, "C'est pris");
          const L = rafale.mesures;
          const resultat = { vue, points: rafale.points, contour: rafale.contour, reperes: rafale.reperes, image: [w, h],
            mesures: { echelle: arrondi(mediane(L.map((x) => x.echelle)), 5), hauteur_px: Math.round(mediane(L.map((x) => x.hauteur_px))),
              ...(vue === "face" ? { largeurs: reunir(L, "largeurs") } : { profondeurs: reunir(L, "profondeurs") }) },
            photo: rafale.photo, qualite: rafale.forcee ? 0.5 : 1 };
          return setTimeout(() => fin(resultat), 450);
        }
        if (!rafale) {
          montrer(c.texte, c.score);
          dire(e, c.texte);
          if (c.ok) { if (!okDepuis) okDepuis = t; } else okDepuis = 0;
          if ((okDepuis && t - okDepuis > TENUE_MS) || forcer) { rafale = { mesures: [], forcee: forcer && !c.ok }; forcer = false; montrer("Ne bouge plus…", 100); dire(e, "Ne bouge plus"); }
          prendre.hidden = !(t - debut > 25000 && p);
        }
        requestAnimationFrame(boucle);
      };
      requestAnimationFrame(boucle);
    });
  }

  // iPhone : la voix et l'inclinaison du téléphone ne s'ouvrent que dans un toucher ; à appeler tout de suite dans le clic.
  function deverrouiller() {
    try { if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (x) {}
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function")
        DeviceOrientationEvent.requestPermission().catch(() => {});
    } catch (x) {}
    charger().catch(() => {});                    // le modèle se charge pendant qu'on remplit les mesures
  }

  return { charger, capturer, fermer, tours, calibrer, consignes, mesurer, reperes, ellipse, deverrouiller, source: null };
})();
