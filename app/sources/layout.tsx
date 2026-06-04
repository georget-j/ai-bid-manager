import { redirect } from "next/navigation";
import { getIsAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function SourcesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = await getIsAdmin();
  if (!isAdmin) {
    redirect("/");
  }
  return <>{children}</>;
}
