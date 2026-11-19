"""Déploie une fonction edge sur le projet Supabase de Mon Meal Prep (API de gestion, comme Rafiq).
    python3 outils/deployer_fonction.py claude"""
import json, pathlib, sys, urllib.request, uuid

nom = sys.argv[1]
cfg = pathlib.Path.home() / ".config"
jeton = (cfg / "supabase-token").read_text().strip()
ref = json.loads((cfg / "meal-prep/project.json").read_text())["ref"]
source = (pathlib.Path(__file__).resolve().parent.parent / "supabase/functions" / nom / "index.ts").read_bytes()
borne = uuid.uuid4().hex
meta = json.dumps({"entrypoint_path": "index.ts", "name": nom, "verify_jwt": False}).encode()
corps = (f"--{borne}\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n".encode() + meta
         + f"\r\n--{borne}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"index.ts\"\r\nContent-Type: application/typescript\r\n\r\n".encode()
         + source + f"\r\n--{borne}--\r\n".encode())
r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/functions/deploy?slug={nom}", data=corps, method="POST",
                           headers={"Authorization": f"Bearer {jeton}", "Content-Type": f"multipart/form-data; boundary={borne}"})
try:
    with urllib.request.urlopen(r, timeout=120) as rep:
        d = json.load(rep); print("déployée :", d.get("slug"), "version", d.get("version"), d.get("status"))
except urllib.error.HTTPError as e:
    print("refus", e.code, e.read().decode()[:800]); sys.exit(1)
