"""Admin : rattrapages sur les données en ligne de quelqu'un, avec le moteur de l'appli (comme outils/appliquer.py).
    python3 outils/rattraper.py <identifiant> vitamines              Claude (celui du PC) estime les vitamines des ingrédients créés
    python3 outils/rattraper.py <identifiant> manges AAAA-MM-JJ ...  marque mangés tous les plats de ces jours (daté du jour)
Les fichiers changés sont renvoyés à Supabase et le journal enregistré."""
import datetime, json, pathlib, re, shutil, subprocess, sys, tempfile, types
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import sb

ident, quoi, *dates = sys.argv[1:]
APP = pathlib.Path(__file__).resolve().parent.parent / "app"
s, p = sb.appel("GET", f"/rest/v1/profils?identifiant=eq.{ident}&select=id")
if not p:
    sys.exit(f"pas de compte « {ident} »")
uid = p[0]["id"]


def claude_du_pc(action, corps):
    """Le pont « messages » du moteur, ici par le CLI claude du PC (usage de l'admin, pour ses données)."""
    c = json.loads(corps)
    if action != "messages":
        return json.dumps({"erreur": "pas de web ici"})
    texte = "\n".join(b["text"] for b in c.get("contenu", []) if b.get("type") == "text")
    r = subprocess.run(["claude", "-p", texte, "--model", "sonnet", "--output-format", "text", "--tools", ""],
                       capture_output=True, text=True, timeout=180)
    trouve = re.search(r"\{.*\}", r.stdout, re.S)
    return json.dumps({"texte": trouve.group(0)} if trouve else {"erreur": "Claude ne répond pas"})


racine = pathlib.Path(tempfile.mkdtemp(prefix="mp-rattraper-"))
try:
    py = racine / "py"
    for nom, texte in json.loads((APP / "py.json").read_text()).items():
        (py / nom).parent.mkdir(parents=True, exist_ok=True); (py / nom).write_text(texte)
    cat = json.loads((APP / "catalogue.json").read_text())
    mp = racine / "mp"; d = mp / "profils" / ident; d.mkdir(parents=True)
    (mp / "repas.json").write_text(cat["repas.json"]); (mp / "ponderation.yaml").write_text(cat["ponderation.yaml"])
    (py / "repas/site").mkdir(parents=True, exist_ok=True)
    (py / "repas/site/recettes.json").write_text(cat["recettes.json"]); (py / "repas/site/nutriments.json").write_text(cat["nutriments.json"])
    _, fichiers = sb.appel("GET", f"/rest/v1/fichiers?user_id=eq.{uid}&select=nom,contenu&limit=5000")
    for f in fichiers:
        (d / f["nom"]).parent.mkdir(parents=True, exist_ok=True); (d / f["nom"]).write_text(f["contenu"])
    js = types.ModuleType("js"); js.pont_sync = claude_du_pc; sys.modules["js"] = js
    sys.path.insert(0, str(py))
    import web
    web.RACINE = str(mp); (racine / "commun").mkdir()
    web.demarrer(ident, {"repas.dossier": str(racine / "commun"), "repas.sauvegardes": str(racine / "sauv")})
    s = web.serveur
    avant = web.instantane_json()
    if quoi == "vitamines":
        print("vitamines estimées :", s.vitamines_manquantes())
    elif quoi == "manges":
        with s._VERROU:
            plan = s._lire_p("semaine.json", None)
            debut = s._debut(plan)
            for date in dates:
                n = (datetime.date.fromisoformat(date) - debut).days
                if not 0 <= n < 7:
                    print(date, ": pas dans la semaine en cours"); continue
                faits = plan.setdefault("prepares", {})
                marques = [c["id"] for c in plan["jours"][n].get("cuisine", []) if f"{n}|{c['id']}" not in faits]
                for i in marques:
                    faits[f"{n}|{i}"] = f"{date}T20:00:00"
                print(date, ": marqués mangés", marques)
            s._enregistrer_semaine(plan)
            mois = s._mois()
            if mois:                                   # la même semaine dans mois.json
                mois["semaines"][mois["rang"]] = plan
                s._ecrire_p("mois.json", mois)
        s.journal("preparation", "Jours marqués mangés (rattrapage)", [", ".join(dates)])
    ch = json.loads(web.changements(avant))
    for c in ch:
        if c.get("texte") is not None:
            sb.appel("POST", "/rest/v1/fichiers", {"user_id": uid, "nom": c["nom"], "contenu": c["texte"]}, entetes={"Prefer": "resolution=merge-duplicates"})
    lignes = [{"user_id": uid, **l} for l in json.loads(web.journaux())]
    if lignes:
        sb.appel("POST", "/rest/v1/journal", lignes)
    print("fichiers renvoyés :", [c["nom"] for c in ch if c.get("texte") is not None])
finally:
    shutil.rmtree(racine, ignore_errors=True)
