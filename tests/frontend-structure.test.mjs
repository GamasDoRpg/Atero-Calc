import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile("index.html", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const uniqueIds = new Set(ids);

assert.equal(
  uniqueIds.size,
  ids.length,
  "index.html contains duplicate IDs"
);

for (const id of [
  "calculator-view",
  "canvas-view",
  "plot-view",
  "plot-canvas",
  "plot-expression-list",
  "plot-parameter-list",
  "plot-angle-mode",
  "plot-status"
]) {
  assert.ok(uniqueIds.has(id), `Missing required ID: ${id}`);
}

assert.match(html, /data-app-view="plot"/);
assert.match(html, /css\/plot\.css\?v=1/);
assert.match(html, /js\/bootstrap\.js\?v=3/);

const app = await readFile("js/app.js", "utf8");
const api = await readFile("js/api.js", "utf8");
const plot = await readFile("js/plot.js", "utf8");

assert.match(app, /iniciarGraph/);
assert.match(app, /"plot"/);
assert.match(api, /\/calc\/v1\/plot/);
assert.match(plot, /calculatePlot/);
assert.match(plot, /ResizeObserver/);
assert.match(plot, /pointerdown/);
assert.match(plot, /wheel/);

console.log("Frontend structure tests passed.");
