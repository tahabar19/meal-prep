"""Admin : fait une requête de l'appli pour le compte de quelqu'un, sur SES données en ligne, avec le moteur du PC.
    python3 outils/appliquer.py <identifiant> POST /api/reglages '{"fruits_secs": false}'
Les fichiers du profil sont lus dans Supabase, la requête passe par app/py/web.py (comme dans l'appli),
puis les fichiers modifiés sont renvoyés et le journal enregistré. Claude n'est pas appelé."""
import json, pathlib, shutil, sys, tempfile, types
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import sb

ident, methode, chemin = sys.argv[1:4]
corps = sys.argv[4] if len(sys.argv) > 4 else ""
APP = pathlib.Path(__file__).resolve().parent.parent / "app"
s, p = sb.appel("GET", f"/rest/v1/profils?identifiant=eq.{ident}&select=id")
if not p:
    sys.exit(f"pas de compte « {ident} »")
uid = p[0]["id"]
racine = pathlib.Path(tempfile.mkdtemp(prefix="mp-appliquer-"))
try:
    py = racine / "py"
    for nom, texte in json.loads((APP / "py.json").read_text()).items():
        (py / nom).parent.mkdir(parents=True, exist_ok=True); (py / nom).write_text(texte)
    cat = json.loads((APP / "catalogue.json").read_text())
    mp = racine / "mp"; d = mp / "profils" / ident; d.mkdir(parents=True)
    (mp / "repas.json").write_text(cat["repas.json"]); (mp / "ponderation.yaml").write_text(cat["ponderation.yaml"])
    (py / "repas/site").mkdir(parents=True, exist_ok=True)
    (py / "repas/site/recettes.json").write_text(cat["recettes.json"]); (py / "repas/site/nutriments.json").write_text(cat["nutriments.json"])
    for x in cat["photos"]:
        (mp / x).mkdir(parents=True, exist_ok=True); (mp / x / "photo.jpg").write_bytes(b"")
    _, fichiers = sb.appel("GET", f"/rest/v1/fichiers?user_id=eq.{uid}&select=nom,contenu&limit=5000")
    for f in fichiers:
        (d / f["nom"]).parent.mkdir(parents=True, exist_ok=True); (d / f["nom"]).write_text(f["contenu"])
    js = types.ModuleType("js"); js.pont_sync = lambda action, c: json.dumps({"erreur": "pas de Claude ici"}); sys.modules["js"] = js
    sys.path.insert(0, str(py))
    import web
    web.RACINE = str(mp)
    (racine / "commun").mkdir()
    web.demarrer(ident, {"repas.dossier": str(racine / "commun"), "repas.sauvegardes": str(racine / "sauv")})
    avant = web.instantane_json()
    r = json.loads(web.traiter(methode, chemin, corps))
    ch = json.loads(web.changements(avant))
    erreur = json.loads(r.get("corps") or "{}").get("erreur") if r["status"] != 200 else None
    print("réponse :", r["status"], erreur or "")
    if r["status"] == 200:
        for c in ch:
            if c.get("texte") is not None:
                sb.appel("POST", "/rest/v1/fichiers", {"user_id": uid, "nom": c["nom"], "contenu": c["texte"]}, entetes={"Prefer": "resolution=merge-duplicates"})
        lignes = [{"user_id": uid, **l} for l in json.loads(web.journaux())]
        if lignes:
            sb.appel("POST", "/rest/v1/journal", lignes)
        print("fichiers renvoyés :", [c["nom"] for c in ch if c.get("texte") is not None])
finally:
    shutil.rmtree(racine, ignore_errors=True)
