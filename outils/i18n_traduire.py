"""Traduit les textes relevés par i18n_extraire.py, avec Claude Code en ligne de commande, par lots.

    python3 outils/i18n_traduire.py [en ar es] [--max N]

Garde ce qui est déjà traduit (outils/i18n/<langue>.json) : seuls les nouveaux textes partent. Écrit ensuite
app/i18n/<langue>.json, lu par la page (app.js : I18N).
"""
import concurrent.futures as cf, json, pathlib, re, subprocess, sys, tempfile, threading

ICI = pathlib.Path(__file__).resolve().parent
APP = ICI.parent / "app"
NOMS = {"en": "anglais (britannique, simple)", "ar": "arabe standard moderne, simple et naturel",
        "es": "espagnol (Espagne, simple)"}
TU = {"en": "« you »", "ar": "le tutoiement (أنت)", "es": "le tutoiement (tú)"}
VERROU = threading.Lock()


def consigne(langue, lot, catalogue):
    return (f"Tu traduis l'appli de nutrition et de repas « Mon Meal Prep » du français vers l'{NOMS[langue]}.\n"
            + ("Ce sont des noms de plats, des noms d'ingrédients, des rayons de magasin et des étapes de recette : "
               "traduis-les comme un livre de cuisine (noms de plats étrangers connus gardés s'ils sont d'usage, "
               "ex. « Shakshuka »).\n" if catalogue else
               "Ce sont des morceaux de l'interface (boutons, titres, phrases, messages). Certains sont des bouts de "
               "phrase : traduis-les comme des bouts de phrase, en gardant les espaces et la ponctuation du début et de la fin.\n")
            + f"Le ton : court, simple, amical, avec {TU[langue]}.\n"
            "Règles : garde EXACTEMENT les marques {0}, {1}… (mêmes numéros, chacune une fois) ; garde les unités "
            "(kcal, g, ml, kg, cm, €), les chiffres, « Mon Meal Prep », les noms de marques (Auchan, Lidl, Tassimo, Nutella…), "
            "et les guillemets « » s'il y en a (en anglais, remplace-les par “ ”). Ne mets aucune explication.\n"
            "Réponds UNIQUEMENT par un objet JSON {\"texte français\": \"traduction\"} avec toutes les clés données.\n\n"
            + json.dumps(lot, ensure_ascii=False))


def marques(t):
    return sorted(re.findall(r"\{\d+\}", t))


def un_lot(langue, lot, catalogue):
    with tempfile.TemporaryDirectory() as vide:
        r = subprocess.run(["claude", "-p", "--model", "sonnet", "--output-format", "text", "--tools", "", "--setting-sources", ""],
                           input=consigne(langue, lot, catalogue), capture_output=True, text=True, timeout=600, cwd=vide)
    m = re.search(r"\{.*\}", r.stdout, re.S)
    try:
        d = json.loads(m.group(0)) if m else {}
    except ValueError:
        d = {}
    return {k: v for k, v in d.items() if k in lot and isinstance(v, str) and v.strip() and marques(v) == marques(k)}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    langues = args or ["en", "ar", "es"]
    maxi = int(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else 10**9
    source = json.loads((ICI / "i18n/source.json").read_text(encoding="utf-8"))
    taches = []
    caches = {}
    for langue in langues:
        f = ICI / f"i18n/{langue}.json"
        caches[langue] = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
        for groupe, catalogue in (("ecrans", False), ("catalogue", True)):
            manque = [t for t in source[groupe] if t not in caches[langue]][:maxi]
            for i in range(0, len(manque), 120):
                taches.append((langue, manque[i:i + 120], catalogue))
    print(len(taches), "lots", flush=True)
    faits = 0
    with cf.ThreadPoolExecutor(6) as ex:
        futurs = {ex.submit(un_lot, *t): t for t in taches}
        for fu in cf.as_completed(futurs):
            langue = futurs[fu][0]
            try:
                d = fu.result()
            except Exception as e:
                print("lot raté :", e, flush=True); continue
            with VERROU:
                caches[langue].update(d)
                (ICI / f"i18n/{langue}.json").write_text(json.dumps(caches[langue], ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")
            faits += 1
            print(f"{faits}/{len(taches)} {langue} +{len(d)}/{len(futurs[fu][1])}", flush=True)
    publier(langues)


def publier(langues):
    """app/i18n/<langue>.json : seulement les textes encore relevés (les vieux tombent)."""
    source = json.loads((ICI / "i18n/source.json").read_text(encoding="utf-8"))
    voulus = set(source["ecrans"]) | set(source["catalogue"])
    (APP / "i18n").mkdir(exist_ok=True)
    for langue in langues:
        f = ICI / f"i18n/{langue}.json"
        d = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
        d = {k: v for k, v in d.items() if k in voulus}
        (APP / f"i18n/{langue}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(langue, len(d), "/", len(voulus), "traduits")


if __name__ == "__main__":
    if "--publier" in sys.argv:
        publier([a for a in sys.argv[1:] if not a.startswith("--")] or ["en", "ar", "es"])
    else:
        main()
