# Plan de tests — Mon Meal Prep

Tout se lance d'un coup : `bash tests/lancer.sh` (rapport dans `~/Bureau/prep_meal/rapports-tests/`).
Les essais n'utilisent que le compte d'essai `zz-essai` ; les vrais comptes sont seulement **lus** (le moteur
tourne sur une copie de leurs fichiers, rien n'est réécrit). Le compte d'essai est sauvé avant les tests dans le
navigateur et remis en état après. Aucune clé n'est affichée.

Quatre niveaux, du plus fin au plus large :

| Niveau | Fichier | Ce qu'il vérifie | Durée |
|---|---|---|---|
| 1. Unitaires | `~/jarvis/…/tests/test_repas_*.py` | Les calculs du moteur, fonction par fonction (171 tests) | ~1 min |
| 2. Fonctionnels moteur | `tests/test_moteur.py` | Chaque action de l'appli, appelée comme la page l'appelle | ~40 s |
| 3. Opérationnels | `tests/test_operationnel.py` | Le site publié, la sécurité, les fonctions serveur, les vrais comptes | ~40 s |
| 4. Bout en bout | `tests/test_navigateur.mjs` | Un vrai Chrome, taille iPhone, sur le site en ligne | ~1 min 30 |

## 2. Fonctionnels moteur (`test_moteur.py`)

| Code | Test | Attendu |
|---|---|---|
| A1 | État complet | `/api/etat` donne semaine, avancement, vitamines, eau, suivi, objectifs ; 10 vitamines ; 7 jours |
| A2 | État rapide | moins de 5 s |
| A3 | Catalogue | plus de 50 plats, chacun avec id et nom |
| A4 | Route inconnue | 404 |
| A5 | Envoi trop gros | refusé |
| B1 | Eau | 1,5 L enregistré puis remis à 0 |
| B2 | Eau impossible | −1 L, 11 L, « beaucoup », demain : refusés |
| B3 | Objectif d'eau | entre 1,5 et 6 L |
| C1 | Mangé / pas encore | le plat ajoute ses calories exactes, puis les retire |
| C2 | Rien mangé | zéro vitamine |
| C3 | Vitamines | un plat mangé apporte des vitamines, jamais négatives |
| C4 | Jour inconnu | refusé (corrigé le 19/11 : c'était accepté sans rien faire) |
| D1 | Poubelle | sans l'ingrédient, moins de calories ; remis, les calories reviennent |
| D2 | Double portion | ×2 sur tous les ingrédients = 2× les calories |
| E1 | Fixer / défixer | le plat devient le petit-déjeuner fixe, puis ne l'est plus |
| E2 | Moment inconnu | refusé |
| F1 | Objectifs par période | deux périodes enregistrées, celle d'aujourd'hui choisie |
| F2 | Périodes absurdes | dates à l'envers, chevauchement, 300 kcal, 900 g de protéines : refusés |
| F3 | Proposition sans Claude | refusée avec un message qui parle du compte Claude |
| G1 | Ingrédient sans vitamines (sans compte Claude) | refusé : à remplir à la main |
| G2 | Ingrédient avec vitamines | accepté, plus dans « À compléter » |
| G3 | Vitamines impossibles | B12 = 1 000 000, C négatif, liste incomplète : refusées |
| G4 | Repas à la main | ajouté au menu, son aliment dans « À compléter », puis complété |
| G5 | Rien en fond sans Claude | aucun appel à Claude |
| G6 | Photo | seulement sur ses propres plats |
| H1 | Mesures | poids et biceps enregistrés |
| H2 | Mesures impossibles | 900 kg, −2 kg, date illisible : refusées |
| I1 | Semaine et mois | sans la journée en cours |
| I2 | Date de début | rien avant |
| I3 | Total du jour | = somme des plats mangés |
| J1 | Profil | taille modifiable |
| J2 | Profil absurde | 20 cm, 900 kg, téléphone « abc » : refusés |

## 3. Opérationnels (`test_operationnel.py`)

| Code | Test | Attendu |
|---|---|---|
| A1 | Page en ligne | 200, en HTTPS, moins de 3 s |
| A2 | Dernière version | la version en ligne = la dernière construite |
| A3 | Fichiers de la page | tous présents |
| A4 | Hors ligne | tous les fichiers du service worker présents |
| A5 | Moteur Python | se compile sans erreur |
| A6 | Catalogue et photos | plus de 50 plats, photos 160 et 480 présentes |
| A7 | Pyodide | joignable |
| A8 | Icônes | présentes |
| B1 | Site publié | aucun secret (clé de service, mots de passe, code d'invitation, clé Claude), aucune adresse e-mail ou postale |
| B2 | Dépôt public | idem, fichier par fichier |
| B3 | Historique git | aucun secret dans tout l'historique |
| C1 | Mauvais mot de passe | refusé |
| C2 | Sans connexion | aucune table lisible |
| C3 | Mes fichiers | je ne lis que les miens |
| C4 | Chez un autre | écrire, modifier, effacer : refusés |
| C5 | Profils | je ne vois que le mien ; identifiant non modifiable |
| C6 | Clés Claude | jamais lisibles, jamais écrites directement |
| C7 | Journal | j'écris le mien, je ne relis rien, je n'écris pas au nom d'un autre |
| C8 | Quotas | ni lisibles ni effaçables |
| C9 | Photos | pas chez un autre ; les miennes oui |
| D1–D3 | Fonction Claude | sans connexion 401, action inconnue 400, sans clé branchée : « branche ton compte » |
| D4 | Lecture de sites | sites hors liste, adresses internes, faux domaine, `file://` : refusés |
| D5 | Site permis | lu |
| D6 | Fausse clé | refusée, rien d'enregistré |
| D7 | CORS | autorisé |
| D8–D9 | Inscription | mauvais code 401 ; identifiant, mot de passe ou identifiant pris : refusés, aucun compte créé |
| E1 | Vrais comptes | l'état se calcule en moins de 8 s |
| E2 | Fichiers | tous lisibles |
| E3 | Menu | une semaine en cours ou qui commence dans les 7 jours |
| E4 | Halal | aucun porc ni alcool (« sans alcool » accepté) |
| E5 | Calories | chaque aliment des menus a sa fiche (kcal, macros) |
| E6 | Vitamines | chaque aliment a ses vitamines |
| E7 | Chiffres du jour | ni négatifs ni absurdes |
| E8 | Erreurs | aucune erreur de l'appli ces dernières 24 h |

## 4. Bout en bout (`test_navigateur.mjs`)

| Code | Test | Attendu |
|---|---|---|
| N1 | Mauvais mot de passe | message d'erreur, l'appli reste fermée |
| N2 | Connexion | plats du jour affichés en moins de 30 s |
| N3 | Les 6 écrans | Jour, Catalogue, Avancement, Vitamines, Suivi, Profil : titre, aucun débordement sur iPhone |
| N4 | Barre d'onglets | les 5 onglets et le bouton « Profil » |
| N5 | Changer de jour | Demain, puis Aujourd'hui |
| N6 | Mangé | le plat se grise, puis « Pas encore mangé » le dégrise |
| N7 | Quantité | ×1,5 donne 1,5× les calories, retour exact, même avec un ingrédient retiré |
| N8 | Poubelle et ↺ | moins de calories, puis exactement les mêmes |
| N9 | Eau | la barre enregistre, la valeur tient après rechargement |
| N10 | Vitamines | seulement aujourd'hui ; « À compléter » sans compte Claude |
| N11 | Avancement | courbe affichée, semaine et mois |
| N12 | Catalogue | grille de 3, recherche, fiche |
| N13 | Suivi | une mesure enregistrée |
| N14 | Profil | objectif, Claude, compte |
| N15 | Réouverture | plats affichés en moins de 8 s |
| N16 | Déconnexion | retour à l'écran de connexion |
| N17 | Console | aucune erreur JavaScript |
