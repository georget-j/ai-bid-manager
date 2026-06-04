-- Org-scope the RAG retrieval function.
--
-- The original hybrid_search_chunks queried all document_chunks regardless of
-- organisation.  In a multi-tenant deployment this allows any user to retrieve
-- and cite documents uploaded by a different organisation.
--
-- This version adds an optional p_org_id parameter.  When supplied, only chunks
-- belonging to documents in that org (or documents with a null org_id, which are
-- shared demo/legacy rows) are searched.  When null, behaviour is unchanged
-- (single-tenant / demo deployments).

create or replace function hybrid_search_chunks(
  query_text      text,
  query_embedding vector(1536),
  match_count     int  default 6,
  p_org_id        uuid default null
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
  rrf_k constant int := 60;
  ts_query tsquery;
begin
  ts_query := plainto_tsquery('english', query_text);

  return query
  with
    org_docs as (
      -- Limit candidate documents to the caller's org (or shared demo rows).
      select id from documents
      where p_org_id is null
         or org_id is null
         or org_id = p_org_id
    ),
    vector_hits as (
      select
        dc.id,
        row_number() over (order by dc.embedding <=> query_embedding) as rank
      from document_chunks dc
      where dc.embedding is not null
        and dc.document_id in (select id from org_docs)
      order by dc.embedding <=> query_embedding
      limit 20
    ),
    fts_hits as (
      select
        dc.id,
        row_number() over (
          order by ts_rank(to_tsvector('english', dc.content), ts_query) desc
        ) as rank
      from document_chunks dc
      where to_tsvector('english', dc.content) @@ ts_query
        and dc.document_id in (select id from org_docs)
      order by ts_rank(to_tsvector('english', dc.content), ts_query) desc
      limit 20
    ),
    rrf_scores as (
      select
        id,
        sum(1.0 / (rrf_k + rank)) as score
      from (
        select id, rank from vector_hits
        union all
        select id, rank from fts_hits
      ) all_hits
      group by id
    )
  select
    dc.id,
    dc.document_id,
    d.title  as document_title,
    dc.content,
    (1 - (dc.embedding <=> query_embedding))::float as similarity,
    dc.metadata
  from rrf_scores rs
  join document_chunks dc on dc.id = rs.id
  join documents d on d.id = dc.document_id
  order by rs.score desc
  limit match_count;
end;
$$;
