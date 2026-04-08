-- Ankit portfolio: Supabase setup
-- Run this in the Supabase SQL Editor if you are not using the migrations folder.
-- This mirrors: supabase/migrations/20260407_0001_portfolio_core.sql

create extension if not exists vector with schema extensions;

create table if not exists public.voice_rate_limits (
  id bigserial primary key,
  ip text not null,
  count integer not null default 1,
  window_start timestamptz not null default date_trunc('day', now()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists voice_rate_limits_ip_window_unique
  on public.voice_rate_limits (ip, window_start);

create index if not exists voice_rate_limits_window_start_idx
  on public.voice_rate_limits (window_start desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists voice_rate_limits_set_updated_at on public.voice_rate_limits;
create trigger voice_rate_limits_set_updated_at
before update on public.voice_rate_limits
for each row
execute function public.set_updated_at();

create table if not exists public.chat_rate_limits (
  id bigserial primary key,
  ip text not null,
  count integer not null default 1,
  window_start timestamptz not null default date_trunc('hour', now()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_rate_limits_ip_window_unique
  on public.chat_rate_limits (ip, window_start);

create index if not exists chat_rate_limits_window_start_idx
  on public.chat_rate_limits (window_start desc);

drop trigger if exists chat_rate_limits_set_updated_at on public.chat_rate_limits;
create trigger chat_rate_limits_set_updated_at
before update on public.chat_rate_limits
for each row
execute function public.set_updated_at();

create table if not exists public.documents (
  id bigserial primary key,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);

create index if not exists documents_embedding_idx
  on public.documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

create index if not exists documents_fts_idx
  on public.documents
  using gin (fts);

create index if not exists documents_metadata_idx
  on public.documents
  using gin (metadata);

create or replace function public.hybrid_search(
  query_text text,
  query_embedding vector(1536),
  match_count int default 10,
  semantic_weight float default 0.7,
  keyword_weight float default 0.3,
  filter jsonb default '{}'::jsonb
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    d.id,
    d.content,
    d.metadata,
    (
      semantic_weight * (1 - (d.embedding <=> query_embedding)) +
      keyword_weight * coalesce(ts_rank(d.fts, websearch_to_tsquery('english', query_text)), 0)
    ) as similarity
  from public.documents d
  where case
    when filter <> '{}'::jsonb then d.metadata @> filter
    else true
  end
  order by similarity desc
  limit match_count;
end;
$$;

create or replace function public.delete_documents_by_slug(slug text)
returns void
language plpgsql
as $$
begin
  delete from public.documents
  where metadata->>'article_id' = slug;
end;
$$;

create table if not exists public.rag_hashes (
  article_id text primary key,
  hash text not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists rag_hashes_set_updated_at on public.rag_hashes;
create trigger rag_hashes_set_updated_at
before update on public.rag_hashes
for each row
execute function public.set_updated_at();
