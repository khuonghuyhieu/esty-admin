import assert from "node:assert/strict";
import { test } from "node:test";
import { selectMembers } from "../../src/features/workspace-foundation/member-search.ts";
import { sampleMembers } from "../../src/features/workspace-foundation/fixtures.ts";

test("member search trims and matches synthetic names and emails case-insensitively", () => {
  assert.deepEqual(selectMembers("  aLeX  ").map(member => member.id), ["alex"]);
  assert.deepEqual(selectMembers("MAYA@WORKSPACE.TEST").map(member => member.id), ["maya"]);
  assert.deepEqual(selectMembers("Kim").map(member => member.id), ["jordan"]);
});

test("no member matches is empty; clearing or whitespace restores original sample ordering without mutation", () => {
  const before = structuredClone(sampleMembers);
  assert.deepEqual(selectMembers("not a member"), []);
  assert.deepEqual(selectMembers(""), before);
  assert.deepEqual(selectMembers("  \t "), before);
  assert.deepEqual(sampleMembers, before);
});
