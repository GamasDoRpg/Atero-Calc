import {
  calculateExpression
} from "./api.js?v=2";

import {
  normalizeExpression
} from "./graph-model.js?v=1";


const HISTORY_STORAGE_KEY =
  "atero-calc-history-v1";

const HISTORY_LIMIT = 30;


function loadHistory() {
  try {
    const value = JSON.parse(
      localStorage.getItem(HISTORY_STORAGE_KEY) || "[]"
    );

    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(item =>
        item &&
        typeof item.expression === "string" &&
        typeof item.result === "string"
      )
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}


function saveHistory(history) {
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, HISTORY_LIMIT))
    );
  } catch (error) {
    console.warn(
      "Não foi possível salvar o histórico da calculadora:",
      error
    );
  }
}


export function iniciarCalculadora() {
  const expressionInput = document.querySelector(
    "#expression-input"
  );

  const resultOutput = document.querySelector(
    "#calculation-result"
  );

  const errorOutput = document.querySelector(
    "#calculation-error"
  );

  const calculateButton = document.querySelector(
    "#calculate-button"
  );

  const clearButton = document.querySelector(
    "#clear-button"
  );

  const clearHistoryButton = document.querySelector(
    "#clear-history-button"
  );

  const historyList = document.querySelector(
    "#history-list"
  );

  if (
    !expressionInput ||
    !resultOutput ||
    !errorOutput ||
    !calculateButton ||
    !clearButton ||
    !clearHistoryButton ||
    !historyList
  ) {
    console.error(
      "A interface da calculadora não foi encontrada."
    );

    return;
  }

  let calculating = false;
  let history = loadHistory();


  function showError(message) {
    errorOutput.textContent = message;
    errorOutput.hidden = false;
  }


  function clearError() {
    errorOutput.textContent = "";
    errorOutput.hidden = true;
  }


  function setLoading(loading) {
    calculating = loading;
    calculateButton.disabled = loading;
    expressionInput.disabled = loading;
    calculateButton.textContent =
      loading
        ? "Calculando..."
        : "Calcular";
  }


  function renderHistory() {
    historyList.replaceChildren();

    for (const item of history) {
      const listItem = document.createElement("li");
      const expression = document.createElement("span");
      const result = document.createElement("strong");

      listItem.tabIndex = 0;
      listItem.title = "Usar este cálculo novamente";
      listItem.dataset.expression = item.expression;
      listItem.dataset.result = item.result;

      expression.className = "history-expression";
      expression.textContent = item.expression;

      result.className = "history-result";
      result.textContent = item.result;

      listItem.append(expression, result);
      historyList.append(listItem);
    }
  }


  function addToHistory(expression, result) {
    history = [
      {
        expression,
        result,
        createdAt: Date.now()
      },
      ...history.filter(item =>
        !(
          item.expression === expression &&
          item.result === result
        )
      )
    ].slice(0, HISTORY_LIMIT);

    saveHistory(history);
    renderHistory();
  }


  async function calculate() {
    if (calculating) {
      return;
    }

    const expression = normalizeExpression(
      expressionInput.value
    );

    clearError();

    if (!expression) {
      showError("Digite uma expressão.");
      expressionInput.focus();
      return;
    }

    setLoading(true);

    try {
      const calculation = await calculateExpression(
        expression
      );

      resultOutput.textContent = calculation.result;
      addToHistory(expression, calculation.result);
    } catch (error) {
      showError(
        error?.message ||
        "Não foi possível realizar o cálculo."
      );
    } finally {
      setLoading(false);
    }
  }


  function clearCalculator() {
    expressionInput.value = "";
    resultOutput.textContent = "0";
    clearError();
    expressionInput.focus();
  }


  function useHistoryItem(listItem) {
    expressionInput.value =
      listItem.dataset.expression || "";

    resultOutput.textContent =
      listItem.dataset.result || "0";

    clearError();
    expressionInput.focus();
  }


  calculateButton.addEventListener(
    "click",
    calculate
  );

  clearButton.addEventListener(
    "click",
    clearCalculator
  );

  clearHistoryButton.addEventListener(
    "click",
    () => {
      history = [];
      saveHistory(history);
      renderHistory();
    }
  );

  expressionInput.addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        event.preventDefault();
        calculate();
      }
    }
  );

  historyList.addEventListener(
    "click",
    event => {
      const listItem = event.target.closest("li");

      if (listItem) {
        useHistoryItem(listItem);
      }
    }
  );

  historyList.addEventListener(
    "keydown",
    event => {
      if (
        event.key !== "Enter" &&
        event.key !== " "
      ) {
        return;
      }

      const listItem = event.target.closest("li");

      if (listItem) {
        event.preventDefault();
        useHistoryItem(listItem);
      }
    }
  );

  renderHistory();
}
