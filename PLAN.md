# Plan : Mon Meal Prep en ligne (option A, comme Rafiq)

Décidé le 19/11/2026 avec Taha. Seul le mode flemmard est ouvert (les autres modes sont à venir) ;
FODMAP gardé pour awatif. L'appli actuelle (serveur Python sur le PC, `~/jarvis/jarvis-assistant-vocal/repas/`)
reste la référence et continue de tourner jusqu'à la bascule.

## Architecture
- **Page** : `app/` (HTML/CSS/JS, reprise de `repas/site/`), publiée par GitHub Pages depuis `gh-pages`
  (`git subtree split --prefix=app main` puis push vers `gh-pages`, comme Rafiq). Adresse : tahabar19.github.io/meal-prep.
- **Comptes** : Supabase Auth, identifiant → `<identifiant>@meal-prep.invalid` + mot de passe (comme Rafiq).
- **Données** (Supabase, une ligne par personne, RLS : chacun ne lit et n'écrit que les siennes) :
  semaines composées, repas notés, plats perso, ingrédients perso, avis, suivi (poids, mesures), réglages.
- **Catalogue** : recettes, valeurs nutritionnelles et photos des fiches, précalculées par un script Python
  (`outils/exporter.py`, lancé à la main sur le PC quand le catalogue change) en fichiers statiques dans `app/data/`.
  Le téléphone n'a plus rien à calculer pour le catalogue ; la recherche de plats se fait sur le téléphone.
- **Claude** : comme Rafiq, chaque personne branche SON compte dans Réglages (clé, adresse d'API, modèle ;
  Anthropic par défaut, modèle par défaut `claude-opus-5-5`), vérifié par un vrai essai, gardé dans
  `cles_claude` (lisible seulement par les fonctions). Fonction edge `claude` : analyser un repas
  (texte, photo, ticket), proposer un nouvel ingrédient (étiquettes Open Food Facts / auchan.fr), choisir la
  photo d'un plat (Foodiesfeed, Openverse, Wikimedia Commons, sinon le plat voisin).

## Ce qui se porte en JavaScript (mode flemmard seulement)
1. Composer des semaines flemmard (repas fixes + un plat par jour midi et soir), FODMAP compris.
2. Le jour : plats prévus, totaux, « il te reste », jours suivants, historique.
3. Changer de plat, ajouter, retirer, plusieurs plats par repas (`au_repas`), modifier les ingrédients d'un jour.
4. Ajuster les quantités d'un plat (`viser_objectif`), « Pour finir la journée » (`idees_pour_finir`).
5. Ajouter un repas → plat du menu (`repas_au_menu`, plats perso « tel quel », ingrédients créés).
6. Suivi (poids, biceps, tour de hanches), Avancement simplifié.

Abandonné (mode flemmard) : paniers automatiques, relevés de prix, courses, budget.

## Étapes
1. ~~Dépôt GitHub et projet Supabase~~ (19/11 : `tahabar19/meal-prep`, projet `ycvmwdipuxbkcuwdhqds`, eu-west-3).
2. ~~Schéma SQL + RLS, fonction `claude`~~ (`supabase/schema.sql`, `supabase/functions/claude/index.ts`).
3. ~~Le moteur~~ : au lieu de traduire la logique en JavaScript, le serveur Python du PC tourne tel quel dans le
   navigateur (Pyodide, dans un Worker : `app/moteur.js` + `app/py/web.py`). La page (`app.js` du PC, retouchée par
   `outils/construire.py`) croit parler au serveur : `app/web.js` lui répond.
4. ~~Catalogue et photos~~ en fichiers statiques (`app/catalogue.json`, `app/photos/`), adresse retirée des fiches.
5. ~~Comptes taha et awatif~~, profils recopiés (`outils/migrer.py`), mots de passe provisoires dans
   `~/.config/meal-prep/comptes.txt`. Compte d'essai `zz-essai` (copie du profil de taha), mot de passe `essai-mdp`.
6. ~~En ligne~~ : https://tahabar19.github.io/meal-prep/ (19/11/2026).

## Mettre à jour l'appli en ligne
Après un changement dans `~/jarvis/jarvis-assistant-vocal/repas/` (moteur ou page) :
`~/jarvis/jarvis-assistant-vocal/.venv/bin/python outils/construire.py` (`--sans-photos` si le catalogue n'a pas changé),
puis commit, push de `main` et `H=$(git subtree split --prefix=app main) && git push -f origin $H:refs/heads/gh-pages`.
Fonction : `python3 outils/deployer_fonction.py claude`. Schéma : rejouer `supabase/schema.sql` (API de gestion).
Essais : `outils/essai_moteur.py` (Python, sans navigateur) ; Chrome sans fenêtre sur `python3 -m http.server` dans `app/`.

## Ce qui reste à voir
- Brancher un compte Claude dans Plus → Réglages (chacun le sien) : « Calculer », photo d'assiette, choix des photos.
- Durées mesurées (Chrome du PC) : première connexion ~7 s, réouverture 0,4 s (dernière journée gardée sur le téléphone),
  moteur prêt ~5 s plus tard ; actions 0,2 à 2 s ; nouvel ingrédient (étiquettes en ligne) ~7 s. À mesurer sur iPhone.
- Open Food Facts refuse les serveurs Supabase : le moteur l'appelle directement depuis le téléphone.
- L'appli du PC tourne encore ; ses données ne remontent plus en ligne (la copie en ligne date du 19/11 après-midi).

## Secrets (jamais dans le dépôt)
- `~/.config/meal-prep/db-password` : mot de passe de la base.
- `~/.config/meal-prep/project.json` : référence du projet.
- `~/.config/supabase-token` : jeton de gestion Supabase (partagé avec Rafiq).
- Les clés Claude : saisies par chacun dans l'appli, gardées dans Supabase.

## Demandes du 19/11 soir — EN COURS (reprendre ici)
Fait dans l'appli source (`~/jarvis/jarvis-assistant-vocal/repas/`, 165 tests OK), PAS encore construit ni publié en ligne :
- serveur : `_fixes()` + `fixer_plat()` + route `/api/repas/fixer` (repas fixes choisis par chacun, jours à venir mis à jour),
  fruits secs plus fixes par défaut (`profil.preferences.fruits_secs` faux sauf demande ; `/api/reglages {fruits_secs}` les ajoute/retire
  des jours à venir), `/api/reglages {date_debut}`, mesures `torse_avant/_apres`, `etat().fixes`.
- profil.py : création avec prénom, nom (`nom_famille`), date de naissance, téléphone (+ sexe, taille, poids) ; `modifier()` permet
  de changer ces infos pour tous (besoins recalculés seulement pour un profil calculé) ; l'identifiant ne change pas.
- app.js : bouton « Fixer ce plat / Ne plus fixer » (carte du plat, matin et collations), « · fixe » dans la grille, avis dans la carte
  du catalogue, verrou du défilement quand une fenêtre est ouverte, Plus sans Historique/Cuisine/Budget/Stock/Journal (flemmard),
  Mon profil sans Mes courses + nouvelles infos, formulaire de création avec les nouveaux champs, Avancement avec vitamines
  + « Voir les détails », Suivi (biceps/hanches/torse quand on veut, après la séance en option, date de début).
- app.css : catalogue en 3 par ligne sur téléphone. Cache sw `meal-prep-55`.
RESTE À FAIRE :
1. Réglages réorganisés (Mon objectif + date de début, Mes repas : fruits secs, FODMAP, liste des repas fixes ; Mes informations
   (form `fMesInfos` → `/api/profil/modifier`) ; Compte Claude (`typeof blocClaude === "function"`) ; Mon compte). Retirer alors
   la retouche « ${modeSuivi} » de outils/construire.py.
2. Connexion : remettre « Créer mon profil » en ligne (retirer la retouche de construire.py) ; fonction Supabase `inscription`
   (code d'invitation en secret), web.js `/api/profil/creer` → inscription → connexion → `web.creer_profil()` (mod_profil.creer +
   generer_mois).
3. Journal centralisé : table `journal` (insert seulement, RLS sans lecture), web.py remplace `serveur.journal`/`consigner`,
   web.js envoie les lignes ; `outils/journaux.py` pour l'admin ; supprimer les journal.json en ligne.
4. Limites Claude dans la fonction `claude` : tâches permises + consigne système (refuser « change l'appli », « cherche
   les données de X »), réponse JSON exigée, tailles max, quota par personne (table `usage_claude`), liste blanche pour « web ».
5. Construire, essais Chrome, publier (gh-pages) ; retirer les fruits secs des semaines en ligne de taha et awatif.
