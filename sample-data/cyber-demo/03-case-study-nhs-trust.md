# Case Study: Cyber Essentials Plus Certification — NHS Community Trust

## Client Overview

**Organisation:** Moorside Community NHS Foundation Trust (anonymised)
**Sector:** Healthcare — NHS community and mental health services
**Size:** 620 staff; 14 community sites across West Yorkshire
**Engagement type:** Cyber Essentials Plus assessment, gap remediation support, DSPT alignment
**Contract value:** £28,500
**Duration:** January 2023 – April 2023
**Outcome:** CE+ certified; DSPT "Standards Met" achieved

---

## Business Problem

Moorside Trust had attempted Cyber Essentials Plus once previously, with a different supplier, and failed at the verification stage due to unpatched systems and inconsistent firewall rules across their community sites. The Trust's Head of IT Infrastructure contacted Fortis following a recommendation from a neighbouring NHS ICB.

The Trust was under pressure from NHS England to achieve CE+ before the end of the 2022/23 financial year, as it was a condition of a forthcoming capital grant for digital transformation. They had approximately 14 weeks to achieve certification, including remediating any findings.

Key concerns raised by the Trust at initial scoping:

- A legacy clinical system running on Windows Server 2012 R2 with no vendor patch support
- 14 geographically dispersed sites with varying network configurations
- A mix of managed devices (via MDM) and unmanaged personally-owned devices (BYOD) used by district nurses
- Firewall configurations had not been formally reviewed in over 3 years
- No formal vulnerability scanning had been conducted previously

---

## Fortis Approach

### Phase 1 — Pre-Assessment Gap Analysis (weeks 1–3)

We conducted a structured gap analysis against the five Cyber Essentials technical controls:

1. Firewalls and internet gateways
2. Secure configuration
3. Access control
4. Malware protection
5. Patch management

A Fortis governance consultant worked on-site for two days at the Trust's head office and remotely interviewed IT staff at four representative community sites. We produced a prioritised gap report with 34 findings, categorised as:

- **Critical (must fix before submission):** 11 findings
- **Significant (should fix):** 14 findings
- **Advisory (good practice):** 9 findings

### Phase 2 — Remediation Support (weeks 3–9)

Rather than leaving the Trust to remediate alone, Fortis provided a named technical consultant to support the internal IT team two days per week throughout remediation. Key remediations included:

**Firewall review:** We audited rules across the Cisco ASA estate (3 firewalls covering 14 sites via a hub-and-spoke MPLS). Identified 47 inbound rules with no documented business justification. 31 were removed; 16 were documented and retained.

**Legacy server:** The Windows Server 2012 R2 system running a legacy patient scheduling application was isolated into a network segment with no internet-facing connectivity, satisfying CE+ boundary requirements. The Trust committed to migration to a supported platform by Q4 2023.

**BYOD:** We advised the Trust to formally exclude personally-owned devices from the CE+ scope and document this boundary clearly in the System Description document. District nurses accessing email via personal phones were moved to a Conditional Access policy requiring Intune compliance before accessing Microsoft 365 resources.

**Patch management:** We identified 112 devices with critical patches outstanding (>30 days). The Trust adopted Windows Update for Business for all endpoints and achieved <98% patch compliance within 6 weeks.

**MFA:** Implemented for all Microsoft 365 accounts. Exceptions for 3 service accounts documented and risk-accepted by the SIRO.

### Phase 3 — CE+ Verification (weeks 10–12)

Fortis conducted the CE+ verification assessment in-scope across the agreed system boundary (all corporate endpoints, servers, and network infrastructure). The verification included:

- External vulnerability scan
- Internal authenticated vulnerability scan
- Firewall configuration review
- Sample device configuration checks (10 endpoints, 3 servers)
- Interview with IT Manager and Head of Procurement

**Finding at verification:** One additional issue identified — 3 printers on the corporate network had telnet enabled and default credentials. Remediated within 48 hours; verification concluded successfully.

### Phase 4 — DSPT Alignment (weeks 12–14)

Alongside CE+, we reviewed the Trust's Data Security & Protection Toolkit submission. CE+ certification satisfied mandatory evidence items across several DSPT assertions, reducing the remaining evidence burden. We produced a DSPT evidence pack and supported the Trust's submission, which achieved "Standards Met."

---

## Outcomes

| Metric                            | Result                |
| --------------------------------- | --------------------- |
| CE+ Certification                 | Achieved — April 2023 |
| DSPT Status                       | Standards Met         |
| Critical findings resolved        | 11 of 11              |
| Devices patched to compliance     | 98.4%                 |
| Firewall rules removed/documented | 47                    |
| Capital grant condition met       | Yes                   |
| Time to certification             | 13 weeks              |

---

## Client Feedback

_"We'd failed CE+ once before and were genuinely worried we wouldn't get there in time. Fortis were practical and never made us feel overwhelmed — they helped us prioritise and actually fixed things alongside us rather than just writing reports. The DSPT alignment support was a bonus we hadn't expected."_

— Head of IT Infrastructure, Moorside Community NHS Foundation Trust

---

## Lessons Learned / Transferable Approach

- BYOD is a recurring blocker for NHS bodies. Early scoping of the system boundary to exclude personal devices (with a compensating control for email access) is almost always the right answer.
- Legacy clinical systems require negotiation between clinical informatics and IG/IT functions — involving both teams in the risk-acceptance conversation prevents last-minute scope disputes.
- Two days per week of on-site/remote support during remediation significantly reduces total engagement duration compared with assessment-only models.
