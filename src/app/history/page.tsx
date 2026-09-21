import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { History } from "@/components/History";
import { databaseConfigured } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  if (!databaseConfigured()) redirect("/");
  if (!(await currentUser())) redirect("/login");
  return (
    <AppShell>
      <History />
    </AppShell>
  );
}
