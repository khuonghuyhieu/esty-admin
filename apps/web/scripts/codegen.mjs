import { mkdir, readFile, writeFile } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifySessionProject } from "./app-session-isolation.mjs";

// Reuse the installed monorepo generator and BE-owned contract; write only FE output.
const webRoot = process.env.APP_SESSION_E2E === "1"
  ? (await verifySessionProject(process.cwd(), process.env.APP_SESSION_E2E_RUN_ID ?? "")).sourceRoot
  : fileURLToPath(new URL("..", import.meta.url));
const contract = pathToFileURL(resolve(webRoot, "../../specs/001-connectivity-foundation/contracts/openapi.json"));
const destination = new URL("../src/lib/api/generated.ts", import.meta.url);
const generated = "// Generated from feature 001 OpenAPI. Run npm run codegen --workspace=@esty-admin/web; do not edit.\n"
  + astToString(await openapiTS(contract));
if (process.argv.includes("--check")) {
  const current = await readFile(destination, "utf8").catch(() => "");
  if (current !== generated) {
    console.error("Web API contract output is missing or stale. Run npm run codegen --workspace=@esty-admin/web.");
    process.exitCode = 1;
  }
} else {
  await mkdir(new URL("../src/lib/api/", import.meta.url), { recursive: true });
  await writeFile(destination, generated);
}
