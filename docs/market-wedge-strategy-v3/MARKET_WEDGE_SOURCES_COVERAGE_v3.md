# UK Procurement Source-Coverage Audit (2026-06-08)

> **Bottom line: the four OCDS feeds we ingest are ~100% of UK public-sector tenders.**
> There is no other _free, machine-readable_ provider to add. Everything else publishes
> _into_ these four by law, so no tenders escape us.

## The complete set of UK public-procurement notice feeds

| Source                        | What it covers                                                                                                                                                                                                           | API (verified contract → `MARKET_WEDGE_SOURCES_HARDENING_v3.md`) |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **Find a Tender (FTS)**       | UK-wide above-threshold + (from Feb 2025) below-threshold for England/Wales/NI; full lifecycle pipeline→termination. **This IS the Procurement Act 2023 "Central Digital Platform"** — same domain, no separate CDP API. | `…/api/1.0/ocdsReleasePackages` (cursor); OCID `ocds-h6vhtk`     |
| **Contracts Finder**          | England public sector ≥ £12k (≥ £30k central gov); back to Nov 2016.                                                                                                                                                     | `…/Published/Notices/OCDS/Search` (cursor); OCID `ocds-b5fd17`   |
| **Public Contracts Scotland** | Scotland — incl. **below-threshold, which never reaches FTS** (Scotland is devolved).                                                                                                                                    | Proactis `…/v1/Notices` (month × noticeType); OCID `ocds-r6ebe6` |
| **Sell2Wales**                | Wales public sector.                                                                                                                                                                                                     | Proactis `…/v1/Notices` + monthly bulk-download fallback         |

## Why nothing else is missing

Under the Procurement Act 2023 (in force 24 Feb 2025) and the devolved regimes, contracting
authorities are **legally required to publish notices to these services**. Buyer e-sourcing
portals are workflow tools that publish _into_ them — they are **not** independent data
sources:

- **eTendersNI / eSourcing NI** (Northern Ireland) — portal only, **no OCDS feed anywhere**.
  NI above-threshold notices flow to **FTS** (from Feb 2025); lower-value NI notices appear
  on **Contracts Finder**. Covered.
- **Crown Commercial Service / Government Commercial Agency** — a buyer, not a feed; its
  frameworks/awards appear on FTS + Contracts Finder.
- **NHS (Atamis)**, **MOD Defence Sourcing Portal**, **Jaggaer**, **ProContract / Delta
  eSourcing / In-tend**, and the **1,000+ other buyer portals** — all publish their notices
  to FTS / Contracts Finder. No independent public OCDS API.

Independent verification: third-party aggregators (e.g. D3 Tenders) that claim full UK
coverage search **exactly these four** services.

## Genuine gaps (nothing to integrate)

- **Northern Ireland sub-threshold** procurement has **no statutory publication obligation**,
  so it appears in **no feed at all** — not a connector we're missing, a gap in the law.

## Beyond notices — paid options (out of scope, for reference)

These are _not_ tender feeds; they add data the free OCDS _notices_ don't carry (actual
**spend**, framework **call-off** linkage, **supplier/buyer intelligence**), via paid APIs:

- **Tussell** — premium API: opportunities, awards, framework + call-off data, spend, buyer
  & supplier data; CRM/Salesforce integration.
- **Stotles** — aggregates 1,000+ UK & EU portals + AI relevance (has a free tier).
- **Spend Network** — public-sector spend/transparency analytics.

Worth revisiting only if/when the product needs spend or supplier-graph data, not for tender
coverage.

## Sources

- [Find a Tender — developer docs](https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsReleasePackages)
- [Contracts Finder — GOV.UK](https://www.gov.uk/contracts-finder) · [OCP Data Registry: Contracts Finder](https://data.open-contracting.org/en/publication/128)
- [OCP — UK Procurement Act one year on (Mar 2026)](https://www.open-contracting.org/2026/03/03/the-uk-procurement-act-one-year-on-what-does-the-data-tell-us/)
- [eTendersNI — Department of Finance NI](https://www.finance-ni.gov.uk/topics/etendersni)
- [Tussell](https://www.tussell.com/) · [Stotles](https://www.stotles.com/) · D3 Tenders (searches CF + FTS + PCS + Sell2Wales)
