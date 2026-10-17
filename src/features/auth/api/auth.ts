import { requestApi, requestCsrfCookie } from "@/api/client";

export type AuthenticatedUser = {
  // Scramble documents this as string, while the controller currently serializes an integer.
  id: number | string;
  name: string;
  email: string;
};

export type SignInCredentials = {
  email: string;
  password: string;
};

export async function signIn(credentials: SignInCredentials) {
  await requestCsrfCookie();

  return requestApi<AuthenticatedUser>("auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ ...credentials, remember: false }),
  });
}

export async function signOut() {
  await requestApi<void>("auth/logout", { method: "POST" });
}
