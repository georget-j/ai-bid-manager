-- 041: Question provenance (additive, idempotent)
--
-- Records which source each extracted requirement/question came from, so the RFP
-- workflow can show "where this came from" (e.g. "Opportunity description" or a
-- specific tender document + section).

alter table opportunity_questions
  add column if not exists source_document text;

alter table opportunity_questions
  add column if not exists source_document_id uuid
    references tender_documents(id) on delete set null;
