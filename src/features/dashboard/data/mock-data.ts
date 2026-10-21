import type { InventoryItem } from "@/features/dashboard/types/inventory";
import type { Warehouse } from "@/features/dashboard/types/warehouse";

export const mockWarehouses: Warehouse[] = [
  // Fictional demo warehouses, placed at real Stavropol addresses for map testing.
  {
    id: 1,
    name: "Основной склад",
    address: "Ставрополь, ул. Ленина, 273",
    latitude: 45.038723,
    longitude: 41.954612,
  },
  {
    id: 2,
    name: "Склад №2",
    address: "Ставрополь, просп. Кулакова, 8",
    latitude: 45.0523,
    longitude: 41.9128,
  },
  {
    id: 3,
    name: "Северный склад",
    address: "Ставрополь, ул. Дзержинского, 102",
    latitude: 45.044559,
    longitude: 41.974671,
  },
  {
    id: 4,
    name: "Западный склад",
    address: "Ставрополь, ул. 50 лет ВЛКСМ, 41/1",
    latitude: 45.00934,
    longitude: 41.91961,
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
  {
    id: 7,
    name: "Контейнеры пластиковые",
    description: "Складские ящики с крышкой, 30 л",
    quantity: 75,
    placed_quantity: 75,
    unplaced_quantity: 0,
    placements: [
      {
        id: 701,
        quantity: 75,
        warehouse: { id: 1, name: "Основной склад" },
        rack: { id: 14, code: "B-01" },
        cell: { id: 141, number: 8, level: 1, position: 2 },
      },
    ],
  },
  {
    id: 8,
    name: "Защитные перчатки",
    description: "Нитриловые, размер L",
    quantity: 120,
    placed_quantity: 120,
    unplaced_quantity: 0,
    placements: [
      {
        id: 801,
        quantity: 120,
        warehouse: { id: 1, name: "Основной склад" },
        rack: { id: 15, code: "B-02" },
        cell: { id: 151, number: 9, level: 3, position: 1 },
      },
    ],
  },
  {
    id: 9,
    name: "Маркировочные этикетки",
    description: "Термоэтикетки 58 × 40 мм",
    quantity: 24,
    placed_quantity: 24,
    unplaced_quantity: 0,
    placements: [
      {
        id: 901,
        quantity: 24,
        warehouse: { id: 1, name: "Основной склад" },
        rack: { id: 16, code: "C-01" },
        cell: { id: 161, number: 3, level: 2, position: 3 },
      },
    ],
  },
];
