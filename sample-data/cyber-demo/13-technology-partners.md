# Fortis Technology Partners and Supplier Relationships

Internal reference doc. Updated by Ben Whitmore. Last updated Jan 2024.
Not for external distribution as-is — use in bids only with specific product/vendor named and cleared by Ben.

---

DETECTION / EDR / ENDPOINT

SentinelOne — Authorised Partner (Reseller)
Contact: Helen Greer, Channel Manager, UK North (hgreer@sentinelone.com)
Products: Singularity Platform (EDR/XDR). We resell as part of deployment packages, mainly for post-IR clients who need to bolt on EDR quickly. Margin is approx 15%. Preferred EDR recommendation for SME clients on Windows-heavy estates. Good support from SentinelOne channel team. Have done 3 joint webinars with them.
Notes: Client must be on current subscription for us to access management console during IR engagements. Always check this at retainer setup.

Microsoft — No direct partnership, but strong practice
We are not a Microsoft CSP. We use Microsoft products extensively (Sentinel, Defender suite, Intune, Entra ID, Purview). Jade and Aaron hold SC-200. Most of our SOC monitoring for retainer clients uses Microsoft Sentinel where client has appropriate M365 licences (E3/E5). We have informal relationships with two local Microsoft-aligned CSP partners (DataVision IT, Cloudsense Tech) who handle licence procurement and we provide security layer on top.

CrowdStrike — occasional use
Not a partner. We have access to a demo/NFR licence for Falcon. Used on two larger engagements where client already had CrowdStrike. We can work with it but it's not our primary recommendation.

---

VULNERABILITY SCANNING

Tenable.io (Nessus / Tenable.sc)
We hold a Tenable Professional licence for internal use (scanning our clients as part of pen tests and CE+ assessments). Not a reseller. Annual renewal in March. Cost: approx £8,200/year. The CE+ external scanning is done via Tenable.io. Authenticated internal scans also via Tenable on-prem sensor where needed.

Qualys
Used occasionally when clients already have Qualys deployed and want us to work within their toolset. Not a licence holder ourselves.

---

AWARENESS TRAINING

KnowBe4 — Authorised Partner (Silver tier)
Contact: Will Patterson, Channel, UK (wpatterson@knowbe4.com)
We resell KnowBe4 seats as part of our awareness training service packages. Typically bundle with our phishing simulation service. Silver tier means we get standard discounts (~20% off list). Not the best margin but clients trust the KnowBe4 brand name.
Platform: we have a Fortis admin portal that allows us to manage multiple client accounts under one master account — makes delivery efficient for our team. Chloe handles the KnowBe4 admin day to day.
Notes: KnowBe4 pushing us to move to Gold tier (requires higher volume). Unlikely this financial year. Review at Q3.

Curricula — Authorised Reseller
Smaller platform, story-based content. Good for clients who find KnowBe4 content too US-centric. Used for 2 clients so far. Low volume.

---

NETWORK / FIREWALL

Fortinet — Reseller (registered)
We recommend FortiGate firewalls for SME clients who need a capable UTM/NGFW on a reasonable budget. Registered reseller but low volume — we don't do hardware fulfilment ourselves, we design and specify and pass the order to the client's IT team or a hardware reseller. Used Fortinet in the Aldwick Foods OT segmentation project.

Cisco — no partnership, advisory only
Many clients have legacy Cisco ASA kit. We can work with Cisco environments (CE+ firewall reviews, pen test firewall config analysis) but we don't sell or implement Cisco hardware.

Palo Alto Networks — no partnership
Encountered in larger NHS environments. James is comfortable with PA config review for pen test purposes. Not a recommended platform for our SME clients due to cost.

---

OT / ICS SPECIFIC

Dragos Platform — referral arrangement (informal)
Dragos is the OT security monitoring platform we recommended for Aldwick Foods. No formal partner agreement. Aldwick negotiated direct with Dragos; we provided implementation specification and technical oversight during deployment. Dragos UK team aware of Fortis and have expressed interest in formalising a referral arrangement. Ben to follow up — potential for introducing Dragos to other OT clients if we win more OT work.

Claroty — similar situation
Used Claroty SRA for passive OT network assessment on one engagement. Good tool. No formal arrangement.

Nozomi Networks — evaluated, not used in production
Dan evaluated Nozomi Guardian. Technically strong. May replace/supplement Claroty in future. No deal yet.

---

FORENSICS / IR SUPPORT

Arcanum Forensics (Leeds) — Subcontract partner
Our go-to for forensic lab work that requires physical equipment we don't have (write blockers, forensic workstations, hard copy analysis). NDA in place. Day rate: £750+VAT for lab analyst, £1,100 for senior examiner. Used on 4 engagements. Reliable. Good chain of custody process.
Contact: Mark Stringer, Director (mark@arcanum-forensics.co.uk)

Kroll — no arrangement, but awareness
For very large IR cases that exceed our capacity we've referred once to Kroll. They're much more expensive but have the headcount for major incidents. Not a formal referral arrangement.

---

PENETRATION TESTING TOOLS (internal use)

Burp Suite Professional — 5 licences (PortSwigger). Annual renewal. Used by all pen testers for web app work.
Cobalt Strike — 1 licence (Fortra). Used for authorised red team engagements only. Licence on restricted machine. Usage logged per engagement. NEVER installed on client systems.
Metasploit Pro — 1 licence. Used for exploit validation in controlled conditions.
BloodHound Enterprise — evaluation. We use the community edition currently. Enterprise evaluation ongoing.
Nmap, Nikto, OWASP ZAP — open source, no licensing concern.
theHarvester, Maltego Community — OSINT. Maltego community has API rate limits. May upgrade to commercial if volume increases.

---

CLOUD / MSSP PARTNERSHIPS

No formal MSSP status. We are not a managed service provider in the traditional sense. We do not manage infrastructure. We partner with MSPs who refer clients to us for security layer (CE+, pen test) — key MSP partners:

DataVision IT (Leeds MSP) — referral partner. They do the IT management, we do the security testing and compliance work. Reciprocal referrals. Loose arrangement, no formal agreement. Contact: Pete Hallam (pete@datavision-it.co.uk).

Cloudsense Tech (Manchester) — similar arrangement. 2 referrals received FY23. 1 converted.

Nexum IT (Sheffield) — newer relationship. Met at an event. 1 referral so far.

---

INSURANCE BROKERS

Gallagher — our broker for PI, PL, EL, Cyber policies. Contact: Rachel Osei at Gallagher Leeds. Annual renewal April. Note: Cyber Liability policy requires notification within 72hrs of a significant incident affecting our own systems (not client incidents, those are client's own insurance matter). Check policy wording — Ben has a copy.

---

LEGAL

Thornton & Wade LLP (Leeds) — our solicitors for commercial contracts. Used for reviewing client MSAs and non-standard RoE documents. Contact: David Thornton (partner). Engaged on ad hoc basis, not retainer. Approx £350/hr.

---

NOTES / TO DO

- Formalise Dragos referral arrangement — Ben action
- Evaluate BloodHound Enterprise vs community for AD assessment work — Dan action Q2
- Consider CrowdStrike partner status if we win more larger clients — revisit at Q3 board
- KnowBe4 Gold tier review — September 2024
