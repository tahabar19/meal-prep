#!/usr/bin/env bash
# Lance les quatre niveaux de tests et écrit un rapport. Code de sortie : 0 si tout passe.
#    bash tests/lancer.sh              (MP_SITE=http://127.0.0.1:8790/ pour une version locale)
set -u
ICI="$(cd "$(dirname "$0")" && pwd)"
PY="$HOME/jarvis/jarvis-assistant-vocal/.venv/bin/python"
DOSSIER="$HOME/Bureau/prep_meal/rapports-tests"
QUAND="$(date +%Y-%m-%d-%H%M)"
mkdir -p "$DOSSIER/captures-$QUAND"
RAPPORT="$DOSSIER/rapport-$QUAND.md"
echo "# Tests du $(date '+%d/%m/%Y à %H:%M')" > "$RAPPORT"
echo "Site : ${MP_SITE:-https://tahabar19.github.io/meal-prep/}" >> "$RAPPORT"
statut=0

niveau() {   # niveau <titre> <commande…>
  local titre="$1"; shift
  echo "== $titre"
  local debut=$SECONDS sortie
  sortie="$("$@" 2>&1)"; local code=$?
  local bilan; bilan="$(echo "$sortie" | grep -E '^(Ran |OK|FAILED|[0-9]+/[0-9]+ réussis)' | tr '\n' ' ')"
  echo "   ${bilan:-terminé} ($((SECONDS - debut)) s)"
  { echo; echo "## $titre — $([ $code -eq 0 ] && echo RÉUSSI || echo ÉCHEC)"; echo; echo '```'
    echo "$sortie" | grep -vE '^\s*$' | tail -60; echo '```'; } >> "$RAPPORT"
  [ $code -eq 0 ] || statut=1
}

niveau "1. Unitaires (moteur, fonction par fonction)" bash -c "cd $HOME/jarvis/jarvis-assistant-vocal && $PY -m unittest tests.test_repas_site tests.test_repas_prix tests.test_repas_donnees tests.test_repas_etiquettes"
niveau "2. Fonctionnels (chaque action de l'appli)" bash -c "cd $ICI && $PY test_moteur.py -v"
niveau "3. Opérationnels (site, sécurité, serveur, comptes)" bash -c "cd $ICI && $PY test_operationnel.py -v"
niveau "4. Bout en bout (Chrome, taille iPhone)" env MP_CAPTURES="$DOSSIER/captures-$QUAND" node "$ICI/test_navigateur.mjs"

echo "Rapport : $RAPPORT"
exit $statut
