import assert from "node:assert/strict";
import { test } from "node:test";
import { discoveryReducer, initialDiscovery, normalizeShopInput } from "../../src/features/etsy-connection/shop-discovery.ts";
import { isShopId, type Lookup } from "../../src/features/etsy-connection/model.ts";

const shopId = "9007199254740993", shopName = "PaperMeadowStudio", query = shopName.toLowerCase();
const response: Lookup = { query, outcome: "exact", items: [{ shopId, shopName, shopUrl: `https://www.etsy.com/shop/${shopName}`, match: "exact" }], page: { offset: 0, limit: 20, providerCount: "1", complete: true, hasMore: false, nextOffset: null, truncated: false }, ownershipVerified: false, observedAt: "2026-11-18T09:00:00.000Z" };

test("shop IDs preserve int64 precision and reject ambiguous or out-of-range representations", () => {
  for (const value of ["1", shopId, "9223372036854775807"]) assert.equal(isShopId(value), true);
  for (const value of ["0", "01", "-1", "1e3", "1.0", " 1", "1 ", "١", "9223372036854775808", "10000000000000000000", "", 123]) assert.equal(isShopId(value), false);
});

test("local name/link parsing accepts bounded names and rejects URL normalization tricks", () => {
  for (const value of ["PaperMeadowStudio", " \f\tPaperMeadowStudio\r\n", "https://etsy.com/shop/PaperMeadowStudio", "https://www.etsy.com/shop/%50aperMeadowStudio/?ref=sample#ignored"]) assert.equal(normalizeShopInput(value), "papermeadowstudio", value);
  assert.equal(normalizeShopInput("A".repeat(64)), "a".repeat(64));
  for (const value of ["", "A".repeat(65), "Paper Meadow", "Päpér", "\u00a0PaperMeadowStudio", "http://etsy.com/shop/Paper", "https://etsy.com.evil.test/shop/Paper", "https://evil.test/shop/Paper", "https://user@etsy.com/shop/Paper", "https://etsy.com:443/shop/Paper", "https://etsy.com:444/shop/Paper", "https://etsy.com/shop/Paper/extra", "https://etsy.com/other/../shop/Paper", "https://etsy.com/shop/Paper%2fExtra", "https://etsy.com/shop/Paper%5cExtra", "https://etsy.com/shop/%252f", "https://etsy.com/shop/%ZZ", "https://etsy.com/shop/../Paper", "https://etsy.com\\shop\\Paper", "https://etsy.com/shop/"]) assert.equal(normalizeShopInput(value), null, value);
});

test("input edits and newer requests invalidate late success/failure and previous confirmation", () => {
  const started = discoveryReducer(discoveryReducer(initialDiscovery, { type: "edit", input: shopName }), { type: "start", query });
  const resolved = discoveryReducer(started, { type: "resolve", generation: started.generation, response });
  assert.equal(resolved.selected?.shopId, shopId);
  assert.equal(resolved.confirmed, false, "Auto-filled exact identity still requires deliberate confirmation");
  const confirmed = discoveryReducer(resolved, { type: "confirm" });
  assert.equal(confirmed.confirmed, true);
  const edited = discoveryReducer(confirmed, { type: "edit", input: "AnotherShop" });
  assert.equal(edited.selected, null); assert.equal(edited.confirmed, false);
  assert.equal(discoveryReducer(edited, { type: "resolve", generation: started.generation, response }), edited);
  const restarted = discoveryReducer(edited, { type: "start", query: "anothershop" });
  assert.equal(discoveryReducer(restarted, { type: "fail", generation: started.generation, message: "late failure" }), restarted);
  assert.equal(discoveryReducer(restarted, { type: "resolve", generation: restarted.generation, response }), restarted, "Wrong-query completion cannot bind a shop");
});

test("ambiguous and partial pages never silently choose a shop, and selection needs fresh confirmation", () => {
  const ambiguous: Lookup = { ...response, outcome: "choose", items: [...response.items, { ...response.items[0], shopId: "9007199254740994" }], page: { ...response.page, providerCount: "2" } };
  const partial: Lookup = { ...response, outcome: "choose", page: { ...response.page, offset: 20, complete: false, providerCount: "21" } };
  const incomplete: Lookup = { ...response, outcome: "incomplete", items: [], page: { ...partial.page, providerCount: "20" } };
  for (const page of [ambiguous, partial, incomplete]) {
    const started = discoveryReducer(initialDiscovery, { type: "start", query });
    const result = discoveryReducer(started, { type: "resolve", generation: started.generation, response: page });
    assert.equal(result.selected, null); assert.equal(discoveryReducer(result, { type: "confirm" }).confirmed, false);
    if (page.items.length) {
      const selected = discoveryReducer(result, { type: "select", shopId: page.items[0].shopId });
      assert.equal(selected.confirmed, false);
      assert.equal(discoveryReducer(selected, { type: "confirm" }).confirmed, true);
      assert.equal(discoveryReducer(selected, { type: "select", shopId: "missing" }).selected, null);
    }
  }
});
