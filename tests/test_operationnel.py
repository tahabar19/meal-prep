"""Tests OPÉRATIONNELS de l'appli en ligne : le site publié, la sécurité de la base (chacun ne voit que ses
données), les fonctions serveur, l'absence de secrets dans le dépôt public, et la santé des vrais comptes
(en lecture seule : le moteur tourne sur une copie, rien n'est réécrit).
    python3 tests/test_operationnel.py
Les clés restent dans ~/.config/meal-prep/ ; aucune n'est affichée."""
import base64, datetime, json, os, pathlib, re, subprocess, sys, time, unittest, urllib.parse, urllib.request

ICI = pathlib.Path(__file__).resolve().parent
RACINE = ICI.parent
sys.path.insert(0, str(RACINE / "outils"))
import sb  # noqa: E402

SITE = os.environ.get("MP_SITE", "https://tahabar19.github.io/meal-prep/")
ESSAI = "zz-essai"
PY_PROJET = pathlib.Path.home() / "jarvis/jarvis-assistant-vocal/.venv/bin/python"


def telecharger(url, timeout=30):
    r = urllib.request.Request(url, headers={"User-Agent": "essai-meal-prep", "Cache-Control": "no-cache"})
    t = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as rep:
            return rep.status, rep.read(), dict(rep.headers), time.time() - t
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers), time.time() - t


def secrets():
    cfg = sb.CFG
    s = {"clé de service": sb.SERVICE, "mot de passe de la base": (cfg / "db-password").read_text().strip(),
         "code d'invitation": (cfg / "code-invitation").read_text().strip(),
         "mot de passe d'essai": (cfg / "essai-mdp").read_text().strip()}
    for ligne in (cfg / "comptes.txt").read_text().splitlines():
        m = re.fullmatch(r"\s*[a-z0-9_-]{2,30}\s*:\s*(\S{8,})\s*", ligne)
        if m and "://" not in ligne:
            s[f"mot de passe de {ligne.split(':')[0].strip()}"] = m.group(1)
    jeton = pathlib.Path.home() / ".config/supabase-token"
    if jeton.exists():
        s["jeton Supabase"] = jeton.read_text().strip()
    return {k: v for k, v in s.items() if len(v) >= 6}


ESSAI_SESSION = None


def essai():
    global ESSAI_SESSION
    if ESSAI_SESSION is None:
        ESSAI_SESSION = sb.connexion(ESSAI, (sb.CFG / "essai-mdp").read_text().strip())
    return ESSAI_SESSION


def comme_essai(methode, chemin, corps=None, **k):
    return sb.appel(methode, chemin, corps, cle=sb.ANON, jeton=essai()["access_token"], **k)


def autres_comptes():
    s, p = sb.appel("GET", "/rest/v1/profils?select=id,identifiant")
    return [x for x in p if x["identifiant"] != ESSAI]


# ------------------------------------------------------------------ 1. le site publié
class A_Site(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s, cls.index, cls.entetes, cls.duree = telecharger(SITE)

    def test_page_en_ligne(self):
        self.assertEqual(self.s, 200)
        self.assertIn(b"<html", self.index.lower())
        self.assertLess(self.duree, 3, f"la page met {self.duree:.1f} s")

    def test_https(self):
        self.assertTrue(SITE.startswith("https://"))

    def test_version_publiee_est_la_derniere(self):
        local = re.search(r'VERSION = "([^"]+)"', (RACINE / "app/web.js").read_text()).group(1)
        s, c, _, _ = telecharger(SITE + f"web.js?x={time.time()}")
        en_ligne = re.search(rb'VERSION = "([^"]+)"', c).group(1).decode()
        self.assertEqual(en_ligne, local, "le site en ligne n'a pas la dernière version construite")

    def test_fichiers_de_la_page(self):
        refs = set(re.findall(rb'(?:src|href)="([^"#:]+)"', self.index))
        manquants = [r.decode() for r in refs if telecharger(SITE + r.decode().lstrip("./"))[0] != 200]
        self.assertEqual(manquants, [])

    def test_fichiers_hors_ligne(self):
        sw = telecharger(SITE + "sw.js")[1].decode()
        liste = json.loads(re.search(r"const FICHIERS = (\[[^\]]*\])", sw, re.S).group(1).replace("'", '"'))
        manquants = [f for f in liste if telecharger(SITE + f.lstrip("./"))[0] != 200]
        self.assertEqual(manquants, [], "le service worker ne pourrait pas s'installer")

    def test_moteur_python_lisible(self):
        s, c, _, _ = telecharger(SITE + "py.json")
        self.assertEqual(s, 200)
        fichiers = json.loads(c)
        self.assertIn("repas/serveur.py", fichiers)
        for nom, texte in fichiers.items():
            if nom.endswith(".py"):
                compile(texte, nom, "exec")                    # aucune erreur de syntaxe

    def test_catalogue_et_photos(self):
        s, c, _, _ = telecharger(SITE + "catalogue.json")
        self.assertEqual(s, 200)
        cat = json.loads(c)
        recettes = json.loads(cat["recettes.json"])["recettes"]
        self.assertGreater(len(recettes), 50)
        avec_photo = [r for r in recettes if r.get("photo")][:12]
        absentes = []
        for r in avec_photo:
            for taille in (160, 480):
                if telecharger(SITE + f"photos/{r['id']}-{taille}.jpg")[0] != 200:
                    absentes.append(f"{r['id']}-{taille}")
        self.assertEqual(absentes, [])

    def test_pyodide_joignable(self):
        url = re.search(r'importScripts\("([^"]+pyodide\.js)"\)', (RACINE / "app/moteur.js").read_text()).group(1)
        self.assertEqual(telecharger(url)[0], 200)

    def test_manifeste_et_icones(self):
        m = json.loads(telecharger(SITE + "manifest.webmanifest")[1])
        for i in m.get("icons", []):
            self.assertEqual(telecharger(SITE + i["src"].split("?")[0].lstrip("./"))[0], 200, i["src"])


# ------------------------------------------------------------------ 2. rien de secret ni de personnel en public
class B_Secrets(unittest.TestCase):
    INTERDITS = [(r"sk-ant-[A-Za-z0-9_-]{10,}", "une clé Claude"), (r"[A-Za-z0-9._%+-]+@gmail\.com", "une adresse e-mail"),
                 (r"le plus proche de [0-9A-Za-zÀ-ÿ]", "une adresse")]      # les jetons non publics : vérifiés plus bas

    def _verifier(self, nom, texte):
        for etiquette, valeur in secrets().items():
            self.assertNotIn(valeur, texte, f"{etiquette} trouvé dans {nom}")
        for motif, etiquette in self.INTERDITS:
            self.assertIsNone(re.search(motif, texte), f"{etiquette} trouvée dans {nom}")
        for jwt in re.findall(r"eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+", texte):
            charge = json.loads(base64.urlsafe_b64decode(jwt + "=" * (-len(jwt) % 4)))
            self.assertEqual(charge.get("role"), "anon", f"jeton non public dans {nom}")

    def test_site_publie(self):
        for f in ("index.html", "web.js", "app.js", "moteur.js", "config.js", "sw.js", "catalogue.json", "py.json", "manifest.webmanifest"):
            self._verifier(f, telecharger(SITE + f)[1].decode("utf-8", "replace"))

    def test_depot_public(self):
        suivis = subprocess.run(["git", "ls-files"], cwd=RACINE, capture_output=True, text=True).stdout.split()
        for f in suivis:
            p = RACINE / f
            if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".woff2", ".ico") or not p.is_file():
                continue
            self._verifier(f, p.read_text(errors="replace"))

    def test_historique_du_depot(self):
        log = subprocess.run(["git", "log", "-p", "--all", "-S", "sk-ant-api"], cwd=RACINE, capture_output=True, text=True).stdout
        self.assertNotRegex(log, r"sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{20,}", "une clé Claude dans l'historique git")
        for etiquette, valeur in secrets().items():
            r = subprocess.run(["git", "log", "--all", "-S", valeur, "--oneline"], cwd=RACINE, capture_output=True, text=True).stdout
            self.assertEqual(r.strip(), "", f"{etiquette} dans l'historique git")


# ------------------------------------------------------------------ 3. chacun ne voit que ses données
class C_Securite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.moi = essai()["user"]["id"]
        cls.autres = autres_comptes()
        if not cls.autres:
            raise unittest.SkipTest("aucun autre compte")
        cls.autre = cls.autres[0]["id"]

    def test_mauvais_mot_de_passe(self):
        s, d = sb.appel("POST", "/auth/v1/token?grant_type=password", {"email": sb.email(ESSAI), "password": "pas-le-bon-1234"}, cle=sb.ANON)
        self.assertEqual(s, 400)

    def test_sans_connexion_rien(self):
        for table in ("fichiers", "profils", "cles_claude", "journal", "usage_claude"):
            s, d = sb.appel("GET", f"/rest/v1/{table}?select=*&limit=5", cle=sb.ANON)
            self.assertTrue(s >= 400 or d == [], f"{table} lisible sans connexion : {s}")

    def test_mes_fichiers_seulement(self):
        s, d = comme_essai("GET", "/rest/v1/fichiers?select=user_id,nom&limit=5000")
        self.assertEqual(s, 200)
        self.assertTrue(d, "le compte d'essai a des fichiers")
        self.assertEqual({x["user_id"] for x in d}, {self.moi})
        for a in self.autres:
            self.assertEqual(comme_essai("GET", f"/rest/v1/fichiers?user_id=eq.{a['id']}&select=nom")[1], [])

    def test_ecrire_chez_un_autre_refuse(self):
        s, _ = comme_essai("POST", "/rest/v1/fichiers", {"user_id": self.autre, "nom": "intrus.json", "contenu": "{}"})
        self.assertGreaterEqual(s, 400)
        s, d = comme_essai("PATCH", f"/rest/v1/fichiers?user_id=eq.{self.autre}", {"contenu": "{}"}, entetes={"Prefer": "return=representation"})
        self.assertTrue(s >= 400 or d == [], "modification chez un autre")
        s, d = comme_essai("DELETE", f"/rest/v1/fichiers?user_id=eq.{self.autre}", entetes={"Prefer": "return=representation"})
        self.assertTrue(s >= 400 or d == [], "suppression chez un autre")
        s, d = sb.appel("GET", f"/rest/v1/fichiers?user_id=eq.{self.autre}&nom=eq.intrus.json&select=nom")
        self.assertEqual(d, [])

    def test_profils(self):
        s, d = comme_essai("GET", "/rest/v1/profils?select=id")
        self.assertEqual([x["id"] for x in d], [self.moi])
        s, _ = comme_essai("PATCH", f"/rest/v1/profils?id=eq.{self.moi}", {"identifiant": "pirate"}, entetes={"Prefer": "return=representation"})
        s2, d2 = sb.appel("GET", f"/rest/v1/profils?id=eq.{self.moi}&select=identifiant")
        self.assertEqual(d2[0]["identifiant"], ESSAI, "l'identifiant ne doit pas changer")

    def test_cles_claude_jamais_lisibles(self):
        s, d = comme_essai("GET", "/rest/v1/cles_claude?select=*")
        self.assertTrue(s >= 400 or d == [])
        s, d = comme_essai("POST", "/rest/v1/cles_claude", {"user_id": self.moi, "cle": "cle-factice-pour-essai"})
        self.assertGreaterEqual(s, 400, "une clé ne s'écrit que par la fonction claude (qui la vérifie)")

    def test_journal_ecrit_jamais_relu(self):
        s, _ = comme_essai("POST", "/rest/v1/journal", {"user_id": self.moi, "type": "essai", "titre": "test opérationnel"})
        self.assertLess(s, 300)
        s, d = comme_essai("GET", "/rest/v1/journal?select=*")
        self.assertTrue(s >= 400 or d == [])
        s, _ = comme_essai("POST", "/rest/v1/journal", {"user_id": self.autre, "type": "essai", "titre": "intrus"})
        self.assertGreaterEqual(s, 400, "écrire au nom d'un autre")

    def test_usage_claude_fermé(self):
        s, d = comme_essai("GET", "/rest/v1/usage_claude?select=*")
        self.assertTrue(s >= 400 or d == [])
        s, _ = comme_essai("DELETE", f"/rest/v1/usage_claude?user_id=eq.{self.moi}", entetes={"Prefer": "return=representation"})
        self.assertTrue(s >= 400 or _ == [], "effacer ses quotas")

    def test_photos(self):
        jeton = essai()["access_token"]
        petit = base64.b64decode("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHR8eHRoaHCQuJyIsIx0cKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==")
        ent = {"Content-Type": "image/jpeg", "x-upsert": "true"}
        s, _ = sb.appel("POST", f"/storage/v1/object/photos/{self.autre}/intrus.jpg", petit, cle=sb.ANON, jeton=jeton, entetes=ent)
        self.assertGreaterEqual(s, 400, "déposer une photo chez un autre")
        s, d = sb.appel("POST", "/storage/v1/object/list/photos", {"prefix": f"{self.autre}/", "limit": 5}, cle=sb.ANON, jeton=jeton)
        self.assertTrue(s >= 400 or d == [], "lister les photos d'un autre")
        s, _ = sb.appel("POST", f"/storage/v1/object/photos/{self.moi}/essai-ops.jpg", petit, cle=sb.ANON, jeton=jeton, entetes=ent)
        self.assertLess(s, 300, "déposer sa propre photo")
        s, _ = sb.appel("DELETE", f"/storage/v1/object/photos/{self.moi}/essai-ops.jpg", cle=sb.ANON, jeton=jeton)
        self.assertLess(s, 300)


# ------------------------------------------------------------------ 4. les fonctions serveur
class D_Fonctions(unittest.TestCase):
    def test_claude_sans_connexion(self):
        s, d = sb.appel("POST", "/functions/v1/claude", {"action": "messages"}, cle=sb.ANON)
        self.assertEqual(s, 401)

    def test_claude_action_inconnue(self):
        self.assertEqual(sb.fonction("claude", {"action": "pirater"}, essai()["access_token"])[0], 400)

    def test_claude_sans_cle_branchee(self):
        s, d = sb.fonction("claude", {"action": "messages", "tache": "repas", "contenu": [{"type": "text", "text": "une pomme"}]}, essai()["access_token"])
        self.assertEqual(s, 400)
        self.assertTrue(d.get("sans_cle"), d)

    def test_web_sites_refuses(self):
        for url in ("https://example.com/", "http://169.254.169.254/latest/meta-data/", "http://localhost:54321/",
                    "https://world.openfoodfacts.org.pirate.com/", "file:///etc/passwd"):
            s, d = sb.fonction("claude", {"action": "web", "url": url}, essai()["access_token"])
            self.assertEqual(s, 400, f"{url} : {s} {d}")

    def test_web_site_autorise(self):
        s, d = sb.fonction("claude", {"action": "web", "url": "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=apple&format=json&srlimit=1"}, essai()["access_token"])
        self.assertEqual(s, 200, d)
        self.assertEqual(d.get("status"), 200)

    def test_cle_fausse_refusee(self):
        s, d = sb.fonction("claude", {"action": "cle", "cle": "pas-une-cle-du-tout"}, essai()["access_token"])
        self.assertEqual(s, 400)
        s, d = comme_essai("POST", "/rest/v1/rpc/infos_claude", {})
        self.assertIn(d, (None, {}), "aucune clé ne doit avoir été enregistrée")

    def test_cors(self):
        r = urllib.request.Request(sb.URL + "/functions/v1/claude", method="OPTIONS", headers={"Origin": "https://tahabar19.github.io"})
        with urllib.request.urlopen(r, timeout=30) as rep:
            self.assertEqual(rep.status, 200)
            self.assertTrue(rep.headers.get("Access-Control-Allow-Origin"))

    def test_inscription_mauvais_code(self):
        s, d = sb.appel("POST", "/functions/v1/inscription", {"code": "faux", "identifiant": "zz-intrus", "mot_de_passe": "12345678abc"}, cle=sb.ANON)
        self.assertEqual(s, 401)

    def test_inscription_controles(self):
        code = (sb.CFG / "code-invitation").read_text().strip()
        for corps, attendu in (({"identifiant": "A B!", "mot_de_passe": "12345678abc"}, "Identifiant"),
                               ({"identifiant": "zz-essai2", "mot_de_passe": "court"}, "Mot de passe"),
                               ({"identifiant": ESSAI, "mot_de_passe": "12345678abc"}, "déjà pris")):
            s, d = sb.appel("POST", "/functions/v1/inscription", {"code": code, **corps}, cle=sb.ANON)
            self.assertEqual(s, 400, d)
            self.assertIn(attendu, d.get("erreur", ""))
        s, d = sb.appel("GET", "/rest/v1/profils?identifiant=eq.zz-essai2&select=id")
        self.assertEqual(d, [], "aucun compte créé par ces essais")


# ------------------------------------------------------------------ 5. la santé des vrais comptes (lecture seule)
HALAL = re.compile(r"\b(porc|jambon(?! de (dinde|poulet|volaille|bœuf|boeuf))|lardons?(?! de (dinde|poulet|volaille|bœuf|boeuf))|bacon(?! de (dinde|bœuf|boeuf))|"
                   r"saucisson(?! de (bœuf|boeuf|volaille))|chorizo(?! de (bœuf|boeuf|volaille|dinde))|vin (rouge|blanc)|bi[eè]re|rhum|cognac|calvados|"
                   r"kirsch|liqueur|(?<!sans )alcool|g[ée]latine(?! (bovine|halal|de poisson)))", re.I)


class E_Comptes(unittest.TestCase):
    """Les vrais comptes (pas le compte d'essai), sur une copie : chaque test liste les problèmes de TOUS les comptes."""
    @classmethod
    def setUpClass(cls):
        cls.bilans = {}
        for c in autres_comptes():
            r = subprocess.run([str(PY_PROJET), str(ICI / "moteur_copie.py"), c["identifiant"]], capture_output=True, text=True, timeout=300)
            cls.bilans[c["identifiant"]] = json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else {"plantage": r.stderr[-800:]}

    def _aucun(self, probleme):
        trouves = {}
        for ident, b in self.bilans.items():
            if "plantage" in b:
                continue
            x = probleme(b)
            if x:
                trouves[ident] = x
        self.assertEqual(trouves, {})

    def test_etat_calculable(self):
        self.assertEqual({i: b["plantage"] for i, b in self.bilans.items() if "plantage" in b}, {})
        self._aucun(lambda b: b["status"] != 200 and f"état : {b['status']}")
        self._aucun(lambda b: b["duree"] > 8 and f"l'état met {b['duree']} s")

    def test_fichiers_lisibles(self):
        self._aucun(lambda b: b["json_illisibles"])

    def test_menu_pour_aujourdhui_ou_bientot(self):
        def perime(b):
            if not b.get("debut"):
                return "aucune semaine"
            ecart = (datetime.date.fromisoformat(b["debut"]) - datetime.date.today()).days
            return not -7 < ecart <= 7 and f"semaine du {b['debut']}"
        self._aucun(perime)

    def test_halal(self):
        self._aucun(lambda b: [n for n in b["noms"] if HALAL.search(n)])

    def test_tous_les_aliments_ont_des_calories(self):
        self._aucun(lambda b: b["sans_macros"])

    def test_vitamines_renseignees(self):
        self._aucun(lambda b: b["sans_vitamines"] and f"{len(b['sans_vitamines'])} fiches sans vitamines : {', '.join(b['sans_vitamines'][:6])}")

    def test_chiffres_du_jour_coherents(self):
        self._aucun(lambda b: (b["aujourdhui"]["kcal"] or 0) > 10000 and "plus de 10 000 kcal aujourd'hui")
        self._aucun(lambda b: [v for v, x in b["aujourdhui"]["vitamines"].items() if x < 0])

    def test_pas_d_erreur_recente(self):
        depuis = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)).isoformat()
        s, d = sb.appel("GET", f"/rest/v1/journal?type=eq.erreur&quand=gte.{urllib.parse.quote(depuis)}&select=titre,quand,user_id&limit=50")
        self.assertEqual(s, 200)
        self.assertEqual([x["titre"] for x in d], [], "erreurs de l'appli ces dernières 24 h")


if __name__ == "__main__":
    unittest.main(verbosity=2 if "-v" in sys.argv else 1, argv=[sys.argv[0]])
