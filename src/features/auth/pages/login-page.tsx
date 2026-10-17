import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/api/client";
import { loginSchema, type LoginFormValues } from "@/features/auth/schema";
import { signIn, type AuthenticatedUser } from "@/features/auth/api/auth";

type LoginPageProps = {
  onAuthenticated: (user: AuthenticatedUser) => void;
};

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const {
    register,
    handleSubmit,
    clearErrors,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit: SubmitHandler<LoginFormValues> = async (values) => {
    clearErrors("root");
    try {
      const user = await signIn(values);
      onAuthenticated(user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const fieldErrors = error.payload?.errors;
        const emailError = fieldErrors?.email?.[0];
        const passwordError = fieldErrors?.password?.[0];
        if (emailError) setError("email", { type: "server", message: emailError });
        if (passwordError) setError("password", { type: "server", message: passwordError });
        if (!emailError && !passwordError) {
          setError("root", { type: "server", message: "Проверьте введённые данные." });
        }
      } else if (error instanceof ApiError && error.status === 401) {
        setError("root", { type: "server", message: "Неверный email или пароль." });
      } else if (error instanceof ApiError && error.kind === "network") {
        setError("root", {
          type: "server",
          message: "Не удалось подключиться к серверу. Проверьте соединение и попробуйте снова.",
        });
      } else if (error instanceof ApiError && error.status === 419) {
        setError("root", {
          type: "server",
          message: "Не удалось подтвердить запрос. Обновите страницу и попробуйте снова.",
        });
      } else {
        setError("root", {
          type: "server",
          message: "Сервис входа временно недоступен. Попробуйте позже.",
        });
      }
    }
  };

  const year = new Intl.DateTimeFormat("ru-RU", { year: "numeric" }).format(new Date());

  return (
    <main className="auth-shell flex flex-col px-5 sm:px-6">
      <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-8">
        <header className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border bg-white text-foreground shadow-sm">
            <Boxes aria-hidden="true" size={21} strokeWidth={1.8} />
          </div>
          <p className="text-sm font-semibold tracking-tight">Склад</p>
        </header>

        <Card className="rounded-2xl border-border bg-card shadow-sm shadow-zinc-950/[0.03]">
          <CardHeader className="space-y-2 px-6 pb-0 pt-6 sm:px-7 sm:pt-7">
            <h1 className="text-xl font-semibold tracking-tight">Вход в систему</h1>
            <p className="text-sm leading-5 text-muted-foreground">
              Введите email и пароль, чтобы продолжить.
            </p>
          </CardHeader>

          <CardContent className="px-6 pb-6 pt-6 sm:px-7 sm:pb-7">
            <form className="space-y-5" noValidate onSubmit={handleSubmit(submit)}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  placeholder="name@example.com"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className="h-12 rounded-lg bg-white px-3.5 text-base sm:text-sm"
                  {...register("email")}
                />
                {errors.email && (
                  <p id="email-error" className="text-xs text-destructive" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={passwordVisible ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Введите пароль"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    className="h-12 rounded-lg bg-white px-3.5 pr-12 text-base sm:text-sm"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                    aria-pressed={passwordVisible}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {passwordVisible ? (
                      <EyeOff aria-hidden="true" size={17} />
                    ) : (
                      <Eye aria-hidden="true" size={17} />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="text-xs text-destructive" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {errors.root && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.root.message}
                </p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 w-full rounded-lg text-sm"
              >
                {isSubmitting && (
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                )}
                {isSubmitting ? "Входим…" : "Войти"}
              </Button>
            </form>

          </CardContent>
        </Card>
      </div>

      <footer className="pb-1 text-center text-xs text-muted-foreground">
        Система учёта инвентаря · {year}
      </footer>
    </main>
  );
}
