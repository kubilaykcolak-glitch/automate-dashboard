import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import {
  DashboardShell,
  type DashboardShellUser,
} from "@/components/dashboard-shell";
import type { UserProfile } from "@/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }

  const userSnap = await adminDb.collection("users").doc(session.uid).get();
  const profile = userSnap.exists ? (userSnap.data() as Partial<UserProfile>) : null;

  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_BYPASS_SUBSCRIPTION === "true";

  if (!devBypass && (!profile || profile.subscriptionStatus !== "active")) {
    redirect("/pricing");
  }

  const subscriptionStatus = profile?.subscriptionStatus ?? "none";
  const user: DashboardShellUser = {
    fullName: profile?.fullName ?? session.name ?? "",
    email: profile?.email ?? session.email ?? "",
    avatarUrl: profile?.avatarUrl ?? (session.picture as string | undefined) ?? "",
    plan: subscriptionStatus === "active" ? "Pro" : "Inactive",
  };

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
