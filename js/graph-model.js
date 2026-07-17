const IDENTIFIER_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*$/;

const IDENTIFIER_GLOBAL_PATTERN =
  /\b[A-Za-z_][A-Za-z0-9_]*\b/g;

const RESERVED_IDENTIFIERS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield"
]);


export class GraphModelError extends Error {
  constructor(message, code = "invalid_graph") {
    super(message);

    this.name = "GraphModelError";
    this.code = code;
  }
}


export function createId(prefix = "item") {
  const randomPart =
    globalThis.crypto?.randomUUID?.()
      ?.replaceAll("-", "")
      .slice(0, 12) ||
    Math.random()
      .toString(36)
      .slice(2, 14);

  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}


export function normalizeExpression(value) {
  return String(value || "")
    .trim()
    .replaceAll("×", "*")
    .replaceAll("·", "*")
    .replaceAll("÷", "/")
    .replaceAll("²", "^2")
    .replaceAll("³", "^3")
    .replace(/(\d),(?=\d)/g, "$1.");
}


export function identifierFromLabel(
  label,
  fallback = "resultado"
) {
  const normalized = String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  let identifier = normalized || fallback;

  if (!/^[A-Za-z_]/.test(identifier)) {
    identifier = `_${identifier}`;
  }

  return identifier.slice(0, 80);
}


export function extractIdentifiers(expression) {
  const normalized = normalizeExpression(expression);
  const matches = normalized.match(IDENTIFIER_GLOBAL_PATTERN) || [];
  const identifiers = [];
  const seen = new Set();

  for (const identifier of matches) {
    if (RESERVED_IDENTIFIERS.has(identifier)) {
      throw new GraphModelError(
        `“${identifier}” é uma palavra reservada e não pode ser usada como variável.`,
        "reserved_identifier"
      );
    }

    if (!seen.has(identifier)) {
      seen.add(identifier);
      identifiers.push(identifier);
    }
  }

  return identifiers;
}


export function parseFormulaDefinition(formulaText) {
  const normalized = normalizeExpression(formulaText);

  if (!normalized) {
    throw new GraphModelError(
      "Digite uma fórmula.",
      "empty_formula"
    );
  }

  const equalsMatches = normalized.match(/=/g) || [];

  if (equalsMatches.length > 1) {
    throw new GraphModelError(
      "Use apenas um sinal de igual para definir a saída da fórmula.",
      "multiple_assignments"
    );
  }

  let outputLabel = "Resultado";
  let expression = normalized;

  if (equalsMatches.length === 1) {
    const equalsIndex = normalized.indexOf("=");
    const left = normalized.slice(0, equalsIndex).trim();
    const right = normalized.slice(equalsIndex + 1).trim();

    if (!IDENTIFIER_PATTERN.test(left)) {
      throw new GraphModelError(
        "O nome antes do sinal de igual deve usar apenas letras, números e sublinhado, sem começar por número.",
        "invalid_output_identifier"
      );
    }

    if (RESERVED_IDENTIFIERS.has(left)) {
      throw new GraphModelError(
        `“${left}” é uma palavra reservada e não pode ser usada como saída.`,
        "reserved_output_identifier"
      );
    }

    if (!right) {
      throw new GraphModelError(
        "A expressão depois do sinal de igual está vazia.",
        "empty_expression"
      );
    }

    outputLabel = left;
    expression = right;
  }

  const inputs = extractIdentifiers(expression)
    .map(identifier => ({
      id: identifier,
      name: identifier
    }));

  return {
    expression,
    output: {
      id: identifierFromLabel(outputLabel),
      name: outputLabel
    },
    inputs
  };
}


export function createGraphPayload(state) {
  return {
    nodes: state.nodes.map(node => {
      if (node.type === "variable") {
        return {
          id: node.id,
          type: "variable",
          name: node.name,
          value: normalizeExpression(node.value),
          output: {
            id: node.output.id,
            name: node.output.name
          }
        };
      }

      return {
        id: node.id,
        type: "formula",
        name: node.name,
        expression: node.expression,
        inputs: node.inputs.map(input => ({
          id: input.id,
          name: input.name
        })),
        output: {
          id: node.output.id,
          name: node.output.name
        }
      };
    }),
    connections: state.connections.map(connection => ({
      id: connection.id,
      from_node: connection.fromNode,
      from_port: connection.fromPort,
      to_node: connection.toNode,
      to_port: connection.toPort
    }))
  };
}


function validPosition(value, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(-3000, Math.min(9000, number));
}


function sanitizeNode(node, index) {
  if (!node || typeof node !== "object") {
    return null;
  }

  const id =
    typeof node.id === "string" &&
    /^[A-Za-z0-9_-]{1,80}$/.test(node.id)
      ? node.id
      : createId("node");

  const x = validPosition(node.x, 240 + index * 36);
  const y = validPosition(node.y, 180 + index * 36);

  if (node.type === "variable") {
    return {
      id,
      type: "variable",
      name: String(node.name || "Variável").slice(0, 80),
      value: String(node.value ?? "0").slice(0, 200),
      output: {
        id: "value",
        name: "Valor"
      },
      x,
      y,
      status: "idle",
      result: null,
      error: null
    };
  }

  if (node.type === "formula") {
    const inputs = Array.isArray(node.inputs)
      ? node.inputs
          .filter(input =>
            input &&
            typeof input.id === "string" &&
            IDENTIFIER_PATTERN.test(input.id)
          )
          .slice(0, 50)
          .map(input => ({
            id: input.id,
            name: String(input.name || input.id).slice(0, 80)
          }))
      : [];

    return {
      id,
      type: "formula",
      name: String(node.name || "Fórmula").slice(0, 80),
      expression: normalizeExpression(node.expression).slice(0, 500),
      inputs,
      output: {
        id: identifierFromLabel(node.output?.id || node.output?.name),
        name: String(node.output?.name || "Resultado").slice(0, 80)
      },
      x,
      y,
      status: "idle",
      result: null,
      error: null
    };
  }

  return null;
}


export function sanitizeLoadedGraph(value) {
  const source =
    value && typeof value === "object"
      ? value
      : {};

  const nodes = Array.isArray(source.nodes)
    ? source.nodes
        .slice(0, 200)
        .map(sanitizeNode)
        .filter(Boolean)
    : [];

  const nodeMap = new Map(
    nodes.map(node => [node.id, node])
  );

  const connections = Array.isArray(source.connections)
    ? source.connections
        .slice(0, 500)
        .filter(connection => {
          if (!connection || typeof connection !== "object") {
            return false;
          }

          const sourceNode = nodeMap.get(connection.fromNode);
          const targetNode = nodeMap.get(connection.toNode);

          if (!sourceNode || !targetNode || targetNode.type !== "formula") {
            return false;
          }

          const validSource =
            sourceNode.output.id === connection.fromPort;

          const validTarget =
            targetNode.inputs.some(
              input => input.id === connection.toPort
            );

          return validSource && validTarget;
        })
        .map(connection => ({
          id:
            typeof connection.id === "string" &&
            /^[A-Za-z0-9_-]{1,80}$/.test(connection.id)
              ? connection.id
              : createId("connection"),
          fromNode: connection.fromNode,
          fromPort: connection.fromPort,
          toNode: connection.toNode,
          toPort: connection.toPort
        }))
    : [];

  const uniqueInputConnections = [];
  const occupiedInputs = new Set();

  for (const connection of connections) {
    const key = `${connection.toNode}:${connection.toPort}`;

    if (!occupiedInputs.has(key)) {
      occupiedInputs.add(key);
      uniqueInputConnections.push(connection);
    }
  }

  const viewport = {
    x: validPosition(source.viewport?.x, 0),
    y: validPosition(source.viewport?.y, 0),
    scale: Math.max(
      0.35,
      Math.min(2, Number(source.viewport?.scale) || 1)
    )
  };

  return {
    version: 1,
    nodes,
    connections: uniqueInputConnections,
    viewport
  };
}
