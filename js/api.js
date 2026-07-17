const API_BASE_URL =
  "https://api.atero.space";

const REQUEST_TIMEOUT_MS =
  15000;


export class AteroApiError extends Error {
  constructor(
    message,
    {
      status = null,
      code = null
    } = {}
  ) {
    super(message);

    this.name =
      "AteroApiError";

    this.status =
      status;

    this.code =
      code;
  }
}


async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}


export async function calculateExpression(
  expression
) {
  const controller =
    new AbortController();

  const timeoutId =
    window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        `${API_BASE_URL}/calc/v1/calculate`,
        {
          method:
            "POST",

          credentials:
            "include",

          cache:
            "no-store",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",

            "X-Atero-Request":
              "calc"
          },

          body:
            JSON.stringify({
              expression
            }),

          signal:
            controller.signal
        }
      );

    const data =
      await readJson(response);

    if (!response.ok) {
      throw new AteroApiError(
        data?.error ||
        data?.detail ||
        "Não foi possível realizar o cálculo.",
        {
          status:
            response.status
        }
      );
    }

    if (
      !data ||
      data.success !== true ||
      typeof data.result !== "string"
    ) {
      throw new AteroApiError(
        "A API retornou uma resposta inválida."
      );
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new AteroApiError(
        "A API demorou para responder."
      );
    }

    if (error instanceof AteroApiError) {
      throw error;
    }

    throw new AteroApiError(
      "Não foi possível conectar à Atero API."
    );
  } finally {
    window.clearTimeout(
      timeoutId
    );
  }
}
