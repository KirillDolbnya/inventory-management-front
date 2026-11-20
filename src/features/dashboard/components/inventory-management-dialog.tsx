import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, LoaderCircle, X } from "lucide-react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import type { InventoryItem } from "@/features/dashboard/types/inventory";

type InventoryManagementDialogProps = {
  item: InventoryItem;
  mode: "edit" | "delete";
  closeRequestRef?: { current: (() => boolean) | null };
  onClose: () => void;
  onUpdated: (item: { id: number; name: string; description: string | null; quantity: number }) => Promise<void>;
  onDeleted: (inventoryId: number) => Promise<void>;
};

const nameSchema = z.string().trim().min(1, "Укажите название.").max(255, "Не более 255 символов.");
const descriptionSchema = z.string().trim().max(255, "Не более 255 символов.");

function getRequestError(error: unknown, mode: "edit" | "delete") {
  if (!(error instanceof ApiError)) return "Не удалось выполнить операцию. Попробуйте ещё раз.";
  if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
  if (error.status === 403) return "У вас нет доступа к этой операции.";
  if (error.status === 404) return "Позиция уже удалена или недоступна. Обновите список инвентаря.";
  if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
  if (error.status === 409 && mode === "edit") {
    return "Общее количество нельзя сделать меньше уже размещённого. Увеличьте количество или сначала снимите часть с размещения.";
  }
  if (error.status === 409 && mode === "delete") {
    return "Нельзя удалить позицию, пока она размещена в ячейках или зарезервирована в событиях. Сначала снимите размещения и завершите или отмените резервы.";
  }
  if (error.kind === "network") return "Не удалось подключиться к серверу. Проверьте соединение и попробуйте снова.";
  if (error.status >= 500) return "Сервер временно недоступен. Попробуйте позже.";
  return error.payload?.message ?? "Не удалось выполнить операцию. Проверьте данные и попробуйте снова.";
}

export function InventoryManagementDialog({ item, mode, closeRequestRef, onClose, onUpdated, onDeleted }: InventoryManagementDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const schema = useMemo(() => z.object({
    name: nameSchema,
    description: descriptionSchema,
    quantity: z.number({ error: "Укажите количество." })
      .int("Введите целое число.")
      .min(Math.max(1, item.placed_quantity), item.placed_quantity > 0
        ? `Количество не может быть меньше уже размещённого — ${item.placed_quantity} шт.`
        : "Количество должно быть не меньше 1.")
      .max(5000, "Количество не может быть больше 5000."),
  }), [item.placed_quantity]);
  type FormValues = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    clearErrors,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: item.name, description: item.description ?? "", quantity: item.quantity },
  });
  const busy = isSubmitting || deleting;
  const title = mode === "edit" ? "Редактировать инвентарь" : "Удалить инвентарь";

  const requestClose = () => {
    if (busy) return false;
    if (mode === "edit" && isDirty && !window.confirm("Закрыть панель? Несохранённые изменения будут потеряны.")) return false;
    onClose();
    return true;
  };

  useEffect(() => {
    if (!closeRequestRef) return;
    closeRequestRef.current = requestClose;
    return () => {
      if (closeRequestRef.current === requestClose) closeRequestRef.current = null;
    };
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.show();
    reset({ name: item.name, description: item.description ?? "", quantity: item.quantity });
  }, [item, reset]);

  const submit: SubmitHandler<FormValues> = async (values) => {
    clearErrors();
    try {
      const updated = await dashboardDataService.updateInventory(item.id, {
        name: values.name,
        description: values.description || null,
        quantity: values.quantity,
      });
      await onUpdated(updated);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const fieldErrors = error.payload?.errors;
        const nameError = fieldErrors?.name?.[0];
        const descriptionError = fieldErrors?.description?.[0];
        const quantityError = fieldErrors?.quantity?.[0];
        if (nameError) setError("name", { type: "server", message: nameError });
        if (descriptionError) setError("description", { type: "server", message: descriptionError });
        if (quantityError) setError("quantity", { type: "server", message: quantityError });
        if (!nameError && !descriptionError && !quantityError) setError("root", { type: "server", message: error.payload?.message ?? getRequestError(error, mode) });
        return;
      }
      setError("root", { type: "server", message: getRequestError(error, mode) });
    }
  };

  const confirmDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await dashboardDataService.deleteInventory(item.id);
      await onDeleted(item.id);
      onClose();
    } catch (error) {
      setDeleteError(getRequestError(error, "delete"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <dialog
      aria-labelledby="inventory-management-title"
      className="inventory-create-dialog workspace-editor-dialog"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      {mode === "edit" ? (
        <form className="inventory-create-dialog__form" noValidate onSubmit={handleSubmit(submit)}>
          <header className="inventory-create-dialog__header">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight" id="inventory-management-title">{title}</h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">{item.name}</p>
            </div>
            <Button aria-label="Закрыть" className="size-10 shrink-0 rounded-lg" disabled={busy} onClick={requestClose} size="icon" type="button" variant="ghost">
              <X aria-hidden="true" size={17} />
            </Button>
          </header>

          <div className="inventory-create-dialog__fields">
            <div className="space-y-2">
              <Label htmlFor="inventory-edit-name">Название</Label>
              <Input aria-invalid={Boolean(errors.name)} className="h-12 rounded-lg bg-white text-base sm:text-sm" id="inventory-edit-name" maxLength={255} {...register("name")} />
              {errors.name && <p className="text-xs text-destructive" role="alert">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-edit-description">Описание <span className="font-normal text-muted-foreground">(необязательно)</span></Label>
              <Input aria-invalid={Boolean(errors.description)} className="h-12 rounded-lg bg-white text-base sm:text-sm" id="inventory-edit-description" maxLength={255} {...register("description")} />
              {errors.description && <p className="text-xs text-destructive" role="alert">{errors.description.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-edit-quantity">Общее количество</Label>
              <Input
                aria-describedby={item.placed_quantity > 0 ? "inventory-edit-quantity-help" : undefined}
                aria-invalid={Boolean(errors.quantity)}
                className="h-12 rounded-lg bg-white text-base sm:text-sm"
                id="inventory-edit-quantity"
                inputMode="numeric"
                max={5000}
                min={Math.max(1, item.placed_quantity)}
                step={1}
                type="number"
                {...register("quantity", { valueAsNumber: true })}
              />
              {item.placed_quantity > 0 && <p className="text-xs leading-5 text-muted-foreground" id="inventory-edit-quantity-help">Уже размещено: {item.placed_quantity} шт. Общее количество не может быть меньше.</p>}
              {errors.quantity && <p className="text-xs text-destructive" role="alert">{errors.quantity.message}</p>}
            </div>
            {errors.root && <p className="text-sm text-destructive" role="alert">{errors.root.message}</p>}
          </div>

          <footer className="inventory-create-dialog__footer">
            <Button className="h-12 flex-1 rounded-lg sm:flex-none" disabled={busy} onClick={requestClose} type="button" variant="outline">Отмена</Button>
            <Button className="h-12 flex-1 rounded-lg sm:flex-none" disabled={busy} type="submit">
              {busy && <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />}
              {busy ? "Сохраняем…" : "Сохранить"}
            </Button>
          </footer>
        </form>
      ) : (
        <div className="inventory-create-dialog__form">
          <header className="inventory-create-dialog__header">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight" id="inventory-management-title">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Это действие нельзя отменить.</p>
            </div>
            <Button aria-label="Закрыть" className="size-10 shrink-0 rounded-lg" disabled={busy} onClick={requestClose} size="icon" type="button" variant="ghost">
              <X aria-hidden="true" size={17} />
            </Button>
          </header>
          <div className="inventory-create-dialog__fields">
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" size={18} />
              <div className="min-w-0 text-sm leading-5">
                <p>Вы собираетесь удалить <strong className="break-words">{item.name}</strong>.</p>
                <p className="mt-2 text-amber-900">Удаление заблокируется, если у позиции есть размещения в ячейках или резервы в событиях. Сначала обработайте их в соответствующих разделах.</p>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              <Summary label="Всего" value={item.quantity} />
              <Summary label="Размещено" value={item.placed_quantity} />
              <Summary label="Не размещено" value={item.unplaced_quantity} />
            </dl>
            {deleteError && <p className="text-sm leading-5 text-destructive" role="alert">{deleteError}</p>}
          </div>
          <footer className="inventory-create-dialog__footer">
            <Button className="h-12 flex-1 rounded-lg sm:flex-none" disabled={busy} onClick={requestClose} type="button" variant="outline">Отмена</Button>
            <Button className="h-12 flex-1 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:flex-none" disabled={busy} onClick={() => void confirmDelete()} type="button">
              {deleting && <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />}
              {deleting ? "Удаляем…" : "Удалить"}
            </Button>
          </footer>
        </div>
      )}
    </dialog>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/70 px-2.5 py-2">
      <dt className="truncate text-[10px] leading-4 text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value.toLocaleString("ru-RU")}</dd>
    </div>
  );
}
