import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Navigate, Route, Routes } from "react-router";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/api/client";
import {
  getCurrentUser,
  signOut,
  type AuthenticatedUser,
} from "@/features/auth/api/auth";
import { LoginPage } from "@/features/auth/pages/login-page";

const HomePage = lazy(() =>
  import("@/pages/home-page").then((module) => ({ default: module.HomePage })),
);
const WarehousePage = lazy(() =>
  import("@/pages/warehouse-page").then((module) => ({ default: module.WarehousePage })),
);

type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "unavailable";

export default function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");

  const checkSession = useCallback(async () => {
    setAuthStatus("checking");
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      setAuthStatus("authenticated");
    } catch (error) {
      setUser(null);
      setAuthStatus(error instanceof ApiError && error.status === 401
        ? "unauthenticated"
        : "unavailable");
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const handleAuthenticated = (authenticatedUser: AuthenticatedUser) => {
    setUser(authenticatedUser);
    setAuthStatus("authenticated");
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      // A 401 means the session has already expired on the backend.
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    setUser(null);
    setAuthStatus("unauthenticated");
  };

  if (authStatus === "checking") return <AuthLoading />;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage onAuthenticated={handleAuthenticated} />
          )
        }
      />
      <Route
        path="/"
        element={
          user ? (
            <Suspense fallback={<AuthLoading label="Загружаем страницу…" />}>
              <HomePage user={user} onLogout={handleLogout} />
            </Suspense>
          ) : authStatus === "unavailable" ? (
            <AuthSessionUnavailable onRetry={() => void checkSession()} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/warehouses/:warehouseId"
        element={
          user ? (
            <Suspense fallback={<AuthLoading label="Загружаем страницу…" />}>
              <WarehousePage />
            </Suspense>
          ) : authStatus === "unavailable" ? (
            <AuthSessionUnavailable onRetry={() => void checkSession()} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
    </Routes>
  );
}

function AuthLoading({ label = "Проверяем авторизацию…" }: { label?: string }) {
  return (
    <main aria-busy="true" className="fixed inset-0 flex items-center justify-center bg-[#eef0f2]">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
        <span>{label}</span>
      </div>
    </main>
  );
}

function AuthSessionUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="fixed inset-0 flex items-center justify-center bg-[#eef0f2] px-5">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <p className="text-sm leading-6 text-muted-foreground" role="alert">
          Не удалось проверить авторизацию. Проверьте подключение к серверу и попробуйте ещё раз.
        </p>
        <Button onClick={onRetry} type="button" variant="outline">
          Повторить
        </Button>
      </div>
    </main>
  );
}
