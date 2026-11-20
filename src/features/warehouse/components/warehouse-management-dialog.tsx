import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AlertTriangle, LoaderCircle, MapPin, Pencil, Trash2, X } from "lucide-react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { warehouseApi, type AddressSuggestion } from "@/features/warehouse/api/warehouse-api";
import type { Warehouse } from "@/features/dashboard/types/warehouse";
import "@/features/warehouse/warehouse-management.css";

const formSchema = z.object({
  name: z.string().trim().min(1, "Введите название склада.").max(255, "Не более 255 символов."),
  address: z.string().trim().min(2, "Введите не менее двух символов.").max(300, "Не более 300 символов."),
});

type FormValues = z.infer<typeof formSchema>;
export type WarehouseManagementMode = "edit" | "delete" | "delete-layout";

type WarehouseManagementDialogProps = {
  open: boolean;
  warehouse: Warehouse;
  mode: WarehouseManagementMode;
  context?: "dashboard" | "warehouse";
  closeRequestRef?: { current: (() => boolean) | null };
  onClose: () => void;
  onSaved: (warehouse: Warehouse) => void;
  onDeleted: () => void;
};

function messageForError(error: unknown, mode: WarehouseManagementMode) {
  if (!(error instanceof ApiError)) return "Не удалось выполнить действие. Попробуйте ещё раз.";
  if (error.status === 0 || error.kind === "network") return "Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.";
  if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
  if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
  if (error.status === 403) return "У вас нет доступа для выполнения этого действия.";
  if (error.status === 404) return "Склад уже удалён или больше недоступен. Обновите список складов.";
  if (error.status === 409) {
    return mode === "delete-layout"
      ? "Нельзя удалить планировку, пока на складе есть активные размещения инвентаря."
      : "Нельзя удалить склад, пока на нём есть активные размещения инвентаря.";
  }
  if (error.status === 422) return "Проверьте название и выбранный адрес склада.";
  return "Сервер не смог выполнить запрос. Попробуйте позже.";
}

export function WarehouseManagementDialog({
  open,
  warehouse,
  mode,
  context = "dashboard",
  closeRequestRef,
  onClose,
  onSaved,
  onDeleted,
}: WarehouseManagementDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AddressSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const addressListId = `warehouse-edit-address-${warehouse.id}`;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: warehouse.name, address: warehouse.address },
  });
  const addressValue = form.watch("address");
  const formIsDirty = form.formState.isDirty;

  const closeWithAnimation = (afterClose?: () => void) => {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (dialogRef.current?.open) dialogRef.current.close();
      afterClose?.();
      onClose();
    }, 170);
  };

  const requestClose = () => {
    if (pending || closing) return false;
    if (mode === "edit" && formIsDirty && !saved && !window.confirm("Закрыть панель? Несохранённые изменения склада будут потеряны.")) return false;
    closeWithAnimation();
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
    if (!dialog) return;
    if (open && !dialog.open) {
      setClosing(false);
      if (context === "warehouse") dialog.show();
      else dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [context, open]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (context !== "warehouse" || !open) return;
    const dialog = dialogRef.current;
    const infoCard = document.querySelector<HTMLElement>(".warehouse-info-card");
    if (!dialog || !infoCard) return;

    const updateInfoCardOffset = () => {
      const bounds = infoCard.getBoundingClientRect();
      dialog.style.setProperty("--warehouse-info-card-bottom", `${Math.ceil(bounds.bottom)}px`);
      dialog.style.setProperty("--warehouse-info-card-width", `${Math.ceil(bounds.width)}px`);
      dialog.style.setProperty("--warehouse-info-card-right", `${Math.max(0, Math.ceil(window.innerWidth - bounds.right))}px`);
    };
    updateInfoCardOffset();
    const observer = new ResizeObserver(updateInfoCardOffset);
    observer.observe(infoCard);
    window.addEventListener("resize", updateInfoCardOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateInfoCardOffset);
    };
  }, [context, open]);

  useEffect(() => {
    if (!open) return;
    form.reset({ name: warehouse.name, address: warehouse.address });
    setSelectedSuggestion(null);
    setSuggestions([]);
    setSuggestionsError("");
    setSubmitError("");
    setSaved(false);
  }, [form.reset, mode, open, warehouse.address, warehouse.name]);

  useEffect(() => {
    const query = addressValue?.trim() ?? "";
    if (!open || mode !== "edit" || query.length < 2 || query === warehouse.address || selectedSuggestion?.address === query) {
      setSuggestions([]);
      setSuggestionsError("");
      setSuggestionsLoading(false);
      return;
    }

    let current = true;
    const timer = window.setTimeout(() => {
      setSuggestionsLoading(true);
      setSuggestionsError("");
      void warehouseApi.suggestAddresses(query)
        .then((result) => { if (current) setSuggestions(result); })
        .catch(() => {
          if (current) {
            setSuggestions([]);
            setSuggestionsError("Не удалось получить подсказки адреса. Проверьте соединение и попробуйте снова.");
          }
        })
        .finally(() => { if (current) setSuggestionsLoading(false); });
    }, 320);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [addressValue, mode, open, selectedSuggestion, warehouse.address]);

  const saveChanges = form.handleSubmit(async (values) => {
    setSubmitError("");
    setSaved(false);
    const name = values.name.trim();
    const addressChanged = values.address.trim() !== warehouse.address;
    if (addressChanged && !selectedSuggestion) {
      setSubmitError("Выберите адрес из подсказок, чтобы сохранить его корректный FIAS ID.");
      return;
    }
    const input: { name?: string; fias_id?: string } = {};
    if (name !== warehouse.name) input.name = name;
    if (addressChanged && selectedSuggestion) input.fias_id = selectedSuggestion.fias_id;
    if (!Object.keys(input).length) {
      setSaved(true);
      return;
    }

    setPending(true);
    try {
      const updated = await warehouseApi.updateWarehouse(warehouse.id, input);
      onSaved(updated);
      setSaved(true);
      closeWithAnimation();
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const nameError = error.payload?.errors?.name?.[0];
        const addressError = error.payload?.errors?.fias_id?.[0];
        if (nameError) form.setError("name", { message: nameError });
        if (addressError) setSubmitError(addressError);
        else if (!nameError) setSubmitError(messageForError(error, mode));
      } else setSubmitError(messageForError(error, mode));
    } finally {
      setPending(false);
    }
  });

  const confirmDelete = async () => {
    setPending(true);
    setSubmitError("");
    try {
      if (mode === "delete-layout") await warehouseApi.deleteLayout(warehouse.id);
      else await warehouseApi.deleteWarehouse(warehouse.id);
      closeWithAnimation(onDeleted);
    } catch (error) {
      setSubmitError(messageForError(error, mode));
    } finally {
      setPending(false);
    }
  };

  const editing = mode === "edit";
  const deletingLayout = mode === "delete-layout";
  const title = editing ? "Редактировать склад" : deletingLayout ? "Удалить планировку?" : "Удалить склад?";

  return (
    <dialog
      aria-labelledby={`warehouse-management-title-${warehouse.id}`}
      className={`warehouse-management-dialog${context === "dashboard" ? " warehouse-management-dialog--dashboard" : " warehouse-management-dialog--below-info-card"}${closing ? " is-closing" : ""}`}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current) requestClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          requestClose();
        }
      }}
      onClose={() => undefined}
      ref={dialogRef}
    >
      <section className="warehouse-management-dialog__surface">
        <header className="warehouse-management-dialog__header">
          <div className="min-w-0">
            <h2 id={`warehouse-management-title-${warehouse.id}`}>{title}</h2>
            <p>{warehouse.name}</p>
          </div>
          <Button aria-label="Закрыть" className="size-10 shrink-0 rounded-lg" disabled={pending} onClick={requestClose} size="icon" type="button" variant="ghost">
            <X aria-hidden="true" size={17} />
          </Button>
        </header>

        {editing ? (
          <form className="warehouse-management-dialog__body" noValidate onSubmit={saveChanges}>
            <div className="space-y-2">
              <Label htmlFor={`warehouse-edit-name-${warehouse.id}`}>Название склада</Label>
              <Input
                autoComplete="organization"
                className="h-12 rounded-lg bg-white text-base sm:text-sm"
                id={`warehouse-edit-name-${warehouse.id}`}
                maxLength={255}
                {...form.register("name")}
              />
              {form.formState.errors.name && <p className="text-xs text-destructive" role="alert">{form.formState.errors.name.message}</p>}
            </div>

            <div className="relative space-y-2">
              <Label htmlFor={`warehouse-edit-address-input-${warehouse.id}`}>Адрес склада</Label>
              <div className="warehouse-management-dialog__address-input">
                <MapPin aria-hidden="true" size={16} />
                <Input
                  aria-autocomplete="list"
                  aria-controls={addressListId}
                  aria-expanded={suggestions.length > 0}
                  autoComplete="street-address"
                  className="h-12 rounded-lg bg-white pl-10 text-base sm:text-sm"
                  id={`warehouse-edit-address-input-${warehouse.id}`}
                  maxLength={300}
                  role="combobox"
                  {...form.register("address", { onChange: () => { setSelectedSuggestion(null); setSaved(false); } })}
                />
              </div>
              {form.formState.errors.address && <p className="text-xs text-destructive" role="alert">{form.formState.errors.address.message}</p>}
              {addressValue?.trim() !== warehouse.address && (
                <p className="text-xs text-muted-foreground">
                  {suggestionsLoading ? "Ищем варианты адреса…" : selectedSuggestion ? "Адрес подтверждён по ФИАС." : "Выберите адрес из подсказок, чтобы обновить FIAS ID."}
                </p>
              )}
              {suggestionsError && <p className="text-xs text-destructive" role="alert">{suggestionsError}</p>}
              {suggestions.length > 0 && (
                <ul className="warehouse-management-dialog__suggestions" id={addressListId} role="listbox">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.fias_id} role="option" aria-selected={selectedSuggestion?.fias_id === suggestion.fias_id}>
                      <button
                        onClick={() => {
                          form.setValue("address", suggestion.address, { shouldDirty: true, shouldValidate: true });
                          setSelectedSuggestion(suggestion);
                          setSuggestions([]);
                        }}
                        type="button"
                      >
                        {suggestion.address}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {submitError && <p className="warehouse-management-dialog__error" role="alert">{submitError}</p>}
            {saved && <p className="warehouse-management-dialog__success" role="status">Изменений нет.</p>}
            <footer className="warehouse-management-dialog__footer">
              <Button className="h-11 rounded-lg" disabled={pending} onClick={requestClose} type="button" variant="outline">Отмена</Button>
              <Button className="h-11 rounded-lg" disabled={pending} type="submit">
                {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <Pencil aria-hidden="true" size={15} />}
                Сохранить
              </Button>
            </footer>
          </form>
        ) : (
          <div className="warehouse-management-dialog__body">
            <div className="warehouse-management-dialog__warning">
              <span><AlertTriangle aria-hidden="true" size={18} /></span>
              {deletingLayout ? (
                <p>Будут удалены сохранённая 3D-модель и позиции стеллажей на планировке. Сами стеллажи и ячейки останутся. При активных размещениях backend не разрешит удалить планировку.</p>
              ) : (
                <p>Вместе со складом backend удалит все связанные стеллажи и ячейки. Склад с активными размещениями удалить нельзя. Это действие нельзя отменить.</p>
              )}
            </div>
            {submitError && <p className="warehouse-management-dialog__error" role="alert">{submitError}</p>}
            <footer className="warehouse-management-dialog__footer">
              <Button className="h-11 rounded-lg" disabled={pending} onClick={requestClose} type="button" variant="outline">Отмена</Button>
              <Button className="h-11 rounded-lg border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700" disabled={pending} onClick={() => void confirmDelete()} type="button" variant="outline">
                {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <Trash2 aria-hidden="true" size={15} />}
                {deletingLayout ? "Удалить планировку" : "Удалить склад"}
              </Button>
            </footer>
          </div>
        )}
      </section>
    </dialog>
  );
}
