"""Tests FONCTIONNELS du moteur : chaque fonction de l'appli, appelée comme la page l'appelle, sur une copie
du compte d'essai (zz-essai). Rien n'est renvoyé à Supabase.
    python3 tests/test_moteur.py            (avec le Python du projet jarvis : ses dépendances)"""
import datetime, sys, unittest

from moteur_copie import Moteur

M = None
AUJ = datetime.date.today().isoformat()
VIT = ("A", "B1", "B2", "B6", "B9", "B12", "C", "D", "E", "K")


def setUpModule():
    global M
    M = Moteur("zz-essai")
    S = M.serveur                         # la semaine d'essai commence aujourd'hui : le jour 0 est aujourd'hui
    plan = S._lire_p("semaine.json", None)
    ancien = plan.get("debut")
    plan["debut"], plan["modes"], plan["prepares"] = AUJ, ["flemmard"], {}
    h = S._historique()                   # sa copie dans l'historique (avec ses « mangé ») ne doit plus compter
    h["semaines"] = [w for w in h["semaines"] if w and w.get("debut") not in (ancien, AUJ)]
    S._ecrire_historique(h)
    S._ecrire_p("semaine.json", plan)
    mois = S._mois()
    if mois:
        mois["semaines"][mois["rang"]] = plan
        S._ecrire_p("mois.json", mois)


def tearDownModule():
    M.fin()


def jour0():
    return M.etat()["semaine"]["jours"][0]


def mange_aujourdhui():
    return M.etat()["avancement"]["jour"]


def plat_du_jour(moment="pdj"):
    return next(r for r in jour0()["repas"] if r["moment"] == moment)


class A_Etat(unittest.TestCase):
    def test_etat_complet(self):
        e = M.etat()
        for cle in ("semaine", "avancement", "vitamines", "eau", "suivi", "phases", "reglages", "claude", "vitamines_a_completer"):
            self.assertIn(cle, e)
        self.assertIs(e["claude"], False, "le compte d'essai n'a pas de compte Claude")
        self.assertEqual(sorted(e["vitamines"]["besoins"]), sorted(VIT))
        self.assertEqual(len(e["semaine"]["jours"]), 7)

    def test_etat_rapide(self):
        s, _, t = M.api("GET", "/api/etat")
        self.assertEqual(s, 200)
        self.assertLess(t, 5, f"/api/etat prend {t} s")

    def test_recettes(self):
        s, c, _ = M.api("GET", "/api/recettes")
        self.assertEqual(s, 200)
        self.assertGreater(len(c["recettes"]), 50)
        for r in c["recettes"]:
            self.assertTrue(r.get("id") and r.get("nom"), r)

    def test_route_inconnue(self):
        self.assertEqual(M.api("GET", "/api/existe_pas")[0], 404)
        self.assertEqual(M.api("POST", "/api/existe_pas", {})[0], 404)

    def test_corps_trop_gros(self):
        s, _, _ = M.api("POST", "/api/eau", {"date": AUJ, "x": "a" * 200_000})
        self.assertGreaterEqual(s, 400)


class B_Eau(unittest.TestCase):
    def test_boire(self):
        self.assertEqual(M.api("POST", "/api/eau", {"date": AUJ, "litres": 1.5})[0], 200)
        self.assertAlmostEqual(M.etat()["eau"]["bu"][AUJ], 1.5)
        self.assertEqual(M.api("POST", "/api/eau", {"date": AUJ, "litres": 0})[0], 200)
        self.assertAlmostEqual(M.etat()["eau"]["bu"].get(AUJ, 0), 0)

    def test_quantites_impossibles(self):
        for litres in (-1, 11, "beaucoup"):
            self.assertEqual(M.api("POST", "/api/eau", {"date": AUJ, "litres": litres})[0], 400, litres)
        demain = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        self.assertEqual(M.api("POST", "/api/eau", {"date": demain, "litres": 1})[0], 400)

    def test_objectif_eau_plausible(self):
        self.assertTrue(1.5 <= M.etat()["eau"]["litres"] <= 6)


class C_Manger(unittest.TestCase):
    def test_marquer_puis_annuler(self):
        r = plat_du_jour("pdj")
        avant = mange_aujourdhui()["kcal"] or 0
        self.assertEqual(M.api("POST", "/api/prepare", {"jour": 0, "plat": r["id"]})[0], 200)
        apres = mange_aujourdhui()
        self.assertAlmostEqual(apres["kcal"] - avant, r["kcal"], delta=2, msg="le plat mangé compte ses calories")
        self.assertIn(f"0|{r['id']}", M.etat()["semaine"]["prepares"])
        self.assertEqual(M.api("POST", "/api/prepare", {"jour": 0, "plat": r["id"], "annuler": True})[0], 200)
        self.assertAlmostEqual(mange_aujourdhui()["kcal"] or 0, avant, delta=1)

    def test_rien_mange_zero_vitamine(self):
        a = mange_aujourdhui()
        self.assertFalse(M.etat()["semaine"].get("prepares"))
        self.assertTrue(all(not v for v in (a.get("vitamines") or {}).values()), a.get("vitamines"))

    def test_vitamines_suivent_le_plat(self):
        r = plat_du_jour("pdj")
        M.api("POST", "/api/prepare", {"jour": 0, "plat": r["id"]})
        try:
            v = mange_aujourdhui()["vitamines"]
            self.assertTrue(any(v.get(k, 0) > 0 for k in VIT), "un plat mangé apporte des vitamines")
            self.assertTrue(all(v.get(k, 0) >= 0 for k in VIT))
        finally:
            M.api("POST", "/api/prepare", {"jour": 0, "plat": r["id"], "annuler": True})

    def test_jour_inconnu(self):
        self.assertEqual(M.api("POST", "/api/prepare", {"jour": 9, "plat": "x"})[0], 400)


class D_Quantites(unittest.TestCase):
    def _ajuster(self, r, quantites):
        return M.api("POST", "/api/semaine/modifier", {"operation": {"type": "ajuster", "jour": 0, "plat": r["id"], "quantites": quantites},
                                                       "confirme": True})

    def _ingredients(self, ident):
        s, c, _ = M.api("POST", "/api/recette/ajuster", {"plat": ident, "jour": 0, "apercu": True})
        self.assertEqual(s, 200, c)
        return c["ajustement"]["ingredients"]

    def test_poubelle_puis_remettre(self):
        self._ajuster(plat_du_jour("pdj"), {})            # la recette telle quelle au départ
        r = plat_du_jour("pdj")
        ings = [i for i in self._ingredients(r["id"]) if i["u"] != "qs" and i["q"] > 0]
        self.assertGreater(len(ings), 1)
        avant = r["kcal"]
        self.assertEqual(self._ajuster(r, {ings[0]["n"]: 0})[0], 200)
        moins = plat_du_jour("pdj")["kcal"]
        self.assertLess(moins, avant, f"sans « {ings[0]['n']} » le plat doit avoir moins de calories")
        self.assertEqual(self._ajuster(r, {})[0], 200)
        self.assertAlmostEqual(plat_du_jour("pdj")["kcal"], avant, delta=2)

    def test_double_portion(self):
        r = plat_du_jour("din")
        ings = {i["n"]: i["q"] * 2 for i in self._ingredients(r["id"]) if i["u"] != "qs"}
        self.assertEqual(self._ajuster(r, ings)[0], 200)
        try:
            self.assertAlmostEqual(plat_du_jour("din")["kcal"], 2 * r["kcal"], delta=0.03 * r["kcal"] + 2)
        finally:
            self._ajuster(r, {})


class E_Fixer(unittest.TestCase):
    def test_fixer_defixer(self):
        r = plat_du_jour("pdj")
        self.assertEqual(M.api("POST", "/api/repas/fixer", {"plat": r["id"], "moment": "pdj", "fixe": True})[0], 200)
        self.assertEqual(M.etat()["fixes"]["petit_dej"], r["id"])
        self.assertEqual(M.api("POST", "/api/repas/fixer", {"plat": r["id"], "moment": "pdj", "fixe": False})[0], 200)
        self.assertNotEqual(M.etat()["fixes"]["petit_dej"], r["id"])

    def test_moment_inconnu(self):
        self.assertEqual(M.api("POST", "/api/repas/fixer", {"plat": "x", "moment": "minuit", "fixe": True})[0], 400)


class F_Objectifs(unittest.TestCase):
    def test_periodes(self):
        periodes = [{"nom": "Sèche", "du": AUJ, "au": "2027-01-31", "kcal": 2200, "prot": 180},
                    {"nom": "Maintien", "du": "2027-02-01", "au": "2027-06-30", "kcal": 2600, "prot": 160}]
        self.assertEqual(M.api("POST", "/api/objectifs", {"phases": periodes})[0], 200)
        e = M.etat()
        self.assertEqual([p["nom"] for p in e["phases"]], ["Sèche", "Maintien"])
        self.assertEqual(e["phase"]["nom"], "Sèche", "la période d'aujourd'hui")
        self.assertEqual(M.api("POST", "/api/objectifs", {"phases": []})[0], 200)

    def test_periodes_refusees(self):
        cas = [[{"nom": "a", "du": "2027-01-01", "au": "2026-12-01", "kcal": 2000, "prot": 150}],          # dates à l'envers
               [{"nom": "a", "du": AUJ, "au": "2027-03-01", "kcal": 2000, "prot": 150},
                {"nom": "b", "du": "2027-02-01", "au": "2027-05-01", "kcal": 2000, "prot": 150}],          # chevauchement
               [{"nom": "a", "du": AUJ, "au": "2027-03-01", "kcal": 300, "prot": 150}],                   # calories absurdes
               [{"nom": "a", "du": AUJ, "au": "2027-03-01", "kcal": 2000, "prot": 900}]]                  # protéines absurdes
        for c in cas:
            self.assertEqual(M.api("POST", "/api/objectifs", {"phases": c})[0], 400, c)

    def test_proposer_sans_claude(self):
        s, c, _ = M.api("POST", "/api/objectifs/proposer", {"demande": "perdre 3 kg d'ici mars"})
        self.assertEqual(s, 400)
        self.assertIn("Claude", c["erreur"])


class G_SansClaude(unittest.TestCase):
    """Règle de Taha : sans compte Claude, rien d'automatique ; la personne renseigne elle-même."""
    VALEURS = {"kcal": 120, "prot": 5, "gluc": 20, "lip": 2, "fib": 1, "u": "g", "q": 100, "a": 2, "prix": 3}

    def test_ingredient_sans_vitamines_refuse(self):
        s, c, _ = M.api("POST", "/api/ingredient/enregistrer", {"nom": "Essai sans vit", **self.VALEURS})
        self.assertEqual(s, 400)
        self.assertIn("vitamines", c["erreur"])

    def test_ingredient_avec_vitamines(self):
        vit = {k: 1 for k in VIT}
        s, c, _ = M.api("POST", "/api/ingredient/enregistrer", {"nom": "Essai avec vit", **self.VALEURS, "vitamines": vit})
        self.assertEqual(s, 200, c)
        self.assertNotIn("Essai avec vit", M.etat()["vitamines_a_completer"])

    def test_vitamines_impossibles(self):
        for vit in ({**{k: 1 for k in VIT}, "B12": 1e6}, {**{k: 1 for k in VIT}, "C": -3}, {"A": 1}, "rien"):
            self.assertEqual(M.api("POST", "/api/vitamines/renseigner", {"nom": "x", "vitamines": vit})[0], 400, vit)

    def test_repas_a_la_main_puis_vitamines(self):
        s, c, _ = M.api("POST", "/api/repas/au_menu", {"date": AUJ, "moment": "col", "nom": "Galette test auto",
                                                     "items": [{"nom": "Galette test auto", "g": 100, "kcal": 250, "prot": 10}]})
        self.assertEqual(s, 200, c)
        e = M.etat()
        self.assertIn("Galette test auto", e["vitamines_a_completer"])
        self.assertTrue(any("galette-test-auto" in x for x in jour0()["collations"]))
        s, c, _ = M.api("POST", "/api/vitamines/renseigner", {"nom": "Galette test auto", "vitamines": {k: 2 for k in VIT}})
        self.assertEqual(s, 200, c)
        self.assertNotIn("Galette test auto", M.etat()["vitamines_a_completer"])

    def test_aucun_appel_claude_en_fond(self):
        avant = len(M.appels_claude)
        M.serveur.vitamines_en_fond()
        M.web.executer_taches() if hasattr(M.web, "executer_taches") else None
        self.assertEqual(len(M.appels_claude), avant, "sans compte Claude, l'appli ne doit pas appeler Claude")

    def test_photo_seulement_pour_ses_plats(self):
        s, _, _ = M.api("POST", "/api/plat/photo", {"plat": "smoothiecarotteorange", "photo": "AAAA"})
        self.assertEqual(s, 400)


class H_Suivi(unittest.TestCase):
    def test_mesures(self):
        self.assertEqual(M.api("POST", "/api/suivi/noter", {"date": AUJ, "poids": 77.9, "biceps_avant": 38.5})[0], 200)
        ligne = next(x for x in M.etat()["suivi"] if x["date"] == AUJ)
        self.assertEqual(ligne["poids"], 77.9)
        self.assertEqual(ligne["biceps_avant"], 38.5)

    def test_mesures_impossibles(self):
        for corps in ({"date": AUJ, "poids": 900}, {"date": AUJ, "poids": -2}, {"date": "hier", "poids": 70}):
            self.assertEqual(M.api("POST", "/api/suivi/noter", corps)[0], 400, corps)


class I_Avancement(unittest.TestCase):
    def test_semaine_et_mois_sans_aujourdhui(self):
        a = M.etat()["avancement"]
        for p in ("semaine", "mois"):
            comptes = [d["date"] for d in a[p]["detail"] if d.get("kcal") is not None]
            self.assertNotIn(AUJ, comptes, f"{p} : aujourd'hui ne compte pas tant que la journée n'est pas finie")

    def test_depuis_date_de_debut(self):
        e = M.etat()
        debut = e["reglages"].get("date_debut")
        if not debut:
            self.skipTest("pas de date de début")
        for p in ("semaine", "mois"):
            for d in e["avancement"][p]["detail"]:
                if d.get("kcal") is not None:
                    self.assertGreaterEqual(d["date"], debut)

    def test_jour_somme_des_plats_manges(self):
        repas = jour0()["repas"]
        for r in repas[:3]:
            M.api("POST", "/api/prepare", {"jour": 0, "plat": r["id"]})
        try:
            total = sum(r["kcal"] for r in jour0()["repas"] if r["id"] in {x["id"] for x in repas[:3]})
            self.assertAlmostEqual(mange_aujourdhui()["kcal"], total, delta=3)
        finally:
            for r in repas[:3]:
                M.api("POST", "/api/prepare", {"jour": 0, "plat": r["id"], "annuler": True})


class J_Profil(unittest.TestCase):
    def test_modifier_infos(self):
        self.assertEqual(M.api("POST", "/api/profil/modifier", {"taille_cm": 180})[0], 200)

    def test_infos_impossibles(self):
        for corps in ({"taille_cm": 20}, {"poids_kg": 900}, {"telephone": "abc"}):
            self.assertEqual(M.api("POST", "/api/profil/modifier", corps)[0], 400, corps)


if __name__ == "__main__":
    unittest.main(verbosity=2 if "-v" in sys.argv else 1, argv=[sys.argv[0]])
