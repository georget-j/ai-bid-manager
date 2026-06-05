# Demo Account — Fortis Cyber Solutions Ltd

A pre-built demo persona for testing the system as a real user. Represents a small UK cyber security consultancy with 20 employees, specialising in SME cyber support.

## Credentials

| Field     | Value                                     |
| --------- | ----------------------------------------- |
| Email     | `demo@fortis-cyber.co.uk`                 |
| Password  | `FortisDemo2024!`                         |
| Login URL | https://ai-rfp-agent-ten.vercel.app/login |

## Creating the Account (one-time setup)

After deploying the latest code, run:

```bash
curl -s -X POST https://ai-rfp-agent-ten.vercel.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@fortis-cyber.co.uk","password":"FortisDemo2024!"}' | jq .
```

Expected response: `{"ok":true}`

If the account already exists you'll get an error — that's fine, just proceed to seeding.

## Seeding the Knowledge Base (one-time, or to reset)

Log in first to get a session cookie, then call the seed endpoint. Easiest way via browser:

1. Log in at `/login` with the credentials above
2. Open browser DevTools → Console and run:

```js
fetch("/api/documents/seed-cyber-demo", { method: "POST" })
  .then((r) => r.json())
  .then(console.log);
```

Expected response:

```json
{
  "seeded": [
    "Fortis Cyber Solutions — Company Overview",
    "Fortis Cyber Solutions — Capability Statement",
    "Case Study: Cyber Essentials Plus — NHS Community Trust",
    "Case Study: Ransomware Incident Response — Regional Law Firm",
    "Case Study: OT/IT Segmentation — Yorkshire Food Manufacturer",
    "Fortis Cyber Solutions — Certifications and Accreditations",
    "Fortis Cyber Solutions — Service Catalogue",
    "Fortis Staff Profiles (Internal HR Notes)",
    "Fortis Delivery Methodology — Internal Reference Notes",
    "Fortis Client Feedback — Raw Compilation",
    "Fortis Bid History Log",
    "Incident Response Playbook v3.0",
    "Fortis Technology Partners and Supplier Relationships"
  ],
  "skipped": []
}
```

Re-running the seed is safe — already-ingested documents are skipped.

## What's in the Knowledge Base

### Well-structured (7 documents)

| Document                        | What it tests                                                   |
| ------------------------------- | --------------------------------------------------------------- |
| Company Overview                | General company queries, sector coverage, headcount             |
| Capability Statement            | Formal bid questions — frameworks, insurance, contract history  |
| Case Study: NHS Trust           | CE+ methodology questions, NHS/healthcare sector experience     |
| Case Study: Law Firm            | Incident response capability, ransomware handling, legal sector |
| Case Study: Manufacturer        | OT/ICS experience, segmentation, supply chain audit             |
| Certifications & Accreditations | Cert questions — CHECK, CREST, IASME, ISO 27001 progress        |
| Service Catalogue               | Pricing, scope, deliverables for any service line               |

### Intentionally messy (6 documents)

| Document                | Realistic imperfection                                      |
| ----------------------- | ----------------------------------------------------------- |
| Team Profiles (HR dump) | Dense bullets, inconsistent format, internal notes mixed in |
| Methodology Notes       | No headings, acronym-heavy, running prose — hard to parse   |
| Client Feedback (raw)   | Mixed email snippets, survey scores, verbatim call notes    |
| Bid History Log         | Spreadsheet export format, pipe-delimited, terse notes      |
| IR Playbook v3          | Highly technical, command-line heavy, 8-phase structure     |
| Technology Partners     | Internal supplier notes, action items, informal tone        |

## Sample Questions to Test

Once seeded, try these in the Ask interface:

- "What certifications does Fortis hold and when do they expire?"
- "Describe Fortis's experience with NHS clients"
- "What is the day rate for incident response out of hours?"
- "How many employees does Fortis have and what are their key certifications?"
- "Has Fortis done any OT security work?"
- "What is Fortis's win rate on bids and what is their largest contract?"
- "How does Fortis handle ransomware incidents?"
- "What EDR tools does Fortis work with?"

## Resetting the Demo

To wipe the KB and re-seed fresh:

1. Go to `/documents` → delete all documents in the Knowledge Base tab
2. Re-run the seed via the browser console command above

## Technical Notes

- Documents are ingested as `source_type: "sample"`, `collection: "main"`
- The seed is org-scoped — seeding while logged in as the demo user only populates that org's KB
- Any other user who runs the seed endpoint populates their own org's KB (not the demo org)
- Source files live in `sample-data/cyber-demo/` (13 markdown files)
- Seed function: `lib/cyber-demo-seed.ts`
- Seed route: `app/api/documents/seed-cyber-demo/route.ts`
