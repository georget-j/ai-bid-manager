-- Seed ONE fully-populated demo opportunity into the (global) opportunities catalog.
--
-- Clearly marked: source_name='demo', title prefixed "[DEMO]". Idempotent upsert on the
-- (source_name, source_notice_id) unique key — safe to re-run. Never touches real notices.
-- Rich enough to showcase the AI tender brief, requirement/question extraction with
-- priorities, evidence gaps, and KB cross-referencing. Deadline is far-future so it shows
-- as a live/open tender and surfaces in recommendations.
--
-- Run:  source ~/.secrets/tokens.sh && supabase db query --linked -f scripts/seed-demo-opportunity.sql

insert into opportunities (
  source_name, source_notice_id, source_url, submission_url,
  title, description, buyer_name, buyer_region, notice_type,
  procurement_stage, status, cpv_codes, region,
  value_amount, value_currency,
  published_at, deadline_at, contract_start_at, contract_end_at,
  framework_flag, lots, documents
) values (
  'demo',
  'DEMO-MDR-001',
  'https://www.gov.uk/contracts-finder',
  'https://www.gov.uk/contracts-finder',
  '[DEMO] Managed Detection & Response (MDR) Security Service',
  $desc$Demoshire County Council invites tenders for a 3-year Managed Detection and Response (MDR) security service to protect its corporate and citizen-facing digital estate.

Scope of requirements:
- Provide a 24/7 Security Operations Centre (SOC) with UK-based analysts and a maximum 15-minute triage time for critical alerts.
- Deliver continuous threat detection across endpoints, network, and Microsoft 365, with monthly threat intelligence reporting.
- The supplier MUST hold ISO/IEC 27001:2022 certification and Cyber Essentials Plus. Certification evidence is a pass/fail requirement.
- The supplier MUST be able to demonstrate at least two comparable UK public-sector MDR deployments within the last three years (mandatory case-study evidence).
- Describe your approach to incident response, including escalation, containment, and post-incident review.
- Confirm compliance with UK GDPR and the Data Protection Act 2018; all data must be processed and stored within the UK.
- Provide a fully costed price schedule with a fixed annual managed-service fee and a day rate for ad-hoc incident response.
- Desirable: integration with the Council's existing Microsoft Sentinel tenant and NCSC Active Cyber Defence feeds.

Responses to the quality questions are limited to 1,000 words each. Pricing must use the supplied schedule. The contract is for an initial 3 years with an option to extend by 12 months.$desc$,
  'Demoshire County Council',
  'South East',
  'Contract Notice',
  'tender',
  'active',
  array['72500000','72222300','79714000','48730000'],
  'South East',
  480000,
  'GBP',
  now() - interval '5 days',
  now() + interval '45 days',
  now() + interval '120 days',
  now() + interval '3 years 120 days',
  false,
  $lots$[
    {"title":"Lot 1 — 24/7 Managed Detection & Response","description":"SOC, continuous monitoring across endpoint/network/M365, monthly threat intelligence reporting, 15-minute critical triage.","valueAmount":360000,"valueCurrency":"GBP","cpvCodes":["72500000","79714000"]},
    {"title":"Lot 2 — Incident Response Retainer","description":"On-demand incident response with a fixed day rate, containment and post-incident review, UK-based responders.","valueAmount":120000,"valueCurrency":"GBP","cpvCodes":["72222300"]}
  ]$lots$::jsonb,
  $docs$[
    {"title":"Cyber Essentials Requirements for IT Infrastructure (reference)","url":"https://www.ncsc.gov.uk/files/cyber-essentials-requirements-for-infrastructure-v3-1-January-2023.pdf","documentType":"guidance","format":"PDF"}
  ]$docs$::jsonb
)
on conflict (source_name, source_notice_id) do update set
  source_url        = excluded.source_url,
  submission_url    = excluded.submission_url,
  title             = excluded.title,
  description       = excluded.description,
  buyer_name        = excluded.buyer_name,
  buyer_region      = excluded.buyer_region,
  notice_type       = excluded.notice_type,
  procurement_stage = excluded.procurement_stage,
  status            = excluded.status,
  cpv_codes         = excluded.cpv_codes,
  region            = excluded.region,
  value_amount      = excluded.value_amount,
  value_currency    = excluded.value_currency,
  published_at      = excluded.published_at,
  deadline_at       = excluded.deadline_at,
  contract_start_at = excluded.contract_start_at,
  contract_end_at   = excluded.contract_end_at,
  framework_flag    = excluded.framework_flag,
  lots              = excluded.lots,
  documents         = excluded.documents,
  updated_at        = now();
