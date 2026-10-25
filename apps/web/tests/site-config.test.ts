import assert from "node:assert/strict";
import { test } from "node:test";
import { readSiteConfig } from "../src/lib/site-config.ts";

// Synthetic publication facts: these are not project/operator information.
const release = {
  SITE_MODE: "release", SITE_URL: "https://example.com", APP_NAME: "Test workspace",
  OPERATOR_NAME: "Test operator", SUPPORT_EMAIL: "support@example.com", PUBLICATION_CONFIRMED: "true",
};

test("draft builds without publication facts and cannot advertise a canonical or contact", () => {
  const config = readSiteConfig({});
  assert.equal(config.mode, "draft");
  assert.equal(config.canonicalOrigin, undefined);
  assert.equal(config.supportEmail, undefined);
  assert.equal(config.operatorName, undefined);
  assert.equal(config.indexable, false);
});

test("preview never inherits a production canonical or becomes indexable", () => {
  const config = readSiteConfig({ ...release, SITE_MODE: "preview", VERCEL_ENV: "preview" });
  assert.equal(config.canonicalOrigin, undefined);
  assert.equal(config.indexable, false);
  assert.equal(config.supportEmail, undefined);
  assert.equal(readSiteConfig({ VERCEL_ENV: "preview", VERCEL_URL: "preview.vercel.app" }).mode, "preview");
});

test("a release exposes only validated, explicitly confirmed facts", () => {
  const config = readSiteConfig(release);
  assert.equal(config.canonicalOrigin, "https://example.com");
  assert.equal(config.supportEmail, "support@example.com");
  assert.equal(config.operatorName, "Test operator");
  assert.equal(config.appName, "Test workspace");
  assert.equal(config.indexable, true);
});

for (const field of ["SITE_URL", "APP_NAME", "OPERATOR_NAME", "SUPPORT_EMAIL", "PUBLICATION_CONFIRMED"]) {
  test(`release rejects missing or blank ${field}`, () => {
    for (const value of [undefined, "", "   "]) {
      assert.throws(() => readSiteConfig({ ...release, [field]: value }), new RegExp(field));
    }
  });
}

for (const url of ["not a url", "http://example.com", "javascript:alert(1)", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?q=1", "https://example.com/#x", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://example.com:8080", "https://bad_host.com", "https://example.com\\evil"]) {
  test(`rejects malformed or unsuitable origin: ${url}`, () => {
    for (const mode of ["draft", "preview", "release"]) {
      assert.throws(() => readSiteConfig({ ...release, SITE_MODE: mode, SITE_URL: url }), /SITE_URL/);
    }
  });
}

test("draft with a valid URL still omits canonical and unconfirmed identity", () => {
  const config = readSiteConfig({ ...release, SITE_MODE: "draft" });
  assert.equal(config.canonicalOrigin, undefined);
  assert.equal(config.indexable, false);
  assert.equal(config.appName, "Fulfillment Workspace");
  assert.equal(config.operatorName, undefined);
});

test("invalid modes and false confirmations cannot opt into release", () => {
  assert.throws(() => readSiteConfig({ SITE_MODE: "production" }), /SITE_MODE/);
  assert.throws(() => readSiteConfig({ ...release, PUBLICATION_CONFIRMED: "false" }), /PUBLICATION_CONFIRMED/);
  assert.throws(() => readSiteConfig({ ...release, VERCEL_ENV: "preview" }), /preview/);
});

test("contact validation rejects malformed addresses and mailto header injection", () => {
  for (const email of ["missing-at", "a@b", "a b@example.com", "a@example.com?subject=bad", "a@example.com\nBcc:b@example.com", "a..b@example.com"]) {
    assert.throws(() => readSiteConfig({ ...release, SUPPORT_EMAIL: email }), /SUPPORT_EMAIL/);
  }
});

test("public names reject control characters and unreasonably long content", () => {
  for (const key of ["APP_NAME", "OPERATOR_NAME"]) {
    for (const value of ["Name\nOther", "x".repeat(161)]) {
      assert.throws(() => readSiteConfig({ ...release, [key]: value }), new RegExp(key));
    }
  }
});
