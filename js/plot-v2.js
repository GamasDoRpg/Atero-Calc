import {
  calculatePlot
} from "./api.js?v=5";

import {
  MAX_EXPRESSIONS,
  SERIES_COLORS,
  createPlotItem,
  detectedParameters,
  expressionMode,
  loadPlotState,
  normalizedPlotExpression,
  savePlotState
} from "./plot-model.js?v=2";

import {
  PlotRenderer,
  formatAxisValue
} from "./plot-renderer.js?v=2";


const TYPE_DEBOUNCE_MS = 520;
const PARAMETER_DEBOUNCE_MS = 280;
const ZOOM_DEBOUNCE_MS = 340;
const PAN_DEBOUNCE_MS = 180;


export function iniciarGraph() {
  const root = document.querySelector("#plot-view");

  if (!root) {
    return null;
  }

  const canvas = document.querySelector("#plot-canvas");
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

  const state = loadPlotState();
  const renderer = new PlotRenderer(canvas, state);
  let resultsById = new Map();
  let errorsById = new Map();
  let requestTimer = null;
  let parameterTimer = null;
  let saveTimer = null;
  let requestVersion = 0;
  let plotAbortController = null;
  let plotting = false;
  let panState = null;
  let composingExpression = false;
  let parameterSignature = "";


  function persistSoon() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(
      () => savePlotState(state),
      120
    );
  }


  function setStatus(message, kind = "idle") {
    status.textContent = message;
    status.dataset.status = kind;
  }


  function cancelActivePlot() {
    if (plotAbortController) {
      plotAbortController.abort();
      plotAbortController = null;
    }
  }


  function schedulePlot(delay = TYPE_DEBOUNCE_MS) {
    window.clearTimeout(requestTimer);
    cancelActivePlot();
    requestTimer = window.setTimeout(
      requestPlot,
      delay
    );
  }


  function scheduleParameterSync(delay = PARAMETER_DEBOUNCE_MS) {
    window.clearTimeout(parameterTimer);
    parameterTimer = window.setTimeout(
      () => {
        if (!isEditingExpression()) {
          syncParameterControls();
        }
      },
      delay
    );
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
        // O erro específico é exibido na própria expressão.
      }
    }

    return [...names].sort((left, right) =>
      left.localeCompare(right, "pt-BR")
    );
  }


  function ensureParameters(names) {
    for (const name of names) {
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


  function isEditingExpression() {
    return document.activeElement?.matches?.(
      "[data-plot-field='expression']"
    ) === true;
  }


  function syncParameterControls({
    force = false,
    allowWhileEditing = false
  } = {}) {
    const names = usedParameterNames();
    const signature = names.join("\u0000");
    ensureParameters(names);

    if (!allowWhileEditing && isEditingExpression()) {
      return;
    }

    if (!force && signature === parameterSignature) {
      return;
    }

    parameterSignature = signature;
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

    if (!row || !error) {
      return;
    }

    error.textContent = message;
    error.hidden = !message;
    row.classList.toggle("has-error", Boolean(message));
  }


  function updateExpressionMode(id) {
    const item = state.expressions.find(candidate => candidate.id === id);
    const row = expressionList.querySelector(
      `[data-plot-expression-id="${CSS.escape(id)}"]`
    );

    if (!item || !row) {
      return;
    }

    const mode = expressionMode(item.expression);
    row.dataset.plotMode = mode;
    row.title = mode === "implicit"
      ? "Equação implícita: o contorno F(x, y) = 0 será desenhado."
      : "Função cartesiana: y = f(x).";
  }


  function updateFunctionCount() {
    functionCount.textContent = String(
      state.expressions.filter(item => item.visible).length
    );
    addButton.disabled =
      state.expressions.length >= MAX_EXPRESSIONS;
  }


  function createExpressionRow(item, index) {
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
      ? "Ocultar expressão"
      : "Mostrar expressão";
    visibility.setAttribute("aria-pressed", String(item.visible));
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
    input.placeholder = "Ex.: sin(x) ou x^2 + y^2 = 25";
    input.maxLength = 500;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dataset.plotField = "expression";
    input.setAttribute("aria-label", `Expressão ${index + 1}`);

    const projection = document.createElement("select");
    projection.className = "plot-projection-select";
    projection.dataset.plotField = "projection";
    projection.title = "Componente complexa exibida";
    projection.setAttribute(
      "aria-label",
      `Projeção da expressão ${index + 1}`
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
    remove.title = "Remover expressão";
    remove.setAttribute(
      "aria-label",
      `Remover expressão ${index + 1}`
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

    return row;
  }


  function renderExpressions() {
    expressionList.replaceChildren();

    for (const [index, item] of state.expressions.entries()) {
      expressionList.append(createExpressionRow(item, index));
      updateExpressionMode(item.id);
      setExpressionError(
        item.id,
        errorsById.get(item.id) || ""
      );
    }

    updateFunctionCount();
  }


  function addExpression() {
    if (state.expressions.length >= MAX_EXPRESSIONS) {
      setStatus(
        `O Graph aceita no máximo ${MAX_EXPRESSIONS} expressões por vez.`,
        "error"
      );
      return;
    }

    const usedColors = new Set(
      state.expressions.map(item => item.colorIndex)
    );
    const item = createPlotItem(state.expressions.length);
    item.expression = "";
    item.colorIndex =
      [...Array(SERIES_COLORS.length).keys()]
        .find(index => !usedColors.has(index)) ??
      item.colorIndex;

    state.expressions.push(item);
    renderExpressions();
    syncParameterControls({ force: true });
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

    renderer.setResults(resultsById);
    renderExpressions();
    syncParameterControls({ force: true });
    renderer.draw();
    schedulePlot(80);
    persistSoon();
  }


  function collectExpressionPayload() {
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
          error?.message || "A expressão não é válida."
        );
        continue;
      }

      expressions.push({
        id: item.id,
        expression: normalizedPlotExpression(item.expression),
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
      420,
      Math.min(1100, Math.round(width * 0.9))
    );

    return Math.max(
      200,
      Math.min(
        preferred,
        Math.floor(10000 / Math.max(1, expressionCount))
      )
    );
  }


  function paddedViewport() {
    const xSpan = state.viewport.xMax - state.viewport.xMin;
    const ySpan = state.viewport.yMax - state.viewport.yMin;
    const xPadding = xSpan * 0.28;
    const yPadding = ySpan * 0.12;

    return {
      x_min: state.viewport.xMin - xPadding,
      x_max: state.viewport.xMax + xPadding,
      y_min: state.viewport.yMin - yPadding,
      y_max: state.viewport.yMax + yPadding
    };
  }


  async function requestPlot() {
    requestTimer = null;

    if (root.hidden) {
      return;
    }

    const expressions = collectExpressionPayload();

    for (const item of state.expressions) {
      setExpressionError(
        item.id,
        errorsById.get(item.id) || ""
      );
    }

    syncParameterControls();

    if (expressions.length === 0) {
      resultsById.clear();
      renderer.setResults(resultsById);
      renderer.draw();
      setStatus(
        errorsById.size > 0
          ? "Revise as expressões marcadas."
          : "Digite uma função ou equação para começar.",
        errorsById.size > 0 ? "error" : "idle"
      );
      return;
    }

    const version = ++requestVersion;
    const controller = new AbortController();
    plotAbortController = controller;
    plotting = true;
    setStatus("Atualizando curvas...", "loading");

    try {
      const response = await calculatePlot(
        {
          expressions,
          viewport: paddedViewport(),
          samples: sampleCount(expressions.length),
          parameters: parameterPayload(),
          angle_mode: state.angleMode
        },
        {
          signal: controller.signal
        }
      );

      if (
        version !== requestVersion ||
        controller.signal.aborted
      ) {
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
      renderer.setResults(resultsById);

      for (const item of state.expressions) {
        setExpressionError(
          item.id,
          errorsById.get(item.id) || ""
        );
      }

      renderer.draw();

      const successful = response.plots.filter(
        plot => plot.point_count > 0
      ).length;

      setStatus(
        successful > 0
          ? `${successful} ${successful === 1 ? "curva atualizada" : "curvas atualizadas"}.`
          : "Nenhuma curva pôde ser desenhada.",
        successful > 0 ? "success" : "error"
      );
    } catch (error) {
      if (
        version !== requestVersion ||
        error?.code === "request_cancelled"
      ) {
        return;
      }

      setStatus(
        error?.message || "Não foi possível calcular o gráfico.",
        "error"
      );
    } finally {
      if (version === requestVersion) {
        plotting = false;

        if (plotAbortController === controller) {
          plotAbortController = null;
        }
      }
    }
  }


  function resetViewport() {
    renderer.resetViewport();
    renderer.draw();
    schedulePlot(80);
    persistSoon();
  }


  expressionList.addEventListener("compositionstart", () => {
    composingExpression = true;
  });

  expressionList.addEventListener("compositionend", event => {
    composingExpression = false;
    event.target.dispatchEvent(
      new Event("input", { bubbles: true })
    );
  });

  expressionList.addEventListener("input", event => {
    if (
      composingExpression ||
      !event.target.matches("[data-plot-field='expression']")
    ) {
      return;
    }

    const row = event.target.closest("[data-plot-expression-id]");
    const item = state.expressions.find(
      candidate => candidate.id === row?.dataset.plotExpressionId
    );

    if (!item) {
      return;
    }

    item.expression = event.target.value;
    errorsById.delete(item.id);
    setExpressionError(item.id, "");
    updateExpressionMode(item.id);
    scheduleParameterSync();
    schedulePlot();
    persistSoon();
  });

  expressionList.addEventListener("change", event => {
    const row = event.target.closest("[data-plot-expression-id]");
    const item = state.expressions.find(
      candidate => candidate.id === row?.dataset.plotExpressionId
    );

    if (!item) {
      return;
    }

    if (event.target.matches("[data-plot-field='expression']")) {
      syncParameterControls();
      schedulePlot(40);
      return;
    }

    if (event.target.matches("[data-plot-field='projection']")) {
      item.projection = event.target.value;
      schedulePlot(60);
      persistSoon();
    }
  });

  expressionList.addEventListener("keydown", event => {
    if (
      event.key !== "Enter" ||
      !event.target.matches("[data-plot-field='expression']")
    ) {
      return;
    }

    event.preventDefault();
    syncParameterControls();
    schedulePlot(0);
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
      action.setAttribute("aria-pressed", String(item.visible));
      action.title = item.visible
        ? "Ocultar expressão"
        : "Mostrar expressão";
      updateFunctionCount();
      syncParameterControls({ force: true });
      renderer.draw();
      schedulePlot(70);
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

    const value = Number(event.target.value);

    if (!Number.isFinite(value)) {
      return;
    }

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

    schedulePlot(110);
    persistSoon();
  });

  addButton.addEventListener("click", addExpression);
  resetButton.addEventListener("click", resetViewport);

  angleModeSelect.value = state.angleMode;
  angleModeSelect.addEventListener("change", () => {
    state.angleMode = angleModeSelect.value;
    schedulePlot(70);
    persistSoon();
  });

  gridToggle.checked = state.showGrid;
  gridToggle.addEventListener("change", () => {
    state.showGrid = gridToggle.checked;
    renderer.draw();
    persistSoon();
  });

  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) {
      return;
    }

    cancelActivePlot();
    const { rectangle } = renderer.metrics();

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
    const point = renderer.coordinateAt(event.clientX, event.clientY);

    coordinateReadout.textContent =
      `x ${formatAxisValue(
        point.x,
        (state.viewport.xMax - state.viewport.xMin) / 100
      )}  ·  y ${formatAxisValue(
        point.y,
        (state.viewport.yMax - state.viewport.yMin) / 100
      )}`;

    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    renderer.panFrom(
      panState.viewport,
      event.clientX - panState.startX,
      event.clientY - panState.startY,
      panState.width,
      panState.height
    );
    renderer.draw();
  });

  function endPan(event) {
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    panState = null;
    canvas.classList.remove("is-panning");
    schedulePlot(PAN_DEBOUNCE_MS);
    persistSoon();
  }

  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);
  canvas.addEventListener("pointerleave", () => {
    if (!panState) {
      coordinateReadout.textContent =
        "Mova o cursor sobre o plano";
    }
  });

  canvas.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      renderer.zoomAt(
        event.clientX,
        event.clientY,
        event.deltaY
      );
      renderer.draw();
      schedulePlot(ZOOM_DEBOUNCE_MS);
      persistSoon();
    },
    { passive: false }
  );

  canvas.addEventListener("dblclick", resetViewport);

  const resizeObserver = new ResizeObserver(() => {
    renderer.draw();

    if (!root.hidden) {
      schedulePlot(420);
    }
  });
  resizeObserver.observe(canvas);

  renderExpressions();
  syncParameterControls({ force: true });
  renderer.draw();

  if (!root.hidden) {
    schedulePlot(30);
  }

  return {
    refresh() {
      renderer.draw();

      if (!plotting) {
        schedulePlot(60);
      }
    },
    reset: resetViewport
  };
}
