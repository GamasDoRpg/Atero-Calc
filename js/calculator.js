import {
  calculateExpression
} from "./api.js?v=1";


export function iniciarCalculadora() {
  const expressionInput =
    document.querySelector(
      "#expression-input"
    );

  const resultOutput =
    document.querySelector(
      "#calculation-result"
    );

  const errorOutput =
    document.querySelector(
      "#calculation-error"
    );

  const calculateButton =
    document.querySelector(
      "#calculate-button"
    );

  const clearButton =
    document.querySelector(
      "#clear-button"
    );

  let calculating =
    false;


  function showError(message) {
    errorOutput.textContent =
      message;

    errorOutput.hidden =
      false;
  }


  function clearError() {
    errorOutput.textContent =
      "";

    errorOutput.hidden =
      true;
  }


  function setLoading(loading) {
    calculating =
      loading;

    calculateButton.disabled =
      loading;

    expressionInput.disabled =
      loading;

    calculateButton.textContent =
      loading
        ? "Calculando..."
        : "Calcular";
  }


  async function calculate() {
    if (calculating) {
      return;
    }

    const expression =
      expressionInput.value.trim();

    clearError();

    if (!expression) {
      showError(
        "Digite uma expressão."
      );

      expressionInput.focus();

      return;
    }

    setLoading(true);

    try {
      const calculation =
        await calculateExpression(
          expression
        );

      resultOutput.textContent =
        calculation.result;
    } catch (error) {
      showError(
        error.message
      );
    } finally {
      setLoading(false);
    }
  }


  calculateButton.addEventListener(
    "click",
    calculate
  );


  clearButton.addEventListener(
    "click",
    () => {
      expressionInput.value =
        "";

      resultOutput.textContent =
        "0";

      clearError();

      expressionInput.focus();
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


  expressionInput.focus();
}
