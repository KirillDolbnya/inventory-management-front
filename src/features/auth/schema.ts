import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Введите корректный email."),
  password: z.string().min(1, "Введите пароль."),
  remember: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
