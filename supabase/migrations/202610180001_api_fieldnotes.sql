create table if not exists public.af_api_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_slug text not null check (length(provider_slug) between 1 and 120),
  encrypted_secret text not null,
  masked_suffix text not null check (length(masked_suffix) <= 8),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_slug)
);

alter table public.af_api_credentials enable row level security;
revoke all on public.af_api_credentials from anon, authenticated;
-- Browser clients may not read or write credentials. The Edge Function uses
-- the service role only after validating the caller's JWT and owner identity.

create index if not exists af_api_credentials_user_id_idx
  on public.af_api_credentials (user_id);

create table if not exists public.af_quota_notes (
  id uuid primary key default gen_random_uuid(),
  provider_slug text not null,
  quota_summary text not null,
  scope text,
  source_url text,
  checked_at date,
  confidence text not null default 'unknown'
    check (confidence in ('documented', 'observed', 'unknown')),
  created_at timestamptz not null default now()
);

alter table public.af_quota_notes enable row level security;
create policy "Quota notes are readable by everyone"
  on public.af_quota_notes for select using (true);
revoke insert, update, delete on public.af_quota_notes from anon, authenticated;
grant select on public.af_quota_notes to anon, authenticated;
