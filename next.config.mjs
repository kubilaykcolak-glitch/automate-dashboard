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
};

export default nextConfig;
