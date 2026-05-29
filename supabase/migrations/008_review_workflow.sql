-- Topic routing configuration
create table if not exists routing_config (
  id uuid primary key default gen_random_uuid(),
  topic text not null unique,
  owner_email text not null default '',
  backup_email text,
  slack_webhook_url text,
  preferred_channel text not null default 'email',
  escalation_hours integer not null default 48,
  created_at timestamptz not null default now()
);

-- Review requests — one per low-confidence or high-risk answer
create table if not exists review_requests (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references queries(id) on delete cascade,
  rfp_run_id text,
  topic text not null,
  risk_level text not null,
  confidence_score numeric(4,3),
  assigned_to text not null,
  status text not null default 'pending',
  due_at timestamptz,
  notified_at timestamptz,
  backup_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_requests_status_idx on review_requests(status);
create index if not exists review_requests_assigned_idx on review_requests(assigned_to);
create index if not exists review_requests_query_idx on review_requests(query_id);

-- Human-approved answers
create table if not exists approved_answers (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid references review_requests(id),
  query_id uuid references queries(id),
  original_question text not null,
  approved_answer text not null,
  approved_by text not null,
  topic text,
  source_rfp text,
  ingested_as_document_id uuid references documents(id),
  reusable boolean not null default true,
  created_at timestamptz not null default now()
);

-- Integration credentials
create table if not exists integration_settings (
  platform text primary key,
  settings jsonb not null default '{}',
  is_active boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Audit log — one row per action taken on a review request
create table if not exists review_audit_log (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid references review_requests(id) on delete cascade,
  actor_email text not null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists review_audit_log_request_idx on review_audit_log(review_request_id);

-- Review comments — threaded discussion per review request
create table if not exists review_comments (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null references review_requests(id) on delete cascade,
  author_email text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists review_comments_request_idx on review_comments(review_request_id);

-- Seed default routing rules (blank owners — admin fills these in)
insert into routing_config (topic, owner_email, preferred_channel) values
  ('security_compliance', '', 'email'),
  ('legal',               '', 'email'),
  ('pricing',             '', 'email'),
  ('technical',           '', 'email'),
  ('commercial',          '', 'email'),
  ('implementation',      '', 'email'),
  ('support',             '', 'email'),
  ('general',             '', 'email')
on conflict (topic) do nothing;
