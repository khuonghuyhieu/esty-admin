import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["src", "tests", "scripts"];
const configs = ["next.config.ts", "tsconfig.json", "package.json", "playwright.config.ts", "eslint.config.mjs"];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const noncePattern = /^[a-f0-9]{32}$/;
const sourceExtension = /\.(?:tsx?|m?js|json|css|svg|png|jpe?g|webp|ico|woff2?|ttf|txt)$/;

export function sessionRunProfile(profile = process.env.APP_SESSION_E2E_PROFILE ?? "006") {
  if (profile === "006") return { profile, purpose: "006-login-session", webOrigin: "http://127.0.0.1:55444", apiOrigin: "http://127.0.0.1:55443", authUrl: "http://127.0.0.1:55441", webPort: 55444 };
  if (profile === "activation001") return { profile, purpose: "001-production-activation", webOrigin: "http://127.0.0.1:55544", apiOrigin: "http://127.0.0.1:55543", authUrl: "http://127.0.0.1:55541", webPort: 55544 };
  throw new Error("Unknown isolated session test profile");
}

async function regularTree(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || entry.name.startsWith(".")) throw new Error("Unexpected hidden or symlink staging input");
    if (entry.isDirectory()) files.push(...await regularTree(root, name));
    else if (entry.isFile() && sourceExtension.test(name)) files.push(name);
    else throw new Error("Unexpected non-source staging input");
  }
  return files.sort();
}

async function publicInputs(root) {
  const paths = [...configs];
  for (const directory of roots) for (const file of await regularTree(join(root, directory))) paths.push(`${directory}/${file}`);
  return paths.sort();
}

async function plainPath(path, stop) {
  let current = path;
  while (current !== stop) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe staging directory");
    const parent = dirname(current);
    if (parent === current) throw new Error("Staging path escaped its owner");
    current = parent;
  }
  if (await realpath(stop) !== stop) throw new Error("Staging root must be a real path");
}

async function requireStoppedWeb(port) {
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); reject(new Error("Stop the owned web/browser lease before restaging")); });
    socket.once("error", error => error.code === "ECONNREFUSED" ? resolve() : reject(new Error("Cannot establish stopped web ownership")));
    socket.setTimeout(1000, () => { socket.destroy(); reject(new Error("Cannot establish stopped web ownership")); });
  });
}

export async function stageSessionProject(nonce, restage = false) {
  if (!noncePattern.test(nonce)) throw new Error("A fresh32hex run ID is required");
  const target = sessionRunProfile();
  const root = await realpath(webRoot);
  const run = join(root, ".openai", `app-session-${nonce}`);
  await mkdir(join(root, ".openai"), { recursive: true, mode: 0o700 });
  await plainPath(join(root, ".openai"), root);
  const project = join(run, "project");
  if (!restage) await mkdir(run, { mode: 0o700 }); // Never adopt an existing run.
  else {
    await plainPath(project, root);
    await assertSessionOutputTree(project);
    const previous = JSON.parse(await readFile(join(run, "source-manifest.json"), "utf8"));
    if (previous.version !== 1 || previous.purpose !== target.purpose || previous.profile !== target.profile || previous.nonce !== nonce || previous.sourceRoot !== root) throw new Error("Mismatched restaging ownership");
    const active = await lstat(join(run, "active-command.json")).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (active) throw new Error("An owned command is still active");
    await requireStoppedWeb(target.webPort);
    const archive = join(run, "attempts", String(Date.now()));
    await mkdir(archive, { recursive: true, mode: 0o700 });
    await rename(project, join(archive, "project"));
    await rename(join(run, "source-manifest.json"), join(archive, "source-manifest.json"));
  }
  await mkdir(project, { mode: 0o700 });
  const paths = await publicInputs(root);
  const inputs = [];
  for (const path of paths.sort()) {
    const source = join(root, path);
    if (!(await lstat(source)).isFile() || await realpath(source) !== source) throw new Error("Unsafe source input");
    const bytes = await readFile(source);
    const target = join(project, path);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    inputs.push({ path, sha256: hash(bytes) });
  }
  // next-env.d.ts is generated only here; live declarations, .env files, caches and dependencies are never copied.
  const manifest = { version: 1, purpose: target.purpose, profile: target.profile, nonce, sourceRoot: root, inputs, adaptations: [], generated: ["next-env.d.ts", "tsconfig.json", ".next", "test-results", "playwright-report"] };
  await writeFile(join(run, "source-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await verifySessionProject(project, nonce);
  return { run, project };
}

export async function verifySessionProject(project, nonce) {
  if (!noncePattern.test(nonce)) throw new Error("Invalid isolated run ID");
  const target = sessionRunProfile();
  const expectedSuffix = `${sep}.openai${sep}app-session-${nonce}${sep}project`;
  if (!project.endsWith(expectedSuffix)) throw new Error("Session verification requires its owned staged project");
  const sourceRoot = resolve(project, "../../..");
  const actualSourceRoot = webRoot.endsWith(expectedSuffix) ? resolve(webRoot, "../../..") : webRoot;
  if (sourceRoot !== await realpath(actualSourceRoot)) throw new Error("Unexpected staging source root");
  await plainPath(project, sourceRoot);
  const manifestPath = join(project, "..", "source-manifest.json");
  if (!(await lstat(manifestPath)).isFile() || await realpath(manifestPath) !== manifestPath) throw new Error("Unsafe staging manifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== 1 || manifest.purpose !== target.purpose || manifest.profile !== target.profile || manifest.nonce !== nonce || manifest.sourceRoot !== sourceRoot) throw new Error("Mismatched staging ownership");
  const paths = await publicInputs(sourceRoot);
  if (!Array.isArray(manifest.inputs) || manifest.inputs.length !== paths.length) throw new Error("Changed public input inventory");
  for (const [index, input] of manifest.inputs.entries()) {
    if (input.path !== paths[index]) throw new Error("Changed public input inventory");
    if (typeof input.path !== "string" || relative(project, resolve(project, input.path)) !== input.path || !/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error("Invalid source manifest entry");
    for (const root of [sourceRoot, project]) {
      const path = join(root, input.path);
      if (!(await lstat(path)).isFile() || await realpath(path) !== path) throw new Error("Source/stage symlink escape");
      if (hash(await readFile(path)) !== input.sha256) throw new Error("Staged artifact no longer matches current public source");
    }
  }
  return manifest;
}

export async function assertSessionOutputTree(project) {
  const run = dirname(project);
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isSymbolicLink() || await realpath(child) !== child) throw new Error("Isolated output symlink escape");
      if (entry.isDirectory()) await visit(child);
    }
  }
  await visit(run);
}
