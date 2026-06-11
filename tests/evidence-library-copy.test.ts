/**
 * Evidence-library copy helpers — pure functions, no network or DOM.
 *
 * - validateUploadFile / formatFileSize (components/DocumentUpload): friendly
 *   pre-flight errors for unsupported types and oversized files.
 * - readinessLabel / sectionsIndexedLabel / sourceTypeLabel
 *   (components/DocumentList): plain-English row copy — chunk/token vocabulary
 *   and raw source_type enums must never reach users.
 */
import { describe, it, expect } from "vitest";
import {
  validateUploadFile,
  formatFileSize,
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
} from "@/components/DocumentUpload";
import {
  readinessLabel,
  sectionsIndexedLabel,
  sourceTypeLabel,
} from "@/components/DocumentList";

describe("validateUploadFile", () => {
  it("accepts every advertised extension", () => {
    for (const ext of ACCEPTED_EXTENSIONS) {
      expect(validateUploadFile(`evidence${ext}`, 1024)).toBeNull();
    }
  });

  it("accepts extensions regardless of case", () => {
    expect(validateUploadFile("Capability Statement.PDF", 1024)).toBeNull();
    expect(validateUploadFile("Case-Study.Docx", 1024)).toBeNull();
  });

  it("accepts a file exactly at the 5 MB limit", () => {
    expect(validateUploadFile("big.pdf", MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("rejects unsupported types with a friendly message", () => {
    const msg = validateUploadFile("setup.exe", 1024);
    expect(msg).toMatch(/can't read this type of file/i);
    expect(msg).toMatch(/PDF/);
  });

  it("rejects files without any extension", () => {
    expect(validateUploadFile("README", 1024)).toMatch(
      /can't read this type of file/i,
    );
  });

  it("rejects oversized files and names the limit and actual size", () => {
    const msg = validateUploadFile("huge.pdf", 7.5 * 1024 * 1024);
    expect(msg).toMatch(/7\.5 MB/);
    expect(msg).toMatch(/5 MB/);
  });

  it("never uses engineering vocabulary in its messages", () => {
    const messages = [
      validateUploadFile("setup.exe", 1024),
      validateUploadFile("huge.pdf", 10 * 1024 * 1024),
    ];
    for (const msg of messages) {
      expect(msg).not.toMatch(/chunk|token|embed|index|mime/i);
    }
  });
});

describe("formatFileSize", () => {
  it("formats megabytes with one decimal, dropping trailing .0", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatFileSize(7.5 * 1024 * 1024)).toBe("7.5 MB");
  });

  it("formats small files in kilobytes, never showing 0 KB", () => {
    expect(formatFileSize(512 * 1024)).toBe("512 KB");
    expect(formatFileSize(10)).toBe("1 KB");
  });
});

describe("readinessLabel", () => {
  it("says ready when the document has indexed content", () => {
    expect(readinessLabel(1)).toBe("Ready to use");
    expect(readinessLabel(42)).toBe("Ready to use");
  });

  it("flags documents with no readable text instead of showing a zero count", () => {
    expect(readinessLabel(0)).toBe("No readable text");
  });
});

describe("sectionsIndexedLabel", () => {
  it("uses the singular for exactly one section", () => {
    expect(sectionsIndexedLabel(1)).toBe("1 section indexed");
  });

  it("uses the plural otherwise", () => {
    expect(sectionsIndexedLabel(0)).toBe("0 sections indexed");
    expect(sectionsIndexedLabel(12)).toBe("12 sections indexed");
  });
});

describe("sourceTypeLabel", () => {
  it("maps every known source_type to plain English", () => {
    expect(sourceTypeLabel("upload")).toBe("Uploaded");
    expect(sourceTypeLabel("sample")).toBe("Sample");
    expect(sourceTypeLabel("procurement")).toBe("Tender");
  });

  it("falls back to a human label so a raw enum never leaks", () => {
    expect(sourceTypeLabel("some_new_enum")).toBe("Uploaded");
  });
});
