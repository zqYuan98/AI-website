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
    // Isolated checkouts are validated in their own workspace.
    ".worktrees/**",
    // Workflow SDK regenerates these routes from src/workflows during typegen/dev/build.
    "src/app/.well-known/workflow/v1/**",
  ]),
]);

export default eslintConfig;
