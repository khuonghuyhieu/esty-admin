import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requirePassingTests, runBuildStages } from "../../scripts/fe-build.mjs";
import { classifyStatus, inspectStatus, productionIdentity, smokeProduction } from "../../scripts/fe-delivery.mjs";

const revision = "a".repeat(40);
const deploymentId = "dpl_CTzBFEjNpsXwDFDLdTz4itKQU4fa";
const environment = {
  VERCEL: "1", VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production",
  VERCEL_PROJECT_ID: "prj_y2YXhPreVpIDZMSKsmzp7gwIMYLA", VERCEL_GIT_PROVIDER: "github",
  VERCEL_GIT_REPO_OWNER: "khuonghuyhieu", VERCEL_GIT_REPO_SLUG: "esty-admin", VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_GIT_COMMIT_SHA: revision, VERCEL_DEPLOYMENT_ID: deploymentId,
};
const event = {
  repository: { full_name: "khuonghuyhieu/esty-admin" }, context: "Vercel – esty-admin", sha: revision,
  branches: [{ name: "main", commit: { sha: revision } }], state: "success",
  target_url: `https://vercel.com/khuonghuyhieu0705s-projects/esty-admin/${deploymentId.slice(4)}`,
};
const passing = "# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
const stages = ["contract", "functional", "lint", "build"].map(name => ({ name }));

for (const failed of ["contract", "functional", "lint"]) {
  test(`a failed ${failed} check prevents the native build`, async () => {
    const reached: string[] = [];
    await assert.rejects(runBuildStages(stages, async (stage: { name: string }) => {
      reached.push(stage.name);
      return { code: stage.name === failed ? 1 : 0, signal: null, stdout: passing };
    }));
    assert.deepEqual(reached, stages.slice(0, stages.findIndex(stage => stage.name === failed) + 1).map(stage => stage.name));
    assert.equal(reached.includes("build"), false);
  });
}

test("zero, skipped, pending, missing and ambiguous test summaries cannot satisfy the gate", () => {
  for (const output of ["", passing.replace("# tests 2", "# tests 0"), passing.replace("# skipped 0", "# skipped 1"), passing.replace("# todo 0", "# todo 1"), passing.replace("# cancelled 0", "# cancelled 1"), `${passing}# tests 2\n`]) {
    assert.throws(() => requirePassingTests(output));
  }
});

test("a zero-exit skipped suite or killed child cannot release the native build", async () => {
  for (const result of [{ code: 0, signal: null, stdout: passing.replace("# skipped 0", "# skipped 1") }, { code: null, signal: "SIGTERM", stdout: passing }]) {
    let built = false;
    await assert.rejects(runBuildStages(stages, async (stage: { name: string }) => {
      if (stage.name === "build") built = true;
      return stage.name === "functional" ? result : { code: 0, signal: null, stdout: "" };
    }));
    assert.equal(built, false);
  }
});

test("production provenance is refused for missing metadata or a different native target", () => {
  assert.deepEqual(productionIdentity(environment), { revision, deploymentId });
  for (const field of ["VERCEL_PROJECT_ID", "VERCEL_GIT_PROVIDER", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "VERCEL_GIT_COMMIT_REF", "VERCEL_TARGET_ENV", "VERCEL_GIT_COMMIT_SHA", "VERCEL_DEPLOYMENT_ID"]) {
    assert.throws(() => productionIdentity({ ...environment, [field]: "" }));
  }
  assert.equal(productionIdentity({ ...environment, VERCEL_ENV: "preview" }), null);
  assert.equal(productionIdentity({}), null);
});

test("unrelated, pending, non-main and stale statuses are not smoke acceptance", async () => {
  assert.equal(classifyStatus({ ...event, context: "BE required checks" }, revision).outcome, "skipped");
  assert.equal(classifyStatus({ ...event, state: "pending" }, revision).outcome, "skipped");
  assert.equal(classifyStatus({ ...event, branches: [] }, revision).outcome, "skipped");
  assert.equal(classifyStatus(event, "b".repeat(40)).outcome, "skipped");
  let requests = 0;
  const noNetwork = async () => { requests++; throw new Error("Ineligible status must not cause network work"); };
  assert.deepEqual(await inspectStatus({}, noNetwork), { outcome: "skipped", reason: "unrelated-status" });
  assert.deepEqual(await inspectStatus({ ...event, state: "pending" }, noNetwork), { outcome: "skipped", reason: "pending-deployment" });
  await assert.rejects(inspectStatus({ ...event, state: "pending", sha: "invalid" }, noNetwork));
  await assert.rejects(inspectStatus({ ...event, state: "pending", branches: null }, noNetwork));
  assert.deepEqual(await inspectStatus({ ...event, state: "pending", branches: [] }, noNetwork), { outcome: "skipped", reason: "not-main" });
  await assert.rejects(smokeProduction({ ...event, state: "pending" }, noNetwork), /not eligible/);
  assert.equal(requests, 0);
});

test("failed or malformed native status and another project's URL fail closed", async () => {
  for (const state of ["failure", "error", "", "neutral"]) {
    assert.throws(() => classifyStatus({ ...event, state }, revision));
    await assert.rejects(inspectStatus({ ...event, state }, fixture().fetcher));
  }
  for (const target_url of [event.target_url.replace("esty-admin/", "esty-admin-api/"), `${event.target_url}?bypass=anything`, event.target_url.replace("https://", "https://user@"), "https://example.com"]) {
    assert.throws(() => classifyStatus({ ...event, target_url }, revision));
    const transport = fixture();
    await assert.rejects(inspectStatus({ ...event, target_url }, transport.fetcher));
    assert.equal(transport.requested.some(url => url.startsWith("https://app.lovora.us")), false);
  }
  assert.throws(() => classifyStatus(event, undefined));
});

test("failed current-main lookup emits bounded CLI diagnostics without provider data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fe-delivery-diagnostics-"));
  const eventPath = join(directory, "event.json");
  const outputPath = join(directory, "output");
  const preloadPath = join(directory, "transport.mjs");
  const canary = "PRIVATE_PAYLOAD_HEADER_URL_CANARY";
  try {
    await writeFile(eventPath, JSON.stringify(event));
    for (const scenario of [
      { transport: `return new Response("${canary}", { status: 403, headers: { "x-private": "${canary}", location: "https://example.com/${canary}" } });`, reason: "http-status", httpStatus: 403 },
      { transport: `return new Response("${canary}", { status: 200 });`, reason: "invalid-response", httpStatus: 200 },
      { transport: `return Response.json({ object: { sha: "${canary}" } });`, reason: "invalid-response", httpStatus: 200 },
      { transport: `return new Response(new ReadableStream({ cancel() { throw new Error("${canary}"); } }), { status: 403 });`, reason: "http-status", httpStatus: 403 },
      { transport: `throw Object.assign(new Error("${canary}"), { phase: "${canary}", reason: "${canary}", status: 403 });`, reason: "transport-error" },
      {
        command: "smoke", phase: "main-recheck", reason: "http-status", httpStatus: 403,
        transport: `if (String(input).startsWith("https://api.github.com/")) {
          if (++mainReads === 1) return Response.json({ object: { sha: "${revision}" } });
          return new Response("${canary}", { status: 403 });
        }
        return new Response("<!doctype html><html></html>", { headers: {
          "content-type": "text/html", "x-lovora-revision": "${revision}", "x-lovora-deployment": "${deploymentId}",
        } });`,
      },
    ]) {
      await writeFile(preloadPath, `let mainReads = 0; globalThis.fetch = async input => { ${scenario.transport} };`);
      const result = spawnSync(process.execPath, ["--import", preloadPath, new URL("../../scripts/fe-delivery.mjs", import.meta.url).pathname, scenario.command ?? "classify"], {
        env: { PATH: process.env.PATH, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
        encoding: "utf8", timeout: 10_000,
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(`${result.stdout}${result.stderr}`.includes(canary), false);
      assert.deepEqual(JSON.parse(result.stderr), {
        outcome: "failed", phase: scenario.phase ?? "main-lookup", reason: scenario.reason,
        ...(scenario.httpStatus ? { httpStatus: scenario.httpStatus } : {}),
      });
      await assert.rejects(readFile(outputPath), { code: "ENOENT" });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function fixture(options: { wrongDeployment?: boolean; redirect?: boolean; oversized?: boolean; advance?: boolean; stale?: boolean } = {}) {
  const requested: string[] = [];
  let mainReads = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requested.push(url);
    assert.equal(init?.redirect, "manual");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.method, "GET");
    assert.deepEqual(init?.headers, { Accept: url.startsWith("https://api.github.com/") ? "application/vnd.github+json" : "text/html" });
    assert.ok(init?.signal);
    if (url === "https://api.github.com/repos/khuonghuyhieu/esty-admin/git/ref/heads/main") {
      mainReads++;
      return Response.json({ object: { sha: options.stale || (options.advance && mainReads > 1) ? "b".repeat(40) : revision } });
    }
    assert.ok(["https://app.lovora.us/", "https://app.lovora.us/privacy", "https://app.lovora.us/login"].includes(url));
    return new Response(options.oversized ? "x".repeat(256 * 1024 + 1) : "<!DOCTYPE html><html><body>Public document</body></html>", {
      status: options.redirect ? 302 : 200,
      headers: { "content-type": "text/html; charset=utf-8", "x-lovora-revision": revision, "x-lovora-deployment": options.wrongDeployment ? "dpl_anotherDeployment123456" : deploymentId },
    });
  };
  return { fetcher, requested };
}

test("public smoke binds actual responses to the status deployment and both current-main observations", async () => {
  const transport = fixture();
  assert.deepEqual(await inspectStatus(event, transport.fetcher), { outcome: "run", revision, deploymentId });
  assert.deepEqual(await smokeProduction(event, transport.fetcher), { outcome: "passed", revision, deploymentId, paths: ["/", "/privacy", "/login"], scope: "public-documents-only-not-session-acceptance" });
  assert.equal(transport.requested.filter(url => url.startsWith("https://app.lovora.us")).length, 3);
});

for (const options of [{ wrongDeployment: true }, { redirect: true }, { oversized: true }, { advance: true }]) {
  test(`public smoke refuses ${Object.keys(options)[0]} without accepting a status-only success`, async () => {
    const transport = fixture(options);
    await assert.rejects(smokeProduction(event, transport.fetcher));
    if (options.wrongDeployment) assert.equal(transport.requested.filter(url => url.startsWith("https://app.lovora.us")).length, 6);
  });
}

test("a stale source never probes production and cannot become a successful smoke", async () => {
  const transport = fixture({ stale: true });
  assert.deepEqual(await inspectStatus(event, transport.fetcher), { outcome: "skipped", reason: "stale-source" });
  await assert.rejects(smokeProduction(event, transport.fetcher));
  assert.equal(transport.requested.some(url => url.startsWith("https://app.lovora.us")), false);
});

test("alias propagation waits through absent, missing and stale identity before accepting exact documents", async () => {
  const transport = fixture();
  let homeReads = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input) === "https://app.lovora.us/") {
      homeReads++;
      if (homeReads === 1) return new Response("Alias pending", { status: 404 });
      if (homeReads === 2) return new Response("<!doctype html><html></html>", { headers: { "content-type": "text/html" } });
      if (homeReads === 3) return new Response("<!doctype html><html></html>", { headers: {
        "content-type": "text/html", "x-lovora-revision": "b".repeat(40), "x-lovora-deployment": "dpl_PreviousDeployment123456",
      } });
    }
    return transport.fetcher(input, init);
  };
  assert.deepEqual(await smokeProduction(event, fetcher), { outcome: "passed", revision, deploymentId, paths: ["/", "/privacy", "/login"], scope: "public-documents-only-not-session-acceptance" });
  assert.equal(homeReads, 4);
});

test("alias readiness cannot extend the shared request deadline", async context => {
  const controller = new AbortController();
  context.mock.method(AbortSignal, "timeout", () => controller.signal);
  const transport = fixture({ wrongDeployment: true });
  const timer = setTimeout(() => controller.abort(), 25);
  try {
    await assert.rejects(smokeProduction(event, transport.fetcher), { name: "AbortError" });
    assert.equal(transport.requested.filter(url => url.startsWith("https://app.lovora.us")).length, 1);
  } finally { clearTimeout(timer); }
});

test("alias readiness does not retry server failures or accept a pending deployment status", async () => {
  const transport = fixture();
  let publicReads = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).startsWith("https://app.lovora.us")) {
      publicReads++;
      return new Response("Unavailable", { status: 503 });
    }
    return transport.fetcher(input, init);
  };
  await assert.rejects(smokeProduction({ ...event, state: "pending" }, fetcher), /not eligible/);
  assert.equal(publicReads, 0);
  await assert.rejects(smokeProduction(event, fetcher), /identity\/status mismatch/);
  assert.equal(publicReads, 1);
});
