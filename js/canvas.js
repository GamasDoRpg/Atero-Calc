import {
  calculateGraph
} from "./api.js?v=2";

import {
  createGraphPayload,
  createId,
  GraphModelError,
  normalizeExpression,
  parseFormulaDefinition,
  sanitizeLoadedGraph
} from "./graph-model.js?v=1";


const GRAPH_STORAGE_KEY =
  "atero-calc-graph-v1";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;
const WORLD_WIDTH = 6000;
const WORLD_HEIGHT = 4000;

const STATUS_LABELS = {
  idle: "Aguardando cálculo",
  stale: "Valor desatualizado",
  input: "Entrada pronta",
  calculated: "Calculado",
  blocked: "Bloqueado",
  error: "Erro"
};


function loadGraph() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(GRAPH_STORAGE_KEY) || "null"
    );

    return sanitizeLoadedGraph(saved);
  } catch (error) {
    console.warn(
      "Não foi possível carregar o canvas salvo:",
      error
    );

    return sanitizeLoadedGraph(null);
  }
}


function persistGraph(state) {
  const serialized = {
    version: 1,
    viewport: state.viewport,
    nodes: state.nodes.map(node => ({
      id: node.id,
      type: node.type,
      name: node.name,
      value: node.value,
      expression: node.expression,
      inputs: node.inputs,
      output: node.output,
      x: node.x,
      y: node.y
    })),
    connections: state.connections
  };

  localStorage.setItem(
    GRAPH_STORAGE_KEY,
    JSON.stringify(serialized)
  );
}


function clamp(value, minimum, maximum) {
  return Math.max(
    minimum,
    Math.min(maximum, value)
  );
}


function createButton({
  className,
  text,
  title,
  action
}) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.title = title;
  button.dataset.nodeAction = action;

  return button;
}


export function iniciarCanvas() {
  const viewport = document.querySelector(
    "#graph-viewport"
  );

  const world = document.querySelector(
    "#graph-world"
  );

  const nodeLayer = document.querySelector(
    "#graph-node-layer"
  );

  const connectionPaths = document.querySelector(
    "#graph-connection-paths"
  );

  const connectionPreview = document.querySelector(
    "#graph-connection-preview"
  );

  const emptyState = document.querySelector(
    "#graph-empty-state"
  );

  const graphStatus = document.querySelector(
    "#graph-status"
  );

  const nodeCount = document.querySelector(
    "#graph-node-count"
  );

  const connectionCount = document.querySelector(
    "#graph-connection-count"
  );

  const calculateButton = document.querySelector(
    "#calculate-graph-button"
  );

  const variableDialog = document.querySelector(
    "#variable-dialog"
  );

  const formulaDialog = document.querySelector(
    "#formula-dialog"
  );

  const variableForm = document.querySelector(
    "#variable-form"
  );

  const formulaForm = document.querySelector(
    "#formula-form"
  );

  const variableNameInput = document.querySelector(
    "#variable-name-input"
  );

  const variableValueInput = document.querySelector(
    "#variable-value-input"
  );

  const variableFormError = document.querySelector(
    "#variable-form-error"
  );

  const formulaTitleInput = document.querySelector(
    "#formula-title-input"
  );

  const formulaExpressionInput = document.querySelector(
    "#formula-expression-input"
  );

  const formulaInputPreview = document.querySelector(
    "#formula-input-preview"
  );

  const formulaFormError = document.querySelector(
    "#formula-form-error"
  );

  const zoomValue = document.querySelector(
    "#zoom-value"
  );

  const toast = document.querySelector(
    "#graph-toast"
  );

  if (
    !viewport ||
    !world ||
    !nodeLayer ||
    !connectionPaths ||
    !connectionPreview ||
    !emptyState ||
    !graphStatus ||
    !nodeCount ||
    !connectionCount ||
    !calculateButton ||
    !variableDialog ||
    !formulaDialog ||
    !variableForm ||
    !formulaForm ||
    !variableNameInput ||
    !variableValueInput ||
    !variableFormError ||
    !formulaTitleInput ||
    !formulaExpressionInput ||
    !formulaInputPreview ||
    !formulaFormError ||
    !zoomValue ||
    !toast
  ) {
    console.error(
      "A interface do Canvas não foi encontrada."
    );

    return;
  }

  const state = loadGraph();

  let nodeDrag = null;
  let panDrag = null;
  let connectionDrag = null;
  let pendingPosition = null;
  let saveTimer = null;
  let toastTimer = null;
  let autoCalculateTimer = null;
  let calculating = false;
  let hasCalculated = false;


  function findNode(nodeId) {
    return state.nodes.find(
      node => node.id === nodeId
    );
  }


  function findNodeElement(nodeId) {
    return [...nodeLayer.children].find(
      element => element.dataset.nodeId === nodeId
    ) || null;
  }


  function findPortElement(
    nodeId,
    portId,
    direction
  ) {
    return [...nodeLayer.querySelectorAll(".node-port")]
      .find(element =>
        element.dataset.nodeId === nodeId &&
        element.dataset.portId === portId &&
        element.dataset.direction === direction
      ) || null;
  }


  function getIncomingConnection(nodeId, portId) {
    return state.connections.find(connection =>
      connection.toNode === nodeId &&
      connection.toPort === portId
    ) || null;
  }


  function setStatus(message, tone = "neutral") {
    graphStatus.textContent = message;
    graphStatus.dataset.tone = tone;
  }


  function showToast(message, tone = "neutral") {
    window.clearTimeout(toastTimer);

    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;

    toastTimer = window.setTimeout(
      () => {
        toast.hidden = true;
      },
      3200
    );
  }


  function scheduleSave() {
    window.clearTimeout(saveTimer);

    saveTimer = window.setTimeout(
      () => {
        try {
          persistGraph(state);
          setStatus(
            "Canvas salvo neste dispositivo.",
            "success"
          );
        } catch (error) {
          console.warn(
            "Não foi possível salvar o canvas:",
            error
          );

          setStatus(
            "Não foi possível salvar o canvas.",
            "error"
          );
        }
      },
      260
    );
  }


  function applyViewport() {
    world.style.transform =
      `translate(${state.viewport.x}px, ${state.viewport.y}px) ` +
      `scale(${state.viewport.scale})`;

    viewport.style.setProperty(
      "--graph-grid-size",
      `${24 * state.viewport.scale}px`
    );

    viewport.style.setProperty(
      "--graph-grid-x",
      `${state.viewport.x}px`
    );

    viewport.style.setProperty(
      "--graph-grid-y",
      `${state.viewport.y}px`
    );

    zoomValue.textContent =
      `${Math.round(state.viewport.scale * 100)}%`;
  }


  function clientToWorld(clientX, clientY) {
    const rectangle = viewport.getBoundingClientRect();

    return {
      x:
        (clientX - rectangle.left - state.viewport.x) /
        state.viewport.scale,
      y:
        (clientY - rectangle.top - state.viewport.y) /
        state.viewport.scale
    };
  }


  function portPoint(element) {
    const rectangle = element.getBoundingClientRect();

    return clientToWorld(
      rectangle.left + rectangle.width / 2,
      rectangle.top + rectangle.height / 2
    );
  }


  function connectionPath(start, end) {
    const distance = Math.abs(end.x - start.x);
    const curve = clamp(distance * 0.52, 64, 240);

    return [
      `M ${start.x} ${start.y}`,
      `C ${start.x + curve} ${start.y},`,
      `${end.x - curve} ${end.y},`,
      `${end.x} ${end.y}`
    ].join(" ");
  }


  function updateConnectionPaths() {
    for (const path of connectionPaths.children) {
      const connection = state.connections.find(
        item => item.id === path.dataset.connectionId
      );

      if (!connection) {
        continue;
      }

      const output = findPortElement(
        connection.fromNode,
        connection.fromPort,
        "output"
      );

      const input = findPortElement(
        connection.toNode,
        connection.toPort,
        "input"
      );

      if (!output || !input) {
        path.setAttribute("d", "");
        continue;
      }

      path.setAttribute(
        "d",
        connectionPath(
          portPoint(output),
          portPoint(input)
        )
      );
    }
  }


  function renderConnections() {
    connectionPaths.replaceChildren();

    for (const connection of state.connections) {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );

      const sourceNode = findNode(connection.fromNode);
      const targetNode = findNode(connection.toNode);

      path.classList.add("graph-connection");
      path.dataset.connectionId = connection.id;

      if (
        sourceNode?.status === "error" ||
        targetNode?.status === "error" ||
        targetNode?.status === "blocked"
      ) {
        path.classList.add("is-error");
      }

      connectionPaths.append(path);
    }

    window.requestAnimationFrame(
      updateConnectionPaths
    );
  }


  function createPort({
    nodeId,
    portId,
    direction,
    connected = false
  }) {
    const port = document.createElement("button");

    port.type = "button";
    port.className =
      `node-port node-port-${direction}`;

    port.dataset.nodeId = nodeId;
    port.dataset.portId = portId;
    port.dataset.direction = direction;

    port.setAttribute(
      "aria-label",
      direction === "output"
        ? "Arrastar saída"
        : connected
          ? "Entrada conectada. Clique para desconectar."
          : "Entrada de fórmula"
    );

    if (connected) {
      port.classList.add("is-connected");
    }

    return port;
  }


  function createNodeElement(node) {
    const article = document.createElement("article");
    const header = document.createElement("header");
    const heading = document.createElement("div");
    const badge = document.createElement("span");
    const title = document.createElement("strong");
    const actions = document.createElement("div");
    const body = document.createElement("div");
    const footer = document.createElement("footer");
    const status = document.createElement("span");

    article.className =
      `graph-node graph-node-${node.type}`;

    article.dataset.nodeId = node.id;
    article.dataset.status = node.status || "idle";
    article.style.transform =
      `translate(${node.x}px, ${node.y}px)`;

    header.className = "graph-node-header";
    heading.className = "graph-node-heading";
    badge.className = "graph-node-type";
    title.className = "graph-node-title";
    actions.className = "graph-node-actions";
    body.className = "graph-node-body";
    footer.className = "graph-node-footer";
    status.className = "graph-node-status";

    badge.textContent =
      node.type === "variable"
        ? "Variável"
        : "Fórmula";

    title.textContent = node.name;
    title.title = node.name;

    actions.append(
      createButton({
        className: "graph-node-action",
        text: "✎",
        title: "Editar node",
        action: "edit"
      }),
      createButton({
        className: "graph-node-action graph-node-action-danger",
        text: "×",
        title: "Excluir node",
        action: "delete"
      })
    );

    heading.append(badge, title);
    header.append(heading, actions);

    if (node.type === "variable") {
      const field = document.createElement("label");
      const fieldLabel = document.createElement("span");
      const valueInput = document.createElement("input");
      const outputRow = document.createElement("div");
      const outputName = document.createElement("span");
      const outputPort = createPort({
        nodeId: node.id,
        portId: node.output.id,
        direction: "output"
      });

      field.className = "graph-node-field";
      fieldLabel.textContent = "Valor";

      valueInput.className = "graph-variable-input";
      valueInput.type = "text";
      valueInput.inputMode = "decimal";
      valueInput.autocomplete = "off";
      valueInput.maxLength = 200;
      valueInput.value = node.value;
      valueInput.dataset.nodeId = node.id;

      outputRow.className =
        "graph-port-row graph-port-row-output";

      outputName.textContent = node.output.name;
      outputRow.append(outputName, outputPort);
      field.append(fieldLabel, valueInput);
      body.append(field, outputRow);
    } else {
      const expression = document.createElement("code");
      const inputList = document.createElement("div");
      const outputRow = document.createElement("div");
      const outputCopy = document.createElement("div");
      const outputName = document.createElement("span");
      const outputValue = document.createElement("strong");
      const outputPort = createPort({
        nodeId: node.id,
        portId: node.output.id,
        direction: "output"
      });

      expression.className = "graph-node-expression";
      expression.textContent = node.expression;
      expression.title = node.expression;

      inputList.className = "graph-node-inputs";

      if (node.inputs.length === 0) {
        const constantNotice = document.createElement("span");

        constantNotice.className = "graph-node-constant";
        constantNotice.textContent = "Fórmula sem entradas";
        inputList.append(constantNotice);
      }

      for (const input of node.inputs) {
        const row = document.createElement("div");
        const name = document.createElement("span");
        const incoming = getIncomingConnection(
          node.id,
          input.id
        );

        const port = createPort({
          nodeId: node.id,
          portId: input.id,
          direction: "input",
          connected: Boolean(incoming)
        });

        row.className =
          "graph-port-row graph-port-row-input";

        name.textContent = input.name;
        row.append(port, name);
        inputList.append(row);
      }

      outputRow.className =
        "graph-port-row graph-port-row-output graph-formula-output";

      outputCopy.className = "graph-output-copy";
      outputName.textContent = node.output.name;
      outputValue.textContent = node.result ?? "—";
      outputValue.title = node.result ?? "Sem resultado";

      outputCopy.append(outputName, outputValue);
      outputRow.append(outputCopy, outputPort);
      body.append(expression, inputList, outputRow);
    }

    status.textContent =
      node.error ||
      STATUS_LABELS[node.status] ||
      STATUS_LABELS.idle;

    footer.append(status);
    article.append(header, body, footer);

    return article;
  }


  function updateStatistics() {
    nodeCount.textContent = String(state.nodes.length);
    connectionCount.textContent = String(
      state.connections.length
    );

    emptyState.hidden = state.nodes.length > 0;
  }


  function renderNodes() {
    nodeLayer.replaceChildren(
      ...state.nodes.map(createNodeElement)
    );

    updateStatistics();
    renderConnections();
  }


  function refreshNodeStatuses() {
    for (const node of state.nodes) {
      const element = findNodeElement(node.id);

      if (!element) {
        continue;
      }

      element.dataset.status = node.status || "idle";

      const status = element.querySelector(
        ".graph-node-status"
      );

      if (status) {
        status.textContent =
          node.error ||
          STATUS_LABELS[node.status] ||
          STATUS_LABELS.idle;
      }
    }

    renderConnections();
  }


  function markGraphStale({ rerender = true } = {}) {
    for (const node of state.nodes) {
      if (node.type === "formula") {
        node.status = "stale";
        node.error = null;
      }
    }

    if (rerender) {
      renderNodes();
    } else {
      refreshNodeStatuses();
    }

    if (hasCalculated) {
      window.clearTimeout(autoCalculateTimer);

      autoCalculateTimer = window.setTimeout(
        () => calculateSystem({ silent: true }),
        520
      );
    }
  }


  function creationPosition() {
    if (pendingPosition) {
      const position = pendingPosition;
      pendingPosition = null;
      return position;
    }

    const rectangle = viewport.getBoundingClientRect();
    const center = clientToWorld(
      rectangle.left + rectangle.width / 2,
      rectangle.top + rectangle.height / 2
    );

    const offset = state.nodes.length * 18;

    return {
      x: clamp(center.x - 140 + offset, 20, WORLD_WIDTH - 360),
      y: clamp(center.y - 100 + offset, 20, WORLD_HEIGHT - 300)
    };
  }


  function clearFormError(element) {
    element.textContent = "";
    element.hidden = true;
  }


  function showFormError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }


  function openVariableDialog(node = null) {
    variableForm.dataset.editingNodeId = node?.id || "";
    variableNameInput.value = node?.name || "";
    variableValueInput.value = node?.value || "";
    clearFormError(variableFormError);

    document.querySelector("#variable-dialog-title")
      .textContent = node
        ? "Editar variável"
        : "Criar variável";

    variableDialog.showModal();
    window.setTimeout(
      () => variableNameInput.focus(),
      0
    );
  }


  function formulaTextForNode(node) {
    return node
      ? `${node.output.name} = ${node.expression}`
      : "";
  }


  function updateFormulaPreview() {
    const value = formulaExpressionInput.value;

    if (!value.trim()) {
      formulaInputPreview.textContent =
        "Nenhuma entrada detectada.";
      return;
    }

    try {
      const definition = parseFormulaDefinition(value);

      if (definition.inputs.length === 0) {
        formulaInputPreview.textContent =
          "Fórmula constante, sem entradas.";
        return;
      }

      formulaInputPreview.replaceChildren();

      for (const input of definition.inputs) {
        const chip = document.createElement("span");

        chip.className = "graph-input-chip";
        chip.textContent = input.name;
        formulaInputPreview.append(chip);
      }
    } catch (error) {
      formulaInputPreview.textContent =
        error?.message ||
        "A fórmula ainda não está completa.";
    }
  }


  function openFormulaDialog(node = null) {
    formulaForm.dataset.editingNodeId = node?.id || "";
    formulaTitleInput.value = node?.name || "";
    formulaExpressionInput.value = formulaTextForNode(node);
    clearFormError(formulaFormError);

    document.querySelector("#formula-dialog-title")
      .textContent = node
        ? "Editar fórmula"
        : "Criar fórmula";

    updateFormulaPreview();
    formulaDialog.showModal();

    window.setTimeout(
      () => formulaExpressionInput.focus(),
      0
    );
  }


  function closeDialog(dialog) {
    if (dialog?.open) {
      dialog.close();
    }
  }


  function deleteNode(nodeId) {
    const node = findNode(nodeId);

    if (!node) {
      return;
    }

    const confirmed = window.confirm(
      `Excluir o node “${node.name}” e todas as conexões ligadas a ele?`
    );

    if (!confirmed) {
      return;
    }

    state.nodes = state.nodes.filter(
      item => item.id !== nodeId
    );

    state.connections = state.connections.filter(
      connection =>
        connection.fromNode !== nodeId &&
        connection.toNode !== nodeId
    );

    renderNodes();
    scheduleSave();
    showToast("Node excluído.");
  }


  function removeIncomingConnection(nodeId, portId) {
    const before = state.connections.length;

    state.connections = state.connections.filter(
      connection => !(
        connection.toNode === nodeId &&
        connection.toPort === portId
      )
    );

    if (state.connections.length === before) {
      return;
    }

    markGraphStale();
    scheduleSave();
    showToast("Conexão removida.");
  }


  function connectPorts({
    fromNode,
    fromPort,
    toNode,
    toPort
  }) {
    const source = findNode(fromNode);
    const target = findNode(toNode);

    if (!source || !target || target.type !== "formula") {
      return;
    }

    if (
      source.output.id !== fromPort ||
      !target.inputs.some(input => input.id === toPort)
    ) {
      return;
    }

    state.connections = state.connections.filter(
      connection => !(
        connection.toNode === toNode &&
        connection.toPort === toPort
      )
    );

    state.connections.push({
      id: createId("connection"),
      fromNode,
      fromPort,
      toNode,
      toPort
    });

    markGraphStale();
    scheduleSave();
    showToast(
      `${source.name} conectado a ${target.name}.`,
      "success"
    );
  }


  function startConnection(event, port) {
    event.preventDefault();
    event.stopPropagation();

    const start = portPoint(port);

    connectionDrag = {
      fromNode: port.dataset.nodeId,
      fromPort: port.dataset.portId,
      start,
      pointerId: event.pointerId
    };

    connectionPreview.hidden = false;
    connectionPreview.setAttribute(
      "d",
      connectionPath(start, start)
    );

    document.documentElement.classList.add(
      "is-connecting-nodes"
    );
  }


  function moveConnection(event) {
    if (!connectionDrag) {
      return;
    }

    const end = clientToWorld(
      event.clientX,
      event.clientY
    );

    connectionPreview.setAttribute(
      "d",
      connectionPath(connectionDrag.start, end)
    );
  }


  function endConnection(event) {
    if (!connectionDrag) {
      return;
    }

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest(".node-port-input");

    if (target) {
      connectPorts({
        fromNode: connectionDrag.fromNode,
        fromPort: connectionDrag.fromPort,
        toNode: target.dataset.nodeId,
        toPort: target.dataset.portId
      });
    }

    connectionDrag = null;
    connectionPreview.hidden = true;
    connectionPreview.setAttribute("d", "");

    document.documentElement.classList.remove(
      "is-connecting-nodes"
    );
  }


  function startNodeDrag(event, header) {
    if (event.button !== 0) {
      return;
    }

    const article = header.closest(".graph-node");
    const node = findNode(article?.dataset.nodeId);

    if (!article || !node) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    nodeDrag = {
      node,
      article,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y
    };

    article.classList.add("is-dragging");
  }


  function moveNode(event) {
    if (!nodeDrag) {
      return;
    }

    const deltaX =
      (event.clientX - nodeDrag.startClientX) /
      state.viewport.scale;

    const deltaY =
      (event.clientY - nodeDrag.startClientY) /
      state.viewport.scale;

    nodeDrag.node.x = clamp(
      nodeDrag.startX + deltaX,
      0,
      WORLD_WIDTH - 320
    );

    nodeDrag.node.y = clamp(
      nodeDrag.startY + deltaY,
      0,
      WORLD_HEIGHT - 180
    );

    nodeDrag.article.style.transform =
      `translate(${nodeDrag.node.x}px, ${nodeDrag.node.y}px)`;

    updateConnectionPaths();
  }


  function endNodeDrag() {
    if (!nodeDrag) {
      return;
    }

    nodeDrag.article.classList.remove("is-dragging");
    nodeDrag = null;
    scheduleSave();
  }


  function startPan(event) {
    if (
      event.button !== 0 ||
      event.target.closest(
        ".graph-node, .graph-connection, .graph-zoom-controls, .graph-button, .graph-empty-state"
      )
    ) {
      return;
    }

    event.preventDefault();

    panDrag = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: state.viewport.x,
      startY: state.viewport.y
    };

    viewport.classList.add("is-panning");
  }


  function movePan(event) {
    if (!panDrag) {
      return;
    }

    state.viewport.x =
      panDrag.startX +
      event.clientX -
      panDrag.startClientX;

    state.viewport.y =
      panDrag.startY +
      event.clientY -
      panDrag.startClientY;

    applyViewport();
  }


  function endPan() {
    if (!panDrag) {
      return;
    }

    panDrag = null;
    viewport.classList.remove("is-panning");
    scheduleSave();
  }


  function setZoom(
    nextScale,
    clientX = null,
    clientY = null
  ) {
    const scale = clamp(
      nextScale,
      MIN_ZOOM,
      MAX_ZOOM
    );

    const rectangle = viewport.getBoundingClientRect();
    const anchorX =
      clientX ?? rectangle.left + rectangle.width / 2;
    const anchorY =
      clientY ?? rectangle.top + rectangle.height / 2;

    const worldBefore = clientToWorld(
      anchorX,
      anchorY
    );

    state.viewport.scale = scale;

    state.viewport.x =
      anchorX -
      rectangle.left -
      worldBefore.x * scale;

    state.viewport.y =
      anchorY -
      rectangle.top -
      worldBefore.y * scale;

    applyViewport();
    scheduleSave();
  }


  function fitGraph() {
    if (state.nodes.length === 0) {
      state.viewport = {
        x: 0,
        y: 0,
        scale: 1
      };

      applyViewport();
      scheduleSave();
      return;
    }

    const rectangle = viewport.getBoundingClientRect();
    const padding = 90;

    let minimumX = Infinity;
    let minimumY = Infinity;
    let maximumX = -Infinity;
    let maximumY = -Infinity;

    for (const node of state.nodes) {
      const element = findNodeElement(node.id);
      const width =
        element?.offsetWidth ||
        (node.type === "formula" ? 310 : 270);

      const height =
        element?.offsetHeight ||
        (node.type === "formula" ? 260 : 190);

      minimumX = Math.min(minimumX, node.x);
      minimumY = Math.min(minimumY, node.y);
      maximumX = Math.max(maximumX, node.x + width);
      maximumY = Math.max(maximumY, node.y + height);
    }

    const contentWidth = maximumX - minimumX;
    const contentHeight = maximumY - minimumY;

    const scale = clamp(
      Math.min(
        (rectangle.width - padding * 2) / contentWidth,
        (rectangle.height - padding * 2) / contentHeight,
        1.15
      ),
      MIN_ZOOM,
      MAX_ZOOM
    );

    state.viewport.scale = scale;
    state.viewport.x =
      rectangle.width / 2 -
      (minimumX + contentWidth / 2) * scale;

    state.viewport.y =
      rectangle.height / 2 -
      (minimumY + contentHeight / 2) * scale;

    applyViewport();
    scheduleSave();
  }


  function applyGraphResult(response) {
    for (const node of state.nodes) {
      const result = response.results?.[node.id];

      if (!result) {
        node.status = "blocked";
        node.error = "O node não foi executado.";
        node.result = null;
        continue;
      }

      node.status = result.status;
      node.error = result.error || null;

      if (node.type === "formula") {
        node.result =
          result.outputs?.[node.output.id] ??
          null;
      }
    }

    hasCalculated = true;
    renderNodes();

    if (response.success) {
      setStatus(
        "Sistema calculado com sucesso.",
        "success"
      );

      showToast(
        "Todos os valores foram atualizados.",
        "success"
      );
      return;
    }

    const firstError = response.errors?.[0];

    setStatus(
      firstError?.message ||
      "O sistema possui erros.",
      "error"
    );

    showToast(
      firstError?.message ||
      "Revise os nodes marcados em vermelho.",
      "error"
    );
  }


  async function calculateSystem({ silent = false } = {}) {
    if (calculating) {
      return;
    }

    if (state.nodes.length === 0) {
      showToast(
        "Crie pelo menos um node antes de calcular.",
        "error"
      );
      return;
    }

    calculating = true;
    calculateButton.disabled = true;
    calculateButton.textContent = "Calculando...";

    if (!silent) {
      setStatus(
        "Enviando o sistema para a Atero API...",
        "loading"
      );
    }

    try {
      const response = await calculateGraph(
        createGraphPayload(state)
      );

      applyGraphResult(response);
    } catch (error) {
      setStatus(
        error?.message ||
        "Não foi possível calcular o sistema.",
        "error"
      );

      if (!silent) {
        showToast(
          error?.message ||
          "Não foi possível calcular o sistema.",
          "error"
        );
      }
    } finally {
      calculating = false;
      calculateButton.disabled = false;
      calculateButton.textContent = "Calcular sistema";
    }
  }


  variableForm.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      clearFormError(variableFormError);

      const name = variableNameInput.value.trim();
      const value = normalizeExpression(
        variableValueInput.value
      );

      if (!name) {
        showFormError(
          variableFormError,
          "Digite um nome para a variável."
        );
        return;
      }

      if (!value) {
        showFormError(
          variableFormError,
          "Digite um valor inicial."
        );
        return;
      }

      const editingNodeId =
        variableForm.dataset.editingNodeId;

      const existing = findNode(editingNodeId);

      if (existing?.type === "variable") {
        existing.name = name;
        existing.value = value;
        existing.status = "idle";
        existing.error = null;
      } else {
        const position = creationPosition();

        state.nodes.push({
          id: createId("node"),
          type: "variable",
          name,
          value,
          output: {
            id: "value",
            name: "Valor"
          },
          x: position.x,
          y: position.y,
          status: "idle",
          result: null,
          error: null
        });
      }

      closeDialog(variableDialog);
      markGraphStale();
      scheduleSave();
    }
  );


  formulaForm.addEventListener(
    "submit",
    event => {
      event.preventDefault();
      clearFormError(formulaFormError);

      let definition;

      try {
        definition = parseFormulaDefinition(
          formulaExpressionInput.value
        );
      } catch (error) {
        showFormError(
          formulaFormError,
          error instanceof GraphModelError
            ? error.message
            : "A fórmula não pôde ser interpretada."
        );
        return;
      }

      const name =
        formulaTitleInput.value.trim() ||
        definition.output.name;

      const editingNodeId =
        formulaForm.dataset.editingNodeId;

      const existing = findNode(editingNodeId);

      if (existing?.type === "formula") {
        const validInputIds = new Set(
          definition.inputs.map(input => input.id)
        );

        const outputChanged =
          existing.output.id !== definition.output.id;

        state.connections = state.connections.filter(
          connection => {
            if (
              connection.toNode === existing.id &&
              !validInputIds.has(connection.toPort)
            ) {
              return false;
            }

            if (
              outputChanged &&
              connection.fromNode === existing.id
            ) {
              return false;
            }

            return true;
          }
        );

        existing.name = name;
        existing.expression = definition.expression;
        existing.inputs = definition.inputs;
        existing.output = definition.output;
        existing.status = "stale";
        existing.result = null;
        existing.error = null;
      } else {
        const position = creationPosition();

        state.nodes.push({
          id: createId("node"),
          type: "formula",
          name,
          expression: definition.expression,
          inputs: definition.inputs,
          output: definition.output,
          x: position.x,
          y: position.y,
          status: "idle",
          result: null,
          error: null
        });
      }

      closeDialog(formulaDialog);
      markGraphStale();
      scheduleSave();
    }
  );


  formulaExpressionInput.addEventListener(
    "input",
    updateFormulaPreview
  );


  nodeLayer.addEventListener(
    "click",
    event => {
      const actionButton = event.target.closest(
        "[data-node-action]"
      );

      if (actionButton) {
        const nodeId = actionButton
          .closest(".graph-node")
          ?.dataset.nodeId;

        const node = findNode(nodeId);

        if (!node) {
          return;
        }

        if (actionButton.dataset.nodeAction === "delete") {
          deleteNode(node.id);
        } else if (node.type === "variable") {
          openVariableDialog(node);
        } else {
          openFormulaDialog(node);
        }

        return;
      }

      const inputPort = event.target.closest(
        ".node-port-input"
      );

      if (inputPort?.classList.contains("is-connected")) {
        removeIncomingConnection(
          inputPort.dataset.nodeId,
          inputPort.dataset.portId
        );
      }
    }
  );


  nodeLayer.addEventListener(
    "input",
    event => {
      const input = event.target.closest(
        ".graph-variable-input"
      );

      if (!input) {
        return;
      }

      const node = findNode(input.dataset.nodeId);

      if (!node || node.type !== "variable") {
        return;
      }

      node.value = input.value;
      node.status = "idle";
      node.error = null;

      markGraphStale({ rerender: false });
      scheduleSave();
    }
  );


  nodeLayer.addEventListener(
    "pointerdown",
    event => {
      const outputPort = event.target.closest(
        ".node-port-output"
      );

      if (outputPort) {
        startConnection(event, outputPort);
        return;
      }

      const header = event.target.closest(
        ".graph-node-header"
      );

      if (
        header &&
        !event.target.closest(".graph-node-actions")
      ) {
        startNodeDrag(event, header);
      }
    }
  );


  connectionPaths.addEventListener(
    "dblclick",
    event => {
      const path = event.target.closest(
        ".graph-connection"
      );

      if (!path) {
        return;
      }

      state.connections = state.connections.filter(
        connection =>
          connection.id !== path.dataset.connectionId
      );

      markGraphStale();
      scheduleSave();
      showToast("Conexão removida.");
    }
  );


  viewport.addEventListener(
    "pointerdown",
    startPan
  );


  viewport.addEventListener(
    "dblclick",
    event => {
      if (
        event.target.closest(
          ".graph-node, .graph-empty-state, .graph-zoom-controls"
        )
      ) {
        return;
      }

      pendingPosition = clientToWorld(
        event.clientX,
        event.clientY
      );

      openFormulaDialog();
    }
  );


  viewport.addEventListener(
    "wheel",
    event => {
      event.preventDefault();

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.002);

        setZoom(
          state.viewport.scale * factor,
          event.clientX,
          event.clientY
        );
        return;
      }

      state.viewport.x -= event.deltaX;
      state.viewport.y -= event.deltaY;
      applyViewport();
      scheduleSave();
    },
    { passive: false }
  );


  window.addEventListener(
    "pointermove",
    event => {
      moveConnection(event);
      moveNode(event);
      movePan(event);
    }
  );


  window.addEventListener(
    "pointerup",
    event => {
      endConnection(event);
      endNodeDrag();
      endPan();
    }
  );


  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape" && connectionDrag) {
        connectionDrag = null;
        connectionPreview.hidden = true;
        connectionPreview.setAttribute("d", "");
        document.documentElement.classList.remove(
          "is-connecting-nodes"
        );
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "0" &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        fitGraph();
      }
    }
  );


  document.addEventListener(
    "click",
    event => {
      const closeButton = event.target.closest(
        "[data-close-dialog]"
      );

      if (closeButton) {
        closeDialog(
          document.querySelector(
            `#${closeButton.dataset.closeDialog}`
          )
        );
      }

      const createButton = event.target.closest(
        "[data-create-node]"
      );

      if (createButton?.dataset.createNode === "variable") {
        openVariableDialog();
      }

      if (createButton?.dataset.createNode === "formula") {
        openFormulaDialog();
      }
    }
  );


  document.querySelector("#add-variable-button")
    ?.addEventListener(
      "click",
      () => openVariableDialog()
    );

  document.querySelector("#add-formula-button")
    ?.addEventListener(
      "click",
      () => openFormulaDialog()
    );

  document.querySelector("#fit-graph-button")
    ?.addEventListener("click", fitGraph);

  document.querySelector("#clear-graph-button")
    ?.addEventListener(
      "click",
      () => {
        if (state.nodes.length === 0) {
          return;
        }

        const confirmed = window.confirm(
          "Apagar todos os nodes e conexões deste canvas?"
        );

        if (!confirmed) {
          return;
        }

        state.nodes = [];
        state.connections = [];
        state.viewport = {
          x: 0,
          y: 0,
          scale: 1
        };

        hasCalculated = false;
        applyViewport();
        renderNodes();
        scheduleSave();
        showToast("Canvas limpo.");
      }
    );

  calculateButton.addEventListener(
    "click",
    () => calculateSystem()
  );

  document.querySelector("#zoom-in-button")
    ?.addEventListener(
      "click",
      () => setZoom(state.viewport.scale * 1.16)
    );

  document.querySelector("#zoom-out-button")
    ?.addEventListener(
      "click",
      () => setZoom(state.viewport.scale / 1.16)
    );

  document.querySelector("#zoom-reset-button")
    ?.addEventListener(
      "click",
      () => setZoom(1)
    );


  const resizeObserver = new ResizeObserver(
    () => updateConnectionPaths()
  );

  resizeObserver.observe(viewport);

  applyViewport();
  renderNodes();

  if (state.nodes.length > 0) {
    setStatus(
      "Canvas carregado deste dispositivo.",
      "success"
    );
  }

  return {
    refresh() {
      window.requestAnimationFrame(() => {
        applyViewport();
        updateConnectionPaths();
      });
    },
    fit: fitGraph
  };
}
