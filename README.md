# Mon Meal Prep (en ligne)

L'appli Mon Meal Prep, mode flemmard, sans dépendre d'un PC : comme Rafiq.

- `app/` : la page (publiée par GitHub Pages depuis la branche `gh-pages`, sous-arbre de `app/`).
- `supabase/` : la base (comptes, plats, journal des repas, suivi) et les fonctions en ligne
  (Claude : analyse d'un repas, nouvel ingrédient, photo d'un plat).

Chaque personne branche son propre compte Claude dans les Réglages (clé, adresse de l'API, modèle), comme dans Rafiq.

Les données personnelles ne sont jamais dans ce dépôt : elles sont dans Supabase.
