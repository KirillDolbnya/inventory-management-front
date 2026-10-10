# Inventory Management Frontend

Адаптивный интерфейс учёта склада на React, TypeScript, Vite, Tailwind CSS и shadcn/ui.

Для запуска среды разработки выполните `docker compose up --build` и откройте http://localhost:5173. Адрес Laravel API задаётся через `VITE_API_URL`, а адрес карты — через `VITE_MAP_TILE_URL` (примеры в `.env.example`).

Production-образ:

```sh
docker build --target production -t inventory-management-front .
docker run --rm -p 8080:80 inventory-management-front
```

Главная страница показывает склады на OpenStreetMap, список mock-инвентаря и события. Для отображения карты используется публичный слой тайлов OpenStreetMap с атрибуцией; для production-нагрузки можно указать другой совместимый источник в `VITE_MAP_TILE_URL`. Backend API и DaData пока не подключены.
