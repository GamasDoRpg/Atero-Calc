const API_BASE_URL =
  "https://api.atero.space";

const REQUEST_TIMEOUT_MS =
  20000;


export class AteroApiError extends Error {
  constructor(
    message,
    {
      status = null,
      code = null,
      details = null
    } = {}
  ) {
    super(message);

    this.name = "AteroApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}


async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}


function formatApiDetail(detail) {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const first = detail[0];

    if (typeof first?.msg === "string") {
      return first.msg;
    }
  }

  return null;
}


async function requestJson(
  path,
  {
    method = "GET",
    body = null
  } = {}
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${API_BASE_URL}${path}`,
      {
        method,
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Atero-Request": "calc"
        },
        body:
          body === null
            ? null
            : JSON.stringify(body),
        signal: controller.signal
      }
    );

    const data = await readJson(response);

    if (!response.ok) {
      throw new AteroApiError(
        data?.error ||
        formatApiDetail(data?.detail) ||
        data?.message ||
        `A API retornou o erro HTTP ${response.status}.`,
        {
          status: response.status,
          code: data?.code || null,
          details: data
        }
      );
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new AteroApiError(
        "A API demorou para responder.",
        { code: "timeout" }
      );
    }

    if (error instanceof AteroApiError) {
      throw error;
    }

    throw new AteroApiError(
      "Não foi possível conectar à Atero API.",
      {
        code: "network_error",
        details: error
      }
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}


export async function calculateExpression(expression) {
  const data = await requestJson(
    "/calc/v1/calculate",
    {
      method: "POST",
      body: { expression }
    }
  );

  if (
    !data ||
    data.success !== true ||
    typeof data.result !== "string"
  ) {
    throw new AteroApiError(
      "A API retornou uma resposta inválida.",
      { code: "invalid_response" }
    );
  }

  return data;
}


export async function calculateGraph(graph) {
  const data = await requestJson(
    "/calc/v1/graph/calculate",
    {
      method: "POST",
      body: graph
    }
  );

  if (
    !data ||
    typeof data.success !== "boolean" ||
    typeof data.results !== "object" ||
    !Array.isArray(data.errors)
  ) {
    throw new AteroApiError(
      "A API retornou um grafo de resposta inválido.",
      { code: "invalid_graph_response" }
    );
  }

  return data;
}
