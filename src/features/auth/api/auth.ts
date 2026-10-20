import { ApiError, requestApi, requestCsrfCookie } from "@/api/client";

export type AuthenticatedUser = {
  // The API documents sign-in as string and /auth/me as integer.
  id: number | string;
  name: string;
  email: string;
};

export type SignInCredentials = {
  email: string;
  password: string;
};

function parseAuthenticatedUser(
  value: unknown,
  idType: "number" | "string",
): AuthenticatedUser {
  if (typeof value !== "object" || value === null) {
    throw new ApiError("Unexpected authentication response", 0, undefined, "response");
  }

  const user = value as Record<string, unknown>;
  const validId = idType === "number"
    ? Number.isInteger(user.id)
    : typeof user.id === "string";

  if (!validId || typeof user.name !== "string" || typeof user.email !== "string") {
    throw new ApiError("Unexpected authentication response", 0, undefined, "response");
  }

  return { id: user.id as number | string, name: user.name, email: user.email };
}

export async function signIn(credentials: SignInCredentials) {
  await requestCsrfCookie();

  const user = await requestApi<unknown>("auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ ...credentials, remember: false }),
  });

  return parseAuthenticatedUser(user, "string");
}

export async function getCurrentUser() {
  const user = await requestApi<unknown>("auth/me", { cache: "no-store" });
  return parseAuthenticatedUser(user, "number");
}

export async function signOut() {
  await requestApi<void>("auth/logout", { method: "POST" });
}
