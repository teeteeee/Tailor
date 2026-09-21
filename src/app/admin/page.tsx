import { notFound, redirect } from "next/navigation";
import { Admin } from "@/components/Admin";
import { AppShell } from "@/components/AppShell";
import { isAdminEmail } from "@/lib/admin";
import { databaseConfigured } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!databaseConfigured()) redirect("/");

  const user = await currentUser();
  if (!user) redirect("/login");
  // Not 403: an ordinary account has no need to learn that this page exists.
  if (!isAdminEmail(user.email)) notFound();

  return (
    <AppShell>
      <Admin />
    </AppShell>
  );
}
