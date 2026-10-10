export type SignInCredentials = {
  email: string;
  password: string;
};

export type DemoUser = {
  email: string;
};

export async function signIn(credentials: SignInCredentials): Promise<DemoUser> {
  await new Promise((resolve) => window.setTimeout(resolve, 700));

  // The demo adapter deliberately doesn't persist credentials or issue a token.
  return { email: credentials.email };
}
