import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple monthly pricing for the Automate workspace.",
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
