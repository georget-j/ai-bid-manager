import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Grant sources now live alongside the tender feeds in the admin Sources
 * panel. Keep this URL (and the sidebar link) working via a redirect; the
 * operator gate in layout.tsx still applies before this runs.
 */
export default function GrantSourcesPage() {
  redirect("/sources#grant-sources");
}
