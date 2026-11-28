/* Scanner un code-barres avec la caméra (Taha, 28/11/2026 : « le scan de code-barres, c'est génial ») : un produit
   emballé pour le stock, un repas ou un plat tout prêt.

   Scanner.lire({ titre }) → le code (8, 12 ou 13 chiffres, clé de contrôle juste) ou null (annulé).
   Détecteur : celui du téléphone s'il lit les EAN (Chrome sur Android), sinon ZXing en WebAssembly (iPhone,
   ordinateur) : barcode-detector 3.2.3 + zxing-wasm 3.1.6, chargés à la demande depuis jsDelivr et gardés par sw.js.
   Le code est confirmé par deux lectures pareilles d'affilée. On peut aussi taper les chiffres sous le code.
   Scanner.source : pour les essais, une fonction qui rend un MediaStream à la place de la caméra. */
(() => {
  const LIB = "https://cdn.jsdelivr.net/npm/barcode-detector@3.2.3/dist/iife/ponyfill.js";
  const INTEGRITE = "sha384-ZQvvHKgw7Ktqkui5vapXokyfDpQcnXLZhR9hfFMh8rUQztTRNywKQdQ994308nhY";
  const WASM = "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/reader/";
  const FORMATS = ["ean_13", "ean_8", "upc_a"];
  let detecteur = null;

  // EAN-8, UPC-A (12), EAN-13 : la clé de contrôle (modulo 10), comme le moteur (etiquettes.code_valide)
  function cleValide(code) {
    if (!/^(\d{8}|\d{12,13})$/.test(code)) return false;
    const c = code.split("").map(Number), cle = c.pop();
    const total = c.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (total % 10)) % 10 === cle;
  }

  async function preparer() {
    if (detecteur) return detecteur;
    if ("BarcodeDetector" in window) {
      try {
        const sait = await window.BarcodeDetector.getSupportedFormats();
        if (sait.includes("ean_13")) return (detecteur = new window.BarcodeDetector({ formats: FORMATS.filter(f => sait.includes(f)) }));
      } catch (e) { /* le détecteur du téléphone ne sait pas : ZXing */ }
    }
    if (!window.BarcodeDetectionAPI) await new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = LIB; s.integrity = INTEGRITE; s.crossOrigin = "anonymous";
      s.onload = ok; s.onerror = () => ko(new Error("Le lecteur de codes-barres ne se charge pas : vérifie ta connexion."));
      document.head.appendChild(s);
    });
    const api = window.BarcodeDetectionAPI;
    api.setZXingModuleOverrides({ locateFile: (chemin, prefixe) => chemin.endsWith(".wasm") ? WASM + chemin : prefixe + chemin });
    return (detecteur = new api.BarcodeDetector({ formats: FORMATS }));
  }

  async function camera() {
    if (Scanner.source) return Scanner.source();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Pas de caméra ici : tape le code.");
    return navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  }

  function lire({ titre = "Scanner un code-barres" } = {}) {
    return new Promise(resolve => {
      const d = document.createElement("dialog");
      d.className = "scan";
      d.setAttribute("aria-label", titre);
      d.innerHTML = `<video class="scan-video" playsinline muted autoplay></video>
        <div class="scan-cadre" aria-hidden="true"><i></i></div>
        <div class="scan-haut"><p class="scan-titre">${titre}</p>
          <button type="button" class="scan-fermer" data-scan="fermer" aria-label="Fermer">×</button></div>
        <div class="scan-bas"><p class="scan-aide" role="status">Le code-barres dans le cadre, bien à plat.</p>
          <form class="scan-taper" novalidate><input inputmode="numeric" pattern="[0-9]*" maxlength="13" autocomplete="off"
            placeholder="Ou tape les chiffres sous le code" aria-label="Les chiffres du code-barres"><button class="bouton" type="submit">OK</button></form>
          <button type="button" class="scan-lampe" data-scan="lampe" hidden>Lampe</button></div>`;
      document.body.appendChild(d);
      const video = d.querySelector("video"), aide = d.querySelector(".scan-aide"), saisie = d.querySelector(".scan-taper input");
      const toile = document.createElement("canvas"), ctx = toile.getContext("2d", { willReadFrequently: true });
      let flux = null, fini = false, minuteur = 0, dernier = "", lampe = false;
      const finir = code => {
        if (fini) return;
        fini = true;
        clearTimeout(minuteur);
        if (flux) flux.getTracks().forEach(t => t.stop());
        if (d.open) d.close();
        d.remove();
        resolve(code || null);
      };
      d.addEventListener("cancel", ev => { ev.preventDefault(); finir(null); });
      d.addEventListener("click", ev => {
        const b = ev.target.closest("[data-scan]");
        if (!b) return;
        if (b.dataset.scan === "fermer") return finir(null);
        if (b.dataset.scan === "lampe" && flux) {
          lampe = !lampe;
          flux.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: lampe }] }).catch(() => {});
          b.setAttribute("aria-pressed", String(lampe));
        }
      });
      d.querySelector("form").addEventListener("submit", ev => {
        ev.preventDefault();
        const code = saisie.value.replace(/\D/g, "");
        if (cleValide(code)) return finir(code);
        aide.textContent = code.length < 8 ? "8 ou 13 chiffres, ceux écrits sous le code-barres." : "Ce code a une faute : vérifie les chiffres.";
      });
      d.showModal();
      // Le cadre seul (88 % de la largeur, une bande au milieu) : plus rapide, et pas d'autre code lu par erreur.
      const lireImage = async () => {
        if (fini) return;
        try {
          const w = video.videoWidth, h = video.videoHeight;
          if (w && h) {
            const cw = Math.round(w * 0.88), ch = Math.round(Math.min(h * 0.42, cw * 0.6));
            const echelle = Math.min(1, 960 / cw);
            toile.width = Math.round(cw * echelle); toile.height = Math.round(ch * echelle);
            ctx.drawImage(video, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, toile.width, toile.height);
            const vus = await detecteur.detect(toile);
            const code = (vus || []).map(x => String(x.rawValue || "").replace(/\D/g, "")).find(cleValide);
            if (code && code === dernier) {
              if (navigator.vibrate) navigator.vibrate(60);
              return finir(code);
            }
            dernier = code || "";
          }
        } catch (e) { /* une image ratée : la suivante */ }
        minuteur = setTimeout(lireImage, 160);
      };
      (async () => {
        try {
          aide.textContent = "La caméra s'ouvre…";
          [flux] = await Promise.all([camera(), preparer()]);
          if (fini) { flux.getTracks().forEach(t => t.stop()); return; }
          video.srcObject = flux;
          await video.play().catch(() => {});
          const piste = flux.getVideoTracks()[0], peut = piste && piste.getCapabilities ? piste.getCapabilities() : {};
          d.querySelector("[data-scan=lampe]").hidden = !peut.torch;
          aide.textContent = "Le code-barres dans le cadre, bien à plat.";
          lireImage();
        } catch (e) {
          d.classList.add("sans-camera");
          aide.textContent = e && e.name === "NotAllowedError" ? "La caméra est refusée : autorise-la dans les réglages, ou tape le code."
            : (e && e.name === "Error" && e.message ? e.message : "La caméra ne s'ouvre pas : tape le code.");
          saisie.focus();
        }
      })();
    });
  }

  window.Scanner = { lire, cleValide, source: null };
})();
