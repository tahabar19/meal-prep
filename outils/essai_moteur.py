"""Essai du moteur web dans Python (sans navigateur) : mêmes fichiers que dans Pyodide, pont réel vers Supabase.
    python3 outils/essai_moteur.py <dossier jetable> <profil source> <identifiant d'essai>"""
import json, pathlib, shutil, sys, types, time
racine, source, ident = pathlib.Path(sys.argv[1]).resolve(), pathlib.Path(sys.argv[2]).expanduser(), sys.argv[3]
APP = pathlib.Path(__file__).resolve().parent.parent / "app"
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import sb

shutil.rmtree(racine, ignore_errors=True)
py = racine / "py"
for nom, texte in json.loads((APP / "py.json").read_text()).items():
    (py / nom).parent.mkdir(parents=True, exist_ok=True)
    (py / nom).write_text(texte)
cat = json.loads((APP / "catalogue.json").read_text())
mp = racine / "mp"
(mp / "profils").mkdir(parents=True)
(mp / "repas.json").write_text(cat["repas.json"]); (mp / "ponderation.yaml").write_text(cat["ponderation.yaml"])
(py / "repas/site").mkdir(parents=True, exist_ok=True)
(py / "repas/site/recettes.json").write_text(cat["recettes.json"]); (py / "repas/site/nutriments.json").write_text(cat["nutriments.json"])
for d in cat["photos"]:
    (mp / d).mkdir(parents=True, exist_ok=True); (mp / d / "photo.jpg").write_bytes(b"")
shutil.copytree(source, mp / "profils" / ident, ignore=shutil.ignore_patterns(".sauvegarde-*", "chrome", "*.avant-*", "acces.json"))

jeton = sb.connexion(ident, (sb.CFG / "essai-mdp").read_text().strip())["access_token"]
js = types.ModuleType("js")
js.pont_sync = lambda action, corps: json.dumps(sb.fonction("claude", {"action": action, **json.loads(corps)}, jeton)[1])
sys.modules["js"] = js
sys.path.insert(0, str(py))
import web
web.RACINE = str(mp)
web.demarrer(ident, {"repas.dossier": str(racine / "commun"), "repas.sauvegardes": str(racine / "sauv")})
(racine / "commun").mkdir(exist_ok=True)

def api(m, chemin, corps=None):
    t = time.time()
    av = web.instantane_json()
    r = json.loads(web.traiter(m, chemin, json.dumps(corps) if corps is not None else ""))
    ch = json.loads(web.changements(av))
    c = json.loads(r["corps"]) if "corps" in r else None
    return r["status"], c, ch, round(time.time() - t, 2)

s, e, ch, t = api("GET", "/api/etat")
print("etat", s, t, "s | profil", e["profil"]["id"], "| flemmard", e["journal_repas"]["actif"], "| jours", len(e["journal_repas"]["jours"]), "| changés", [x["nom"] for x in ch])
s, r, ch, t = api("GET", "/api/recettes"); print("recettes", s, t, len(r["recettes"]))
import datetime
date = datetime.date.today().isoformat()
s, r, ch, t = api("POST", "/api/repas/au_menu", {"date": date, "moment": "col", "nom": "Essai web", "items": [
    {"nom": "Essai web", "g": None, "kcal": 222, "prot": 11, "gluc": 20, "lip": 9, "fib": 1}]})
print("au_menu", s, t, (r or {}).get("au_menu") or (r or {}).get("erreur"), "| changés", [x["nom"] for x in ch])
s, r, ch, t = api("POST", "/api/repas/analyser", {"texte": "un yaourt", "moment": "col", "date": date})
print("analyser sans clé", s, r)
print("tâches en fond :", len(web.A_FAIRE))
