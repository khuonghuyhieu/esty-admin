import assert from "node:assert/strict";
import { test } from "node:test";
import { localConnectivityOrigin, validateLoopbackOrigin } from "../../src/features/connectivity/config.ts";

test("local route is opt-in and rejects hosted execution even with a valid local origin", () => {
  for (const env of [{}, { LOCAL_CONNECTIVITY_ENABLED: "false" }, { LOCAL_CONNECTIVITY_ENABLED: "TRUE" }]) {
    assert.equal(localConnectivityOrigin(env), null);
  }
  assert.equal(localConnectivityOrigin({ LOCAL_CONNECTIVITY_ENABLED: "true" }), "http://127.0.0.1:3001");
  for (const key of ["VERCEL", "VERCEL_ENV", "AWS_LAMBDA_FUNCTION_NAME", "NETLIFY", "RENDER"]) {
    assert.equal(localConnectivityOrigin({ LOCAL_CONNECTIVITY_ENABLED: "true", [key]: "present" }), null);
  }
  for (const SITE_MODE of ["release", "preview"]) {
    assert.equal(localConnectivityOrigin({ LOCAL_CONNECTIVITY_ENABLED: "true", SITE_MODE }), null);
  }
});

test("API target permits only canonical explicit-port IPv4 loopback HTTP origins", () => {
  assert.equal(validateLoopbackOrigin("http://127.0.0.1:4317"), "http://127.0.0.1:4317");
  for (const origin of ["https://api.lovora.us", "https://127.0.0.1:3001", "http://localhost:3001", "http://127.1:3001", "http://2130706433:3001", "http://127.0.0.1", "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:3001/", "http://127.0.0.1:3001/path", "http://user:secret@127.0.0.1:3001", "http://127.0.0.1:3001?token=secret", " http://127.0.0.1:3001", "http://127.0.0.1:03001"]) {
    assert.throws(() => validateLoopbackOrigin(origin), { message: "Local API origin must be an explicit-port http://127.0.0.1 origin." });
  }
});
