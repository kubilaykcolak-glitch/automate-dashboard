"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FEATURES = [
  "5,000,000 tokens / month — powers thousands of chats",
  "Full UK accountancy skill library",
  "Quick + Rich chat modes (file generation, web search, multi-step)",
  "Connect Google Drive / Sheets and let the agent read your data",
  "Downloadable CSV / XLSX / PDF reports",
  "Cancel anytime",
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubscribe() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        if (res.status === 401) {
          router.push("/login?next=/pricing");
          return;
        }
        throw new Error(data.error ?? "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Pro</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One simple plan. Subscribe to chat with your agents.
          </p>
        </div>

        <Card className="border-primary/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Pro</CardTitle>
            <CardDescription>For teams and serious builders.</CardDescription>
            <div className="pt-4">
              <span className="text-4xl font-bold tracking-tight">$29</span>
              <span className="ml-1 text-sm text-muted-foreground">/month</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            {error && (
              <div className="w-full rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button
              className="w-full"
              onClick={onSubscribe}
              disabled={loading}
            >
              {loading ? "Redirecting…" : "Subscribe"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
