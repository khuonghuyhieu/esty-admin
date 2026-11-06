import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const repository = "khuonghuyhieu/esty-admin";
const projectId = "prj_y2YXhPreVpIDZMSKsmzp7gwIMYLA";
const statusContext = "Vercel – esty-admin";
const revisionPattern = /^[a-f0-9]{40}$/;
const deploymentPattern = /^dpl_[A-Za-z0-9]{16,64}$/;
const mainUrl = `https://api.github.com/repos/${repository}/git/ref/heads/main`;
const origin = "https://app.lovora.us";

/** @param {Record<string, string | undefined>} environment */
export function productionIdentity(environment = process.env) {
  if (environment.VERCEL !== "1" || environment.VERCEL_ENV !== "production") return null;
  const revision = environment.VERCEL_GIT_COMMIT_SHA;
  const deploymentId = environment.VERCEL_DEPLOYMENT_ID;
  if (environment.VERCEL_PROJECT_ID !== projectId || environment.VERCEL_GIT_PROVIDER !== "github"
    || `${environment.VERCEL_GIT_REPO_OWNER}/${environment.VERCEL_GIT_REPO_SLUG}` !== repository
    || environment.VERCEL_GIT_COMMIT_REF !== "main" || environment.VERCEL_TARGET_ENV !== "production"
    || typeof revision !== "string" || !revisionPattern.test(revision)
    || typeof deploymentId !== "string" || !deploymentPattern.test(deploymentId)) {
    throw new Error("Production FE build identity is missing or does not match the approved native Git target");
  }
  return { revision, deploymentId };
}

export function classifyStatus(event, currentMain) {
  if (event?.repository?.full_name !== repository || event.context !== statusContext) return { outcome: "skipped", reason: "unrelated-status" };
  if (!revisionPattern.test(event.sha ?? "") || !Array.isArray(event.branches)) throw new Error("Invalid FE status identity");
  if (!event.branches.some(branch => branch.name === "main" && branch.commit?.sha === event.sha)) return { outcome: "skipped", reason: "not-main" };
  if (!revisionPattern.test(currentMain ?? "")) throw new Error("Current main identity is unavailable");
  if (event.sha !== currentMain) return { outcome: "skipped", reason: "stale-source" };
  if (event.state === "pending") return { outcome: "skipped", reason: "pending-deployment" };
  if (event.state !== "success") throw new Error("Native FE deployment status is not successful");
  let url;
  try { url = new URL(event.target_url); } catch { throw new Error("Invalid native deployment status URL"); }
  const match = /^\/khuonghuyhieu0705s-projects\/esty-admin\/([A-Za-z0-9]{16,64})$/.exec(url.pathname);
  if (url.origin !== "https://vercel.com" || url.username || url.password || url.search || url.hash || !match) throw new Error("Native deployment status targets another project");
  return { outcome: "run", revision: event.sha, deploymentId: `dpl_${match[1]}` };
}

async function readBounded(response) {
  if (!response.body) throw new Error("Smoke response has no body");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) throw new Error("Smoke response exceeds its bound");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { await reader.cancel(); }
}

async function get(url, fetcher, signal) {
  return fetcher(url, { method: "GET", credentials: "omit", redirect: "manual", cache: "no-store", signal, headers: { Accept: url === mainUrl ? "application/vnd.github+json" : "text/html" } });
}

async function currentMain(fetcher, signal) {
  const response = await get(mainUrl, fetcher, signal);
  if (response.status !== 200) { await response.body?.cancel(); throw new Error("Cannot verify current public main revision"); }
  const data = JSON.parse(await readBounded(response));
  if (!revisionPattern.test(data.object?.sha ?? "")) throw new Error("Invalid current main response");
  return data.object.sha;
}

export async function inspectStatus(event, fetcher = fetch) {
  if (event?.repository?.full_name !== repository || event.context !== statusContext) return { outcome: "skipped", reason: "unrelated-status" };
  return classifyStatus(event, await currentMain(fetcher, AbortSignal.timeout(10_000)));
}

export async function smokeProduction(event, fetcher = fetch) {
  const signal = AbortSignal.timeout(20_000);
  const identity = classifyStatus(event, await currentMain(fetcher, signal));
  if (identity.outcome !== "run") throw new Error("FE smoke is not eligible; no acceptance recorded");
  const paths = ["/", "/privacy", "/login"];
  for (const path of paths) {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const response = await get(`${origin}${path}`, fetcher, signal);
      const html = response.status === 200 && response.headers.get("content-type")?.startsWith("text/html");
      const matches = response.headers.get("x-lovora-revision") === identity.revision
        && response.headers.get("x-lovora-deployment") === identity.deploymentId;
      if (html && matches) {
        if (!/^<!doctype html>/i.test(await readBounded(response))) throw new Error(`FE public document missing at ${path}`);
        break;
      }
      await response.body?.cancel();
      // A success status can precede alias assignment; retry only an absent or older alias.
      if (attempt >= 5 || !(response.status === 404 || (html && !matches))) {
        throw new Error(`FE public smoke identity/status mismatch at ${path}`);
      }
      await delay(500, undefined, { signal });
    }
  }
  if (await currentMain(fetcher, signal) !== identity.revision) throw new Error("Main advanced during FE smoke; acceptance withheld");
  return { outcome: "passed", revision: identity.revision, deploymentId: identity.deploymentId, paths, scope: "public-documents-only-not-session-acceptance" };
}

async function main() {
  if (!process.versions.node.startsWith("24.") || !["classify", "smoke"].includes(process.argv[2]) || !process.env.GITHUB_EVENT_PATH) throw new Error("Expected Node24 and an explicit GitHub status event");
  const raw = await readFile(process.env.GITHUB_EVENT_PATH, "utf8");
  if (Buffer.byteLength(raw) > 256 * 1024) throw new Error("Status event exceeds its bound");
  const event = JSON.parse(raw);
  const result = process.argv[2] === "classify" ? await inspectStatus(event) : await smokeProduction(event);
  if (process.argv[2] === "classify" && process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `outcome=${result.outcome}\n`);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("FE delivery evidence unavailable or rejected; no hosted acceptance recorded"); process.exitCode = 1; });
}
