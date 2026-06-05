-- Add optional p_client_id scoping to hybrid_search_chunks.
--
-- When p_client_id is supplied, retrieval includes:
--   1. Documents with client_id = p_client_id (this client's evidence)
--   2. Documents with client_id IS NULL (shared org knowledge base)
-- This lets an agency's general methodology docs contribute to any bid,
-- while client-specific certs and case studies are kept per-client.
--
-- When p_client_id is null, behaviour is unchanged (all org docs searched).

create or replace function hybrid_search_chunks(
  query_text      text,
  query_embedding vector(1536),
  match_count     int  default 6,
  p_org_id        uuid default null,
  p_client_id     uuid default null
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
      select id from documents
      where
        -- Org scope (null = demo/shared rows visible to all)
        (p_org_id is null or org_id is null or org_id = p_org_id)
        -- Client scope: when set, include this client's docs + shared org docs
        and (
          p_client_id is null
          or client_id is null
          or client_id = p_client_id
        )
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
