"""Le moteur de l'appli (le même Python que dans le navigateur), lancé sur une COPIE des fichiers d'un compte.
Rien n'est renvoyé à Supabase : les essais ne touchent jamais les vraies données."""
import json, pathlib, shutil, sys, tempfile, time, types

ICI = pathlib.Path(__file__).resolve().parent
APP = ICI.parent / "app"
sys.path.insert(0, str(ICI.parent / "outils"))
import sb  # noqa: E402


def uid_de(ident):
    s, p = sb.appel("GET", f"/rest/v1/profils?identifiant=eq.{ident}&select=id")
    if not p:
        raise SystemExit(f"pas de compte « {ident} »")
    return p[0]["id"]


class Moteur:
    def __init__(self, ident, claude=False, reponse_claude=None):
        self.ident, self.uid = ident, uid_de(ident)
        self.racine = pathlib.Path(tempfile.mkdtemp(prefix="mp-essai-"))
        py = self.racine / "py"
        for nom, texte in json.loads((APP / "py.json").read_text()).items():
            (py / nom).parent.mkdir(parents=True, exist_ok=True); (py / nom).write_text(texte)
        cat = json.loads((APP / "catalogue.json").read_text())
        mp = self.racine / "mp"; d = mp / "profils" / ident; d.mkdir(parents=True)
        (mp / "repas.json").write_text(cat["repas.json"]); (mp / "ponderation.yaml").write_text(cat["ponderation.yaml"])
        (py / "repas/site").mkdir(parents=True, exist_ok=True)
        (py / "repas/site/recettes.json").write_text(cat["recettes.json"]); (py / "repas/site/nutriments.json").write_text(cat["nutriments.json"])
        _, fichiers = sb.appel("GET", f"/rest/v1/fichiers?user_id=eq.{self.uid}&select=nom,contenu&limit=5000")
        self.fichiers = {f["nom"]: f["contenu"] for f in fichiers}
        for nom, contenu in self.fichiers.items():
            (d / nom).parent.mkdir(parents=True, exist_ok=True); (d / nom).write_text(contenu)
        self.appels_claude = []
        js = types.ModuleType("js")

        def pont(action, corps):
            self.appels_claude.append(action)
            if reponse_claude is not None:
                return json.dumps(reponse_claude(action, json.loads(corps)))
            return json.dumps({"erreur": "Connecte d'abord ton compte Claude.", "sans_cle": True})
        js.pont_sync = pont
        sys.modules["js"] = js
        sys.path.insert(0, str(py))
        import web
        self.web = web
        web.RACINE = str(mp); (self.racine / "commun").mkdir()
        web.demarrer(ident, {"repas.dossier": str(self.racine / "commun"), "repas.sauvegardes": str(self.racine / "sauv"),
                             "repas.plat_perso_ia": bool(claude)})
        self.serveur = web.serveur

    def api(self, methode, chemin, corps=None):
        t = time.time()
        r = json.loads(self.web.traiter(methode, chemin, json.dumps(corps) if corps is not None else ""))
        c = json.loads(r["corps"]) if r.get("corps") else None
        return r["status"], c, round(time.time() - t, 3)

    def etat(self):
        s, e, _ = self.api("GET", "/api/etat")
        assert s == 200, (s, e)
        return e

    def fin(self):
        shutil.rmtree(self.racine, ignore_errors=True)


def bilan(ident):
    """La santé d'un compte, sur une copie : l'état se calcule-t-il, les fiches sont-elles complètes…"""
    import datetime, io
    vrai, sys.stdout = sys.stdout, io.StringIO()           # le moteur peut écrire : seul le bilan sort
    try:
        s, cles = sb.appel("GET", f"/rest/v1/cles_claude?user_id=eq.{uid_de(ident)}&select=user_id")
        m = Moteur(ident, claude=bool(cles))
        try:
            illisibles = []
            for nom, contenu in m.fichiers.items():
                if nom.endswith(".json"):
                    try:
                        json.loads(contenu)
                    except ValueError:
                        illisibles.append(nom)
            status, e, duree = m.api("GET", "/api/etat")
            S = m.serveur
            _, rec, _ = m.api("GET", "/api/recettes")
            recettes = rec["recettes"] if rec else []
            macros = (S.nutriments().get("macros") or {})
            plan = e["semaine"] if e else {}
            debut = plan.get("debut")
            en_cours = bool(debut) and 0 <= (datetime.date.today() - datetime.date.fromisoformat(debut)).days < 7
            au_menu = {r["id"] for j in plan.get("jours", []) for r in j.get("repas", [])}
            sans_macros = sorted({i["n"] for r in recettes if r["id"] in au_menu for i in r.get("ing", [])
                                  if i.get("u") != "qs" and i["n"] not in macros})
            noms = sorted({r["nom"] for r in recettes} | {i["n"] for r in recettes for i in r.get("ing", [])}
                          | set((e or {}).get("ingredients_perso") or {}))
            return {"status": status, "duree": duree, "json_illisibles": illisibles, "debut": debut,
                    "semaine_en_cours": en_cours, "sans_macros": sans_macros, "noms": noms,
                    "sans_vitamines": S._ingredients_sans_vitamines(), "claude": bool(cles),
                    "aujourdhui": {k: e["avancement"]["jour"][k] for k in ("kcal", "prot", "vitamines")}}
        finally:
            m.fin()
    finally:
        sys.stdout = vrai


if __name__ == "__main__":
    print(json.dumps(bilan(sys.argv[1]), ensure_ascii=False))
