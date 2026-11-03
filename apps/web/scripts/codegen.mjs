import { mkdir, readFile, writeFile } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";

// Reuse the installed monorepo generator and BE-owned contract; write only FE output.
const contract = new URL("../../../specs/001-connectivity-foundation/contracts/openapi.json", import.meta.url);
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
