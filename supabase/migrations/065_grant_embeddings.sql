-- 065: grant embeddings for semantic matching (additive, idempotent).
--
-- Stores a 1536-dim embedding per grant (text-embedding-3-small) so /my-grants can add
-- a semantic-fit boost on top of the keyword score. pgvector is already enabled
-- (document_chunks uses vector(1536)).

alter table grants
  add column if not exists embedding vector(1536);
