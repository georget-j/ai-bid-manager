-- 040: Central tender document store + dedup (additive, idempotent)
--
-- Stores buyer-published tender documents (bytes + extracted text) ONCE, globally,
-- keyed by content hash, and links them to the global `opportunities` catalog.
-- Rationale: opportunities are a central/global catalog (migration 023); their
-- attached tender documents are the same public buyer material for every org, so
-- caching them per-org (tender_doc_cache) re-downloads + re-extracts the same file.
--
-- Security: these two tables hold PUBLIC buyer material only — global read for
-- authenticated users, writes via service role only (no write policy). All
-- bid-private data (opportunity_questions, bid_pipeline, drafts) stays org-scoped.
--
-- This migration is purely additive. tender_doc_cache is intentionally left in
-- place as a dormant fallback; a later migration drops it once this is prod-proven.

create table if not exists tender_documents (
  id             uuid primary key default gen_random_uuid(),
  url            text not null,
  url_hash       text not null,        -- sha256 of the source URL (no-download fast path)
  content_hash   text not null,        -- sha256 of the bytes (dedup key)
  storage_path   text not null,        -- central/<content_hash>/<file> in the tender-docs bucket
  content_type   text,
  byte_size      integer,
  extracted_text text,
  page_count     integer,
  word_count     integer,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists tender_documents_content_hash_idx
  on tender_documents (content_hash);
create index if not exists tender_documents_url_hash_idx
  on tender_documents (url_hash);

create table if not exists opportunity_tender_documents (
  opportunity_id     uuid not null references opportunities(id) on delete cascade,
  tender_document_id uuid not null references tender_documents(id) on delete cascade,
  title              text,
  source_url         text,
  created_at         timestamptz not null default now(),
  primary key (opportunity_id, tender_document_id)
);

create index if not exists otd_opportunity_idx
  on opportunity_tender_documents (opportunity_id);

-- RLS: global read (public buyer material, same trust class as opportunities);
-- writes via service role only.
alter table tender_documents enable row level security;
alter table opportunity_tender_documents enable row level security;

drop policy if exists "tender_documents_read" on tender_documents;
create policy "tender_documents_read"
  on tender_documents for select
  to authenticated
  using (true);

drop policy if exists "otd_read" on opportunity_tender_documents;
create policy "otd_read"
  on opportunity_tender_documents for select
  to authenticated
  using (true);
