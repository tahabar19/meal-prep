-- Mon Meal Prep : schéma de la base (Supabase / Postgres). Rejouable : "if not exists" / "or replace".
-- Les fichiers du profil (semaine.json, mois.json, journal_repas.json, plats_perso.json…) sont gardés tels quels,
-- une ligne par fichier et par personne : le moteur de l'appli (le même code Python que sur le PC, lancé dans
-- le navigateur) les lit et les écrit comme avant.

-- ---------- Personnes ----------
create table if not exists public.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  identifiant text unique not null check (identifiant ~ '^[a-z0-9_-]{2,30}$'),
  created_at timestamptz not null default now()
);
alter table public.profils enable row level security;
drop policy if exists "profil lu par soi" on public.profils;
create policy "profil lu par soi" on public.profils for select using (id = auth.uid());

-- ---------- Fichiers du profil ----------
create table if not exists public.fichiers (
  user_id uuid not null references auth.users(id) on delete cascade,
  nom text not null check (nom ~ '^[A-Za-z0-9_.-]{1,80}(/[A-Za-z0-9_.-]{1,80})?$' and nom !~ '\.\.'),
  contenu text not null,
  maj timestamptz not null default now(),
  primary key (user_id, nom)
);
alter table public.fichiers enable row level security;
drop policy if exists "fichiers a soi" on public.fichiers;
create policy "fichiers a soi" on public.fichiers for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Compte Claude de chacun (comme Rafiq) ----------
-- Jamais lisible par la page : seule la fonction « claude » (clé de service) y touche.
create table if not exists public.cles_claude (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cle text not null,
  endpoint text,                                  -- null = API Anthropic
  modele text,
  bearer boolean not null default false,          -- clé envoyée en « Authorization: Bearer »
  maj timestamptz not null default now()
);
alter table public.cles_claude enable row level security;
create or replace function public.infos_claude() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('endpoint', endpoint, 'modele', modele) from cles_claude where user_id = auth.uid();
$$;
create or replace function public.oublier_cle_claude() returns void
language sql security definer set search_path = public as $$ delete from cles_claude where user_id = auth.uid(); $$;

-- ---------- Photos des plats de chacun ----------
-- Lisibles par l'adresse (dossier = identifiant de la personne, impossible à deviner) ; écrites par soi seulement.
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
drop policy if exists "photos ecrites par soi" on storage.objects;
create policy "photos ecrites par soi" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos changees par soi" on storage.objects;
create policy "photos changees par soi" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos retirees par soi" on storage.objects;
create policy "photos retirees par soi" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos listees par soi" on storage.objects;
create policy "photos listees par soi" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Journal (ce que l'appli a fait, les erreurs) : centralisé, lisible par l'admin seulement ----------
-- Chacun peut y écrire SES lignes ; personne ne peut les relire depuis l'appli (aucune règle de lecture).
-- L'admin les récupère avec outils/journaux.py (clé de service).
create table if not exists public.journal (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quand timestamptz not null default now(),
  type text not null,
  titre text not null,
  details jsonb not null default '[]'::jsonb
);
alter table public.journal enable row level security;
drop policy if exists "journal ecrit par soi" on public.journal;
create policy "journal ecrit par soi" on public.journal for insert to authenticated with check (user_id = auth.uid());
create index if not exists journal_user_quand on public.journal (user_id, quand desc);

-- ---------- Questions à Claude : pour limiter ce que chacun peut demander par heure (fonction « claude ») ----------
create table if not exists public.usage_claude (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  quand timestamptz not null default now(),
  action text not null
);
alter table public.usage_claude enable row level security;
create index if not exists usage_claude_user_quand on public.usage_claude (user_id, quand desc);

-- ---------- Comptes renforcés (Taha, 22/11/2026) : email et téléphone, essais de connexion ----------
-- L'email sert à se connecter et à recevoir « mot de passe oublié » ; il n'est lisible que par soi.
alter table public.profils add column if not exists email text;
alter table public.profils add column if not exists telephone text;
create unique index if not exists profils_email on public.profils (lower(email)) where email is not null;
-- Les essais de connexion (identifiant ou email, réussis ou non) : au-delà de 8 échecs en 15 min, on attend.
-- Seule la fonction « compte » (clé de service) y touche.
create table if not exists public.essais_connexion (
  id bigint generated always as identity primary key,
  cle text not null,
  quand timestamptz not null default now(),
  reussi boolean not null default false
);
alter table public.essais_connexion enable row level security;
create index if not exists essais_connexion_cle_quand on public.essais_connexion (cle, quand desc);
-- Consommation par appel (Taha, 23/11/2026 : page « Suivi de conso », pour juger la facturation)
alter table public.usage_claude add column if not exists modele text;
alter table public.usage_claude add column if not exists tokens_entree integer;
alter table public.usage_claude add column if not exists tokens_sortie integer;
alter table public.usage_claude add column if not exists cle text;   -- 'perso' (sa clé), 'partagee' (celle de l'appli), 'gemini'
