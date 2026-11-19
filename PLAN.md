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
2. Schéma SQL + RLS, comptes taha et awatif, table `cles_claude`, fonction edge `claude` (connexion de la clé).
3. Export du catalogue en fichiers statiques + page qui s'ouvre, se connecte, affiche le catalogue.
4. Port de la logique du jour (étapes 1 à 6 ci-dessus), avec les mêmes tests que l'appli Python (rejoués en JS).
5. Fonctions Claude (analyse, ingrédient, photo).
6. Recopie des données actuelles de taha et awatif dans Supabase ; essai à deux ; bascule.

## Secrets (jamais dans le dépôt)
- `~/.config/meal-prep/db-password` : mot de passe de la base.
- `~/.config/meal-prep/project.json` : référence du projet.
- `~/.config/supabase-token` : jeton de gestion Supabase (partagé avec Rafiq).
- Les clés Claude : saisies par chacun dans l'appli, gardées dans Supabase.
