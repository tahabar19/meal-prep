"""Sauvegarde / remise en état du compte d'essai (zz-essai) autour des tests dans le navigateur.
    python3 tests/compte_essai.py sauver <fichier>     python3 tests/compte_essai.py restaurer <fichier>"""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "outils"))
import sb

quoi, chemin = sys.argv[1], pathlib.Path(sys.argv[2])
s, p = sb.appel("GET", "/rest/v1/profils?identifiant=eq.zz-essai&select=id")
uid = p[0]["id"]
if quoi == "sauver":
    s, f = sb.appel("GET", f"/rest/v1/fichiers?user_id=eq.{uid}&select=nom,contenu&limit=5000")
    chemin.write_text(json.dumps(f, ensure_ascii=False))
    print(f"{len(f)} fichiers sauvés")
else:
    gardes = json.loads(chemin.read_text())
    s, f = sb.appel("GET", f"/rest/v1/fichiers?user_id=eq.{uid}&select=nom")
    noms = {x["nom"] for x in gardes}
    for x in f:
        if x["nom"] not in noms:
            sb.appel("DELETE", f"/rest/v1/fichiers?user_id=eq.{uid}&nom=eq.{x['nom']}")
    s, _ = sb.appel("POST", "/rest/v1/fichiers", [{"user_id": uid, **x} for x in gardes], entetes={"Prefer": "resolution=merge-duplicates"})
    s2, objets = sb.appel("POST", "/storage/v1/object/list/photos", {"prefix": f"{uid}/", "limit": 1000})
    print(f"{len(gardes)} fichiers remis ({s})")
