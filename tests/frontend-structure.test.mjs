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
assert.match(html, /js\/bootstrap-v2\.js\?v=1/);

const app = await readFile("js/app.js", "utf8");
const api = await readFile("js/api.js", "utf8");
const controller = await readFile("js/plot-v2.js", "utf8");
const model = await readFile("js/plot-model.js", "utf8");
const renderer = await readFile("js/plot-renderer.js", "utf8");

assert.match(app, /iniciarGraph/);
assert.match(app, /\.\/plot-v2\.js\?v=3/);
assert.match(app, /"plot"/);
assert.match(api, /\/calc\/v1\/plot/);
assert.match(api, /request_cancelled/);
assert.match(api, /signal/);
assert.match(controller, /calculatePlot/);
assert.match(controller, /plotAbortController/);
assert.match(controller, /isEditingExpression/);
assert.match(controller, /TYPE_DEBOUNCE_MS/);
assert.match(controller, /ZOOM_DEBOUNCE_MS/);
assert.match(controller, /paddedViewport/);
assert.match(controller, /ResizeObserver/);
assert.match(controller, /pointerdown/);
assert.match(controller, /wheel/);
assert.match(model, /expressionMode/);
assert.match(model, /identifier !== "y"/);
assert.match(model, /x\^2 \+ y\^2 = 25/);
assert.match(renderer, /class PlotRenderer/);
assert.match(renderer, /drawCurves/);

const inputHandler = controller.match(
  /expressionList\.addEventListener\("input", event => \{([\s\S]*?)\n  \}\);/
)?.[1] || "";

assert.ok(inputHandler, "Missing Graph expression input handler");
assert.doesNotMatch(
  inputHandler,
  /renderExpressions\(/,
  "Typing must not rebuild the expression list"
);
assert.match(inputHandler, /schedulePlot\(/);
assert.match(inputHandler, /updateExpressionMode\(/);

console.log("Frontend structure tests passed.");
