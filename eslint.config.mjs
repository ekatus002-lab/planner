import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Pre-bundled PowerSync worker assets copied into `public/` by
    // `scripts/copy-powersync-worker.mjs` - not source we own or want linted.
    "public/@powersync/**",
    // Claude Code tooling state - may contain nested git worktrees with
    // their own node_modules/.next build output; never our source.
    ".claude/**",
  ]),
]);

export default eslintConfig;
