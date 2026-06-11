"use client";

import { useState, useRef, useEffect } from "react";

interface DocumentUploadProps {
  onSuccess?: (result: { title: string; chunk_count: number }) => void;
  defaultClientId?: string;
  /** Smaller dropzone, no client selector — always uploads to the shared library. */
  compact?: boolean;
}

interface Client {
  id: string;
  name: string;
}

const ACCEPT = ".txt,.md,.pdf,.docx,.csv,.xlsx,.html,.htm,.json";

// ── pure helpers (exported for tests) ──────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // keep in sync with the upload API

export const ACCEPTED_EXTENSIONS = ACCEPT.split(",");

const FRIENDLY_TYPE_LIST =
  "PDF, Word (.docx), Excel (.xlsx), CSV, plain text, Markdown, HTML or JSON";

/** "7.3 MB" / "412 KB" — for friendly size errors. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1).replace(/\.0$/, "")} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Pre-flight check before a file is sent to the server.
 * Returns a friendly, plain-English problem description, or null if the file is fine.
 */
export function validateUploadFile(
  name: string,
  sizeBytes: number,
): string | null {
  const dot = name.lastIndexOf(".");
  const ext = dot === -1 ? "" : name.slice(dot).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `We can't read this type of file — please use ${FRIENDLY_TYPE_LIST}.`;
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return `This file is ${formatFileSize(sizeBytes)} — the limit is 5 MB per file. Try saving a smaller copy or splitting it in two.`;
  }
  return null;
}

// ── per-file upload tracking ───────────────────────────────────────────────────

type ItemStatus = "queued" | "processing" | "done" | "failed" | "duplicate";

interface UploadItem {
  id: number;
  file: File;
  status: ItemStatus;
  message: string;
  /** Set when the server reports a same-named document already in the library. */
  existingId?: string;
}

const STATUS_BADGE: Record<ItemStatus, { label: string; className: string }> = {
  queued: { label: "Waiting", className: "bg-gray-100 text-gray-600" },
  processing: { label: "Processing…", className: "bg-blue-50 text-blue-700" },
  done: { label: "Added", className: "bg-green-50 text-green-700" },
  failed: { label: "Couldn't add", className: "bg-red-50 text-red-700" },
  duplicate: {
    label: "Already in your library",
    className: "bg-amber-50 text-amber-700",
  },
};

const FORMAT_CHIPS = [
  { label: "TXT", className: "bg-gray-100 text-gray-600" },
  { label: "MD", className: "bg-gray-100 text-gray-600" },
  { label: "PDF", className: "bg-blue-50 text-blue-600" },
  { label: "DOCX", className: "bg-blue-50 text-blue-600" },
  { label: "CSV", className: "bg-green-50 text-green-700" },
  { label: "XLSX", className: "bg-green-50 text-green-700" },
  { label: "HTML", className: "bg-purple-50 text-purple-700" },
  { label: "JSON", className: "bg-purple-50 text-purple-700" },
];

export function DocumentUpload({
  onSuccess,
  defaultClientId,
  compact = false,
}: DocumentUploadProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(
    defaultClientId ?? "",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    if (compact) return; // compact uploads always go to the shared library
    fetch("/api/clients?status=active")
      .then((r) => r.json())
      .then((data: unknown) =>
        setClients(Array.isArray(data) ? (data as Client[]) : []),
      )
      .catch(() => {});
  }, [compact]);

  function patch(id: number, changes: Partial<UploadItem>) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...changes } : i)),
    );
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function clearSettled() {
    setItems((prev) =>
      prev.filter((i) => i.status === "queued" || i.status === "processing"),
    );
  }

  async function uploadItem(item: UploadItem) {
    patch(item.id, { status: "processing", message: "Reading the file…" });

    const form = new FormData();
    form.append("file", item.file);
    if (!compact && selectedClientId) {
      form.append("client_id", selectedClientId);
    }

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        title?: string;
        chunk_count?: number;
        warnings?: string[];
        error?: string;
        duplicate?: boolean;
        existing_id?: string;
        warning?: string;
      };

      if (res.status === 409 && data.duplicate) {
        patch(item.id, {
          status: "duplicate",
          existingId: data.existing_id,
          message:
            data.warning ??
            "A document with this filename is already in your library.",
        });
        return;
      }

      if (!res.ok) {
        patch(item.id, {
          status: "failed",
          message: data.error ?? "Something went wrong — please try again.",
        });
        return;
      }

      patch(item.id, {
        status: "done",
        message: data.warnings?.length
          ? `Added — ready to use in your answers. ${data.warnings.join(" ")}`
          : "Added — ready to use in your answers.",
      });
      onSuccess?.({
        title: data.title ?? item.file.name,
        chunk_count: data.chunk_count ?? 0,
      });
    } catch {
      patch(item.id, {
        status: "failed",
        message: "Network problem — check your connection and try again.",
      });
    }
  }

  /** Delete the same-named document already in the library, then upload this file. */
  async function replaceExisting(item: UploadItem) {
    if (!item.existingId) return;
    patch(item.id, {
      status: "processing",
      message: "Replacing the existing copy…",
    });
    try {
      const res = await fetch(`/api/documents?id=${item.existingId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        patch(item.id, {
          status: "duplicate",
          message: "We couldn't remove the existing copy — please try again.",
        });
        return;
      }
    } catch {
      patch(item.id, {
        status: "duplicate",
        message: "Network problem — check your connection and try again.",
      });
      return;
    }
    await uploadItem(item);
  }

  function handleFiles(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;

    const newItems: UploadItem[] = list.map((file) => {
      const problem = validateUploadFile(file.name, file.size);
      return {
        id: ++idCounter.current,
        file,
        status: problem ? ("failed" as const) : ("queued" as const),
        message: problem ?? "Waiting…",
      };
    });
    setItems((prev) => [...prev, ...newItems]);

    const queued = newItems.filter((i) => i.status === "queued");
    void (async () => {
      for (const item of queued) {
        await uploadItem(item);
      }
    })();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-3">
      {/* Client selector — only when clients exist, never in compact mode */}
      {!compact && clients.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{ fontSize: 12.5, color: "var(--muted)", flexShrink: 0 }}
            >
              Use for:
            </span>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              style={{
                fontSize: 12.5,
                padding: "4px 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                background: "var(--surface-2)",
                color: "var(--ink)",
              }}
            >
              <option value="">Every answer (shared library)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} only
                </option>
              ))}
            </select>
          </div>
          <p
            style={{ fontSize: 11.5, color: "var(--muted)", margin: "4px 0 0" }}
          >
            Pick a client to use these files only when answering for them —
            leave as shared and they help with every answer.
          </p>
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg ${compact ? "p-5" : "p-8"} text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-gray-400 bg-gray-50"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-sm text-gray-600">
          Drop files here or click to browse — several at once is fine
        </p>
        {compact ? (
          <p className="text-xs text-gray-400 mt-2">
            PDF, Word, Excel, CSV or text · up to 5 MB each
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 justify-center mt-3">
              {FORMAT_CHIPS.map((chip) => (
                <span
                  key={chip.label}
                  className={`px-2 py-0.5 rounded text-xs font-medium ${chip.className}`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">up to 5 MB each</p>
          </>
        )}
      </div>

      {/* Per-file status list */}
      {items.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-500">
              Your uploads
            </span>
            {items.every(
              (i) => i.status !== "queued" && i.status !== "processing",
            ) && (
              <button
                onClick={clearSettled}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Clear list
              </button>
            )}
          </div>
          <ul
            className="space-y-1.5"
            style={{ listStyle: "none", margin: 0, padding: 0 }}
          >
            {items.map((item) => {
              const badge = STATUS_BADGE[item.status];
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-800 truncate">
                      {item.file.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{item.message}</p>
                  {item.status === "duplicate" && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void replaceExisting(item)}
                          className="px-2.5 py-1 rounded bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 transition-colors"
                        >
                          Replace existing
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="px-2.5 py-1 rounded text-xs text-gray-500 hover:text-gray-800"
                        >
                          Skip this file
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">
                        Want to keep both versions? Rename the file on your
                        computer first, then upload it again.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
