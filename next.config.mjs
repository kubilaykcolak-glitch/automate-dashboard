/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The chat route reads agent skill markdowns at runtime via fs.readFileSync.
    // Without this trace hint, Vercel's output file tracer won't include the
    // lib/anthropic/skills directory in the serverless bundle.
    outputFileTracingIncludes: {
      "/api/agent/chat": ["./lib/anthropic/skills/**/*.md"],
    },
  },
};

export default nextConfig;
