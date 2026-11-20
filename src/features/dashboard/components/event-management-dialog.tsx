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
import type { InventoryEventDetail, UpdateEventInput } from "@/features/dashboard/types/inventory-event";

type EventManagementDialogProps = {
  event: InventoryEventDetail;
  mode: "edit" | "delete";
  closeRequestRef?: { current: (() => boolean) | null };
  onClose: () => void;
  onUpdated: (eventId: number) => Promise<void>;
  onDeleted: (eventId: number) => Promise<void>;
};

type EventFormValues = { name: string; description: string; starts_at: string; ends_at: string };

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoWithLocalOffset(value: string) {
  const date = new Date(value);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const pad = (part: number) => String(part).padStart(2, "0");
  const offset = `${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${offset}`;
}

function getErrorMessage(error: unknown, mode: "edit" | "delete") {
  if (!(error instanceof ApiError)) return "Не удалось выполнить операцию. Попробуйте ещё раз.";
  if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
  if (error.status === 403) return "У вас нет доступа к этой операции.";
  if (error.status === 404) return "Событие больше не найдено. Обновите список событий.";
  if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
  if (error.status === 409 && mode === "edit") {
    const message = error.payload?.message?.toLocaleLowerCase("ru-RU") ?? "";
    if (message.includes("дата начала") || message.includes("окончания")) return "Дата окончания должна быть позже даты начала.";
    return "Нельзя изменить период: доступного количества инвентаря на эти даты не хватает. Измените даты или бронирования.";
  }
  if (error.status === 422) return error.payload?.message ?? "Сервер отклонил данные. Проверьте название и даты.";
  if (error.kind === "network") return "Не удалось подключиться к серверу. Проверьте соединение и попробуйте снова.";
  if (error.status >= 500) return "Сервер временно недоступен. Попробуйте позже.";
  return "Не удалось выполнить операцию. Проверьте данные и попробуйте снова.";
}

function createSchema(baseline: EventFormValues) {
  return z.object({
    name: z.string().trim().min(1, "Укажите название события.").max(255, "Не более 255 символов."),
    description: z.string().max(255, "Не более 255 символов."),
    starts_at: z.string().min(1, "Укажите дату и время начала."),
    ends_at: z.string().min(1, "Укажите дату и время окончания."),
  }).superRefine((values, context) => {
    const start = new Date(values.starts_at);
    const end = new Date(values.ends_at);
    if (Number.isNaN(start.getTime())) {
      context.addIssue({ code: "custom", path: ["starts_at"], message: "Проверьте дату начала." });
    } else if (values.starts_at !== baseline.starts_at && start.getTime() < Date.now()) {
      context.addIssue({ code: "custom", path: ["starts_at"], message: "Новое начало не может быть в прошлом." });
    }
    if (Number.isNaN(end.getTime())) {
      context.addIssue({ code: "custom", path: ["ends_at"], message: "Проверьте дату окончания." });
    } else if (end.getTime() <= start.getTime()) {
      context.addIssue({ code: "custom", path: ["ends_at"], message: "Окончание должно быть позже начала." });
    }
  });
}

export function EventManagementDialog({ event, mode, closeRequestRef, onClose, onUpdated, onDeleted }: EventManagementDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const baseline = useMemo<EventFormValues>(() => ({
    name: event.name,
    description: event.description ?? "",
    starts_at: toLocalDateTime(event.starts_at),
    ends_at: toLocalDateTime(event.ends_at),
  }), [event]);
  const schema = useMemo(() => createSchema(baseline), [baseline]);
  type FormValues = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: baseline });
  const busy = isSubmitting || deleting;

  const requestClose = () => {
    if (busy) return false;
    if (mode === "edit" && isDirty && !window.confirm("Закрыть панель? Несохранённые изменения события будут потеряны.")) return false;
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
  }, []);

  const submit: SubmitHandler<FormValues> = async (values) => {
    clearErrors();
    const input: UpdateEventInput = {};
    const name = values.name.trim();
    const description = values.description.trim() || null;
    if (name !== event.name) input.name = name;
    if (description !== event.description) input.description = description;
    if (values.starts_at !== baseline.starts_at) input.starts_at = toIsoWithLocalOffset(values.starts_at);
    if (values.ends_at !== baseline.ends_at) input.ends_at = toIsoWithLocalOffset(values.ends_at);
    if (!Object.keys(input).length) {
      setError("root", { type: "manual", message: "Изменений нет." });
      return;
    }

    try {
      await dashboardDataService.updateEvent(event.id, input);
      await onUpdated(event.id);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.payload?.errors) {
        const fieldNames = ["name", "description", "starts_at", "ends_at"] as const;
        let hasFieldError = false;
        for (const field of fieldNames) {
          const message = error.payload.errors[field]?.[0];
          if (message) {
            setError(field, { type: "server", message });
            hasFieldError = true;
          }
        }
        if (!hasFieldError) setError("root", { type: "server", message: error.payload.message ?? getErrorMessage(error, mode) });
        return;
      }
      setError("root", { type: "server", message: getErrorMessage(error, mode) });
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await dashboardDataService.deleteEvent(event.id);
      await onDeleted(event.id);
      onClose();
    } catch (error) {
      setError("root", { type: "server", message: getErrorMessage(error, "delete") });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <dialog
      aria-labelledby="event-management-title"
      className={mode === "edit" ? "event-create-dialog workspace-editor-dialog" : "inventory-create-dialog workspace-editor-dialog"}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current) requestClose(); }}
      onClose={() => undefined}
      ref={dialogRef}
    >
      {mode === "edit" ? (
        <form className="event-create-dialog__form" noValidate onSubmit={handleSubmit(submit)}>
          <header className="event-create-dialog__header">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight" id="event-management-title">Редактировать событие</h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">{event.name}</p>
            </div>
            <Button aria-label="Закрыть" className="size-10 shrink-0 rounded-lg" disabled={busy} onClick={requestClose} size="icon" type="button" variant="ghost"><X aria-hidden="true" size={17} /></Button>
          </header>
          <div className="event-create-dialog__body">
            <div className="mx-auto grid w-full max-w-xl gap-5 py-2">
              <div className="space-y-2">
                <Label htmlFor="event-edit-name">Название</Label>
                <Input aria-invalid={Boolean(errors.name)} className="h-12 rounded-lg bg-white text-base sm:text-sm" id="event-edit-name" maxLength={255} {...register("name")} />
                {errors.name && <p className="text-xs text-destructive" role="alert">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-edit-description">Описание <span className="font-normal text-muted-foreground">(необязательно)</span></Label>
                <textarea aria-invalid={Boolean(errors.description)} className="min-h-24 w-full resize-y rounded-lg border border-input bg-white px-3 py-2.5 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm" id="event-edit-description" maxLength={255} {...register("description")} />
                {errors.description && <p className="text-xs text-destructive" role="alert">{errors.description.message}</p>}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="event-edit-starts-at">Начало</Label>
                  <Input aria-invalid={Boolean(errors.starts_at)} className="h-12 rounded-lg bg-white text-base sm:text-sm" id="event-edit-starts-at" type="datetime-local" {...register("starts_at")} />
                  {errors.starts_at && <p className="text-xs text-destructive" role="alert">{errors.starts_at.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-edit-ends-at">Окончание</Label>
                  <Input aria-invalid={Boolean(errors.ends_at)} className="h-12 rounded-lg bg-white text-base sm:text-sm" id="event-edit-ends-at" type="datetime-local" {...register("ends_at")} />
                  {errors.ends_at && <p className="text-xs text-destructive" role="alert">{errors.ends_at.message}</p>}
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">Даты передаются с часовым поясом устройства. Изменение периода повторно проверяется backend по всем активным бронированиям.</p>
              {errors.root && <p className="text-sm text-destructive" role="alert">{errors.root.message}</p>}
            </div>
          </div>
          <footer className="event-create-dialog__footer">
            <Button className="h-11 min-w-24 rounded-lg" disabled={busy} onClick={requestClose} type="button" variant="outline">Отмена</Button>
            <Button className="h-11 min-w-36 rounded-lg" disabled={busy || !isDirty} type="submit">{busy ? <><LoaderCircle aria-hidden="true" className="animate-spin" size={16} />Сохраняем…</> : "Сохранить"}</Button>
          </footer>
        </form>
      ) : (
        <div className="inventory-create-dialog__form">
          <header className="inventory-create-dialog__header">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight" id="event-management-title">Удалить событие</h2>
              <p className="mt-1 text-sm text-muted-foreground">Это действие нельзя отменить.</p>
            </div>
            <Button aria-label="Закрыть" className="size-10 shrink-0 rounded-lg" disabled={busy} onClick={requestClose} size="icon" type="button" variant="ghost"><X aria-hidden="true" size={17} /></Button>
          </header>
          <div className="inventory-create-dialog__fields">
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" size={18} />
              <div className="min-w-0 text-sm leading-5">
                <p>Удалить событие <strong className="break-words">{event.name}</strong>?</p>
                <p className="mt-2 text-amber-900">Связанные бронирования тоже будут удалены. Инвентарь и физические размещения останутся без изменений.</p>
              </div>
            </div>
            {errors.root?.message && <p className="text-sm text-destructive" role="alert">{errors.root.message}</p>}
          </div>
          <footer className="inventory-create-dialog__footer">
            <Button className="h-12 flex-1 rounded-lg sm:flex-none" disabled={busy} onClick={requestClose} type="button" variant="outline">Отмена</Button>
            <Button className="h-12 flex-1 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:flex-none" disabled={busy} onClick={() => void confirmDelete()} type="button">{deleting ? <><LoaderCircle aria-hidden="true" className="animate-spin" size={16} />Удаляем…</> : "Удалить событие"}</Button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
