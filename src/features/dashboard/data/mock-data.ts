import type { InventoryEvent } from "@/features/dashboard/types/inventory-event";
import type { InventoryItem } from "@/features/dashboard/types/inventory";
import type { Warehouse } from "@/features/dashboard/types/warehouse";

export const mockWarehouses: Warehouse[] = [
  {
    id: 1,
    name: "Основной склад",
    address: "Москва, ул. Складская, 12",
    latitude: 55.7558,
    longitude: 37.6173,
  },
  {
    id: 2,
    name: "Склад №2",
    address: "Москва, ул. Промышленная, 8",
    latitude: 55.7358,
    longitude: 37.6573,
  },
  {
    id: 3,
    name: "Северный склад",
    address: "Москва, Ленинградское шоссе, 46",
    latitude: 55.8234,
    longitude: 37.4932,
  },
  {
    id: 4,
    name: "Западный склад",
    address: "Москва, ул. Рябиновая, 44",
    latitude: 55.7044,
    longitude: 37.4304,
  },
];

export const mockInventoryItems: InventoryItem[] = [
  {
    id: 1,
    name: "Картонные коробки, 40 × 30",
    description: "Гофрокороб для упаковки товаров",
    quantity: 420,
    placed_quantity: 360,
    unplaced_quantity: 60,
    placements: [
      {
        id: 101,
        quantity: 240,
        warehouse: { id: 1, name: "Основной склад" },
        rack: { id: 11, code: "A-01" },
        cell: { id: 111, number: 4, level: 2, position: 1 },
      },
      {
        id: 102,
        quantity: 120,
        warehouse: { id: 2, name: "Склад №2" },
        rack: { id: 21, code: "B-04" },
        cell: { id: 211, number: 7, level: 1, position: 2 },
      },
    ],
  },
  {
    id: 2,
    name: "Стрейч-плёнка 500 мм",
    description: "Прозрачная упаковочная плёнка, 20 мкм",
    quantity: 156,
    placed_quantity: 156,
    unplaced_quantity: 0,
    placements: [
      {
        id: 201,
        quantity: 156,
        warehouse: { id: 1, name: "Основной склад" },
        rack: { id: 12, code: "A-02" },
        cell: { id: 121, number: 2, level: 1, position: 3 },
      },
    ],
  },
  {
    id: 3,
    name: "Маркер перманентный, чёрный",
    description: null,
    quantity: 84,
    placed_quantity: 60,
    unplaced_quantity: 24,
    placements: [
      {
        id: 301,
        quantity: 60,
        warehouse: { id: 3, name: "Северный склад" },
        rack: { id: 31, code: "C-03" },
        cell: { id: 311, number: 9, level: 3, position: 1 },
      },
    ],
  },
  {
    id: 4,
    name: "Паллеты деревянные",
    description: "Стандарт EUR 1200 × 800 мм",
    quantity: 96,
    placed_quantity: 88,
    unplaced_quantity: 8,
    placements: [
      {
        id: 401,
        quantity: 88,
        warehouse: { id: 4, name: "Западный склад" },
        rack: { id: 41, code: "D-01" },
        cell: { id: 411, number: 1, level: 1, position: 1 },
      },
    ],
  },
  {
    id: 5,
    name: "Пузырчатая плёнка",
    description: "Ширина рулона 1,2 м",
    quantity: 38,
    placed_quantity: 30,
    unplaced_quantity: 8,
    placements: [
      {
        id: 501,
        quantity: 30,
        warehouse: { id: 2, name: "Склад №2" },
        rack: { id: 22, code: "B-05" },
        cell: { id: 221, number: 3, level: 2, position: 2 },
      },
    ],
  },
  {
    id: 6,
    name: "Скотч упаковочный",
    description: "Прозрачный, 48 мм × 66 м",
    quantity: 240,
    placed_quantity: 208,
    unplaced_quantity: 32,
    placements: [
      {
        id: 601,
        quantity: 208,
        warehouse: { id: 1, name: "Основной склад" },
        rack: { id: 13, code: "A-03" },
        cell: { id: 131, number: 5, level: 2, position: 3 },
      },
    ],
  },
];

export const mockInventoryEvents: InventoryEvent[] = [
  {
    id: 1,
    title: "Поступление инвентаря",
    description: "Добавлено 48 рулонов стрейч-плёнки на Основной склад",
    created_at: "2026-10-10T13:42:00+03:00",
  },
  {
    id: 2,
    title: "Изменение количества",
    description: "Обновлён остаток упаковочных коробок на Складе №2",
    created_at: "2026-10-10T11:18:00+03:00",
  },
  {
    id: 3,
    title: "Размещение на складе",
    description: "Паллеты размещены в секции D-01 Западного склада",
    created_at: "2026-10-09T16:05:00+03:00",
  },
  {
    id: 4,
    title: "Новый склад",
    description: "Добавлен Северный склад",
    created_at: "2026-10-09T10:24:00+03:00",
  },
  {
    id: 5,
    title: "Инвентарь перемещён",
    description: "60 коробок перемещены на Основной склад",
    created_at: "2026-10-08T14:50:00+03:00",
  },
  {
    id: 6,
    title: "Поступление инвентаря",
    description: "Получена партия упаковочного скотча",
    created_at: "2026-10-08T09:12:00+03:00",
  },
  {
    id: 7,
    title: "Обновление адреса",
    description: "Уточнён адрес Западного склада",
    created_at: "2026-10-07T17:36:00+03:00",
  },
];
