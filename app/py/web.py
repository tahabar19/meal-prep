"""Le serveur Mon Meal Prep, dans le navigateur (Pyodide, dans un Web Worker).

C'est le MÊME code que sur le PC (repas/serveur.py et ses modules, recopiés par outils/construire.py) ;
seules les portes vers l'extérieur changent :
  - la config de Jarvis (core.config) vient de REGLAGES ;
  - Claude, les étiquettes en ligne et les banques de photos passent par la fonction Supabase « claude »
    (pont_sync, une requête synchrone faite par le Worker) ;
  - pas de fils d'exécution dans Pyodide : ce qui partait « en fond » (photo d'un plat) est fait juste après
    la réponse (apres()) ;
  - la personne connectée est donnée par l'appli (Supabase Auth), pas par une session du serveur.
Les fichiers du profil sont dans /mp/profils/<identifiant>/ ; l'appli les recharge depuis Supabase à
l'ouverture et y renvoie ceux qui ont changé après chaque requête (changements())."""
import base64
import concurrent.futures
import io
import json
import os
import re
import sys
import threading
import types

RACINE = "/mp"
UTILISATEUR = ""
REGLAGES = {}
A_FAIRE = []                      # ce qui partait dans un fil : fait après la réponse
JOURNAUX = []                     # le journal et les erreurs : envoyés à la table « journal » (lisible par l'admin seulement)


def _pont(action: str, corps: dict) -> dict:
    """Appel synchrone à la fonction Supabase « claude » (voir moteur.js)."""
    from js import pont_sync
    return json.loads(pont_sync(action, json.dumps(corps)))


# ------------------------------------------------------------------ modules remplacés
def _modules_de_remplacement():
    core = types.ModuleType("core")
    config = types.ModuleType("core.config")
    config.reglage = lambda cle, defaut=None: REGLAGES.get(cle, defaut)
    llm = types.ModuleType("core.llm")

    class ClaudeCodeProvider:                    # le CLI claude n'existe pas ici
        _ENV_RETIRE = ()

        @staticmethod
        def _trouver_binaire():
            return None
    llm.ClaudeCodeProvider = ClaudeCodeProvider
    core.config, core.llm = config, llm
    sys.modules.update({"core": core, "core.config": config, "core.llm": llm})

    nav = types.ModuleType("repas.navigateur")   # Chrome des enseignes : rien en ligne

    class ErreurNavigateur(Exception):
        pass
    nav.ErreurNavigateur = ErreurNavigateur
    nav.chrome_propre = lambda *a, **k: False
    nav.Firefox = object
    sys.modules["repas.navigateur"] = nav

    req = types.ModuleType("requests")           # requests.get par la fonction en ligne

    class RequestException(Exception):
        pass

    class Reponse:
        def __init__(self, d):
            self.status_code = int(d.get("status") or 0)
            self.content = base64.b64decode(d.get("base64") or "")
            self.text = self.content.decode("utf-8", "replace")

        def json(self):
            return json.loads(self.text)

    def get(url, params=None, headers=None, timeout=None, **_):
        if params:
            from urllib.parse import urlencode
            url += ("&" if "?" in url else "?") + urlencode(params)
        d = _pont("web", {"url": url, "binaire": True})
        if d.get("erreur"):
            raise RequestException(d["erreur"])
        return Reponse(d)
    req.get, req.RequestException, req.Response = get, RequestException, Reponse
    req.exceptions = types.SimpleNamespace(RequestException=RequestException)
    sys.modules["requests"] = req


class _Sequentiel:
    """ThreadPoolExecutor sans fils : chaque tâche est faite tout de suite, l'une après l'autre."""
    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def map(self, f, *iterables):
        return [f(*x) for x in zip(*iterables)]

    def submit(self, f, *a, **k):
        fut = concurrent.futures.Future()
        try:
            fut.set_result(f(*a, **k))
        except Exception as e:
            fut.set_exception(e)
        return fut

    def shutdown(self, *a, **k):
        pass


def _fil_plus_tard(self):
    A_FAIRE.append(self.run)


# ------------------------------------------------------------------ démarrage
serveur = None


def _reglages(utilisateur: str, autres: dict) -> None:
    REGLAGES.clear()
    REGLAGES.update({"repas.profils": RACINE, "repas.profil": utilisateur, "repas.dossier": "/commun",
                     "repas.acces_wifi": False, "repas.admin_local": False, "repas.sauvegardes": "/tmp/sauvegardes",
                     "repas.hotes": ["localhost"], "repas.plat_perso_ia": True, "repas.etiquettes_en_ligne": True,
                     **(autres or {})})


def preparer() -> None:
    """Les remplacements, puis le serveur du PC importé (avant même la connexion : c'est le plus long)."""
    global serveur
    if serveur is not None:
        return
    _reglages("", {})
    _modules_de_remplacement()
    threading.Thread.start = _fil_plus_tard
    concurrent.futures.ThreadPoolExecutor = _Sequentiel
    from repas import serveur as s, etiquettes, profil as mod_profil
    serveur = s
    etiquettes._lire = lambda url, delai=10, entetes=None: _lire_page(url)
    s._claude_json = _claude_json
    s._claude_avec_photo = _claude_avec_photo
    s.sauvegarder = lambda *a, **k: None          # les sauvegardes, c'est Supabase
    # Un seul journal, centralisé (Taha, 19/11/2026) : plus de journal.json dans le profil.
    s.journal = lambda type_, titre, details=None: JOURNAUX.append(
        {"type": str(type_)[:40], "titre": str(titre)[:300], "details": [str(x)[:1000] for x in (details or [])][:30]})
    s.consigner = lambda quoi, texte: JOURNAUX.append({"type": f"erreur:{quoi}"[:40], "titre": str(texte)[:300], "details": [str(texte)[:4000]]})

    class Requete(s._Requete):
        reponse = None

        def _qui(self):
            mod_profil.choisir(UTILISATEUR)
            return UTILISATEUR

        def _repondre(self, code, corps, type_="application/json; charset=utf-8", entetes=(), etiquette=None):
            self.reponse = (code, corps, type_)
    s.RequeteWeb = Requete


def demarrer(utilisateur: str, reglages: dict) -> None:
    """Le moteur pour cette personne (ses fichiers sont déjà dans /mp/profils/<identifiant>/)."""
    global UTILISATEUR
    preparer()
    UTILISATEUR = utilisateur
    _reglages(utilisateur, reglages)
    from repas import profil as mod_profil
    mod_profil.choisir(utilisateur)


def regler(reglages_json: str) -> None:
    """La page dit si la personne a branché son compte Claude : sans lui, rien d'automatique (repas.plat_perso_ia)."""
    REGLAGES.update(json.loads(reglages_json))


def _lire_page(url: str) -> str:
    d = _pont("web", {"url": url})
    if d.get("erreur"):
        raise OSError(d["erreur"])
    return d.get("texte") or ""


def _claude(blocs: list, max_tokens: int = 4000, tache: str = "aide") -> dict | None:
    if not REGLAGES.get("repas.plat_perso_ia", True):
        return None
    d = _pont("messages", {"contenu": blocs, "max_tokens": max_tokens, "tache": tache})
    if d.get("erreur"):
        raise _ErreurClaude(d["erreur"])
    trouve = re.search(r"\{.*\}", d.get("texte") or "", re.S)
    try:
        reponse = json.loads(trouve.group(0)) if trouve else None
    except ValueError:
        return None
    return reponse if isinstance(reponse, dict) else None


class _ErreurClaude(ValueError):
    """Claude n'est pas joignable (pas de clé, clé refusée, plus de crédit) : le message est montré tel quel."""


def _claude_json(demande: str, timeout: int = 60) -> dict | None:
    try:
        return _claude([{"type": "text", "text": demande}])
    except _ErreurClaude:
        return None


def _claude_avec_photo(demande: str, photo: bytes | None, timeout: int = 150) -> dict | None:
    # Sur le PC, Claude lisait ./photo.jpg avec l'outil Read ; ici la photo est jointe à la question.
    texte = demande.replace("lis le fichier ./photo.jpg (outil Read)", "elle est jointe à ce message")
    blocs = [{"type": "text", "text": texte}]
    if photo:
        type_ = "image/png" if photo[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
        blocs.insert(0, {"type": "image", "media_type": type_, "data": base64.b64encode(photo).decode()})
    return _claude(blocs, 4000, "repas")             # une erreur (pas de clé, hors sujet…) remonte jusqu'à la page


# ------------------------------------------------------------------ créer son profil (en ligne)
def valider_profil(champs_json: str) -> str:
    """Le formulaire de création vérifié AVANT de créer le compte : "" si tout va bien, sinon le message."""
    from repas import profil as mod_profil
    try:
        mod_profil.valider({**json.loads(champs_json), "mot_de_passe": "x" * 8}, lambda cle, defaut=None: defaut)
        return ""
    except ValueError as e:
        return str(e)


def creer_profil(champs: dict) -> None:
    """Le profil de la personne qui vient de créer son compte : comme sur le PC (calories, protéines, vitamines),
    puis ses deux premières semaines (mode flemmard)."""
    from repas import profil as mod_profil
    d = _dossier()
    if os.path.isdir(d) and not os.listdir(d):
        os.rmdir(d)
    mod_profil.creer({**champs, "identifiant": UTILISATEUR, "mot_de_passe": "x" * 8}, 0, serveur.reglage)
    mod_profil.choisir(UTILISATEUR)
    serveur._ecrire_p("reglages_site.json", {"nb_semaines": 2})      # deux semaines d'un coup, comme les autres
    serveur.generer_mois(None, garder=False)


# ------------------------------------------------------------------ une requête de la page
def traiter(methode: str, chemin: str, corps: str = "") -> str:
    """Comme le serveur du PC : renvoie {"status", "corps" (JSON) | "binaire" (base64), "type"}."""
    if chemin == "/api/web/creer_profil":
        try:
            creer_profil(json.loads(corps or "{}"))
        except ValueError as e:
            return json.dumps({"status": 400, "corps": json.dumps({"erreur": str(e)}, ensure_ascii=False)})
        methode, chemin, corps = "GET", "/api/etat", ""
    from email.message import Message
    h = Message()
    h["Host"] = "localhost"
    h["Origin"] = "http://localhost"
    donnees = (corps or "").encode("utf-8")
    h["Content-Length"] = str(len(donnees))
    h["Content-Type"] = "application/json"
    r = serveur.RequeteWeb.__new__(serveur.RequeteWeb)
    r.command, r.path, r.headers, r.request_version = methode, chemin, h, "HTTP/1.1"
    r.rfile, r.wfile, r.client_address, r.server = io.BytesIO(donnees), io.BytesIO(), ("127.0.0.1", 0), None
    r.requestline = f"{methode} {chemin} HTTP/1.1"
    try:
        (r.do_POST if methode == "POST" else r.do_GET)()
    except _ErreurClaude as e:
        r.reponse = (400, {"erreur": str(e)}, "application/json")
    if r.reponse is None:
        return json.dumps({"status": 500, "corps": json.dumps({"erreur": "pas de réponse"})})
    code, c, type_ = r.reponse
    if isinstance(c, bytes) and not type_.startswith("application/json"):
        return json.dumps({"status": code, "binaire": base64.b64encode(c).decode(), "type": type_})
    return json.dumps({"status": code, "corps": c.decode("utf-8") if isinstance(c, bytes) else json.dumps(c, ensure_ascii=False),
                       "type": type_})


def apres() -> bool:
    """Fait une tâche laissée « en fond » (photo d'un plat). Vrai s'il en reste."""
    if A_FAIRE:
        tache = A_FAIRE.pop(0)
        try:
            tache()
        except Exception as e:
            print("tâche en fond :", e)
    return bool(A_FAIRE)


# ------------------------------------------------------------------ fichiers du profil
def _dossier() -> str:
    return f"{RACINE}/profils/{UTILISATEUR}"


def instantane() -> dict:
    """{nom relatif: (taille, date)} des fichiers du profil (les sauvegardes du PC et Chrome exceptés)."""
    vu = {}
    racine = _dossier()
    for d, sous, noms in os.walk(racine):
        sous[:] = [x for x in sous if not x.startswith(".") and x not in ("chrome", "donnees")]
        for n in noms:
            if n.startswith(".") or n.endswith(".part"):
                continue
            p = os.path.join(d, n)
            st = os.stat(p)
            vu[os.path.relpath(p, racine)] = (st.st_size, st.st_mtime_ns)
    return vu


def changements(avant_json: str) -> str:
    """Ce qui a changé depuis l'instantané `avant` : [{"nom", "texte"} | {"nom", "photo": True} | {"nom", "retire": True}]."""
    avant = {k: tuple(v) for k, v in json.loads(avant_json).items()}
    apres_ = instantane()
    out = []
    for nom, sig in apres_.items():
        if avant.get(nom) != sig:
            chemin = os.path.join(_dossier(), nom)
            if nom.endswith((".jpg", ".jpeg", ".png")):
                out.append({"nom": nom, "photo": True})
            else:
                with open(chemin, encoding="utf-8") as f:
                    out.append({"nom": nom, "texte": f.read()})
    out += [{"nom": nom, "retire": True} for nom in avant if nom not in apres_]
    return json.dumps(out, ensure_ascii=False)


def journaux() -> str:
    """Les lignes de journal écrites depuis la dernière fois (la page les envoie à Supabase)."""
    lignes = JOURNAUX[:]
    JOURNAUX.clear()
    return json.dumps(lignes, ensure_ascii=False)


def instantane_json() -> str:
    return json.dumps(instantane())
