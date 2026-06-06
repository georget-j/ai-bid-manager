export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  uploadTenderDoc,
  TenderDocError,
  tenderDocErrorResponse,
} from "@/lib/tender-docs";

const MAX_DOC_SIZE = 10 * 1024 * 1024;

interface Params {
  params: Promise<{ id: string }>;
}

// Accepts a manually-uploaded tender document (multipart "file"), stores it in
// the central tender document store, and links it to the opportunity. The file's
// requirements/questions are then picked up by POST /extract-all.
export async function POST(request: NextRequest, { params }: Params) {
  const limited = await checkRateLimit(request, "upload");
  if (limited) return limited;

  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: opportunityId } = await params;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_DOC_SIZE) {
    return NextResponse.json(
      { error: "Document too large (max 10 MB)" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || "document";
  const contentType = file.type || "application/octet-stream";

  try {
    const doc = await uploadTenderDoc(
      buffer,
      fileName,
      contentType,
      opportunityId,
      fileName,
    );
    return NextResponse.json({
      tenderDocumentId: doc.tenderDocumentId,
      fromCache: doc.fromCache,
    });
  } catch (err) {
    if (err instanceof TenderDocError) {
      const { body, status } = tenderDocErrorResponse(err);
      return NextResponse.json(body, { status });
    }
    throw err;
  }
}
