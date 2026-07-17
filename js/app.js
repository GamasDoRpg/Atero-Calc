import {
  iniciarCalculadora
} from "./calculator.js?v=2";

import {
  iniciarCanvas
} from "./canvas.js?v=1";

import {
  iniciarGraph
} from "./plot-v2.js?v=3";


const VIEW_STORAGE_KEY =
  "atero-calc-active-view-v1";

const VALID_VIEWS = new Set([
  "calculator",
  "canvas",
  "plot"
]);


function mostrarUsuario(usuario) {
  const elemento = document.querySelector(
    "#user-name"
  );

  if (!elemento) {
    return;
  }

  elemento.textContent =
    usuario?.user_metadata?.display_name ||
    usuario?.email ||
    "Conta Atero";
}


function loadActiveView() {
  try {
    const value = localStorage.getItem(
      VIEW_STORAGE_KEY
    );

    return VALID_VIEWS.has(value)
      ? value
      : "calculator";
  } catch {
    return "calculator";
  }
}


function saveActiveView(view) {
  try {
    localStorage.setItem(
      VIEW_STORAGE_KEY,
      view
    );
  } catch {
    // A troca de aba continua funcionando sem armazenamento.
  }
}


function iniciarNavegacao({
  canvasController,
  plotController
}) {
  const tabs = [
    ...document.querySelectorAll(
      "[data-app-view]"
    )
  ];

  const views = [
    ...document.querySelectorAll(
      ".app-view[data-view]"
    )
  ];

  function showView(viewName, { persist = true } = {}) {
    const safeView = VALID_VIEWS.has(viewName)
      ? viewName
      : "calculator";

    for (const view of views) {
      const active = view.dataset.view === safeView;
      view.hidden = !active;
    }

    for (const tab of tabs) {
      const active = tab.dataset.appView === safeView;

      tab.classList.toggle("is-active", active);
      tab.setAttribute(
        "aria-selected",
        String(active)
      );
    }

    document.documentElement.dataset.calcView = safeView;

    if (persist) {
      saveActiveView(safeView);
    }

    if (safeView === "canvas") {
      canvasController?.refresh?.();
    }

    if (safeView === "plot") {
      plotController?.refresh?.();
    }
  }

  for (const tab of tabs) {
    tab.addEventListener(
      "click",
      () => showView(tab.dataset.appView)
    );
  }

  showView(
    loadActiveView(),
    { persist: false }
  );
}


export async function iniciarAplicativo({
  usuario,
  aplicativo
}) {
  mostrarUsuario(usuario);

  iniciarCalculadora({
    usuario,
    aplicativo
  });

  const canvasController = iniciarCanvas({
    usuario,
    aplicativo
  });

  const plotController = iniciarGraph({
    usuario,
    aplicativo
  });

  iniciarNavegacao({
    canvasController,
    plotController
  });
}
