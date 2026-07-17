import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const graphModelPath = "/tmp/atero-graph-model.mjs";
const plotModelPath = "/tmp/atero-plot-model.mjs";

const source = await readFile("js/plot-model.js", "utf8");
const prepared = source.replace(
  '"./graph-model.js?v=2"',
  JSON.stringify(pathToFileURL(graphModelPath).href)
);

await writeFile(plotModelPath, prepared);

const {
  detectedParameters,
  expressionMode,
  normalizedPlotExpression
} = await import(`${pathToFileURL(plotModelPath).href}?v=${Date.now()}`);

assert.equal(expressionMode("sin(x)"), "explicit");
assert.equal(expressionMode("y = x^2"), "explicit");
assert.equal(expressionMode("f(x) = a*x"), "explicit");
assert.equal(expressionMode("x^2 + y^2 = 25"), "implicit");
assert.equal(expressionMode("r = x^2 + y^2"), "implicit");
assert.equal(expressionMode("x^2 + y^2 - 25"), "implicit");

assert.deepEqual(
  detectedParameters("r = x^2 + y^2"),
  ["r"]
);
assert.deepEqual(
  detectedParameters("(x-h)^2 + (y-k)^2 = r^2"),
  ["h", "k", "r"]
);
assert.deepEqual(
  detectedParameters("y = a * sin(b*x)"),
  ["a", "b"]
);
assert.equal(
  normalizedPlotExpression("x² + y² = 25"),
  "x^2 + y^2 = 25"
);

console.log("Plot model tests passed.");
