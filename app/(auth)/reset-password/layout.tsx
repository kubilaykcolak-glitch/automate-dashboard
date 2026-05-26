import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Reset the password for your Automate account.",
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
