import { HistoryList } from "@/components/HistoryList";

export default function HistoryPage() {
  return (
    <div>
      <div className="page-head">
        <div className="title-block">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            History
          </div>
          <h1>
            Past <em>queries</em>
          </h1>
          <p className="subtitle">
            Past questions you&apos;ve asked your evidence library. Click any
            row to see the full answer.
          </p>
        </div>
      </div>
      <HistoryList />
    </div>
  );
}
