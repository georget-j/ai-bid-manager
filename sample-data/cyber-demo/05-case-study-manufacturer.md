# Case Study: OT/IT Network Segmentation — Yorkshire Food Manufacturer

## Client Overview

**Organisation:** Mid-scale food and beverage manufacturer (anonymised as "Aldwick Foods")
**Sector:** Manufacturing — food production (ambient grocery)
**Size:** 340 staff; 2 production sites (Wakefield and Doncaster); annual turnover ~£45m
**Engagement type:** OT/IT penetration test + network segmentation design + vCISO retainer
**Contract value:** £62,000 (initial engagement) + ongoing £18,000/year vCISO
**Duration:** September 2022 – ongoing
**Outcome:** Flat OT/IT network segmented; production systems isolated; vCISO engagement ongoing

---

## Background

Aldwick Foods came to Fortis following a near-miss incident: a phishing email opened by an accounts payable team member had allowed malware to reach a production SCADA workstation on the same flat network. The malware was identified by anti-virus software and quarantined, but the production director had been sufficiently alarmed that they commissioned an external review.

A further driver was the firm's largest retail customer (a major UK supermarket) requiring evidence of OT security controls as a condition of supply chain audit renewal scheduled for Q1 2023.

---

## Scope of Initial Engagement

The initial engagement was structured in three phases:

1. OT/IT penetration test (6 weeks)
2. Network segmentation design and implementation support (8 weeks)
3. vCISO retainer commencement (ongoing)

---

## Phase 1: OT/IT Penetration Test

### Methodology

Fortis assigned two testers — a CREST Certified Infrastructure Tester and a specialist OT security consultant (previously lead OT security engineer at a national utilities company). Testing followed IEC 62443-3-3 system security requirements as a framework reference, with PTES as the general penetration testing standard.

Testing was conducted during scheduled production downtime windows (Saturday nights) to avoid any impact to live production.

### Architecture Reviewed

Both production sites ran a flat network topology: corporate IT endpoints, SCADA workstations (Ignition platform), PLCs (Siemens S7-300 series), and production line HMIs all resided on the same /20 subnet with no internal segmentation. Internet access from production workstations was unrestricted.

### Key Findings

| Finding                                     | Severity      | Description                                                                                     |
| ------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| Flat network — no Purdue model segmentation | Critical      | SCADA workstations reachable from corporate endpoints with no firewall between them             |
| Siemens S7 PLCs exposed on LAN              | Critical      | PLCs accessible via S7comm protocol from any network host; no authentication required           |
| SCADA workstations running Windows 7        | High          | End-of-life OS with no security updates since 2020; cannot be patched without vendor validation |
| Remote desktop (RDP) open to internet       | High          | Vendor remote access via RDP directly exposed; no MFA, no VPN                                   |
| Default credentials on HMIs                 | High          | 4 of 7 HMIs retained factory-default passwords                                                  |
| No OT-specific monitoring                   | Medium        | No network monitoring solution with OT protocol awareness                                       |
| USB ports unrestricted on production hosts  | Medium        | Physical media could introduce malware to OT segment                                            |
| No network diagram                          | Informational | No accurate current-state documentation of OT network                                           |

### Exploitation Demonstrated

With client permission and during a controlled window, the test team demonstrated:

- Lateral movement from a simulated compromised corporate laptop to the SCADA server in under 20 minutes
- Read access to live process historian data from the corporate network
- Ability to enumerate PLC rack configuration (not exploited further given production risk)

---

## Phase 2: Network Segmentation Design and Implementation

### Design Approach

Fortis proposed a 4-zone architecture aligned to the Purdue Reference Model:

| Zone                    | Contents                                           | Firewall Policy                                                          |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Zone 0–1 (Field)        | PLCs, sensors, actuators                           | Isolated; no external connectivity                                       |
| Zone 2 (Control)        | SCADA, HMIs, historians                            | Allow only OT-specific protocols inbound from Zone 3; block all internet |
| Zone 3 (Operations/DMZ) | Engineering workstations, patch servers, jump host | Controlled access to Zone 2; allowed to corporate via DMZ only           |
| Zone 4 (Corporate IT)   | All standard IT endpoints, servers, Microsoft 365  | No direct access to Zones 0–2                                            |

### Implementation

Fortis acted in a design and assurance role; the client's IT contractor (a regional MSP) executed the physical implementation under Fortis supervision.

Key implementation steps:

- Deployment of two Fortinet FortiGate 200F firewalls (one per site) to enforce zone boundaries
- Jump host server provisioned in Zone 3; all vendor remote access routed via VPN to jump host only
- Default credentials changed on all HMIs
- USB boot disabled and ports blocked on SCADA workstations via BIOS and Group Policy where supported
- Dragos Platform deployed for OT network monitoring (Aldwick negotiated direct with Dragos; Fortis provided implementation specification)
- Windows 7 SCADA workstations isolated within Zone 2 with a documented compensating controls register accepted by the production director and supply chain auditor

### Vendor Remote Access

The previous RDP-to-internet arrangement was replaced with a dedicated Fortinet SSL-VPN with MFA, restricted to vendor IP addresses (allowlisted), with session recording via a privileged access management (PAM) solution.

---

## Phase 3: vCISO Retainer (Ongoing)

Fortis provides 3 days per month of virtual CISO services to Aldwick Foods. Activities include:

- Monthly risk register review with the Production Director and IT Manager
- Supplier assurance questionnaires (particularly for OT vendors)
- Security policy maintenance (ICS security policy, removable media policy, remote access policy)
- Liaison with the supply chain auditor (pre-audit documentation preparation)
- Incident readiness — tabletop exercises twice per year

---

## Outcomes

| Metric                       | Result                              |
| ---------------------------- | ----------------------------------- |
| Network zones implemented    | 4 (Purdue model)                    |
| Critical findings resolved   | 2 of 2 (flat network; PLC exposure) |
| Vendor remote access secured | Yes (VPN + MFA + PAM)               |
| Supply chain audit passed    | Yes (Q1 2023)                       |
| OT monitoring deployed       | Yes (Dragos)                        |
| vCISO engagement             | Active — ongoing since October 2022 |

---

## Key Lessons

- Food manufacturers are increasingly targeted by ransomware actors who understand the time-pressure of production downtime. Flat OT/IT networks are the primary enabler.
- Windows 7 SCADA workstations cannot be patched but can be isolated. Compensating controls (network isolation, application whitelisting, monitoring) are accepted by most supply chain auditors if documented and risk-accepted at board level.
- Supply chain audit requirements from large retail customers are now a practical forcing function for OT security investment in the food sector — more effective than any regulatory requirement.
