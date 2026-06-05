-- Storage bucket for cached tender documents
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tender-docs', 'tender-docs', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Service-role-only policy (no anon access)
CREATE POLICY "Service role full access on tender-docs"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'tender-docs')
  WITH CHECK (bucket_id = 'tender-docs');

-- Cache table maps URL → storage object
CREATE TABLE IF NOT EXISTS tender_doc_cache (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url_hash     text UNIQUE NOT NULL,
  url          text NOT NULL,
  storage_path text NOT NULL,
  content_type text,
  byte_size    integer,
  created_at   timestamptz DEFAULT now()
);
