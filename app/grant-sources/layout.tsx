import { redirect } from "next/navigation";
import { getIsOperator } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function GrantSourcesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isOperator = await getIsOperator();
  if (!isOperator) {
    redirect("/");
  }
  return <>{children}</>;
}
