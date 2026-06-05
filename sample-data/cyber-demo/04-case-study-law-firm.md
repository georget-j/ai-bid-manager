# Case Study: Ransomware Incident Response — Regional Law Firm

## Client Overview

**Organisation:** Regional solicitors firm (8 offices, anonymised as "Hartwell Legal")
**Sector:** Legal services
**Size:** 210 staff; 8 offices across Yorkshire and the Humber
**Engagement type:** Emergency incident response (non-retained) + post-incident review
**Contract value:** £41,200
**Duration:** March 2023 (emergency response: 9 days) + May 2023 (review: 5 days)
**Outcome:** Ransomware contained; no confirmed data exfiltration; firm operational within 11 days

---

## The Incident

At 06:47 on a Tuesday morning, Hartwell Legal's IT Manager received automated alerts that multiple file servers were unresponsive. On arriving at the Leeds head office at 08:00, he discovered that shared drives across three office locations had been encrypted. Ransom notes in `.txt` format were present in every encrypted directory, demanding 18 BTC (approximately £420,000 at the time) for a decryption key.

The firm had no cyber insurance, no IR retainer, and no pre-existing relationship with a cyber security provider.

The firm's Senior Partner contacted Fortis at 08:23. Our on-call analyst took the call within 8 minutes. We had an incident commander and technical responder at the Leeds office by 11:00.

---

## Initial Assessment (Hours 1–4)

On arrival, we immediately:

1. **Isolated affected segments** — Instructed the IT Manager to disconnect three office VPN tunnels (affected offices: Leeds, Sheffield, Hull). Five unaffected offices remained operational.
2. **Preserved evidence** — Captured a forensic image of one encrypted file server before any remediation activity. Took memory dumps from three affected endpoints.
3. **Identified patient zero** — Log analysis of the firm's on-premise Exchange server identified an email received 3 days earlier with a malicious Office macro attachment, opened by a fee earner in the Leeds office. The macro had dropped a Cobalt Strike beacon that had been dormant for 72 hours before triggering the ransomware payload.
4. **Identified the ransomware variant** — File extension analysis and ransom note content identified the variant as BlackCat (ALPHV). Fortis's IR team had handled two previous ALPHV engagements.
5. **Assessed exfiltration risk** — Firewall logs and DNS query logs showed significant outbound data transfer over the 72-hour dwell period to three external IPs (subsequently attributed to ALPHV staging infrastructure). We advised the firm to treat data exfiltration as likely until proven otherwise.

---

## Containment and Recovery (Hours 4–72)

### Communication

We established a crisis command structure:

- Incident Commander (Fortis): single point of contact for all technical decisions
- Senior Partner: authority over legal and communications decisions
- IT Manager: internal technical execution
- External comms consultant (retained separately by the firm): handled SRA notification and media holding statement

We advised the firm not to pay the ransom. ALPHV's negotiation track record is poor, and the firm had usable backups.

### Backup Assessment

The firm used a Veeam on-premise backup with 3-2-1 configuration. Critically, backup repositories were on a separate VLAN that had not been reachable from the compromised segment — the ransomware had not encrypted backups. The most recent clean backup was from 36 hours before the encryption event.

### Eradication

All affected servers and endpoints were wiped and rebuilt from known-good OS images. The Cobalt Strike beacon artefacts were identified and removed from the two endpoints where it had survived the initial cleanup pass (identified via memory dump analysis).

Exchange hybrid environment was hardened: macro execution disabled via Group Policy; external macro auto-run blocked; attachment sandboxing enabled via Defender for Office 365 (the firm held E3 licences but had not configured Defender features).

### Recovery

Veeam restore from backup completed within 14 hours. Data loss: approximately 36 hours of new/amended documents. Fee earners were advised to check recently modified files against email records to reconstruct lost work.

Five offices operational by Day 3. Full restoration of all 8 offices by Day 11.

---

## Regulatory Considerations

We advised the firm that the incident likely constituted a personal data breach reportable to the ICO under UK GDPR Article 33, given that client files containing personal data had been encrypted and potentially exfiltrated.

Fortis produced a breach notification report template, which the firm's Data Protection Officer (an external solicitor) used to prepare the ICO notification. The ICO acknowledged receipt and issued no further action at this stage, pending outcome of the exfiltration investigation.

We also advised notification to the SRA (Solicitors Regulation Authority) under the firm's regulatory obligations. The SRA acknowledged receipt.

---

## Post-Incident Review (May 2023)

Six weeks after resolution, Fortis conducted a formal post-incident review, examining:

- Root cause (macro-enabled attachment, lack of email sandboxing)
- Dwell time (72 hours — extended by lack of EDR alerting)
- Backup integrity (effective, but recovery time could be improved with offsite replication)
- Detection gaps (no SIEM; reliance on firewall logs and manual review)

**Recommendations implemented:**

- Microsoft Defender for Office 365 Plan 2 (ATP) enabled and configured
- Endpoint Detection & Response (EDR) deployed across all endpoints via SentinelOne
- Offsite backup replication to Azure Blob (immutable storage) added
- IR retainer with Fortis signed post-engagement

---

## Outcomes

| Metric                             | Result                                        |
| ---------------------------------- | --------------------------------------------- |
| Time to initial response           | 8 minutes (phone); 2.5 hours (on-site)        |
| Ransom paid                        | No                                            |
| Data confirmed exfiltrated         | Unconfirmed (treat as probable for 3 offices) |
| Offices restored                   | All 8                                         |
| Time to full operations            | 11 days                                       |
| Data loss                          | ~36 hours                                     |
| Regulatory notifications           | ICO (no action), SRA (acknowledged)           |
| Post-incident controls implemented | EDR, ATP, immutable backup, IR retainer       |
