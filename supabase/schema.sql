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
-- Mode famille (Taha, 23/11/2026) : un stock commun, les mêmes plats pour tous (chacun à ses quantités).
-- On rejoint une famille avec son code ; le créateur accepte ou refuse la demande.
create table if not exists public.familles (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(nom) between 1 and 40),
  code text unique not null,
  createur uuid not null references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now()
);
create table if not exists public.membres_famille (
  famille_id uuid not null references public.familles(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  statut text not null check (statut in ('attente', 'membre')),
  demande_le timestamptz not null default now(),
  primary key (famille_id, user_id)
);
create table if not exists public.fichiers_famille (
  famille_id uuid not null references public.familles(id) on delete cascade,
  nom text not null check (nom in ('stock.csv', 'mouvements.csv')),
  contenu text not null,
  maj timestamptz not null default now(),
  primary key (famille_id, nom)
);
create table if not exists public.operations_famille (
  id bigint generated always as identity primary key,
  famille_id uuid not null references public.familles(id) on delete cascade,
  auteur uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quand timestamptz not null default now(),
  operation jsonb not null
);
create index if not exists operations_famille_fam on public.operations_famille (famille_id, id);
alter table public.familles enable row level security;
alter table public.membres_famille enable row level security;
alter table public.fichiers_famille enable row level security;
alter table public.operations_famille enable row level security;

create or replace function public.ma_famille() returns uuid language sql stable security definer set search_path = public as $$
  select famille_id from public.membres_famille where user_id = auth.uid() and statut = 'membre'
$$;
drop policy if exists "famille lue par ses membres" on public.familles;
create policy "famille lue par ses membres" on public.familles for select using (id = public.ma_famille());
drop policy if exists "fichiers de la famille" on public.fichiers_famille;
create policy "fichiers de la famille" on public.fichiers_famille for all
  using (famille_id = public.ma_famille()) with check (famille_id = public.ma_famille());
drop policy if exists "operations lues par la famille" on public.operations_famille;
create policy "operations lues par la famille" on public.operations_famille for select using (famille_id = public.ma_famille());
drop policy if exists "operations ecrites par un membre" on public.operations_famille;
create policy "operations ecrites par un membre" on public.operations_famille for insert
  with check (famille_id = public.ma_famille() and auteur = auth.uid());

-- Tout le reste passe par ces fonctions (elles vérifient qui demande quoi).
create or replace function public.famille_etat() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m record; f record;
begin
  select * into m from membres_famille where user_id = auth.uid();
  if not found then return jsonb_build_object('famille', null); end if;
  select * into f from familles where id = m.famille_id;
  return jsonb_build_object('statut', m.statut, 'famille', jsonb_build_object('id', f.id, 'nom', f.nom,
      'code', case when m.statut = 'membre' then f.code end, 'createur', f.createur = auth.uid(),
      'createur_ident', (select identifiant from profils where id = f.createur)),
    'membres', case when m.statut = 'membre' then (select coalesce(jsonb_agg(jsonb_build_object('id', mf.user_id,
        'identifiant', p.identifiant, 'statut', mf.statut, 'createur', mf.user_id = f.createur, 'moi', mf.user_id = auth.uid())
        order by mf.statut desc, mf.demande_le), '[]') from membres_famille mf join profils p on p.id = mf.user_id
        where mf.famille_id = f.id and (mf.statut = 'membre' or f.createur = auth.uid())) end);
end $$;

create or replace function public.famille_creer(p_nom text, p_stock text, p_mouvements text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare fid uuid; c text;
begin
  if auth.uid() is null then raise exception 'Reconnecte-toi.'; end if;
  if exists (select 1 from membres_famille where user_id = auth.uid()) then raise exception 'Tu fais déjà partie d''une famille.'; end if;
  loop
    c := 'FAM-' || (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 4));
    exit when length(c) = 8 and not exists (select 1 from familles where code = c);
  end loop;
  insert into familles (nom, code, createur) values (left(coalesce(nullif(trim(p_nom), ''), 'Ma famille'), 40), c, auth.uid()) returning id into fid;
  insert into membres_famille (famille_id, user_id, statut) values (fid, auth.uid(), 'membre');
  insert into fichiers_famille (famille_id, nom, contenu) values (fid, 'stock.csv', coalesce(p_stock, '')), (fid, 'mouvements.csv', coalesce(p_mouvements, ''));
  return public.famille_etat();
end $$;

create or replace function public.famille_rejoindre(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'Reconnecte-toi.'; end if;
  if exists (select 1 from membres_famille where user_id = auth.uid()) then raise exception 'Tu fais déjà partie d''une famille, ou ta demande est en attente.'; end if;
  select id into fid from familles where code = upper(trim(p_code));
  if fid is null then raise exception 'Aucune famille avec ce code.'; end if;
  insert into membres_famille (famille_id, user_id, statut) values (fid, auth.uid(), 'attente');
  return public.famille_etat();
end $$;

create or replace function public.famille_repondre(p_user uuid, p_accepter boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select id into fid from familles where createur = auth.uid();
  if fid is null then raise exception 'Seul le créateur de la famille accepte les demandes.'; end if;
  if p_accepter then
    update membres_famille set statut = 'membre' where famille_id = fid and user_id = p_user and statut = 'attente';
  else
    delete from membres_famille where famille_id = fid and user_id = p_user and user_id <> auth.uid();
  end if;
  return public.famille_etat();
end $$;

create or replace function public.famille_quitter() returns jsonb
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select fa.* into f from familles fa join membres_famille m on m.famille_id = fa.id where m.user_id = auth.uid();
  if not found then return public.famille_etat(); end if;
  if f.createur = auth.uid() then
    delete from familles where id = f.id;            -- le créateur part : la famille est dissoute
  else
    delete from membres_famille where user_id = auth.uid();
  end if;
  return public.famille_etat();
end $$;
revoke all on function public.famille_creer(text, text, text), public.famille_rejoindre(text), public.famille_repondre(uuid, boolean),
  public.famille_quitter(), public.famille_etat() from public, anon;
grant execute on function public.famille_creer(text, text, text), public.famille_rejoindre(text), public.famille_repondre(uuid, boolean),
  public.famille_quitter(), public.famille_etat(), public.ma_famille() to authenticated;

-- ---------- Reprise d'un appel à l'IA après une coupure (Taha, 27/11/2026 : « Pas de réseau » à chaque fois) ----------
-- Le téléphone renvoie la même demande (même numéro) quand la connexion a coupé pendant le calcul : la fonction
-- « claude » rend la réponse gardée ici au lieu de refaire (et repayer) l'appel. Lignes effacées au bout de 2 heures.
create table if not exists public.reponses_ia (
  user_id uuid not null references auth.users(id) on delete cascade,
  demande text not null,
  action text not null,
  statut text not null default 'encours',
  http integer,
  reponse jsonb,
  quand timestamptz not null default now(),
  primary key (user_id, demande)
);
alter table public.reponses_ia enable row level security;      -- aucune règle : seules les fonctions y touchent
-- La durée de chaque appel (secondes d'attente côté téléphone), pour la page « Suivi de conso ».
alter table public.usage_claude add column if not exists duree_ms integer;

-- ---------- Famille ouverte (Taha, 27/11/2026 : « on peut changer de profil facilement sur un téléphone, ça donne
-- les doses de tous les membres dans un seul téléphone » ; choix : tout le monde ouvre le profil de tout le monde) ----------
-- Chaque membre lit et modifie les fichiers des autres membres de sa famille (journée, doses, repas mangés, plats).
-- Le suivi (poids, mesures, silhouette du miroir) reste privé : suivi.json et silhouette*.
create or replace function public.de_ma_famille(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membres_famille a join membres_famille b on b.famille_id = a.famille_id
    where a.user_id = auth.uid() and a.statut = 'membre' and b.user_id = p_user and b.statut = 'membre')
$$;
create or replace function public.dossier_de_ma_famille(p_dossier text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membres_famille a join membres_famille b on b.famille_id = a.famille_id
    where a.user_id = auth.uid() and a.statut = 'membre' and b.user_id::text = p_dossier and b.statut = 'membre')
$$;
revoke all on function public.de_ma_famille(uuid), public.dossier_de_ma_famille(text) from public, anon;
grant execute on function public.de_ma_famille(uuid), public.dossier_de_ma_famille(text) to authenticated;

drop policy if exists "fichiers de la famille ouverts" on public.fichiers;
create policy "fichiers de la famille ouverts" on public.fichiers for all to authenticated
  using (public.de_ma_famille(user_id) and nom <> 'suivi.json' and nom not like 'silhouette%')
  with check (public.de_ma_famille(user_id) and nom <> 'suivi.json' and nom not like 'silhouette%');
drop policy if exists "journal ecrit pour la famille" on public.journal;
create policy "journal ecrit pour la famille" on public.journal for insert to authenticated with check (public.de_ma_famille(user_id));
drop policy if exists "photos de la famille ecrites" on storage.objects;
create policy "photos de la famille ecrites" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.dossier_de_ma_famille((storage.foldername(name))[1]));
drop policy if exists "photos de la famille changees" on storage.objects;
create policy "photos de la famille changees" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.dossier_de_ma_famille((storage.foldername(name))[1]));
drop policy if exists "photos de la famille retirees" on storage.objects;
create policy "photos de la famille retirees" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.dossier_de_ma_famille((storage.foldername(name))[1]));
drop policy if exists "photos de la famille listees" on storage.objects;
create policy "photos de la famille listees" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.dossier_de_ma_famille((storage.foldername(name))[1]));

-- Un membre sans téléphone (enfant…), créé par un membre de la famille : un compte sans mot de passe connu.
alter table public.profils add column if not exists sans_telephone boolean not null default false;

create or replace function public.famille_etat() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m record; f record;
begin
  select * into m from membres_famille where user_id = auth.uid();
  if not found then return jsonb_build_object('famille', null); end if;
  select * into f from familles where id = m.famille_id;
  return jsonb_build_object('statut', m.statut, 'famille', jsonb_build_object('id', f.id, 'nom', f.nom,
      'code', case when m.statut = 'membre' then f.code end, 'createur', f.createur = auth.uid(),
      'createur_id', case when m.statut = 'membre' then f.createur end,
      'createur_ident', (select identifiant from profils where id = f.createur)),
    'membres', case when m.statut = 'membre' then (select coalesce(jsonb_agg(jsonb_build_object('id', mf.user_id,
        'identifiant', p.identifiant, 'statut', mf.statut, 'createur', mf.user_id = f.createur, 'moi', mf.user_id = auth.uid(),
        'sans_telephone', p.sans_telephone)
        order by mf.statut desc, mf.demande_le), '[]') from membres_famille mf join profils p on p.id = mf.user_id
        where mf.famille_id = f.id and (mf.statut = 'membre' or f.createur = auth.uid())) end);
end $$;

-- ---------- Notifications sur le téléphone (Taha, 27/11/2026 : « le responsable ne reçoit jamais la notif ») ----------
-- Abonnements Web Push de chaque appareil, et ce qui a été envoyé (pour borner les envois). Fonctions seulement.
create table if not exists public.abonnements_push (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  appareil text,
  cree timestamptz not null default now()
);
alter table public.abonnements_push enable row level security;
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  de uuid references auth.users(id) on delete set null,
  pour uuid references auth.users(id) on delete cascade,
  type text not null,
  titre text not null,
  envoyees integer not null default 0,
  quand timestamptz not null default now()
);
alter table public.notifications enable row level security;

-- ---------- Silhouette au miroir (Taha, 27/11/2026) : photos de face et de profil, PRIVÉES (choix de Taha : gardées en
-- ligne, visibles par soi seul). Dossier = identifiant de la personne ; personne d'autre, pas même la famille.
insert into storage.buckets (id, name, public) values ('silhouettes', 'silhouettes', false) on conflict (id) do update set public = false;
drop policy if exists "silhouettes lues par soi" on storage.objects;
create policy "silhouettes lues par soi" on storage.objects for select to authenticated
  using (bucket_id = 'silhouettes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "silhouettes ecrites par soi" on storage.objects;
create policy "silhouettes ecrites par soi" on storage.objects for insert to authenticated
  with check (bucket_id = 'silhouettes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "silhouettes changees par soi" on storage.objects;
create policy "silhouettes changees par soi" on storage.objects for update to authenticated
  using (bucket_id = 'silhouettes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "silhouettes retirees par soi" on storage.objects;
create policy "silhouettes retirees par soi" on storage.objects for delete to authenticated
  using (bucket_id = 'silhouettes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------------ rappels (28/11/2026)
-- Chacun coche ses rappels (Réglages → Rappels) ; la base appelle la fonction notifier chaque heure (pg_cron + pg_net),
-- avec le jeton du coffre (vault : « rappels_jeton », le même que le secret RAPPELS_JETON de la fonction ; copie locale
-- ~/.config/meal-prep/rappels-jeton). Créer le jeton du coffre à la main : select vault.create_secret('<jeton>', 'rappels_jeton');
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create table if not exists public.rappels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  types text[] not null default '{}',
  fuseau text not null default 'Europe/Paris',
  maj timestamptz not null default now()
);
alter table public.rappels enable row level security;
drop policy if exists "mes rappels" on public.rappels;
create policy "mes rappels" on public.rappels for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and types <@ array['pesee','eau','diner','silhouette']::text[]
              and cardinality(types) <= 4 and length(fuseau) between 3 and 60);
select cron.schedule('rappels-meal-prep', '2 * * * *', $cron$
  select net.http_post(
    url := 'https://ycvmwdipuxbkcuwdhqds.supabase.co/functions/v1/notifier',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-rappels', (select decrypted_secret from vault.decrypted_secrets where name = 'rappels_jeton')),
    body := '{"action":"rappels"}'::jsonb,
    timeout_milliseconds := 60000);
$cron$);

