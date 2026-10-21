import { useEffect, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, X } from "lucide-react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import {
  inventoryCreateSchema,
  type InventoryCreateFormValues,
} from "@/features/dashboard/schema/inventory-create-schema";

type InventoryCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
};

function getSubmitErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
    if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
    if (error.status === 403) return "У вас нет доступа для добавления инвентаря.";
    if (error.kind === "network") return "Не удалось подключиться к серверу. Проверьте соединение и попробуйте снова.";
    if (error.kind === "configuration" || error.kind === "response") {
      return "Не удалось обработать ответ. Попробуйте позже.";
    }
  }
  return "Не удалось добавить инвентарь. Проверьте данные и попробуйте снова.";
}

export function InventoryCreateDialog({ open, onClose, onCreated }: InventoryCreateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const {
    register,
    handleSubmit,
    clearErrors,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InventoryCreateFormValues>({
    resolver: zodResolver(inventoryCreateSchema),
    defaultValues: { name: "", description: "", quantity: 1 },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit: SubmitHandler<InventoryCreateFormValues> = async (values) => {
    clearErrors(["name", "description", "quantity"]);
    clearErrors("root");
    try {
      await dashboardDataService.createInventory({
        name: values.name,
        description: values.description || null,
        quantity: values.quantity,
      });
      await onCreated();
      reset({ name: "", description: "", quantity: 1 });
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
        if (!nameError && !descriptionError && !quantityError) {
          setError("root", { type: "server", message: error.payload?.message ?? getSubmitErrorMessage(error) });
        }
        return;
      }
      setError("root", {
        type: "server",
        message: error instanceof ApiError && error.payload?.message && error.status >= 500
          ? "Не удалось добавить инвентарь из-за ошибки сервера. Попробуйте позже."
          : getSubmitErrorMessage(error),
      });
    }
  };

  return (
    <dialog
      aria-labelledby="inventory-create-title"
      className="inventory-create-dialog"
      onCancel={(event) => {
        if (isSubmitting) event.preventDefault();
        else onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !isSubmitting) onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <form className="inventory-create-dialog__form" noValidate onSubmit={handleSubmit(submit)}>
        <header className="inventory-create-dialog__header">
          <div>
            <h2 className="text-lg font-semibold tracking-tight" id="inventory-create-title">
              Добавить инвентарь
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Укажите название и количество.</p>
          </div>
          <Button
            aria-label="Закрыть"
            className="size-10 rounded-lg"
            disabled={isSubmitting}
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" size={17} />
          </Button>
        </header>

        <div className="inventory-create-dialog__fields">
          <div className="space-y-2">
            <Label htmlFor="inventory-name">Название</Label>
            <Input
              aria-describedby={errors.name ? "inventory-name-error" : undefined}
              aria-invalid={Boolean(errors.name)}
              autoComplete="off"
              className="h-12 rounded-lg bg-white text-base sm:text-sm"
              id="inventory-name"
              maxLength={255}
              {...register("name")}
            />
            {errors.name && <p className="text-xs text-destructive" id="inventory-name-error" role="alert">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inventory-description">Описание <span className="font-normal text-muted-foreground">(необязательно)</span></Label>
            <Input
              aria-describedby={errors.description ? "inventory-description-error" : undefined}
              aria-invalid={Boolean(errors.description)}
              className="h-12 rounded-lg bg-white text-base sm:text-sm"
              id="inventory-description"
              maxLength={255}
              {...register("description")}
            />
            {errors.description && <p className="text-xs text-destructive" id="inventory-description-error" role="alert">{errors.description.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inventory-quantity">Количество</Label>
            <Input
              aria-describedby={errors.quantity ? "inventory-quantity-error" : undefined}
              aria-invalid={Boolean(errors.quantity)}
              className="h-12 rounded-lg bg-white text-base sm:text-sm"
              id="inventory-quantity"
              inputMode="numeric"
              min={1}
              step={1}
              type="number"
              {...register("quantity", { valueAsNumber: true })}
            />
            {errors.quantity && <p className="text-xs text-destructive" id="inventory-quantity-error" role="alert">{errors.quantity.message}</p>}
          </div>

          {errors.root && <p className="text-sm text-destructive" role="alert">{errors.root.message}</p>}
        </div>

        <footer className="inventory-create-dialog__footer">
          <Button className="h-12 flex-1 rounded-lg sm:flex-none" disabled={isSubmitting} onClick={onClose} type="button" variant="outline">
            Отмена
          </Button>
          <Button className="h-12 flex-1 rounded-lg sm:flex-none" disabled={isSubmitting} type="submit">
            {isSubmitting && <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />}
            {isSubmitting ? "Добавляем…" : "Добавить"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
