import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import openapiTS, { astToString } from "openapi-typescript";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifySessionProject } from "./app-session-isolation.mjs";

// Reuse the installed monorepo generator and BE-owned contract; write only FE output.
const webRoot = process.env.APP_SESSION_E2E === "1"
  ? (await verifySessionProject(process.cwd(), process.env.APP_SESSION_E2E_RUN_ID ?? "")).sourceRoot
  : fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const source = args.find(value => value.startsWith("--contract="))?.slice("--contract=".length);
const digest = args.find(value => value.startsWith("--sha256="))?.slice("--sha256=".length);
if (args.some(value => value !== "--check" && !value.startsWith("--contract=") && !value.startsWith("--sha256="))
  || args.filter(value => value.startsWith("--contract=")).length > 1
  || args.filter(value => value.startsWith("--sha256=")).length > 1
  || source === "" || (source === undefined) !== (digest === undefined) || (digest !== undefined && !/^[a-f0-9]{64}$/.test(digest))) {
  throw new Error("Use --check and optionally a paired --contract=local-path --sha256=reviewed-digest");
}
const contract = pathToFileURL(source ? resolve(source) : resolve(webRoot, "../../specs/001-connectivity-foundation/contracts/openapi.json"));
const contractBytes = await readFile(contract);
if (digest && createHash("sha256").update(contractBytes).digest("hex") !== digest) throw new Error("Reviewed canonical contract digest mismatch");
const destination = new URL("../src/lib/api/generated.ts", import.meta.url);
const generated = "// Generated from feature 001 OpenAPI. Run npm run codegen --workspace=@esty-admin/web; do not edit.\n"
  + astToString(await openapiTS(JSON.parse(contractBytes.toString("utf8"))));
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
