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
