import { redirect } from "next/navigation";
import { getIsAdmin } from "@/lib/admin-auth";

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
