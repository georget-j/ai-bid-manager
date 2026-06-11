import { ReviewQueue } from "@/components/ReviewQueue";

export default function ReviewPage() {
  return (
    <div>
      <div className="page-head">
        <div className="title-block">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Review Queue
          </div>
          <h1>
            Human <em>review</em>
          </h1>
          <p className="subtitle">
            Answers the AI wasn&apos;t sure about land here for someone on your
            team to approve.
          </p>
        </div>
      </div>
      <ReviewQueue />
    </div>
  );
}
