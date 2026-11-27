"""Relève les textes français à traduire (Taha, 23/11/2026 : l'appli en anglais, arabe, espagnol).

Sources : la page (app.js : chaînes et gabarits ; un ${…} dans un texte devient {0}, {1}…), le moteur (messages
d'erreur et textes montrés : chaînes et f-strings de serveur.py et des modules), le catalogue (noms, étapes,
ingrédients). Écrit outils/i18n/source.json : la liste triée des textes.
"""
import ast, json, pathlib, re

REPAS = pathlib.Path.home() / "jarvis/jarvis-assistant-vocal/repas"
ICI = pathlib.Path(__file__).resolve().parent
LETTRES = re.compile(r"[A-Za-zÀ-ÿŒœ]{2}")
ACCENTS = re.compile(r"[À-ÿŒœ]")
TAG = re.compile(r"<[^<>]*>")
ATTR = re.compile(r'\b(?:placeholder|aria-label|title|alt)="([^"]*)"')


def scanner_js(src: str):
    """Les littéraux de app.js : ('str', texte) ou ('tpl', [morceaux], [expressions])."""
    i, n, out = 0, len(src), []

    def chaine(i, q):
        j, buf = i + 1, []
        while j < n and src[j] != q:
            if src[j] == "\\":
                buf.append(src[j:j + 2]); j += 2; continue
            buf.append(src[j]); j += 1
        return j + 1, "".join(buf)

    def gabarit(i):
        j, morceaux, buf, exprs = i + 1, [], [], []
        while j < n and src[j] != "`":
            if src[j] == "\\":
                buf.append(src[j + 1]); j += 2; continue
            if src[j] == "$" and j + 1 < n and src[j + 1] == "{":
                morceaux.append("".join(buf)); buf = []
                k, prof = j + 2, 1
                debut = k
                while k < n and prof:
                    c = src[k]
                    if c in "\"'":
                        k, _ = chaine(k, c); continue
                    if c == "`":
                        k = gabarit_fin(k); continue
                    if c == "{": prof += 1
                    elif c == "}": prof -= 1
                    k += 1
                exprs.append(src[debut:k - 1])
                j = k; continue
            buf.append(src[j]); j += 1
        morceaux.append("".join(buf))
        return j + 1, morceaux, exprs

    def gabarit_fin(i):
        return gabarit(i)[0]

    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            i = src.find("\n", i); i = n if i < 0 else i; continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            i = src.find("*/", i + 2) + 2; continue
        if c in "\"'":
            i, t = chaine(i, c); out.append(("str", t)); continue
        if c == "`":
            j, morceaux, exprs = gabarit(i)
            out.append(("tpl", morceaux, exprs))
            for e in exprs:                                   # les littéraux des ${…}
                out.extend(scanner_js(e))
            i = j; continue
        if c == "/" and re.match(r"[=(,:!&|?;{}\[\s]", (src[:i].rstrip() or " ")[-1]):   # une expression régulière
            j = i + 1
            while j < n and src[j] != "/" and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            i = j + 1; continue
        i += 1
    return out


def morceaux_texte(gabarit: str) -> list:
    """Le texte visible d'un morceau de HTML (marques \x00k\x00 pour les ${…}) : segments entre balises, et attributs."""
    out = [a for a in ATTR.findall(gabarit)]
    for seg in TAG.split(gabarit):
        out.append(seg)
    return out


def propre(t: str):
    t = re.sub(r"\s+", " ", t.replace("\\n", " ")).strip()
    t = re.sub(r"&nbsp;", " ", t)
    # les marques des ${…} : renumérotées {0}, {1}… dans l'ordre
    k = 0
    def num(m):
        nonlocal k
        r = "{" + str(k) + "}"; k += 1
        return r
    t = re.sub(r"\x00\d+\x00", num, t).strip()
    t = re.sub(r"^(\{\d+\}\s*)+$", "", t)
    if not LETTRES.search(re.sub(r"\{\d+\}", "", t)):
        return None
    if re.fullmatch(r"[A-Z]{2}", t) or ("/" in t and " " not in t) or t.startswith("("):
        return None
    if "${" in t or re.search(r'"\w+":|\?\s*$|^\W*[?:]\s', t):
        return None
    if re.search(r"[;=]|=>|\(\)|\bfunction\b|\bconst\b|\breturn\b|^[.#\[]|\bvar\(--|px\b|^[a-z]+[A-Z]\w*$|^https?:", t):
        return None
    if len(t) > 600:
        return None
    return t


def litteraux_js(chemin) -> list:
    """Les littéraux lus par acorn (outils/i18n_js.mjs) ; à défaut, le lecteur maison (moins sûr)."""
    import subprocess
    r = subprocess.run(["node", str(ICI / "i18n_js.mjs"), str(chemin)], capture_output=True, text=True)
    if r.returncode == 0:
        out = []
        for el in json.loads(r.stdout):
            out.append(("str", el[1]) if el[0] == "str" else ("tpl", el[1], [""] * (len(el[1]) - 1)))
        return out
    print("acorn indisponible pour", chemin.name, ":", r.stderr.strip()[:200])
    return scanner_js(chemin.read_text(encoding="utf-8"))


# Des mots seuls, en minuscules, montrés tels quels (le filtre ci-dessous les prendrait pour des clés) (27/11/2026).
MOTS_SEULS = {"poids", "fixe", "facultatif", "(facultatif)", "illisible", "kcal par jour"}


def depuis_js(chemin) -> set:
    textes = set(MOTS_SEULS) if chemin.name == "app.js" else set()
    for el in litteraux_js(chemin):
        if el[0] == "str":
            t = propre(el[1])
            # une chaîne seule : un vrai texte (espace, majuscule ou accent), pas une clé (« dej », « plat »)
            if t and (" " in t or t[:1].isupper() or ACCENTS.search(t)) and not re.fullmatch(r"[a-z0-9_-]+", t):
                textes.add(t)
            for a in ATTR.findall(el[1]):
                t = propre(a)
                if t: textes.add(t)
        else:
            morceaux, exprs = el[1], el[2]
            brut = "".join(m + (f"\x00{k}\x00" if k < len(exprs) else "") for k, m in enumerate(morceaux))
            for seg in morceaux_texte(brut):
                t = propre(seg)
                if t and (not re.fullmatch(r"[a-z0-9_ -]+", t) or re.search(r" (pour|par|de|la|le|les|un|une|et|ou|ton|ta|tes|du|des|avec|sans|en|au|sur|dans|chez)\b", " " + t)):
                    textes.add(t)
    return textes


def depuis_py(chemin) -> set:
    """Le moteur : seulement les messages montrés à la personne (raise ValueError(…), _ErreurClaude(…)) ;
    les consignes envoyées à l'IA et les journaux ne se traduisent pas."""
    textes = set()
    arbre = ast.parse(chemin.read_text(encoding="utf-8"))
    for n in ast.walk(arbre):
        if not (isinstance(n, ast.Raise) and isinstance(n.exc, ast.Call) and getattr(n.exc.func, "id", getattr(n.exc.func, "attr", ""))
                in ("ValueError", "_ErreurClaude", "PermissionError", "RuntimeError") and n.exc.args):
            continue
        for x in ast.walk(n.exc.args[0]):
            if isinstance(x, ast.JoinedStr):
                parts, k = [], 0
                for v in x.values:
                    if isinstance(v, ast.Constant): parts.append(str(v.value))
                    else: parts.append(f"\x00{k}\x00"); k += 1
                t = propre("".join(parts))
            elif isinstance(x, ast.Constant) and isinstance(x.value, str):
                t = propre(x.value)
            else:
                continue
            if t:
                textes.add(t)
    return textes


def main():
    textes = set()
    for f in ("app.js", "graphiques.js", "miroir.js"):
        textes |= depuis_js(REPAS / "site" / f)
    for f in ("serveur.py", "journal_repas.py", "plat_perso.py", "profil.py", "stock.py", "planification.py"):
        textes |= depuis_py(REPAS / f)
    meal = pathlib.Path.home() / "Bureau/meal-prep/app"
    for f in ("web.js", "index.html"):
        textes |= depuis_js(meal / f)
    textes |= depuis_py(meal / "py/web.py")
    cat = json.loads((REPAS / "site/recettes.json").read_text(encoding="utf-8"))
    recettes = set()
    for r in cat["recettes"]:
        recettes.add(r["nom"].strip())
        recettes |= {e.strip() for e in r.get("etapes", []) if e.strip()}
        recettes |= {i["n"].strip() for i in r.get("ing", [])}
    recettes |= {str(x).strip() for x in cat.get("rayons", [])}
    nut = json.loads((REPAS / "site/nutriments.json").read_text(encoding="utf-8"))
    recettes |= {n.strip() for n in (nut.get("macros") or {})}
    (ICI / "i18n").mkdir(exist_ok=True)
    (ICI / "i18n/source.json").write_text(json.dumps({"ecrans": sorted(textes), "catalogue": sorted(recettes - textes)},
                                                     ensure_ascii=False, indent=0), encoding="utf-8")
    print(len(textes), "textes d'écran,", len(recettes - textes), "du catalogue")


if __name__ == "__main__":
    main()
