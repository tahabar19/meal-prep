"""Construit l'appli en ligne (app/) à partir de l'appli du PC, qui reste la source :
    python3 outils/construire.py            (avec les photos du catalogue : la première fois ou quand elles changent)
    python3 outils/construire.py --sans-photos

- app/py.json        : le moteur Python (repas/*.py, le même que sur le PC) + app/py/web.py, pour Pyodide ;
- app/catalogue.json : les fiches repas (repas.json), la pondération, recettes.json et nutriments.json ;
- app/photos/        : les photos du catalogue en 160, 480 et 960 px ;
- app/app.js, app.css, graphiques.js, icones.js, polices et icônes : la page du PC, retouchée pour le web
  (chemins relatifs, photos, compte Claude dans Réglages). Chaque retouche vérifie qu'elle s'applique."""
import json
import re
import shutil
import sys
import time
from pathlib import Path

JARVIS = Path.home() / "jarvis/jarvis-assistant-vocal"
REPAS = JARVIS / "repas"
SITE = REPAS / "site"
FICHES = Path.home() / "Bureau/prep_meal"
APP = Path(__file__).resolve().parent.parent / "app"
LARGEURS = (160, 480, 960)


def retoucher(texte: str, nom: str, retouches: list) -> str:
    for avant, apres in retouches:
        if texte.count(avant) != 1:
            sys.exit(f"{nom} : la retouche ne s'applique plus ({texte.count(avant)} fois) :\n{avant[:200]}")
        texte = texte.replace(avant, apres)
    return texte


def moteur():
    fichiers = {}
    for f in sorted(REPAS.glob("*.py")):
        if f.name == "telegram.py":
            continue
        fichiers[f"repas/{f.name}"] = f.read_text(encoding="utf-8")
    fichiers["web.py"] = (APP / "py/web.py").read_text(encoding="utf-8")
    (APP / "py.json").write_text(json.dumps(fichiers, ensure_ascii=False), encoding="utf-8")
    return len(fichiers)


def _sans_adresse(x):
    """Le dépôt est public : rien de personnel dans les fiches (« drive le plus proche de <adresse> »)."""
    if isinstance(x, dict):
        return {k: _sans_adresse(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_sans_adresse(v) for v in x]
    if isinstance(x, str):
        return re.sub(r"\s*\((?:drive )?le plus proche de [^)]*\)", "", x)
    return x


def catalogue():
    repas = _sans_adresse(json.loads((FICHES / "repas.json").read_text(encoding="utf-8")))
    avec_photo = [f["dossier"] for f in repas["repas"] if f.get("photo") and (FICHES / f.get("dossier", "") / "photo.jpg").is_file()]
    (APP / "catalogue.json").write_text(json.dumps({
        "repas.json": json.dumps(repas, ensure_ascii=False, indent=1),
        "ponderation.yaml": (FICHES / "ponderation.yaml").read_text(encoding="utf-8"),
        "recettes.json": (SITE / "recettes.json").read_text(encoding="utf-8"),
        "nutriments.json": (SITE / "nutriments.json").read_text(encoding="utf-8"),
        "photos": avec_photo,
    }, ensure_ascii=False), encoding="utf-8")
    return repas, avec_photo


def photos(repas):
    from PIL import Image
    dossier = APP / "photos"
    dossier.mkdir(exist_ok=True)
    n = 0
    for f in repas["repas"]:
        source = FICHES / f.get("dossier", "") / "photo.jpg"
        if not f.get("photo") or not source.is_file():
            continue
        for l in LARGEURS:
            cible = dossier / f"{f['id']}-{l}.jpg"
            if cible.exists() and cible.stat().st_mtime >= source.stat().st_mtime:
                continue
            with Image.open(source) as im:
                im = im.convert("RGB")
                im.thumbnail((l, l * 2))
                im.save(cible, "JPEG", quality=80, optimize=True, progressive=True)
            n += 1
    return n


def icones():
    sys.path.insert(0, str(JARVIS))
    icones = {p.stem: p.read_text(encoding="utf-8").strip() for p in sorted((SITE / "icones").glob("*.svg"))}
    (APP / "icones.js").write_text("const ICONES = " + json.dumps(icones, ensure_ascii=False) + ";\n", encoding="utf-8")


def page():
    js = retoucher((SITE / "app.js").read_text(encoding="utf-8"), "app.js", [
        # Les photos : celles du catalogue sont des fichiers de l'appli, celles de tes plats sont dans Supabase.
        ('<img src="/photo/${r.id}?l=${largeur}&v=${r.photo}"', '<img src="${urlPhoto(r, largeur)}"'),
        ('navigator.serviceWorker.register("/sw.js")', 'navigator.serviceWorker.register("sw.js")'),
        # Pas de PDF à télécharger en ligne (Chrome du PC).
        # En ligne : pas de PC à allumer.
        ('<h1 tabindex="-1" style="margin-bottom:8px">L\'appli ne répond pas</h1>\n    <p>Vérifie que le PC est allumé et que le site y tourne, sur le même Wi-Fi que ce téléphone.</p>',
         '<h1 tabindex="-1" style="margin-bottom:8px">L\'appli ne répond pas</h1>\n    <p>Vérifie ta connexion à internet, puis réessaie.</p>'),
        ('const boutonPdf = (quoi, texte = "Exporter en PDF") => `<a class="bouton sobre" href="/export/${quoi}.pdf" download>${icone("notebook")}${texte}</a>`;',
         'const boutonPdf = () => "";'),
        # Pages retirées de l'appli en ligne (Taha, 22/11/2026 : « je ne vois pas comment y accéder ») : fiche complète
        # d'un plat, page Plus, journal de l'appli, profils. Elles restent sur le site du PC. Une adresse vers elles
        # ramène au Jour ; toucher un plat ouvre toujours sa carte, même sur grand écran.
        ('  const r = route();\n  const changement = location.hash !== derniereAdresse;',
         '  let r = route();\n  if (["plat", "plus", "journal", "profils", "nouveau"].includes(r.vue)) { history.replaceState(null, "", "#/semaine"); r = route(); }\n'
         '  const changement = location.hash !== derniereAdresse;'),
        ('if (plat && PETIT.matches && !ev.target.closest("#dialogue, .carte-fond"))', 'if (plat && !ev.target.closest("#dialogue, .carte-fond"))'),
    ])
    (APP / "app.js").write_text(js, encoding="utf-8")
    css = (SITE / "app.css").read_text(encoding="utf-8")
    if css.count('url("/fonts/') != 2:
        sys.exit("app.css : les polices ont changé de place")
    (APP / "app.css").write_text(css.replace('url("/fonts/', 'url("fonts/'), encoding="utf-8")
    shutil.copy(SITE / "graphiques.js", APP / "graphiques.js")
    shutil.copy(SITE / "miroir.js", APP / "miroir.js")           # la silhouette au miroir, chargée à la demande (27/11/2026)
    shutil.copy(SITE / "scan.js", APP / "scan.js")               # le scanner de codes-barres, chargé à la demande (28/11/2026)
    for nom in ("icone.svg", "icone-192.png", "icone-512.png", "apple-touch-icon.png"):
        shutil.copy(SITE / nom, APP / nom)
    shutil.copytree(SITE / "fonts", APP / "fonts", dirs_exist_ok=True)
    manifeste = json.loads((SITE / "manifest.webmanifest").read_text(encoding="utf-8"))
    manifeste.update(start_url="./#/semaine", scope="./", description="Ce que tu manges, jour après jour : tes plats, tes calories, tes protéines.")
    for i in manifeste["icons"]:
        i["src"] = i["src"].lstrip("/") + "?v=bol"         # le logo bol (19/11/2026) : l'iPhone reprend la nouvelle icône
    (APP / "manifest.webmanifest").write_text(json.dumps(manifeste, ensure_ascii=False, indent=1), encoding="utf-8")


def versions():
    """Une version par construction : le moteur et le catalogue sont redemandés, le service worker se renouvelle."""
    import time
    v = time.strftime("%Y-%m-%d-%H%M%S")
    for nom, motif, modele in (("web.js", r'const VERSION = "[^"]*";', f'const VERSION = "{v}";'),
                               ("sw.js", r'const VERSION = "[^"]*";', f'const VERSION = "meal-prep-web-{v}";')):
        f = APP / nom
        texte, n = re.subn(motif, modele, f.read_text(encoding="utf-8"), count=1)
        if n != 1:
            sys.exit(f"{nom} : version introuvable")
        f.write_text(texte, encoding="utf-8")
    return v


if __name__ == "__main__":
    print("moteur :", moteur(), "fichiers Python")
    repas, avec_photo = catalogue()
    print("catalogue :", len(repas["repas"]), "fiches,", len(avec_photo), "avec photo")
    if "--sans-photos" not in sys.argv:
        faites = photos(repas)
        print("photos :", faites, "images faites")
        if faites:                                       # l'iPhone garde les photos en cache : une nouvelle version les recharge
            f = APP / "web.js"
            texte, n = re.subn(r'const PHOTOS_V = "[^"]*";', f'const PHOTOS_V = "{time.strftime("%Y%m%d%H%M")}";', f.read_text(encoding="utf-8"), count=1)
            if n != 1:
                sys.exit("web.js : PHOTOS_V introuvable")
            f.write_text(texte, encoding="utf-8")
    icones()
    page()
    print("page : faite, version", versions())
