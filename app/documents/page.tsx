"use client";

import { useState } from "react";
import { DocumentList } from "@/components/DocumentList";
import { DocumentUpload } from "@/components/DocumentUpload";

export default function DocumentsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleNewDoc() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <div className="page-head">
        <div className="title-block">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Knowledge Base
          </div>
          <h1>
            Indexed <em>documents</em>
          </h1>
          <p className="subtitle">
            Manage your knowledge base. Documents are chunked and embedded for
            semantic search.
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 36 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Upload a document
        </div>
        <DocumentUpload onSuccess={handleNewDoc} />
      </div>

      <div className="section-title">Indexed documents</div>
      <DocumentList refreshKey={refreshKey} />
    </div>
  );
}
