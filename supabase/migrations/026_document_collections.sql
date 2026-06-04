-- Migration 026: Document collections
--
-- Adds a `collection` field to separate the user's main knowledge base from
-- procurement-sourced tender documents added via the opportunity detail page.
-- Also adds `opportunity_id` so procurement docs can be traced back to the
-- tender they came from (used for pre-marking "In KB" on the opportunity page).

alter table documents
  add column collection text not null default 'main',
  add column opportunity_id uuid references opportunities(id) on delete set null;

-- Backfill: existing procurement docs (added before this migration) get the
-- correct collection value so they don't pollute the main KB view.
update documents set collection = 'procurement' where source_type = 'procurement';

create index documents_collection_idx on documents (org_id, collection);
