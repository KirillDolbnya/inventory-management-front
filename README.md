# Inventory Management Frontend

Адаптивный интерфейс учёта склада на React, TypeScript, Vite, Tailwind CSS и shadcn/ui.

Для запуска среды разработки выполните `docker compose up --build` и откройте http://localhost:5173. Адрес Laravel API задаётся через `VITE_API_URL` (пример в `.env.example`).

Production-образ:

```sh
docker build --target production -t inventory-management-front .
docker run --rm -p 8080:80 inventory-management-front
```

Первый экран использует демонстрационные данные. API, реальная карта и DaData пока не подключены.
