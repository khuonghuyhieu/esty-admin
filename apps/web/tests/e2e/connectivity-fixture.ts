import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);
const container = "esty-admin-fe-connectivity";
const image = "public.ecr.aws/supabase/postgres:17.11.0.006";
const database = "postgresql://postgres:fe-connectivity-synthetic@127.0.0.1:55433/postgres";

export async function localApiFixture() {
  const root = resolve(process.cwd(), "../..");
  const directory = await mkdtemp(join(tmpdir(), "esty-fe-connectivity-"));
  let ownedContainer: string | undefined;
  let api: ChildProcess | undefined;
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH, HOME: directory, API_RUNTIME: "local", API_HOST: "127.0.0.1", API_PORT: "4317", BROWSER_ORIGIN: "http://127.0.0.1:3100", DATABASE_URL: database };
  const dockerEnv: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH, HOME: process.env.HOME, ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}) };
  const docker = async (...args: string[]) => exec("docker", args, { env: dockerEnv, timeout: 60_000, maxBuffer: 1024 * 1024 });

  async function stopApi() {
    const child = api;
    api = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exit = Promise.withResolvers<void>();
    child.once("exit", () => exit.resolve());
    child.kill("SIGTERM");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
    try { await exit.promise; } finally { clearTimeout(timeout); }
  }

  async function startApi(unavailableDatabase = false) {
    await stopApi();
    // The missing database is confined to our own container; shared DBs are never stopped.
    const child = spawn(process.execPath, [join(directory, "build/src/main.js")], {
      cwd: directory, env: { ...env, DATABASE_URL: unavailableDatabase ? "postgresql://postgres:fe-connectivity-synthetic@127.0.0.1:55433/fe_missing_database" : database },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const listening = Promise.withResolvers<void>();
    api = child;
    let output = "";
    child.stdout?.on("data", data => {
      output += String(data);
      if (output.includes('"stage":"listening"')) listening.resolve();
    });
    child.stderr?.resume();
    child.once("error", () => listening.reject(new Error("Owned local API failed to start.")));
    child.once("exit", () => listening.reject(new Error("Owned local API exited before listening.")));
    const timeout = setTimeout(() => listening.reject(new Error("Owned local API startup exceeded 12 seconds.")), 12_000);
    try { await listening.promise; } finally { clearTimeout(timeout); }
  }

  async function cleanup() {
    await stopApi();
    if (ownedContainer) await docker("rm", "--force", "--volumes", ownedContainer);
    await rm(directory, { recursive: true, force: true });
  }

  try {
    // Snapshot only public API inputs; canonical startup cannot discover owner .env files here.
    await cp(join(root, "apps/api/package.json"), join(directory, "package.json"));
    for (const path of ["src", "migrations"]) {
      await cp(join(root, "apps/api", path), join(directory, path), { recursive: true });
    }
    await mkdir(join(directory, "scripts"));
    for (const path of ["migrate.ts", "migrations.ts", "migration-report.ts", "migration-files.mjs", "private-files.mjs", "bounded.ts"]) {
      await cp(join(root, "apps/api/scripts", path), join(directory, "scripts", path));
    }
    await mkdir(join(directory, "config"));
    await cp(join(root, "apps/api/config/hosted-target.example.json"), join(directory, "config/hosted-target.example.json"));
    await symlink(join(root, "node_modules"), join(directory, "node_modules"), "dir");
    const config = JSON.parse(await readFile(join(root, "apps/api/tsconfig.json"), "utf8"));
    config.include = ["src/**/*.ts", "scripts/migrate.ts"];
    await writeFile(join(directory, "tsconfig.json"), JSON.stringify(config));
    await exec(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", join(directory, "tsconfig.json")], { cwd: directory, timeout: 60_000 });
    const created = await docker("create", "--pull=never", "--name", container, "--label", "esty.owner=fe-connectivity", "--publish", "127.0.0.1:55433:5432", "--env", "POSTGRES_PASSWORD=fe-connectivity-synthetic", "--env", "POSTGRES_DB=postgres", "--tmpfs", "/var/lib/postgresql/data", image);
    ownedContainer = created.stdout.trim();
    await docker("start", ownedContainer);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-p", "5432", "-U", "postgres"); ready = true; break; }
      catch { await delay(500); }
    }
    if (!ready) throw new Error("Owned Supabase PostgreSQL did not become ready.");
    await exec(process.execPath, [join(directory, "build/scripts/migrate.js")], { cwd: directory, env, timeout: 60_000 });
    await startApi();
    await writeFile(join(directory, "fixture.json"), JSON.stringify({ container, image, apiOrigin: "http://127.0.0.1:4317", databasePort: 55433 }));
    return { startApi, stopApi, cleanup, directory };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
