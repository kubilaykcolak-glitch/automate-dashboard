import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";

export default async function RootPage() {
  const session = await getSessionUser();
  redirect(session ? "/dashboard" : "/login");
}
