import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stageSessionProject, verifySessionProject, assertSessionOutputTree, sessionRunProfile } from "./app-session-isolation.mjs";
import { readSessionConfig } from "../src/features/app-session/config.ts";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(webRoot, "../..");
const require = createRequire(join(webRoot, "package.json"));
const nonce = process.env.APP_SESSION_E2E_RUN_ID ?? "";
const operation = process.argv[2];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const protectedPaths = ["apps/web/next-env.d.ts", "apps/web/tsconfig.json", "package.json", "package-lock.json", ".specify/feature.json", "README.md", "PROJECT_STATE.md", "apps/web/src/lib/api/generated.ts", "specs/001-connectivity-foundation/contracts/openapi.json"];

async function protectedHashes() {
  return Object.fromEntries(await Promise.all(protectedPaths.map(async path => [path, hash(await readFile(join(repository, path)))])));
}

async function syntheticEnvironment() {
  const path = process.env.APP_SESSION_FIXTURE_PATH;
  if (!path) throw new Error("An approved secure synthetic fixture path is required");
  const stat = await lstat(path);
  const parent = await lstat(dirname(path));
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.()
    || !parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o777) !== 0o700 || await realpath(path) !== path) throw new Error("Unsafe synthetic handoff");
  const fixture = JSON.parse(await readFile(path, "utf8"));
  const target = sessionRunProfile();
  if (fixture.version !== 1 || fixture.purpose !== target.purpose || (fixture.profile === undefined ? "006" : fixture.profile) !== target.profile || fixture.nonce !== nonce) throw new Error("Mismatched synthetic fixture nonce/profile");
  const config = readSessionConfig(fixture.webEnv);
  if (fixture.webEnv.APP_SESSION_MODE !== "local" || config.origin !== target.webOrigin || config.apiOrigin !== target.apiOrigin || config.authUrl !== target.authUrl || config.secure) throw new Error("Unexpected local fixture targets");
  const names = ["APP_SESSION_MODE", "APP_ORIGIN", "APP_API_ORIGIN", "APP_AUTH_URL", "APP_API_TECHNICAL_KEY", "APP_AUTH_API_KEY", "APP_SESSION_COOKIE_KEY"];
  if (Object.keys(fixture.webEnv).length !== names.length) throw new Error("Unexpected fixture environment fields");
  return Object.fromEntries(names.map(name => [name, fixture.webEnv[name]]));
}

async function main() {
  if (!process.versions.node.startsWith("24.") || !/^[a-f0-9]{32}$/.test(nonce)) throw new Error("Installed Node24 and the approved32hex run ID are required");
  if (!["stage", "restage", "build", "test", "verify"].includes(operation)) throw new Error("Expected stage, restage, build, test or verify");
  if (operation === "stage" || operation === "restage") {
    const baseline = await protectedHashes();
    if (operation === "restage") {
      const previous = JSON.parse(await readFile(join(webRoot, ".openai", `app-session-${nonce}`, "protected-before.json"), "utf8"));
      if (JSON.stringify(previous) !== JSON.stringify(baseline)) throw new Error("Protected inputs changed before restaging");
    }
    const staged = await stageSessionProject(nonce, operation === "restage");
    if (operation === "stage") await writeFile(join(staged.run, "protected-before.json"), JSON.stringify(baseline, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ operation, nonce, project: staged.project, privateConfigurationCopied: false }));
    return;
  }
  const project = join(webRoot, ".openai", `app-session-${nonce}`, "project");
  const run = dirname(project);
  const manifest = await verifySessionProject(project, nonce);
  await assertSessionOutputTree(project);
  const before = JSON.parse(await readFile(join(run, "protected-before.json"), "utf8"));
  if (JSON.stringify(await protectedHashes()) !== JSON.stringify(before)) throw new Error("Protected live inputs changed after staging");
  if (operation === "verify") {
    console.log(JSON.stringify({ operation, nonce, inputs: manifest.inputs.length, sourceMatchesStage: true, protectedInputsUnchanged: true, outputSymlinks: false }));
    return;
  }
  const environment = await syntheticEnvironment();
  for (const directory of ["home", "tmp", "cache"]) await mkdir(join(run, directory), { recursive: true, mode: 0o700 });
  const command = operation === "build"
    ? [require.resolve("next/dist/bin/next"), "build"]
    : [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(3)];
  if (operation === "test") await lstat(join(project, ".next", "BUILD_ID"));
  const active = join(run, "active-command.json");
  await writeFile(active, JSON.stringify({ pid: process.pid, operation, nonce }), { flag: "wx", mode: 0o600 });
  let exit = 1;
  try {
    const child = spawn(process.execPath, command, {
      cwd: project, stdio: "inherit",
      env: {
        PATH: `${dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
        HOME: join(run, "home"), TMPDIR: join(run, "tmp"), XDG_CACHE_HOME: join(run, "cache"),
        CI: "1", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
        SITE_MODE: "draft", SITE_URL: "", APP_NAME: "", OPERATOR_NAME: "", SUPPORT_EMAIL: "", PUBLICATION_CONFIRMED: "false",
        LOCAL_CONNECTIVITY_ENABLED: "false", LOCAL_CONNECTIVITY_API_ORIGIN: "http://127.0.0.1:4317",
        APP_SESSION_E2E: "1", APP_SESSION_E2E_PROFILE: manifest.profile, APP_SESSION_E2E_RUN_ID: nonce, APP_SESSION_FIXTURE_PATH: process.env.APP_SESSION_FIXTURE_PATH,
        ...environment,
        ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH } : {}),
      },
    });
    const terminate = () => child.kill("SIGTERM");
    process.once("SIGINT", terminate);
    process.once("SIGTERM", terminate);
    try {
      exit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
    } finally {
      process.removeListener("SIGINT", terminate);
      process.removeListener("SIGTERM", terminate);
    }
  } finally {
    await unlink(active);
    const after = await protectedHashes();
    const unchanged = JSON.stringify(before) === JSON.stringify(after);
    await writeFile(join(run, `${operation}-${Date.now()}.json`), JSON.stringify({ operation, command: [process.execPath, ...command], nonce, exit, node: process.version, sourceManifestSha256: hash(await readFile(join(run, "source-manifest.json"))), protectedInputsUnchanged: unchanged }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    if (!unchanged) throw new Error("Protected live inputs changed during isolated command");
  }
  if (exit === 0) { await verifySessionProject(project, nonce); await assertSessionOutputTree(project); }
  process.exitCode = exit;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Isolated session command failed");
  process.exitCode = 1;
});
