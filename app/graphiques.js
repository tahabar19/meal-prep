// Graphiques en SVG, sans bibliothèque : courbes avec réticule et barres avec repère.
// Repris de Muscu Jeu (~/Bureau/muscu-jeu/js/graphiques.js). Les couleurs viennent des
// variables CSS (--s1, --s2, --s3, --accent). Script classique : tout est sous `Graph`.
"use strict";
const Graph = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const el = (nom, attrs = {}, parent = null) => {
    const e = document.createElementNS(NS, nom);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const nb = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString(typeof LOCALE === "string" ? LOCALE : "fr-FR");
  // « ven 20 nov. » (Taha, 22/11/2026 : le jour de la semaine avec la date, sans point après le jour)
  const jourCourt = d => new Date(d).toLocaleDateString(typeof LOCALE === "string" ? LOCALE : "fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(/^(\p{L}+)\./u, "$1");

  function graduations(min, max, n = 4) {
    const brut = (max - min) / n || 1, p = 10 ** Math.floor(Math.log10(brut));
    const pas = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= brut);
    const out = [];
    for (let v = Math.ceil(min / pas) * pas; v <= max + 1e-9; v += pas) out.push(Math.round(v * 1000) / 1000);
    return out;
  }
  function cadre(hote, hauteur, titre) {
    hote.innerHTML = "";
    hote.classList.add("graph");
    const L = Math.max(280, hote.clientWidth || 560), H = hauteur;
    const svg = el("svg", { viewBox: `0 0 ${L} ${H}`, width: "100%", height: H, role: "img", "aria-label": titre || "Graphique" }, hote);
    const bulle = document.createElement("div");
    bulle.className = "bulle";
    bulle.hidden = true;
    hote.appendChild(bulle);
    return { svg, bulle, L, H };
  }
  function montrer(bulle, hote, x, y, html) {
    bulle.innerHTML = html;
    bulle.hidden = false;
    const l = bulle.offsetWidth, max = hote.clientWidth;
    bulle.style.left = `${Math.max(0, Math.min(max - l, x - l / 2))}px`;
    bulle.style.top = `${Math.max(0, y - bulle.offsetHeight - 12)}px`;
  }
  // Ce que montre le graphique, sous lui (Taha, 23/11/2026 : « dis calories, jour… pour que le user comprenne ») :
  // chaque ligne avec sa couleur et son trait, puis ce que disent les axes.
  function legende(hote, items, axes) {
    const p = document.createElement("p");
    p.className = "graph-legende";
    p.innerHTML = items.map(x => `<span><i class="${x.pointille ? "gl-pointille" : x.barre ? "gl-barre" : "gl-trait"}" style="--c:${x.couleur}"></i>${x.nom}</span>`).join("")
      + (axes ? `<small>${axes}</small>` : "");
    hote.appendChild(p);
  }
  function vide(hote, texte) {
    hote.classList.add("graph");
    hote.innerHTML = `<p class="graph-vide">${texte}</p>`;
  }

  // Courbes dans le temps. series = [{ nom, couleur, points: [{ x: 'AAAA-MM-JJ', y }], pointille, marques }]
  // yMin / yMax : le bas et le haut de l'axe (Taha, 20/11/2026 : 500 kcal sous la journée la plus basse, 200 au-dessus de la plus haute).
  function courbes(hote, { series, unite = "", hauteur = 220, aujourdhui = null, videTexte = "Pas encore de données.", titre = "", decimales = 0, yMin = null, yMax = null,
                           axeX = "le jour du mois" }) {
    const tous = series.flatMap(s => s.points);
    if (!tous.length) return vide(hote, videTexte);
    const { svg, bulle, L, H } = cadre(hote, hauteur, titre);
    const m = { g: 48, d: 16, h: 22, b: 26 };
    const xs = tous.map(p => +new Date(p.x)), ys = tous.map(p => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    if (x0 === x1) { x0 -= 864e5 * 3; x1 += 864e5 * 3; }
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const marge = (y1 - y0) * 0.15 || Math.max(1, y1 * 0.05);
    y0 -= marge; y1 += marge;
    if (yMin != null) y0 = yMin;                     // les bornes demandées sont tenues exactement
    if (yMax != null) y1 = yMax;
    const X = d => m.g + ((+new Date(d) - x0) / (x1 - x0)) * (L - m.g - m.d);
    const Y = v => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.h - m.b);
    // Avec des bornes demandées, le bas et le haut de l'axe sont toujours écrits ; les graduations trop proches
    // d'eux (moins de 18 px) s'effacent pour que les chiffres ne se chevauchent pas (Taha, 20/11/2026).
    let lignesY = graduations(y0, y1);
    if (yMin != null || yMax != null) {
      const bornes = [yMin != null ? y0 : null, yMax != null ? y1 : null].filter(v => v != null).map(v => Math.round(v));
      lignesY = [...bornes, ...lignesY.filter(v => bornes.every(b => Math.abs(Y(v) - Y(b)) >= 18))].sort((a, b) => a - b);
    }
    for (const v of lignesY) {
      el("line", { x1: m.g, x2: L - m.d, y1: Y(v), y2: Y(v), class: "grille" }, svg);
      el("text", { x: m.g - 8, y: Y(v) + 4, class: "axe", "text-anchor": "end" }, svg).textContent = nb(v, decimales && y1 - y0 < 8 ? decimales : 0);
    }
    // Les dates de l'axe : des jours entiers, chacun une seule fois (Taha, 20/11/2026 : « 16 nov » répété).
    const JOUR = 864e5, nbJours = Math.round((x1 - x0) / JOUR), pasJours = Math.max(1, Math.ceil(nbJours / Math.max(2, Math.floor((L - m.g - m.d) / 40))));
    const reperes = [];
    for (let k = nbJours; k >= 0; k -= pasJours) reperes.unshift(x0 + k * JOUR);      // le dernier jour a toujours sa date
    reperes.forEach((d, i) => {
      const bord = X(d) < m.g + 24 ? "start" : X(d) > L - m.d - 24 ? "end" : "middle";
      // Sur l'axe, le numéro du jour seulement ; la date entière est dans la bulle du point touché (Taha, 23/11/2026).
      el("text", { x: X(d), y: H - 6, class: "axe", "text-anchor": bord }, svg).textContent = new Date(d).getDate();
    });
    if (aujourdhui && +new Date(aujourdhui) >= x0 && +new Date(aujourdhui) <= x1) {
      el("line", { x1: X(aujourdhui), x2: X(aujourdhui), y1: m.h, y2: H - m.b, class: "repere" }, svg);
      el("text", { x: X(aujourdhui) + 6, y: m.h + 10, class: "axe" }, svg).textContent = "aujourd'hui";
    }
    for (const s of series) {
      if (!s.points.length) continue;
      const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
      el("path", { d, fill: "none", stroke: s.couleur, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
                   ...(s.pointille ? { "stroke-dasharray": "5 6" } : {}) }, svg);
      if (s.marques) for (const p of s.points) el("circle", { cx: X(p.x), cy: Y(p.y), r: 4, fill: s.couleur, class: "marque" }, svg);
    }
    if (unite) el("text", { x: m.g - 8, y: 9, class: "axe unite", "text-anchor": "end" }, svg).textContent = unite;
    legende(hote, series.filter(s => s.points.length).map(s => ({ nom: s.nom, couleur: s.couleur, pointille: s.pointille })),
            `${unite ? `Hauteur : ${unite}` : ""}${unite && axeX ? " · " : ""}${axeX ? `en bas : ${axeX}` : ""}`);
    const fil = el("line", { y1: m.h, y2: H - m.b, class: "reticule", visibility: "hidden" }, svg);
    const zone = el("rect", { x: m.g, y: m.h, width: L - m.g - m.d, height: H - m.h - m.b, fill: "transparent" }, svg);
    // Souris : la valeur au survol ; téléphone : toucher un point montre sa valeur, qui reste affichée (Taha, 20/11/2026).
    const voir = e => {
      const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * L;
      let proche = null;
      for (const p of tous) if (!proche || Math.abs(X(p.x) - px) < Math.abs(X(proche.x) - px)) proche = p;
      fil.setAttribute("x1", X(proche.x));
      fil.setAttribute("x2", X(proche.x));
      fil.setAttribute("visibility", "visible");
      const lignes = series.map(s => {
        const p = s.points.find(q => q.x === proche.x);
        return p ? `<span><i style="background:${s.couleur}"></i>${s.nom}</span><b>${nb(p.y, decimales)} ${unite}</b>` : "";
      }).join("");
      montrer(bulle, hote, (X(proche.x) / L) * r.width, (Y(proche.y) / H) * r.height, `<em>${jourCourt(proche.x)}</em>${lignes}`);
    };
    zone.addEventListener("pointermove", voir);
    zone.addEventListener("pointerdown", voir);
    // Un toucher ailleurs (hors de la courbe) fait disparaître la bulle ; un toucher dans le graphique la déplace.
    const cacher = () => { fil.setAttribute("visibility", "hidden"); bulle.hidden = true; };
    const dehors = e => {
      if (!hote.isConnected) return document.removeEventListener("pointerdown", dehors, true);     // graphique redessiné
      if (!bulle.hidden && e.target !== zone) cacher();
    };
    document.addEventListener("pointerdown", dehors, true);
    zone.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") cacher(); });
  }

  // Barres. donnees = [{ etiquette, valeur, detail, couleur, choisi }] ; cible = trait pointillé (objectif).
  function barres(hote, { donnees, couleur = "var(--s1)", unite = "", hauteur = 200, cible = null, nomCible = "objectif",
                          decimales = 0, videTexte = "Pas encore de données.", titre = "", nom = "", axeX = "le jour" }) {
    if (!donnees.length) return vide(hote, videTexte);
    const { svg, bulle, L, H } = cadre(hote, hauteur, titre);
    const m = { g: 44, d: 8, h: 22, b: 26 };
    const max = Math.max(...donnees.map(d => d.valeur), cible || 0, 1);
    const grad = graduations(0, max * 1.12, 3), haut = Math.max(grad[grad.length - 1] || 0, max * 1.12);   // le plus haut reste dans le cadre
    const pas = (L - m.g - m.d) / Math.max(donnees.length, 6), larg = Math.min(38, pas - 6);
    const Y = v => H - m.b - (v / haut) * (H - m.h - m.b);
    for (const v of grad) {
      el("line", { x1: m.g, x2: L - m.d, y1: Y(v), y2: Y(v), class: "grille" }, svg);
      el("text", { x: m.g - 8, y: Y(v) + 4, class: "axe", "text-anchor": "end" }, svg).textContent = nb(v, 0);
    }
    donnees.forEach((d, i) => {
      const x = m.g + pas * i + (pas - larg) / 2, y = Y(d.valeur), h = H - m.b - y;
      const r = Math.min(4, Math.max(0, h));
      const b = el("path", { d: `M${x},${y + h}V${y + r}q0,-${r} ${r},-${r}h${larg - 2 * r}q${r},0 ${r},${r}V${y + h}z`,
                             fill: d.couleur || couleur, class: "barre" + (d.choisi ? " choisie" : "") }, svg);
      if (donnees.length <= 12) el("text", { x: x + larg / 2, y: H - 8, class: "axe" + (d.choisi ? " ici" : ""), "text-anchor": "middle" }, svg).textContent = d.etiquette;
      const zone = el("rect", { x: m.g + pas * i, y: m.h, width: pas, height: H - m.h - m.b, fill: "transparent" }, svg);
      zone.addEventListener("pointerenter", () => {
        b.classList.add("survol");
        const rr = svg.getBoundingClientRect();
        montrer(bulle, hote, ((x + larg / 2) / L) * rr.width, (y / H) * rr.height,
                `<em>${d.detail || d.etiquette}</em><span>${nb(d.valeur, decimales)} ${unite}</span>${cible ? `<span>${nomCible}</span><b>${nb(cible, decimales)} ${unite}</b>` : ""}`);
      });
      zone.addEventListener("pointerleave", () => { b.classList.remove("survol"); bulle.hidden = true; });
    });
    if (unite) el("text", { x: m.g - 8, y: 9, class: "axe unite", "text-anchor": "end" }, svg).textContent = unite;
    legende(hote, [...(nom ? [{ nom, couleur, barre: true }] : []), ...(cible ? [{ nom: nomCible, couleur: "var(--texte)", pointille: true }] : [])],
            `${unite ? `Hauteur : ${unite}` : ""}${unite && axeX ? " · " : ""}${axeX ? `en bas : ${axeX}` : ""}`);
    if (cible) {
      el("line", { x1: m.g, x2: L - m.d, y1: Y(cible), y2: Y(cible), class: "cible" }, svg);
      el("text", { x: L - m.d, y: Y(cible) - 6, class: "etiquette", "text-anchor": "end" }, svg).textContent = `${nomCible} ${nb(cible, decimales)}`;
    }
  }
  return { courbes, barres };
})();
