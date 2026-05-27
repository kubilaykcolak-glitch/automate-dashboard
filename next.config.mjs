/**
 * Standard browser hardening headers. Sent on every response.
 *
 *   X-Frame-Options=DENY        — block embedding in iframes (clickjacking)
 *   X-Content-Type-Options=nosniff — stop MIME-type sniffing
 *   Referrer-Policy             — strip path/query when leaving the site
 *   Permissions-Policy          — turn off APIs we don't use
 *   Strict-Transport-Security   — long-lived HSTS once on HTTPS (Vercel always is)
 *   X-DNS-Prefetch-Control      — minor perf hint
 *
 * Content-Security-Policy is intentionally permissive on inline styles +
 * scripts because Next.js + shadcn need them. Tightening to nonces is a
 * future hardening step (would require switching to next-csp helpers).
 * The rest of the directives are real — third-party origins are
 * explicitly allow-listed.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    // Disable APIs the app never uses. Keeps the surface small.
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js + React inline a small bootstrap script; Stripe + Firebase
      // also require their JS bundles.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.firebaseapp.com https://www.googleapis.com",
      // Tailwind injects styles at runtime; shadcn primitives use style attrs.
      "style-src 'self' 'unsafe-inline'",
      // Image URLs we actually load: Firebase Storage, Google avatars, data
      // URLs from the exports lib, plus self.
      "img-src 'self' data: blob: https://*.googleusercontent.com https://*.firebasestorage.app https://*.firebaseapp.com https://lh3.googleusercontent.com",
      // Same kind of allow-list for fonts (only system + self today).
      "font-src 'self' data:",
      // Outbound XHR / fetch — Firebase, Stripe, Anthropic, our own origin.
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://*.firebasestorage.app https://api.stripe.com https://api.anthropic.com https://*.anthropic.com wss://*.firebaseio.com",
      // Stripe Checkout + Customer Portal load inside iframes when invoked.
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.firebaseapp.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The chat route reads agent skill markdowns at runtime and uses pdfkit
    // for PDF exports. pdfkit reads .afm font metric files from its own
    // node_modules data directory at runtime — without this trace hint
    // those files won't be bundled into the Vercel serverless lambda and
    // every PDF export will fail with ENOENT on Helvetica.afm.
    outputFileTracingIncludes: {
      "/api/agent/chat": [
        "./lib/anthropic/skills/**/*.md",
        "./node_modules/pdfkit/js/data/**/*",
      ],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
