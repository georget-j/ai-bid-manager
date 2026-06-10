-- 063: collection-scoped retrieval (additive, idempotent).
--
-- Grant application context (documents + links imported for a specific grant) is stored
-- in a per-grant collection ("grant:<grantId>"). This redefines the 5-arg
-- hybrid_search_chunks to take an optional p_collection and ensures:
--   * general retrieval (p_collection null) EXCLUDES all "grant:%" collections, so a
--     grant's context never leaks into other responses;
--   * a grant draft (p_collection = "grant:<id>") includes the main KB + only its own
--     grant collection (never another grant's).
-- All current documents use collection = 'main', so default behaviour is unchanged.

drop function if exists hybrid_search_chunks(text, vector, int, uuid, uuid);

create or replace function hybrid_search_chunks(
  query_text      text,
  query_embedding vector(1536),
  match_count     int  default 6,
  p_org_id        uuid default null,
  p_client_id     uuid default null,
  p_collection    text default null
)
returns table (
  id             uuid,
  document_id    uuid,
  document_title text,
  content        text,
  similarity     float,
  metadata       jsonb
)
language plpgsql
as $$
declare
  rrf_k    constant int := 60;
  ts_query          tsquery;
begin
  ts_query := plainto_tsquery('english', query_text);

  return query
  with
    org_docs as (
      select d0.id as doc_id
      from documents d0
      where
        (p_org_id is null or d0.org_id is null or d0.org_id = p_org_id)
        and (
          p_client_id is null
          or d0.client_id is null
          or d0.client_id = p_client_id
        )
        and (
          -- exclude grant-scoped collections from general retrieval; a grant draft
          -- (p_collection set) additionally includes only its own collection.
          d0.collection is null
          or d0.collection not like 'grant:%'
          or d0.collection = p_collection
        )
    ),
    vector_hits as (
      select
        dc.id as chunk_id,
        row_number() over (order by dc.embedding <=> query_embedding) as rank
      from document_chunks dc
      where dc.embedding is not null
        and dc.document_id in (select doc_id from org_docs)
      order by dc.embedding <=> query_embedding
      limit 20
    ),
    fts_hits as (
      select
        dc.id as chunk_id,
        row_number() over (
          order by ts_rank(to_tsvector('english', dc.content), ts_query) desc
        ) as rank
      from document_chunks dc
      where to_tsvector('english', dc.content) @@ ts_query
        and dc.document_id in (select doc_id from org_docs)
      order by ts_rank(to_tsvector('english', dc.content), ts_query) desc
      limit 20
    ),
    rrf_scores as (
      select
        all_hits.chunk_id,
        sum(1.0 / (rrf_k + all_hits.rank)) as score
      from (
        select chunk_id, rank from vector_hits
        union all
        select chunk_id, rank from fts_hits
      ) all_hits
      group by all_hits.chunk_id
    )
  select
    dc.id,
    dc.document_id,
    d.title as document_title,
    dc.content,
    (1 - (dc.embedding <=> query_embedding))::float as similarity,
    dc.metadata
  from rrf_scores rs
  join document_chunks dc on dc.id = rs.chunk_id
  join documents d on d.id = dc.document_id
  order by rs.score desc
  limit match_count;
end;
$$;
