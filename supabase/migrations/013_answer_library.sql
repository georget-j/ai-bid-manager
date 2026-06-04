-- Answer library: pre-approved responses promoted from reviewed query results.
-- A similarity pre-check against this table runs before RAG to surface
-- existing answers for repeat questions.

create table if not exists answer_library (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid references orgs(id),
  question            text not null,
  answer              text not null,
  topic               text,
  tags                text[] not null default '{}',
  embedding           vector(1536),
  source_query_id     uuid references queries(id) on delete set null,
  source_review_id    uuid references review_requests(id) on delete set null,
  created_by          text not null,
  last_used_at        timestamptz,
  use_count           integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists answer_library_org_idx on answer_library(org_id);
create index if not exists answer_library_embedding_idx
  on answer_library using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

create trigger answer_library_updated_at
  before update on answer_library
  for each row execute function set_updated_at();

-- RLS
alter table answer_library enable row level security;

create policy "org_answer_library"
  on answer_library for all
  to authenticated
  using (org_id is null or org_id in (
    select org_id from org_memberships where user_id = auth.uid()
  ))
  with check (org_id is null or org_id in (
    select org_id from org_memberships where user_id = auth.uid()
  ));

-- Function: find similar library entries by embedding cosine similarity
create or replace function match_answer_library(
  query_embedding   vector(1536),
  match_threshold   float,
  match_count       int,
  p_org_id          uuid default null
)
returns table (
  id          uuid,
  question    text,
  answer      text,
  topic       text,
  similarity  float
)
language sql stable
as $$
  select
    al.id,
    al.question,
    al.answer,
    al.topic,
    1 - (al.embedding <=> query_embedding) as similarity
  from answer_library al
  where
    1 - (al.embedding <=> query_embedding) > match_threshold
    and (p_org_id is null or al.org_id = p_org_id or al.org_id is null)
  order by al.embedding <=> query_embedding
  limit match_count;
$$;
