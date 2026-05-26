import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your Automate workspace.",
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
