import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(
  process.env.GRAPH_MODEL_MODULE ||
  "/tmp/atero-graph-model.mjs"
);

const {
  extractIdentifiers,
  parseFormulaDefinition
} = await import(moduleUrl.href);

const energy = parseFormulaDefinition(
  "Energia = 0.5 * massa * velocidade^2"
);

assert.equal(energy.output.name, "Energia");
assert.equal(energy.expression, "0.5 * massa * velocidade^2");
assert.deepEqual(
  energy.inputs.map(input => input.id),
  ["massa", "velocidade"]
);

const advanced = parseFormulaDefinition(
  "saida = sqrt(massa) + sin(angulo) + pi + j"
);

assert.deepEqual(
  advanced.inputs.map(input => input.id),
  ["massa", "angulo"]
);

assert.deepEqual(
  extractIdentifiers("1e6 + valor + log10(100)"),
  ["valor"]
);

assert.throws(
  () => parseFormulaDefinition("sqrt = massa"),
  /nome reservado/
);

console.log("Graph model tests passed.");
