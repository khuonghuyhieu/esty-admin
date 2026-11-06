import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSessionOutputTree, verifySessionProject } from "./app-session-isolation.mjs";
import { productionIdentity } from "./fe-delivery.mjs";

export function requirePassingTests(output) {
  const counts = Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map(name => {
    const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
    return [name, matches.length === 1 ? Number(matches[0][1]) : NaN];
  }));
  if (!(counts.tests > 0) || counts.pass !== counts.tests || ["fail", "cancelled", "skipped", "todo"].some(name => counts[name] !== 0)) {
    throw new Error("Functional checks must finish with positive coverage and no failed, skipped, cancelled or pending tests");
  }
}

export async function runBuildStages(stages, execute) {
  for (const stage of stages) {
    const result = await execute(stage);
    if (result.code !== 0 || result.signal) throw new Error(`FE ${stage.name} did not succeed; later stages were not started`);
    if (stage.name === "functional") requirePassingTests(result.stdout);
  }
}

function execute(stage, cwd, environment) {
  return new Promise((resolveResult, reject) => {
    let stdout = "";
    const child = spawn(process.execPath, stage.args, { cwd, env: environment, stdio: ["ignore", "pipe", "inherit"], timeout: 300_000, killSignal: "SIGKILL" });
    child.stdout.on("data", chunk => {
      process.stdout.write(chunk);
      if (stage.name === "functional") {
        stdout += chunk;
        if (stdout.length > 4 * 1024 * 1024) child.kill("SIGKILL");
      }
    });
    child.once("error", () => reject(new Error(`Cannot start FE ${stage.name}`)));
    child.once("close", (code, signal) => resolveResult({ code, signal, stdout }));
  });
}

async function main() {
  const cwd = process.cwd();
  if (!process.versions.node.startsWith("24.")) throw new Error("FE delivery requires Node24");
  if (process.env.APP_SESSION_E2E === "1") {
    await verifySessionProject(cwd, process.env.APP_SESSION_E2E_RUN_ID ?? "");
    await assertSessionOutputTree(cwd);
  } else if (process.env.VERCEL !== "1") {
    throw new Error("Use the existing isolated project for local delivery checks");
  }
  productionIdentity(process.env);
  const require = createRequire(join(cwd, "package.json"));
  const tests = (await readdir(join(cwd, "tests/functional"))).filter(name => name.endsWith(".test.ts")).sort();
  const stages = [
    { name: "contract", args: ["scripts/codegen.mjs", "--check"] },
    { name: "functional", args: ["--experimental-strip-types", "--test", "--test-reporter=tap", "tests/site-config.test.ts", ...tests.map(name => `tests/functional/${name}`)] },
    { name: "lint", args: [join(dirname(require.resolve("eslint/package.json")), "bin/eslint.js"), ".", "--max-warnings=0", "--no-cache"] },
    { name: "build", args: [require.resolve("next/dist/bin/next"), "build"] },
  ];
  // Tests/lint never inherit the native build's runtime credentials. Next alone receives its build environment.
  const checkEnvironment = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "APP_SESSION_E2E", "APP_SESSION_E2E_RUN_ID", "APP_SESSION_E2E_PROFILE"].flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]]]));
  checkEnvironment.NEXT_TELEMETRY_DISABLED = "1";
  await runBuildStages(stages, stage => execute(stage, cwd, stage.name === "build" ? process.env : checkEnvironment));
  if (process.env.APP_SESSION_E2E === "1") await assertSessionOutputTree(cwd);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
