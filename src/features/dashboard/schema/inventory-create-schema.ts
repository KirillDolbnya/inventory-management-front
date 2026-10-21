import { z } from "zod";

export const inventoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Укажите название.").max(255, "Не более 255 символов."),
  description: z.string().trim().max(255, "Не более 255 символов."),
  quantity: z.number({ error: "Укажите количество." })
    .int("Введите целое число.")
    .min(1, "Количество должно быть не меньше 1."),
});

export type InventoryCreateFormValues = z.infer<typeof inventoryCreateSchema>;
