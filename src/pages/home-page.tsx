import { Button } from "@/components/ui/button";
import type { DemoUser } from "@/features/auth/services/auth-service";

type HomePageProps = {
  user: DemoUser;
  onLogout: () => void;
};

export function HomePage({ user, onLogout }: HomePageProps) {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Демо-вход выполнен</h1>
      <p className="mt-2 text-sm text-muted-foreground">Вы вошли как {user.email}.</p>
      <Button variant="outline" className="mt-5" onClick={onLogout}>
        Выйти
      </Button>
    </main>
  );
}
