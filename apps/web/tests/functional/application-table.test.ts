import assert from "node:assert/strict";
import { test } from "node:test";
import { projects } from "../../src/features/application-preview/fixtures.ts";
import type { Project, TableState } from "../../src/features/application-preview/model.ts";
import { initialTableState, selectProjects, toggleSort } from "../../src/features/application-preview/table-state.ts";

const view = (state: Partial<TableState> = {}, rows: readonly Project[] = projects) =>
  selectProjects(rows, { ...initialTableState, ...state });
const ids = (state: Partial<TableState> = {}, rows: readonly Project[] = projects) =>
  view(state, rows).rows.map((row) => row.id);

test("search trims and matches title or owner case-insensitively", () => {
  assert.deepEqual(ids({ query: "  jOrDaN  " }), ["retro", "planning"]);
  assert.deepEqual(ids({ query: " CHECKOUT " }), ["mobile"]);
  assert.deepEqual(ids({ query: "   " }), projects.map((row) => row.id));
});

test("search and status combine with AND and aggregate only matching rows", () => {
  const result = view({ query: "jordan", status: "Active" });
  assert.deepEqual(result.rows.map((row) => row.id), ["planning"]);
  assert.equal(result.count, 1);
  assert.equal(result.strokes, 4280);
  assert.deepEqual(ids({ status: "Review" }), ["research", "mobile"]);
  assert.equal(view({ status: "Review" }).strokes, 3100);
  assert.equal(view({ query: "jordan", status: "Review" }).count, 0);
});

test("strokes sort numerically in both directions without mutating fixtures", () => {
  const before = projects.map((row) => row.id);
  assert.deepEqual(ids({ sort: { key: "strokes", direction: "ascending" } }), ["research", "retro", "mobile", "planning", "design"]);
  assert.deepEqual(ids({ sort: { key: "strokes", direction: "descending" } }), ["design", "planning", "mobile", "retro", "research"]);
  assert.deepEqual(projects.map((row) => row.id), before);
  assert.equal(view({ sort: { key: "strokes", direction: "descending" } }).strokes, 17540);
});

test("updated sort follows timestamps rather than relative-time labels", () => {
  assert.deepEqual(ids({ sort: { key: "updatedAt", direction: "ascending" } }), ["research", "retro", "design", "mobile", "planning"]);
  assert.deepEqual(ids({ sort: { key: "updatedAt", direction: "descending" } }), ["planning", "mobile", "design", "retro", "research"]);
});

test("equal values break ties by stable id in either direction and input order", () => {
  const tied: readonly Project[] = ["z", "a", "m"].map((id) => ({ ...projects[0], id }));
  for (const key of ["strokes", "updatedAt"] as const) {
    for (const direction of ["ascending", "descending"] as const) {
      assert.deepEqual(ids({ sort: { key, direction } }, tied), ["a", "m", "z"]);
      assert.deepEqual(ids({ sort: { key, direction } }, tied.toReversed()), ["a", "m", "z"]);
    }
  }
});

test("a new sort key starts ascending and repeated selection toggles", () => {
  const first = toggleSort(null, "strokes");
  assert.deepEqual(first, { key: "strokes", direction: "ascending" });
  const second = toggleSort(first, "strokes");
  assert.deepEqual(second, { key: "strokes", direction: "descending" });
  assert.deepEqual(toggleSort(second, "strokes"), first);
  assert.deepEqual(toggleSort(second, "updatedAt"), { key: "updatedAt", direction: "ascending" });
});

test("no matches have zero totals; reset restores the original order and complete totals", () => {
  const empty = view({ query: "missing", status: "Active", sort: { key: "strokes", direction: "descending" } });
  assert.deepEqual(empty, { rows: [], count: 0, strokes: 0 });
  const reset = selectProjects(projects, initialTableState);
  assert.deepEqual(reset.rows.map((row) => row.id), ["retro", "planning", "design", "research", "mobile"]);
  assert.equal(reset.count, 5);
  assert.equal(reset.strokes, 17540);
});
