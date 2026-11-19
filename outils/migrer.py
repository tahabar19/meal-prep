"""Recopie un profil du PC (~/Bureau/prep_meal/profils/<nom>/) dans Supabase, pour un compte de l'appli en ligne.
    python3 outils/migrer.py <dossier du profil> <identifiant du compte> [--remplacer]

Fichiers texte du profil -> table « fichiers » (les sauvegardes, Chrome, acces.json et les *.avant-* restent sur le PC) ;
photos de ses plats (photos/*.jpg) -> stockage « photos/<id du compte>/ ».
Sans --remplacer, refuse si le compte a déjà des fichiers en ligne."""
import json, pathlib, sys
import sb

source, ident = pathlib.Path(sys.argv[1]).expanduser().resolve(), sys.argv[2]
remplacer = "--remplacer" in sys.argv
s, profils = sb.appel("GET", f"/rest/v1/profils?identifiant=eq.{ident}&select=id")
if s != 200 or not profils:
    sys.exit(f"pas de compte « {ident} » ({s} {profils})")
uid = profils[0]["id"]
s, deja = sb.appel("GET", f"/rest/v1/fichiers?user_id=eq.{uid}&select=nom")
if deja and not remplacer:
    sys.exit(f"« {ident} » a déjà {len(deja)} fichiers en ligne : relance avec --remplacer")

IGNORES = ("acces.json", "sessions_site.json", "stock.csv.avant", "mouvements.csv.avant")
lignes, photos = [], []
for f in sorted(source.rglob("*")):
    rel = f.relative_to(source).as_posix()
    if not f.is_file() or any(p.startswith(".") or p in ("chrome", "donnees") for p in rel.split("/")) \
            or ".avant-" in f.name or f.name.startswith(IGNORES) or rel.count("/") > 1:
        continue
    if f.suffix.lower() in (".jpg", ".jpeg", ".png"):
        photos.append(f)
    else:
        lignes.append({"user_id": uid, "nom": rel, "contenu": f.read_text(encoding="utf-8")})
if remplacer:
    sb.appel("DELETE", f"/rest/v1/fichiers?user_id=eq.{uid}")
s, r = sb.appel("POST", "/rest/v1/fichiers", lignes, entetes={"Prefer": "resolution=merge-duplicates"})
if s >= 300:
    sys.exit(f"fichiers refusés : {s} {r}")
for f in photos:
    s, r = sb.appel("POST", f"/storage/v1/object/photos/{uid}/{f.name}", f.read_bytes(),
                    entetes={"Content-Type": "image/jpeg", "x-upsert": "true"})
    if s >= 300:
        print("photo refusée", f.name, s, r)
print(f"{ident} : {len(lignes)} fichiers, {len(photos)} photos ->", ", ".join(l["nom"] for l in lignes))
