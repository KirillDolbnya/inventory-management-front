# Inventory Management Frontend

Адаптивный интерфейс учёта склада на React, TypeScript, Vite, Tailwind CSS и shadcn/ui.

Для запуска среды разработки выполните `docker compose up --build` и откройте http://localhost:5173. Адрес Laravel API задаётся через `VITE_API_URL`, а адрес карты — через `VITE_MAP_TILE_URL` (примеры в `.env.example`).

Production-образ:

```sh
docker build --target production -t inventory-management-front .
docker run --rm -p 8080:80 inventory-management-front
```

Главная страница показывает склады на OpenStreetMap, список mock-инвентаря и события. Для отображения карты используется публичный слой тайлов OpenStreetMap с атрибуцией; для production-нагрузки можно указать другой совместимый источник в `VITE_MAP_TILE_URL`.

Авторизация подключена к Laravel API через cookie-сессию Sanctum. Frontend сначала получает `/sanctum/csrf-cookie`, затем отправляет `POST /api/auth/sign-in`; все запросы передают cookies. Укажите адрес API в `VITE_API_URL` (по умолчанию для локального backend — `http://localhost:8080/api`). Backend должен разрешать origin `http://localhost:5173` с credentials и включать `localhost:5173` в `SANCTUM_STATEFUL_DOMAINS`.

Сейчас backend не предоставляет endpoint для чтения текущего пользователя. Поэтому после обновления страницы UI безопасно возвращается на `/login`; cookie-сессия не подменяется флагом в браузерном хранилище. Для восстановления входа нужен документированный endpoint, возвращающий текущего пользователя.

Склады, инвентарь и события остаются на mock-данных. DaData и остальные backend endpoints пока не подключены.

Авторизованный пользователь может открыть страницу склада по маршруту `/warehouses/:warehouseId`. На ней показана интерактивная процедурная 3D-модель с демонстрационными стеллажами и ячейками, списком размещённого на складе инвентаря и событиями. Геометрия модели и данные складов пока mock-овые; API для страницы не подключён.
