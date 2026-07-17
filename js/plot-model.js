import {
  createId,
  extractIdentifiers,
  normalizeExpression
} from "./graph-model.js?v=2";


export const PLOT_STORAGE_KEY = "atero-calc-plot-v2";
export const MAX_EXPRESSIONS = 8;
export const MIN_SPAN = 1e-9;
export const MAX_SPAN = 1e12;

export const SERIES_COLORS = [
  "#2f6fed",
  "#0f9fa4",
  "#7c3aed",
  "#e2556f",
  "#d88800",
  "#26905c",
  "#c43c94",
  "#526071"
];

const EXPLICIT_ASSIGNMENT_PATTERN =
  /^(?:y|[A-Za-z_][A-Za-z0-9_]*\s*\(\s*x\s*\))$/;


export function createPlotItem(index = 0) {
  return {
    id: createId("plot"),
    expression: index === 0 ? "sin(x)" : "",
    visible: true,
    projection: "real",
    colorIndex: index % SERIES_COLORS.length
  };
}


export function defaultPlotState() {
  return {
    version: 2,
    expressions: [createPlotItem(0)],
    parameters: {},
    angleMode: "radians",
    showGrid: true,
    viewport: {
      xMin: -10,
      xMax: 10,
      yMin: -6,
      yMax: 6
    }
  };
}


function finiteNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function sanitizeViewport(value) {
  const fallback = defaultPlotState().viewport;
  let xMin = finiteNumber(value?.xMin, fallback.xMin);
  let xMax = finiteNumber(value?.xMax, fallback.xMax);
  let yMin = finiteNumber(value?.yMin, fallback.yMin);
  let yMax = finiteNumber(value?.yMax, fallback.yMax);

  if (
    xMin >= xMax ||
    xMax - xMin < MIN_SPAN ||
    xMax - xMin > MAX_SPAN
  ) {
    xMin = fallback.xMin;
    xMax = fallback.xMax;
  }

  if (
    yMin >= yMax ||
    yMax - yMin < MIN_SPAN ||
    yMax - yMin > MAX_SPAN
  ) {
    yMin = fallback.yMin;
    yMax = fallback.yMax;
  }

  return { xMin, xMax, yMin, yMax };
}


function sanitizeState(value) {
  const fallback = defaultPlotState();

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const expressions = Array.isArray(value.expressions)
    ? value.expressions
        .slice(0, MAX_EXPRESSIONS)
        .filter(item => item && typeof item === "object")
        .map((item, index) => ({
          id:
            typeof item.id === "string" &&
            /^[A-Za-z0-9_-]{1,80}$/.test(item.id)
              ? item.id
              : createId("plot"),
          expression: String(item.expression || "").slice(0, 500),
          visible: item.visible !== false,
          projection:
            ["real", "imag", "magnitude", "phase"].includes(
              item.projection
            )
              ? item.projection
              : "real",
          colorIndex:
            Number.isInteger(item.colorIndex)
              ? Math.abs(item.colorIndex) % SERIES_COLORS.length
              : index % SERIES_COLORS.length
        }))
    : [];

  return {
    version: 2,
    expressions:
      expressions.length > 0
        ? expressions
        : fallback.expressions,
    parameters:
      value.parameters && typeof value.parameters === "object"
        ? value.parameters
        : {},
    angleMode:
      value.angleMode === "degrees"
        ? "degrees"
        : "radians",
    showGrid: value.showGrid !== false,
    viewport: sanitizeViewport(value.viewport)
  };
}


export function loadPlotState() {
  try {
    const current = localStorage.getItem(PLOT_STORAGE_KEY);
    const legacy = localStorage.getItem("atero-calc-plot-v1");

    return sanitizeState(
      JSON.parse(current || legacy || "null")
    );
  } catch {
    return defaultPlotState();
  }
}


export function savePlotState(state) {
  try {
    localStorage.setItem(
      PLOT_STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch {
    // O Graph continua funcionando sem armazenamento local.
  }
}


export function normalizedPlotExpression(value) {
  return normalizeExpression(value)
    .replaceAll("²", "^2")
    .replaceAll("³", "^3");
}


export function expressionMode(value) {
  const expression = normalizedPlotExpression(value).trim();

  if (!expression) {
    return "explicit";
  }

  if (expression.includes("=")) {
    const pieces = expression.split("=");
    const left = pieces[0]?.trim() || "";
    const right = pieces[1] || "";

    if (
      pieces.length === 2 &&
      EXPLICIT_ASSIGNMENT_PATTERN.test(left)
    ) {
      return /\by\b/.test(right)
        ? "implicit"
        : "explicit";
    }

    return "implicit";
  }

  return /\by\b/.test(expression)
    ? "implicit"
    : "explicit";
}


function identifierSource(expression) {
  const normalized = normalizedPlotExpression(expression);

  if (expressionMode(normalized) === "implicit") {
    return normalized;
  }

  const equalsIndex = normalized.indexOf("=");

  return equalsIndex >= 0
    ? normalized.slice(equalsIndex + 1).trim()
    : normalized;
}


export function detectedParameters(expression) {
  if (!expression.trim()) {
    return [];
  }

  return extractIdentifiers(
    identifierSource(expression)
  ).filter(identifier =>
    identifier !== "x" &&
    identifier !== "y"
  );
}


export function clampSpan(span) {
  return Math.max(
    MIN_SPAN,
    Math.min(MAX_SPAN, span)
  );
}
