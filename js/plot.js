import {
  calculatePlot
} from "./api.js?v=3";
import {
  createId,
  extractIdentifiers,
  normalizeExpression
} from "./graph-model.js?v=2";
const PLOT_STORAGE_KEY =
  "atero-calc-plot-v1";
const MAX_EXPRESSIONS = 8;
const MIN_SPAN = 1e-9;
const MAX_SPAN = 1e12;
const SERIES_COLORS = [
  "#2f6fed",
  "#0f9fa4",
  "#7c3aed",
  "#e2556f",
  "#d88800",
  "#26905c",
  "#c43c94",
  "#526071"
];
function defaultState() {
  return {
    version: 1,
    expressions: [
      {
        id: createId("plot"),
        expression: "sin(x)",
        visible: true,
        projection: "real",
        colorIndex: 0
      }
    ],
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
  const fallback = defaultState().viewport;
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
  const fallback = defaultState();
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
    version: 1,
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
function loadState() {
  try {
    return sanitizeState(
      JSON.parse(
        localStorage.getItem(PLOT_STORAGE_KEY) || "null"
      )
    );
  } catch {
    return defaultState();
  }
}
function saveState(state) {
  try {
    localStorage.setItem(
      PLOT_STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch {
    // O Graph continua funcionando mesmo sem armazenamento local.
  }
}
function expressionBody(value) {
  const normalized = normalizeExpression(value);
  const equalsIndex = normalized.indexOf("=");
  return equalsIndex >= 0
    ? normalized.slice(equalsIndex + 1).trim()
    : normalized;
}
function detectedParameters(expression) {
  if (!expression.trim()) {
    return [];
  }
  return extractIdentifiers(
    expressionBody(expression)
  ).filter(identifier => identifier !== "x");
}
function niceStep(span, targetLines = 9) {
  const rough = span / targetLines;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  if (fraction <= 1) {
    return power;
  }
  if (fraction <= 2) {
    return 2 * power;
  }
  if (fraction <= 5) {
    return 5 * power;
  }
  return 10 * power;
}
function formatAxisValue(value, step) {
  if (Math.abs(value) < step * 1e-8) {
    return "0";
  }
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-4) {
    return value.toExponential(3).replace("+", "");
  }
  const decimals = Math.max(
    0,
    Math.min(8, -Math.floor(Math.log10(step)) + 1)
  );
  return Number(value.toFixed(decimals)).toString();
}
function clampSpan(span) {
  return Math.max(
    MIN_SPAN,
    Math.min(MAX_SPAN, span)
  );
}
export function iniciarGraph() {
  const root = document.querySelector("#plot-view");
  if (!root) {
    return null;
  }
  const canvas = document.querySelector("#plot-canvas");
  const context = canvas.getContext("2d");
  const expressionList = document.querySelector("#plot-expression-list");
  const parameterList = document.querySelector("#plot-parameter-list");
  const parameterSection = document.querySelector("#plot-parameters");
  const addButton = document.querySelector("#add-plot-expression-button");
  const resetButton = document.querySelector("#reset-plot-view-button");
  const angleModeSelect = document.querySelector("#plot-angle-mode");
  const gridToggle = document.querySelector("#plot-grid-toggle");
  const status = document.querySelector("#plot-status");
  const coordinateReadout = document.querySelector("#plot-coordinate-readout");
  const functionCount = document.querySelector("#plot-function-count");
  const state = loadState();
  let resultsById = new Map();
  let errorsById = new Map();
  let requestTimer = null;
  let saveTimer = null;
  let requestVersion = 0;
  let plotting = false;
  let panState = null;
  function persistSoon() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(
      () => saveState(state),
      100
    );
  }
  function setStatus(message, kind = "idle") {
    status.textContent = message;
    status.dataset.status = kind;
  }
  function usedParameterNames() {
    const names = new Set();
    for (const item of state.expressions) {
      if (!item.visible || !item.expression.trim()) {
        continue;
      }
      try {
        for (const name of detectedParameters(item.expression)) {
          names.add(name);
        }
      } catch {
        // O erro específico aparece ao lado da função.
      }
    }
    return [...names].sort((left, right) =>
      left.localeCompare(right, "pt-BR")
    );
  }
  function ensureParameters() {
    for (const name of usedParameterNames()) {
      const current = state.parameters[name];
      if (!current || typeof current !== "object") {
        state.parameters[name] = {
          value: 1,
          minimum: -10,
          maximum: 10,
          step: 0.1
        };
      }
    }
  }
  function renderParameters() {
    ensureParameters();
    const names = usedParameterNames();
    parameterList.replaceChildren();
    parameterSection.hidden = names.length === 0;
    for (const name of names) {
      const parameter = state.parameters[name];
      const row = document.createElement("label");
      row.className = "plot-parameter-row";
      row.dataset.parameterName = name;
      const header = document.createElement("span");
      header.className = "plot-parameter-header";
      const label = document.createElement("strong");
      label.textContent = name;
      const number = document.createElement("input");
      number.className = "plot-parameter-number";
      number.type = "number";
      number.step = "any";
      number.value = String(parameter.value);
      number.setAttribute("aria-label", `Valor de ${name}`);
      const slider = document.createElement("input");
      slider.className = "plot-parameter-slider";
      slider.type = "range";
      slider.min = String(parameter.minimum);
      slider.max = String(parameter.maximum);
      slider.step = String(parameter.step);
      slider.value = String(parameter.value);
      slider.setAttribute("aria-label", `Ajustar ${name}`);
      header.append(label, number);
      row.append(header, slider);
      parameterList.append(row);
    }
  }
  function setExpressionError(id, message = "") {
    const row = expressionList.querySelector(
      `[data-plot-expression-id="${CSS.escape(id)}"]`
    );
    const error = row?.querySelector(".plot-expression-error");
    if (!error) {
      return;
    }
    error.textContent = message;
    error.hidden = !message;
    row.classList.toggle("has-error", Boolean(message));
  }
  function renderExpressions() {
    expressionList.replaceChildren();
    for (const [index, item] of state.expressions.entries()) {
      const row = document.createElement("article");
      row.className = "plot-expression-row";
      row.dataset.plotExpressionId = item.id;
      const main = document.createElement("div");
      main.className = "plot-expression-main";
      const visibility = document.createElement("button");
      visibility.className = "plot-visibility-button";
      visibility.type = "button";
      visibility.dataset.plotAction = "visibility";
      visibility.title = item.visible
        ? "Ocultar função"
        : "Mostrar função";
      visibility.setAttribute(
        "aria-pressed",
        String(item.visible)
      );
      visibility.style.setProperty(
        "--series-color",
        SERIES_COLORS[item.colorIndex]
      );
      const number = document.createElement("span");
      number.className = "plot-expression-number";
      number.textContent = String(index + 1);
      const input = document.createElement("input");
      input.className = "plot-expression-input";
      input.type = "text";
      input.value = item.expression;
      input.placeholder = "Ex.: sin(x)";
      input.maxLength = 500;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.dataset.plotField = "expression";
      input.setAttribute(
        "aria-label",
        `Função ${index + 1}`
      );
      const projection = document.createElement("select");
      projection.className = "plot-projection-select";
      projection.dataset.plotField = "projection";
      projection.title = "Componente complexa exibida";
      projection.setAttribute(
        "aria-label",
        `Projeção da função ${index + 1}`
      );
      for (const [value, label] of [
        ["real", "Re"],
        ["imag", "Im"],
        ["magnitude", "|z|"],
        ["phase", "Arg"]
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = item.projection === value;
        projection.append(option);
      }
      const remove = document.createElement("button");
      remove.className = "plot-remove-button";
      remove.type = "button";
      remove.dataset.plotAction = "remove";
      remove.textContent = "×";
      remove.title = "Remover função";
      remove.setAttribute(
        "aria-label",
        `Remover função ${index + 1}`
      );
      const error = document.createElement("p");
      error.className = "plot-expression-error";
      error.hidden = true;
      main.append(
        visibility,
        number,
        input,
        projection,
        remove
      );
      row.append(main, error);
      expressionList.append(row);
      setExpressionError(
        item.id,
        errorsById.get(item.id) || ""
      );
    }
    functionCount.textContent = String(
      state.expressions.filter(item => item.visible).length
    );
    addButton.disabled =
      state.expressions.length >= MAX_EXPRESSIONS;
  }
  function addExpression() {
    if (state.expressions.length >= MAX_EXPRESSIONS) {
      setStatus(
        `O Graph aceita no máximo ${MAX_EXPRESSIONS} funções por vez.`,
        "error"
      );
      return;
    }
    const usedColors = new Set(
      state.expressions.map(item => item.colorIndex)
    );
    const colorIndex =
      [...Array(SERIES_COLORS.length).keys()]
        .find(index => !usedColors.has(index)) ??
      state.expressions.length % SERIES_COLORS.length;
    const item = {
      id: createId("plot"),
      expression: "",
      visible: true,
      projection: "real",
      colorIndex
    };
    state.expressions.push(item);
    renderExpressions();
    renderParameters();
    persistSoon();
    window.requestAnimationFrame(() => {
      expressionList
        .querySelector(
          `[data-plot-expression-id="${CSS.escape(item.id)}"] .plot-expression-input`
        )
        ?.focus();
    });
  }
  function removeExpression(id) {
    if (state.expressions.length === 1) {
      const item = state.expressions[0];
      item.expression = "";
      item.visible = true;
      resultsById.clear();
      errorsById.clear();
    } else {
      state.expressions = state.expressions.filter(
        item => item.id !== id
      );
      resultsById.delete(id);
      errorsById.delete(id);
    }
    renderExpressions();
    renderParameters();
    draw();
    schedulePlot();
    persistSoon();
  }
  function expressionPayload() {
    errorsById.clear();
    const expressions = [];
    for (const item of state.expressions) {
      if (!item.visible || !item.expression.trim()) {
        continue;
      }
      try {
        detectedParameters(item.expression);
      } catch (error) {
        errorsById.set(
          item.id,
          error?.message || "A função não é válida."
        );
        continue;
      }
      expressions.push({
        id: item.id,
        expression: normalizeExpression(item.expression),
        projection: item.projection
      });
    }
    return expressions;
  }
  function parameterPayload() {
    const payload = {};
    for (const name of usedParameterNames()) {
      payload[name] = String(
        state.parameters[name]?.value ?? 1
      );
    }
    return payload;
  }
  function sampleCount(expressionCount) {
    const width = Math.max(400, canvas.clientWidth || 800);
    const preferred = Math.max(
      500,
      Math.min(1800, Math.round(width * 1.4))
    );
    return Math.max(
      200,
      Math.min(
        preferred,
        Math.floor(12000 / Math.max(1, expressionCount))
      )
    );
  }
  function schedulePlot(delay = 220) {
    window.clearTimeout(requestTimer);
    requestTimer = window.setTimeout(
      requestPlot,
      delay
    );
  }
  async function requestPlot() {
    const expressions = expressionPayload();
    for (const item of state.expressions) {
      setExpressionError(
        item.id,
        errorsById.get(item.id) || ""
      );
    }
    renderParameters();
    if (expressions.length === 0) {
      resultsById.clear();
      draw();
      setStatus(
        errorsById.size > 0
          ? "Revise as funções marcadas."
          : "Digite uma função para começar.",
        errorsById.size > 0 ? "error" : "idle"
      );
      return;
    }
    plotting = true;
    const version = ++requestVersion;
    setStatus("Calculando curvas...", "loading");
    try {
      const response = await calculatePlot({
        expressions,
        viewport: {
          x_min: state.viewport.xMin,
          x_max: state.viewport.xMax,
          y_min: state.viewport.yMin,
          y_max: state.viewport.yMax
        },
        samples: sampleCount(expressions.length),
        parameters: parameterPayload(),
        angle_mode: state.angleMode
      });
      if (version !== requestVersion) {
        return;
      }
      resultsById = new Map(
        response.plots.map(plot => [plot.id, plot])
      );
      errorsById = new Map(
        response.plots
          .filter(plot => plot.error)
          .map(plot => [plot.id, plot.error])
      );
      for (const item of state.expressions) {
        setExpressionError(
          item.id,
          errorsById.get(item.id) || ""
        );
      }
      draw();
      const successful = response.plots.filter(
        plot => plot.point_count > 0
      ).length;
      setStatus(
        successful > 0
          ? `${successful} ${successful === 1 ? "curva calculada" : "curvas calculadas"}.`
          : "Nenhuma curva pôde ser desenhada.",
        successful > 0 ? "success" : "error"
      );
    } catch (error) {
      if (version !== requestVersion) {
        return;
      }
      setStatus(
        error?.message || "Não foi possível calcular o gráfico.",
        "error"
      );
    } finally {
      if (version === requestVersion) {
        plotting = false;
      }
    }
  }
  function canvasMetrics() {
    const rectangle = canvas.getBoundingClientRect();
    const width = Math.max(1, rectangle.width);
    const height = Math.max(1, rectangle.height);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (
      canvas.width !== pixelWidth ||
      canvas.height !== pixelHeight
    ) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }
  function mathToScreen(x, y, width, height) {
    const { xMin, xMax, yMin, yMax } = state.viewport;
    return {
      x: (x - xMin) / (xMax - xMin) * width,
      y: (yMax - y) / (yMax - yMin) * height
    };
  }
  function screenToMath(x, y, width, height) {
    const { xMin, xMax, yMin, yMax } = state.viewport;
    return {
      x: xMin + x / width * (xMax - xMin),
      y: yMax - y / height * (yMax - yMin)
    };
  }
  function drawGrid(width, height) {
    const { xMin, xMax, yMin, yMax } = state.viewport;
    const xStep = niceStep(xMax - xMin);
    const yStep = niceStep(yMax - yMin);
    context.save();
    context.lineWidth = 1;
    context.font = "11px Inter, system-ui, sans-serif";
    context.textBaseline = "top";
    if (state.showGrid) {
      context.strokeStyle = "rgba(47, 66, 91, 0.10)";
      context.fillStyle = "rgba(65, 78, 96, 0.72)";
      const firstX = Math.ceil(xMin / xStep) * xStep;
      for (
        let value = firstX, guard = 0;
        value <= xMax + xStep * 0.25 && guard < 200;
        value += xStep, guard += 1
      ) {
        const point = mathToScreen(value, 0, width, height);
        context.beginPath();
        context.moveTo(point.x, 0);
        context.lineTo(point.x, height);
        context.stroke();
        if (Math.abs(value) > xStep * 1e-8) {
          context.fillText(
            formatAxisValue(value, xStep),
            point.x + 4,
            Math.min(height - 17, Math.max(4,
              mathToScreen(0, 0, width, height).y + 5
            ))
          );
        }
      }
      const firstY = Math.ceil(yMin / yStep) * yStep;
      for (
        let value = firstY, guard = 0;
        value <= yMax + yStep * 0.25 && guard < 200;
        value += yStep, guard += 1
      ) {
        const point = mathToScreen(0, value, width, height);
        context.beginPath();
        context.moveTo(0, point.y);
        context.lineTo(width, point.y);
        context.stroke();
        if (Math.abs(value) > yStep * 1e-8) {
          context.fillText(
            formatAxisValue(value, yStep),
            Math.min(width - 58, Math.max(5,
              mathToScreen(0, 0, width, height).x + 6
            )),
            point.y + 4
          );
        }
      }
    }
    const origin = mathToScreen(0, 0, width, height);
    context.strokeStyle = "rgba(28, 41, 60, 0.52)";
    context.lineWidth = 1.25;
    if (origin.x >= 0 && origin.x <= width) {
      context.beginPath();
      context.moveTo(origin.x, 0);
      context.lineTo(origin.x, height);
      context.stroke();
    }
    if (origin.y >= 0 && origin.y <= height) {
      context.beginPath();
      context.moveTo(0, origin.y);
      context.lineTo(width, origin.y);
      context.stroke();
    }
    context.restore();
  }
  function drawCurves(width, height) {
    context.save();
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();
    context.lineJoin = "round";
    context.lineCap = "round";
    context.lineWidth = 2.35;
    for (const item of state.expressions) {
      if (!item.visible) {
        continue;
      }
      const plot = resultsById.get(item.id);
      if (!plot || !Array.isArray(plot.segments)) {
        continue;
      }
      context.strokeStyle =
        SERIES_COLORS[item.colorIndex];
      for (const segment of plot.segments) {
        if (!Array.isArray(segment) || segment.length === 0) {
          continue;
        }
        context.beginPath();
        for (const [index, point] of segment.entries()) {
          const screen = mathToScreen(
            point.x,
            point.y,
            width,
            height
          );
          if (index === 0) {
            context.moveTo(screen.x, screen.y);
          } else {
            context.lineTo(screen.x, screen.y);
          }
        }
        if (segment.length === 1) {
          const screen = mathToScreen(
            segment[0].x,
            segment[0].y,
            width,
            height
          );
          context.arc(screen.x, screen.y, 2.5, 0, Math.PI * 2);
          context.fillStyle = SERIES_COLORS[item.colorIndex];
          context.fill();
        } else {
          context.stroke();
        }
      }
    }
    context.restore();
  }
  function draw() {
    const { width, height } = canvasMetrics();
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    drawGrid(width, height);
    drawCurves(width, height);
  }
  function resetViewport() {
    state.viewport = {
      xMin: -10,
      xMax: 10,
      yMin: -6,
      yMax: 6
    };
    draw();
    schedulePlot(60);
    persistSoon();
  }
  expressionList.addEventListener("input", event => {
    const row = event.target.closest("[data-plot-expression-id]");
    const item = state.expressions.find(
      candidate => candidate.id === row?.dataset.plotExpressionId
    );
    if (!item) {
      return;
    }
    if (event.target.matches("[data-plot-field='expression']")) {
      item.expression = event.target.value;
      errorsById.delete(item.id);
      renderParameters();
      schedulePlot();
      persistSoon();
    }
  });
  expressionList.addEventListener("change", event => {
    const row = event.target.closest("[data-plot-expression-id]");
    const item = state.expressions.find(
      candidate => candidate.id === row?.dataset.plotExpressionId
    );
    if (!item) {
      return;
    }
    if (event.target.matches("[data-plot-field='projection']")) {
      item.projection = event.target.value;
      schedulePlot(80);
      persistSoon();
    }
  });
  expressionList.addEventListener("click", event => {
    const action = event.target.closest("[data-plot-action]");
    const row = action?.closest("[data-plot-expression-id]");
    const item = state.expressions.find(
      candidate => candidate.id === row?.dataset.plotExpressionId
    );
    if (!action || !item) {
      return;
    }
    if (action.dataset.plotAction === "remove") {
      removeExpression(item.id);
      return;
    }
    if (action.dataset.plotAction === "visibility") {
      item.visible = !item.visible;
      renderExpressions();
      renderParameters();
      draw();
      schedulePlot(80);
      persistSoon();
    }
  });
  parameterList.addEventListener("input", event => {
    const row = event.target.closest("[data-parameter-name]");
    const name = row?.dataset.parameterName;
    const parameter = state.parameters[name];
    if (!name || !parameter) {
      return;
    }
    const value = finiteNumber(event.target.value, parameter.value);
    parameter.value = value;
    const number = row.querySelector(".plot-parameter-number");
    const slider = row.querySelector(".plot-parameter-slider");
    if (event.target !== number) {
      number.value = String(value);
    }
    if (
      event.target !== slider &&
      value >= Number(slider.min) &&
      value <= Number(slider.max)
    ) {
      slider.value = String(value);
    }
    schedulePlot(80);
    persistSoon();
  });
  addButton.addEventListener("click", addExpression);
  resetButton.addEventListener("click", resetViewport);
  angleModeSelect.value = state.angleMode;
  angleModeSelect.addEventListener("change", () => {
    state.angleMode = angleModeSelect.value;
    schedulePlot(80);
    persistSoon();
  });
  gridToggle.checked = state.showGrid;
  gridToggle.addEventListener("change", () => {
    state.showGrid = gridToggle.checked;
    draw();
    persistSoon();
  });
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) {
      return;
    }
    const rectangle = canvas.getBoundingClientRect();
    panState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rectangle.width,
      height: rectangle.height,
      viewport: { ...state.viewport }
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-panning");
  });
  canvas.addEventListener("pointermove", event => {
    const rectangle = canvas.getBoundingClientRect();
    const localX = event.clientX - rectangle.left;
    const localY = event.clientY - rectangle.top;
    const point = screenToMath(
      localX,
      localY,
      rectangle.width,
      rectangle.height
    );
    coordinateReadout.textContent =
      `x ${formatAxisValue(point.x, (state.viewport.xMax - state.viewport.xMin) / 100)}  ·  ` +
      `y ${formatAxisValue(point.y, (state.viewport.yMax - state.viewport.yMin) / 100)}`;
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - panState.startX;
    const deltaY = event.clientY - panState.startY;
    const xSpan =
      panState.viewport.xMax - panState.viewport.xMin;
    const ySpan =
      panState.viewport.yMax - panState.viewport.yMin;
    const xShift = -deltaX / panState.width * xSpan;
    const yShift = deltaY / panState.height * ySpan;
    state.viewport = {
      xMin: panState.viewport.xMin + xShift,
      xMax: panState.viewport.xMax + xShift,
      yMin: panState.viewport.yMin + yShift,
      yMax: panState.viewport.yMax + yShift
    };
    draw();
  });
  function endPan(event) {
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }
    panState = null;
    canvas.classList.remove("is-panning");
    schedulePlot(70);
    persistSoon();
  }
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);
  canvas.addEventListener("pointerleave", () => {
    if (!panState) {
      coordinateReadout.textContent = "Mova o cursor sobre o plano";
    }
  });
  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      const rectangle = canvas.getBoundingClientRect();
      const localX = event.clientX - rectangle.left;
      const localY = event.clientY - rectangle.top;
      const anchor = screenToMath(
        localX,
        localY,
        rectangle.width,
        rectangle.height
      );
      const factor = Math.exp(event.deltaY * 0.0015);
      const oldXSpan = state.viewport.xMax - state.viewport.xMin;
      const oldYSpan = state.viewport.yMax - state.viewport.yMin;
      const newXSpan = clampSpan(oldXSpan * factor);
      const newYSpan = clampSpan(oldYSpan * factor);
      const xRatio = localX / rectangle.width;
      const yRatio = localY / rectangle.height;
      state.viewport.xMin = anchor.x - xRatio * newXSpan;
      state.viewport.xMax = state.viewport.xMin + newXSpan;
      state.viewport.yMax = anchor.y + yRatio * newYSpan;
      state.viewport.yMin = state.viewport.yMax - newYSpan;
      draw();
      schedulePlot(120);
      persistSoon();
    },
    { passive: false }
  );
  canvas.addEventListener("dblclick", resetViewport);
  const resizeObserver = new ResizeObserver(() => {
    draw();
    if (!root.hidden) {
      schedulePlot(120);
    }
  });
  resizeObserver.observe(canvas);
  renderExpressions();
  renderParameters();
  draw();
  if (!root.hidden) {
    schedulePlot(20);
  }
  return {
    refresh() {
      draw();
      if (!plotting) {
        schedulePlot(40);
      }
    },
    reset: resetViewport
  };
}
