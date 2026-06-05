import * as fs from "fs";
import * as path from "path";
import { ingestDocument } from "./documents";
import { getServiceSupabase } from "./supabase";
import type { SeedResult } from "./schema";

const CYBER_DEMO_DIR = path.join(process.cwd(), "sample-data", "cyber-demo");

type DemoDoc = { fileName: string; title: string };

export const CYBER_DEMO_DOCUMENTS: DemoDoc[] = [
  {
    fileName: "01-company-overview.md",
    title: "Fortis Cyber Solutions — Company Overview",
  },
  {
    fileName: "02-capability-statement.md",
    title: "Fortis Cyber Solutions — Capability Statement",
  },
  {
    fileName: "03-case-study-nhs-trust.md",
    title: "Case Study: Cyber Essentials Plus — NHS Community Trust",
  },
  {
    fileName: "04-case-study-law-firm.md",
    title: "Case Study: Ransomware Incident Response — Regional Law Firm",
  },
  {
    fileName: "05-case-study-manufacturer.md",
    title: "Case Study: OT/IT Segmentation — Yorkshire Food Manufacturer",
  },
  {
    fileName: "06-certifications-accreditations.md",
    title: "Fortis Cyber Solutions — Certifications and Accreditations",
  },
  {
    fileName: "07-service-catalogue.md",
    title: "Fortis Cyber Solutions — Service Catalogue",
  },
  {
    fileName: "08-team-profiles-dump.md",
    title: "Fortis Staff Profiles (Internal HR Notes)",
  },
  {
    fileName: "09-methodology-notes-internal.md",
    title: "Fortis Delivery Methodology — Internal Reference Notes",
  },
  {
    fileName: "10-client-feedback-raw.md",
    title: "Fortis Client Feedback — Raw Compilation",
  },
  {
    fileName: "11-bid-history-log.md",
    title: "Fortis Bid History Log",
  },
  {
    fileName: "12-ir-playbook-v3.md",
    title: "Incident Response Playbook v3.0",
  },
  {
    fileName: "13-technology-partners.md",
    title: "Fortis Technology Partners and Supplier Relationships",
  },
];

async function docExistsForOrg(title: string, orgId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("documents")
    .select("id")
    .eq("title", title)
    .eq("org_id", orgId)
    .maybeSingle();
  return !!data;
}

export async function seedCyberDemoDocuments(
  orgId: string,
): Promise<SeedResult> {
  const seeded: string[] = [];
  const skipped: string[] = [];

  for (const doc of CYBER_DEMO_DOCUMENTS) {
    const exists = await docExistsForOrg(doc.title, orgId);
    if (exists) {
      skipped.push(doc.title);
      continue;
    }

    const filePath = path.join(CYBER_DEMO_DIR, doc.fileName);
    const text = fs.readFileSync(filePath, "utf-8");

    await ingestDocument({
      text,
      title: doc.title,
      fileName: doc.fileName,
      mimeType: "text/markdown",
      sourceType: "sample",
      collection: "main",
      orgId,
    });

    seeded.push(doc.title);
  }

  return { seeded, skipped };
}
