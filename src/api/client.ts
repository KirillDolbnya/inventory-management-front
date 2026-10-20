type ApiErrorPayload = {
  message?: string;
  errors?: Record<string, string[]>;
  status?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: ApiErrorPayload,
    readonly kind: "http" | "network" | "configuration" | "response" = "http",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getApiBaseUrl() {
  const baseUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new ApiError("API URL is not configured", 0, undefined, "configuration");
  }

  try {
    return new URL(baseUrl);
  } catch {
    throw new ApiError("API URL is invalid", 0, undefined, "configuration");
  }
}

function readXsrfToken() {
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("XSRF-TOKEN="));

  if (!cookie) return undefined;

  try {
    return decodeURIComponent(cookie.slice("XSRF-TOKEN=".length));
  } catch {
    return cookie.slice("XSRF-TOKEN=".length);
  }
}

async function readPayload(response: Response): Promise<ApiErrorPayload | undefined> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as ApiErrorPayload;
  } catch {
    return undefined;
  }
}

function toApiError(response: Response, payload?: ApiErrorPayload) {
  return new ApiError(
    payload?.message ?? `Request failed with status ${response.status}`,
    response.status,
    payload,
  );
}

export async function requestApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = new URL(path.replace(/^\/+/, ""), `${baseUrl.href.replace(/\/+$/, "")}/`);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Requested-With", "XMLHttpRequest");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const xsrfToken = readXsrfToken();
  if (xsrfToken) headers.set("X-XSRF-TOKEN", xsrfToken);

  let response: Response;
  try {
    response = await fetch(url, { ...init, credentials: "include", headers });
  } catch {
    throw new ApiError("Unable to connect to the API", 0, undefined, "network");
  }

  const payload = await readPayload(response);
  if (!response.ok) throw toApiError(response, payload);

  return payload as T;
}

export async function requestCsrfCookie() {
  const apiUrl = getApiBaseUrl();
  const csrfUrl = new URL("/sanctum/csrf-cookie", apiUrl.origin);

  let response: Response;
  try {
    response = await fetch(csrfUrl, {
      credentials: "include",
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
  } catch {
    throw new ApiError("Unable to connect to the API", 0, undefined, "network");
  }

  if (!response.ok) throw toApiError(response, await readPayload(response));
}
