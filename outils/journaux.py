"""Le journal de l'appli en ligne (ce qu'elle a fait, les erreurs), pour l'admin seulement : écrit dans un fichier.
    python3 outils/journaux.py [identifiant] [--jours N]      (défaut : tout le monde, 7 jours)
Fichier : ~/Bureau/prep_meal/journaux-en-ligne.log (lisible par toi seul)."""
import datetime, pathlib, sys
import sb

jours = int(sys.argv[sys.argv.index("--jours") + 1]) if "--jours" in sys.argv else 7
qui = next((a for a in sys.argv[1:] if not a.startswith("--") and not a.isdigit()), None)
_, profils = sb.appel("GET", "/rest/v1/profils?select=id,identifiant")
noms = {p["id"]: p["identifiant"] for p in profils or []}
depuis = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=jours)).strftime("%Y-%m-%dT%H:%M:%SZ")
filtre = f"&user_id=eq.{next(i for i, n in noms.items() if n == qui)}" if qui else ""
s, lignes = sb.appel("GET", f"/rest/v1/journal?select=*&quand=gte.{depuis}{filtre}&order=quand.desc&limit=5000")
if s != 200:
    sys.exit(f"lecture impossible : {s} {lignes}")
f = pathlib.Path.home() / "Bureau/prep_meal/journaux-en-ligne.log"
with open(f, "w", encoding="utf-8") as sortie:
    for l in lignes:
        sortie.write(f"{l['quand'][:19].replace('T', ' ')}  {noms.get(l['user_id'], l['user_id'])}  [{l['type']}] {l['titre']}\n")
        for d in l.get("details") or []:
            sortie.write(f"      {d}\n")
f.chmod(0o600)
print(f"{len(lignes)} lignes ({jours} jours{', ' + qui if qui else ''}) -> {f}")
