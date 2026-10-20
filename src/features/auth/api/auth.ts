import { ApiError, requestApi, requestCsrfCookie } from "@/api/client";

export type AuthenticatedUser = {
  id: number;
  name: string;
  email: string;
};

export type SignInCredentials = {
  email: string;
  password: string;
};

function parseAuthenticatedUser(value: unknown): AuthenticatedUser {
  if (typeof value !== "object" || value === null) {
    throw new ApiError("Unexpected authentication response", 0, undefined, "response");
  }

  const user = value as Record<string, unknown>;

  if (!Number.isInteger(user.id) || typeof user.name !== "string" || typeof user.email !== "string") {
    throw new ApiError("Unexpected authentication response", 0, undefined, "response");
  }

  return { id: user.id as number, name: user.name, email: user.email };
}

export async function signIn(credentials: SignInCredentials) {
  await requestCsrfCookie();

  const user = await requestApi<unknown>("auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ ...credentials, remember: false }),
  });

  return parseAuthenticatedUser(user);
}

export async function getCurrentUser() {
  const user = await requestApi<unknown>("auth/me", { cache: "no-store" });
  return parseAuthenticatedUser(user);
}

export async function signOut() {
  await requestApi<void>("auth/logout", { method: "POST" });
}
