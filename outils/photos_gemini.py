"""Met les photos faites avec Gemini dans l'appli (Taha, 22/11/2026). Les anciennes sont sauvegardées d'abord.
    python3 outils/photos_gemini.py [dossier des images] [--envoyer]
Les images s'appellent 001.webp, 002.png… : le numéro est celui de ~/Bureau/photos-gemini/liste.csv.
- plat du catalogue : ~/Bureau/prep_meal/<dossier>/photo.jpg, et sa fiche (repas.json) dit d'où vient la photo ;
- plat d'un compte (source = identifiant) : le stockage Supabase « photos/<id du compte>/<plat>.jpg » et son credits.json.
Sans --envoyer : ne fait que dire ce qui serait fait. Une image absente : le plat garde sa photo (listé à la fin)."""
import csv, io, json, pathlib, shutil, sys, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import sb
from PIL import Image

LISTE = pathlib.Path.home() / "Bureau/photos-gemini/liste.csv"
FICHES = pathlib.Path.home() / "Bureau/prep_meal"
ENVOYER = "--envoyer" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
IMAGES = pathlib.Path(args[0]) if args else pathlib.Path.home() / "Téléchargements/photos-gemini"
SAUVEGARDE = FICHES / f".sauvegarde-avant-photos-gemini-{time.strftime('%Y-%m-%d-%H%M')}"
CREDIT = {"fichier": "photo.jpg", "page": "", "auteur": "Google Gemini", "licence": "image générée par IA",
          "licence_url": "", "source": "Gemini (Nano Banana)"}


def jpeg(chemin: pathlib.Path) -> bytes:
    with Image.open(chemin) as im:
        im = im.convert("RGB")
        im.thumbnail((1024, 1024))
        sortie = io.BytesIO()
        im.save(sortie, "JPEG", quality=88, optimize=True, progressive=True)
        return sortie.getvalue()


images = {int(p.stem): p for p in IMAGES.iterdir() if p.stem.isdigit() and p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg")}
lignes = list(csv.DictReader(LISTE.open(encoding="utf-8"), delimiter=";"))
repas = json.loads((FICHES / "repas.json").read_text(encoding="utf-8"))
par_id = {f["id"]: f for f in repas["repas"]}
manquantes, faites, comptes = [], 0, {}
if ENVOYER:
    SAUVEGARDE.mkdir()
    shutil.copy(FICHES / "repas.json", SAUVEGARDE / "repas.json")
for l in lignes:
    n = int(l["numero"])
    if n not in images:
        manquantes.append(l)
        continue
    if l["source"] == "catalogue":
        f = par_id.get(l["id"])
        if not f or not f.get("dossier"):
            print("fiche introuvable :", n, l["id"]); continue
        cible = FICHES / f["dossier"] / "photo.jpg"
        if ENVOYER:
            if cible.exists():
                (SAUVEGARDE / f["dossier"]).mkdir(parents=True, exist_ok=True)
                shutil.copy(cible, SAUVEGARDE / f["dossier"] / "photo.jpg")
            cible.write_bytes(jpeg(images[n]))
            f["photo"] = {**CREDIT, "titre": f["nom"]}
        faites += 1
    else:
        comptes.setdefault(l["source"], []).append((l, images[n]))
for ident, plats in comptes.items():
    s, p = sb.appel("GET", f"/rest/v1/profils?identifiant=eq.{ident}&select=id")
    uid = p[0]["id"]
    s, c = sb.appel("GET", f"/rest/v1/fichiers?user_id=eq.{uid}&nom=eq.photos/credits.json&select=contenu")
    credits = json.loads(c[0]["contenu"]) if c else {}
    for l, image in plats:
        chemin = f"/storage/v1/object/photos/{uid}/{l['id']}.jpg"
        if ENVOYER:
            s, ancien = sb.appel("GET", chemin, brut=True)
            if s == 200:
                (SAUVEGARDE / "comptes" / ident).mkdir(parents=True, exist_ok=True)
                (SAUVEGARDE / "comptes" / ident / f"{l['id']}.jpg").write_bytes(ancien)
            s, r = sb.appel("POST", chemin, jpeg(image), entetes={"Content-Type": "image/jpeg", "x-upsert": "true"})
            if s not in (200, 201):
                print("envoi refusé :", l["id"], s, r); continue
            credits[l["id"]] = {**CREDIT, "titre": l["nom"]}
        faites += 1
    if ENVOYER:
        (SAUVEGARDE / "comptes" / ident).mkdir(parents=True, exist_ok=True)
        (SAUVEGARDE / "comptes" / ident / "credits.json").write_text(json.dumps(credits, ensure_ascii=False))
        sb.appel("POST", "/rest/v1/fichiers", [{"user_id": uid, "nom": "photos/credits.json", "contenu": json.dumps(credits, ensure_ascii=False, indent=1)}],
                 entetes={"Prefer": "resolution=merge-duplicates"})
if ENVOYER:
    (FICHES / "repas.json").write_text(json.dumps(repas, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{'mises' if ENVOYER else 'à mettre'} : {faites} photos ; sans image : {len(manquantes)}" + (f" ; sauvegarde : {SAUVEGARDE}" if ENVOYER else ""))
for l in manquantes:
    print(f"  {l['numero']:>3}. {l['nom']}  ({l['source']}, {l['id']})")
