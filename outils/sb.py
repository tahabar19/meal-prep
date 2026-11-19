"""Petits appels à Supabase pour les outils (comptes, fichiers, essais). Les clés restent dans ~/.config/meal-prep/."""
import json, pathlib, urllib.request

CFG = pathlib.Path.home() / ".config/meal-prep"
REF = json.loads((CFG / "project.json").read_text())["ref"]
URL = f"https://{REF}.supabase.co"
ANON = (CFG / "anon-key").read_text().strip()
SERVICE = (CFG / "service-key").read_text().strip()


def appel(methode, chemin, corps=None, cle=SERVICE, jeton=None, entetes=None, brut=False):
    h = {"apikey": cle, "Authorization": f"Bearer {jeton or cle}", **(entetes or {})}
    data = None
    if corps is not None:
        data = corps if isinstance(corps, (bytes, bytearray)) else json.dumps(corps).encode()
        h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(URL + chemin, data=data, method=methode, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=120) as rep:
            b = rep.read()
            return rep.status, (b if brut else (json.loads(b) if b else None))
    except urllib.error.HTTPError as e:
        b = e.read()
        try:
            return e.code, json.loads(b)
        except ValueError:
            return e.code, b.decode()[:500]


def email(identifiant):
    return f"{identifiant}@meal-prep.invalid"


def creer_compte(identifiant, mot_de_passe):
    s, u = appel("POST", "/auth/v1/admin/users", {"email": email(identifiant), "password": mot_de_passe, "email_confirm": True})
    if s >= 300:
        raise RuntimeError(f"compte {identifiant} : {s} {u}")
    appel("POST", "/rest/v1/profils", {"id": u["id"], "identifiant": identifiant}, entetes={"Prefer": "resolution=merge-duplicates"})
    return u["id"]


def connexion(identifiant, mot_de_passe):
    s, d = appel("POST", "/auth/v1/token?grant_type=password", {"email": email(identifiant), "password": mot_de_passe}, cle=ANON)
    if s != 200:
        raise RuntimeError(f"connexion {identifiant} : {s} {d}")
    return d


def fonction(nom, corps, jeton):
    return appel("POST", f"/functions/v1/{nom}", corps, cle=ANON, jeton=jeton)
