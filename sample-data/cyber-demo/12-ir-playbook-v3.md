# Incident Response Playbook v3.0

Fortis Cyber Solutions Ltd — Internal Use Only
Owner: Ravi Subramaniam (IR Lead)
Reviewed: September 2023
Next review: September 2024
Classification: CONFIDENTIAL — not to be shared with clients in full; executive summary version available (IR-Playbook-ExecSummary-v2)

---

## Phase 1: Detection and Initial Triage

### 1.1 Activation Triggers

IR engagement begins when any of the following occur:

- Client contacts on-call number reporting suspected incident
- Fortis SOC (for retainer clients with monitoring) detects anomalous activity and escalates
- Third party (insurer, legal, law enforcement) contacts Fortis on behalf of a client
- Client contacts via email/portal (lower priority — triage within 2 business hours)

On-call rota is maintained in Google Calendar (Fortis IR On-Call). Primary on-call: Ravi Subramaniam. Secondary: James Renwick. Tertiary: Dan Okafor.

### 1.2 Initial Call Protocol (< 15 minutes from contact)

On first contact, on-call analyst must establish:

1. Organisation name and contact name/role
2. Retained or non-retained? (Check CRM if uncertain — search by company name)
3. Nature of incident (ransomware / BEC / malware / data breach / availability / unknown)
4. Current status: are systems still affected? Is the threat actor still present?
5. What actions, if any, has the client already taken? (Rebooting systems, deleting files, paying ransom — all critical to know immediately)
6. Number of systems/users affected (estimate)
7. Is law enforcement aware or involved?
8. Does the client have cyber insurance? (If yes, insurer must often be notified before any third-party engagement commences — ask for insurer details)

Record all information in the IR Log (SharePoint > IR Engagements > [YYYY-MM] > [ClientName] > IR-Log.xlsx). Time-stamp every entry.

### 1.3 Severity Classification

| Severity      | Criteria                                                                                                             | Response SLA                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P1 — Critical | Active ransomware encryption; confirmed data exfiltration in progress; operational systems down; >100 users affected | On-site/remote within 2 hours (retained); 4 hours (non-retained)          |
| P2 — High     | Suspected breach, systems degraded; malware confirmed but not spreading; BEC detected and account isolated           | Initial remote triage within 4 hours; on-site if required within 24 hours |
| P3 — Medium   | Suspicious activity not yet confirmed; isolated device suspected compromised; phishing email opened                  | Remote triage within 8 hours                                              |
| P4 — Low      | Security query, possible false alarm, policy question                                                                | Next business day                                                         |

---

## Phase 2: Evidence Preservation

### 2.1 Golden Rule

**Do not remediate before preserving evidence.** Clients will often want to wipe systems immediately. Resist this pressure. Explain that evidence is needed to understand the full scope, confirm whether data was exfiltrated, identify patient zero, and support any legal or regulatory process.

### 2.2 Forensic Image Acquisition

Where possible, acquire forensic images of:

- All affected servers (priority: file servers, domain controllers, mail servers)
- Patient zero endpoint
- Any systems that may have been used as lateral movement stepping stones

Tools:

- FTK Imager (preferred for Windows endpoints and servers) — creates .E01 or .AD1 image
- dd with ewfacquire for Linux systems
- For cloud: snapshot the VM before any changes

```
# Standard FTK Imager CLI acquisition (run from forensic workstation):
ftkimager.exe \\[TARGET_IP]\C$ [OUTPUT_PATH]\[HOSTNAME]-C.E01 --e01 --verify

# Verify hash after acquisition:
ftkimager.exe [IMAGE_FILE] --verify
```

All images must be accompanied by:

- SHA-256 hash of the image file
- Acquisition log (FTK Imager produces this automatically)
- Chain of custody form (template: SharePoint > IR > CoC-Template.docx)

Store images on the Fortis encrypted IR drive (VeraCrypt volume) or, for large volumes, on the client's own NAS in an isolated location agreed with them.

### 2.3 Memory Acquisition

For live systems where a threat actor may still be resident:

```
# WinPmem for Windows memory acquisition:
winpmem_mini_x64_rc2.exe [OUTPUT_PATH]\[HOSTNAME]-memory.raw

# LiME for Linux (requires kernel module compilation — have pre-compiled modules for common kernels):
sudo insmod lime-[kernel-version].ko "path=/mnt/usb/memory.lime format=lime"
```

Memory should be captured before any shutdown or reboot. If the client has already rebooted, document this in the IR log — memory evidence is lost.

### 2.4 Log Preservation

Immediately pull the following logs before any systems are touched:

- Windows Event Logs: Security (4624, 4625, 4648, 4720, 4768, 4776), System, Application
- Firewall logs (all available — request from network team or ISP if not held centrally)
- VPN authentication logs
- DNS query logs (if available)
- Email gateway logs (especially for BEC and phishing)
- EDR telemetry (if client has EDR — retrieve from console)
- Active Directory replication logs and NTDS.dit (for credential theft assessment)

```powershell
# Export Windows event logs (run on affected system or via remote PS):
wevtutil epl Security C:\temp\Security.evtx
wevtutil epl System C:\temp\System.evtx
wevtutil epl Application C:\temp\Application.evtx

# Export AD user account changes (last 30 days):
Get-ADUser -Filter * -Properties LastLogonDate, WhenChanged, PasswordLastSet |
  Where-Object {$_.WhenChanged -gt (Get-Date).AddDays(-30)} |
  Export-Csv C:\temp\ad-users-changed.csv
```

---

## Phase 3: Containment

### 3.1 Network Isolation

For active ransomware: isolate affected network segments immediately. Do not shut down systems if avoidance of encryption is the goal (ransomware often triggers a "kill switch" on shutdown on some variants). Instead, isolate at the network level:

- Block affected VLANs at the core switch
- Take affected VPN tunnels down
- Block outbound traffic from affected subnets at the perimeter firewall
- Notify the IT team of each step and document in IR log

### 3.2 Account Lockdown

- Reset all potentially compromised accounts (start with admin/privileged accounts)
- Revoke all active sessions in Azure AD / Entra ID:

```powershell
# Revoke all sessions for a user (Azure AD):
Revoke-AzureADUserAllRefreshToken -ObjectId [USER_OBJECT_ID]

# Reset password and force re-authentication:
Set-AzureADUserPassword -ObjectId [USER_OBJECT_ID] -Password [SECURE_STRING]
```

- Disable service accounts that are not essential
- Rotate all API keys and secrets (check Azure Key Vault, GitHub secrets, .env files)
- For on-premise AD: force Kerberos ticket expiry by resetting KRBTGT account password twice (with 10-hour gap to allow ticket expiry):

```
# Reset KRBTGT twice (important: twice, 10 hours apart):
Set-ADAccountPassword -Identity krbtgt -Reset -NewPassword (ConvertTo-SecureString -AsPlainText "[NEW_PASS]" -Force)
```

### 3.3 Malware/Backdoor Identification

Use EDR telemetry or manual analysis to identify all persistence mechanisms:

- Run keys (HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run etc.)
- Scheduled tasks (look for encoded PowerShell or unusual paths)
- Services (look for services with random-looking names or pointing to temp directories)
- WMI subscriptions
- DLL sideloading in legitimate application directories

```powershell
# List all scheduled tasks with actions:
Get-ScheduledTask | Select TaskName, TaskPath, @{N='Action';E={$_.Actions.Execute}} |
  Where-Object {$_.Action -ne $null} | Export-Csv C:\temp\scheduled-tasks.csv

# Check startup items:
Get-CimInstance Win32_StartupCommand | Select Name, Command, Location |
  Export-Csv C:\temp\startup-items.csv
```

---

## Phase 4: Eradication

All identified malware, backdoors, and attacker tools must be removed before recovery begins. Eradication order:

1. Remove persistence mechanisms identified in Phase 3
2. Delete attacker tooling from disk
3. Patch the initial access vulnerability (if known)
4. Rebuild any systems where full eradication cannot be confirmed (prefer rebuild over clean for critical systems — it is faster and more certain)

For ransomware: do NOT attempt to decrypt files until the threat actor has been fully eradicated. Decryption while the actor is still present may lead to re-encryption.

---

## Phase 5: Recovery

### 5.1 Backup Assessment

Before recovery:

- Verify backup integrity (test restore on an isolated system)
- Confirm backup predates the compromise (use the earliest known compromise date from log analysis)
- Confirm backup storage was not accessible from the compromised environment (if it was, assume backups are also compromised until verified)

### 5.2 Recovery Sequence

Restore in order:

1. Core infrastructure (AD, DNS, DHCP)
2. File servers (most critical data first, as agreed with client)
3. Application servers
4. End user workstations (redeploy from image if possible)

Document all systems restored, restore point used, and time of completion.

### 5.3 Monitoring During Recovery

Deploy enhanced logging during the recovery period (minimum 14 days post-eradication):

- Enable verbose audit logging on AD
- Increase firewall logging verbosity
- If EDR not already present, deploy as part of recovery
- Daily review of alerts for at least 7 days

---

## Phase 6: Regulatory and Legal Notification

### 6.1 UK GDPR (ICO)

If personal data was or may have been involved:

- The 72-hour notification clock to the ICO starts when the organisation became "aware" of a breach — advise clients that this is typically when they first called us, not when they confirm data was stolen
- Notification via ICO self-reporting portal: ico.org.uk/make-a-report
- Content required: nature of breach, categories and approximate number of data subjects, likely consequences, measures taken/proposed
- Fortis does not file the notification on behalf of clients (we are not the controller) but we prepare the notification report for the DPO/legal team to submit

### 6.2 Sector-Specific Notifications

| Sector             | Regulator                             | Notes                                                         |
| ------------------ | ------------------------------------- | ------------------------------------------------------------- |
| Legal              | Solicitors Regulation Authority (SRA) | Within 1 business day of becoming aware of a cyber incident   |
| Financial services | FCA                                   | Significant cyber incidents via FCA Connect portal            |
| NHS                | NHS England DSPT / NCSC               | Critical incidents via NHS SIRT; also DSPT incident reporting |
| Charity            | Charity Commission                    | If assets at risk or charity reputation at significant risk   |

### 6.3 Law Enforcement

- NCSC Cyber Incident Reporting: report.ncsc.gov.uk (voluntary but encouraged)
- Action Fraud: actionfraud.police.uk (for fraud-related incidents including BEC)
- Regional Cyber Crime Unit: where criminal activity suspected — Fortis can advise on contact but client must make the report directly

---

## Phase 7: Post-Incident Review

Conduct 4–6 weeks after resolution. Structured as a no-blame review covering:

- Timeline reconstruction (what happened, when)
- Root cause analysis
- Detection gaps (why wasn't this caught earlier?)
- Containment and recovery — what worked, what didn't
- Recommendations (technical controls, process, training)
- Action plan with owners and dates

Deliverable: Post-Incident Review Report (template: SharePoint > IR > PIR-Template.docx)

---

## Phase 8: Engagement Close

- All forensic images and working papers transferred to Fortis secure archive (retained 7 years per our data retention policy)
- IR log finalised and signed off by Ravi
- Client satisfaction survey sent (7 days after PIR delivery)
- Lessons learned fed back into this playbook (quarterly update cycle)
- Account record updated in HubSpot with IR engagement details

---

## Appendix: Common Ransomware Variants — Quick Reference

| Variant          | Extension                              | Notes                                                 | Decryptor available? |
| ---------------- | -------------------------------------- | ----------------------------------------------------- | -------------------- |
| LockBit 3.0      | Variable                               | Exfil before encrypt; double extortion                | No (as at Sept 2023) |
| BlackCat / ALPHV | Variable                               | Rust-based; cross-platform; negotiation portal        | No                   |
| BlackBasta       | .basta                                 | Fast encryption; often uses Qakbot for initial access | No                   |
| Dharma/Crysis    | .id-[victim].[email].dharma            | Older variant; still active; brute-forced RDP usually | Partial (older keys) |
| Phobos           | .id[victim-id].[attacker-email].phobos | Often via RDP; lower sophistication; frequent builder | No                   |
| Cl0p             | .clop                                  | MOVEit/GoAnywhere exploitation; large orgs            | No                   |

If variant cannot be identified from extension and ransom note: submit sample file to id-ransomware.malwarehunterteam.com for identification.
