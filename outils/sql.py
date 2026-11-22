"""Joue du SQL sur la base en ligne (API de gestion Supabase, jeton dans ~/.config/supabase-token).
    python3 outils/sql.py fichier.sql      ou      python3 outils/sql.py -c "select 1" """
import json, pathlib, sys, urllib.request

CFG = pathlib.Path.home() / ".config"
JETON = (CFG / "supabase-token").read_text().strip()
REF = json.loads((CFG / "meal-prep/project.json").read_text())["ref"]


def jouer(sql: str):
    r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", method="POST",
                               data=json.dumps({"query": sql}).encode(),
                               headers={"Authorization": f"Bearer {JETON}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=120) as rep:
            return rep.status, json.loads(rep.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:800]


if __name__ == "__main__":
    sql = sys.argv[2] if sys.argv[1] == "-c" else pathlib.Path(sys.argv[1]).read_text()
    print(*jouer(sql))
