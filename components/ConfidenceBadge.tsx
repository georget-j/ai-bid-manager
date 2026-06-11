import { cn } from "@/lib/utils";
import { confidenceLabel } from "@/lib/copy";
import type { Confidence } from "@/lib/schema";

const STYLES = {
  high: "bg-green-50 text-green-700 border-green-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-red-50 text-red-700 border-red-200",
};

interface ConfidenceBadgeProps {
  confidence: Confidence;
  showReason?: boolean;
}

export function ConfidenceBadge({
  confidence,
  showReason = false,
}: ConfidenceBadgeProps) {
  return (
    <div>
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium",
          STYLES[confidence.level],
        )}
      >
        {confidenceLabel(confidence.level)}
      </span>
      {showReason && confidence.reason && (
        <p className="mt-1.5 text-xs text-gray-500">{confidence.reason}</p>
      )}
    </div>
  );
}
