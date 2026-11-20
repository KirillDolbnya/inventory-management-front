import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Check, LoaderCircle, MapPin, Package, Plus, Search, Trash2, X } from "lucide-react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import type { InventoryItem, InventoryPlacement } from "@/features/dashboard/types/inventory";
import type { EventReservation } from "@/features/dashboard/types/inventory-event";

type ReservationMode = "create" | "edit" | "delete";

type ReservationManagementDialogProps = {
  eventId: number;
  eventName: string;
  reservations: EventReservation[];
  mode: ReservationMode;
  reservation?: EventReservation;
  closeRequestRef?: { current: (() => boolean) | null };
  onClose: () => void;
  onSaved: (eventId: number) => Promise<void>;
};

type PlacementChoice = { inventory: InventoryItem; placement: InventoryPlacement };

function getOperationError(error: unknown, mode: ReservationMode) {
  if (!(error instanceof ApiError)) return "Не удалось выполнить операцию. Попробуйте ещё раз.";
  if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
  if (error.status === 403) return "У вас нет доступа к этой операции.";
  if (error.status === 404) {
    return mode === "create"
      ? "Размещение инвентаря или событие больше не найдены. Обновите данные и повторите попытку."
      : "Бронирование или событие больше не найдены. Обновите данные.";
  }
  if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
  if (error.status === 409) {
    return mode === "create"
      ? "На выбранный период не хватает свободного количества либо эта ячейка уже забронирована для события. Обновите данные и проверьте количество."
      : "На выбранный период не хватает свободного количества в этой ячейке. Уменьшите количество или проверьте даты события.";
  }
  if (error.status === 422) {
    const quantityError = error.payload?.errors?.quantity?.[0];
    const placementError = error.payload?.errors?.["reservations.0.inventory_placement_id"]?.[0];
    return quantityError ?? placementError ?? error.payload?.message ?? "Сервер отклонил количество или выбранное размещение.";
  }
  if (error.kind === "network") return "Не удалось подключиться к серверу. Проверьте соединение и попробуйте снова.";
  if (error.status >= 500) return "Сервер временно недоступен. Попробуйте позже.";
  return "Не удалось выполнить операцию. Проверьте данные и попробуйте снова.";
}

export function ReservationManagementDialog({
  eventId,
  eventName,
  reservations,
  mode,
  reservation,
  closeRequestRef,
  onClose,
  onSaved,
}: ReservationManagementDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(mode === "create");
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedPlacement, setSelectedPlacement] = useState<PlacementChoice | null>(null);
  const [quantity, setQuantity] = useState(String(reservation?.quantity ?? 1));
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (mode !== "create") return;
    let mounted = true;
    setLoadingInventory(true);
    void dashboardDataService.getInventoryItems()
      .then((items) => { if (mounted) setInventoryItems(items); })
      .catch(() => { if (mounted) setInventoryError("Не удалось загрузить доступные размещения. Повторите попытку."); })
      .finally(() => { if (mounted) setLoadingInventory(false); });
    return () => { mounted = false; };
  }, [mode]);

  const existingPlacementKeys = useMemo(() => new Set(
    reservations.map((item) => `${item.inventory.id}:${item.cell.id}`),
  ), [reservations]);
  const choices = useMemo<PlacementChoice[]>(() => inventoryItems.flatMap((inventory) =>
    inventory.placements
      .filter((placement) => placement.quantity > 0 && !existingPlacementKeys.has(`${inventory.id}:${placement.cell.id}`))
      .map((placement) => ({ inventory, placement })),
  ), [existingPlacementKeys, inventoryItems]);
  const filteredChoices = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");
    if (!normalized) return choices;
    return choices.filter(({ inventory, placement }) =>
      `${inventory.name} ${placement.warehouse.name} ${placement.rack.code} ${placement.cell.number}`
        .toLocaleLowerCase("ru-RU").includes(normalized),
    );
  }, [choices, query]);

  const selectedItem = selectedPlacement?.inventory ?? null;
  const selectedLocation = selectedPlacement?.placement ?? null;
  const title = mode === "create" ? "Новое бронирование" : mode === "edit" ? "Изменить бронирование" : "Удалить бронирование";

  const requestClose = () => {
    if (submitting) return false;
    const isDirty = mode === "create"
      ? Boolean(selectedPlacement) || query.length > 0 || quantity !== "1"
      : mode === "edit" && quantity !== String(reservation?.quantity ?? 1);
    if (isDirty && !window.confirm("Закрыть окно? Несохранённые данные бронирования будут потеряны.")) return false;
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOperationError(null);
    setQuantityError(null);
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setQuantityError("Укажите целое количество не меньше 1.");
      return;
    }
    if (mode === "create") {
      if (!selectedPlacement) {
        setOperationError("Выберите размещение инвентаря.");
        return;
      }
      if (parsedQuantity > selectedPlacement.placement.quantity) {
        setQuantityError(`Не больше физического остатка в ячейке — ${selectedPlacement.placement.quantity} шт.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "create" && selectedLocation) {
        await dashboardDataService.addEventReservations(eventId, [{ inventory_placement_id: selectedLocation.id, quantity: parsedQuantity }]);
      } else if (mode === "edit" && reservation) {
        await dashboardDataService.updateEventReservation(eventId, reservation.id, parsedQuantity);
      } else {
        return;
      }
      await onSaved(eventId);
      onClose();
    } catch (error) {
      setOperationError(getOperationError(error, mode));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!reservation) return;
    setOperationError(null);
    setSubmitting(true);
    try {
      await dashboardDataService.deleteEventReservation(eventId, reservation.id);
      await onSaved(eventId);
      onClose();
    } catch (error) {
      setOperationError(getOperationError(error, mode));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      aria-labelledby="reservation-management-title"
      className="inventory-create-dialog"
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current) requestClose(); }}
      onClose={() => undefined}
      ref={dialogRef}
    >
      {mode === "delete" ? (
        <div className="inventory-create-dialog__form">
          <header className="inventory-create-dialog__header">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight" id="reservation-management-title">{title}</h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">{eventName}</p>
            </div>
            <Button aria-label="Закрыть" className="size-10 shrink-0 rounded-lg" disabled={submitting} onClick={requestClose} size="icon" type="button" variant="ghost"><X aria-hidden="true" size={17} /></Button>
          </header>
          <div className="inventory-create-dialog__fields">
            {reservation && (
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" size={18} />
                <div className="min-w-0 text-sm leading-5">
                  <p>Удалить бронирование <strong className="break-words">{reservation.inventory.name}</strong> ({reservation.quantity} шт.)?</p>
                  <p className="mt-2 text-amber-900">Само событие, инвентарь и физическое размещение в ячейке останутся без изменений.</p>
                </div>
              </div>
            )}
            {operationError && <p className="text-sm text-destructive" role="alert">{operationError}</p>}
          </div>
          <footer className="inventory-create-dialog__footer">
            <Button className="h-12 flex-1 rounded-lg sm:flex-none" disabled={submitting} onClick={requestClose} type="button" variant="outline">Отмена</Button>
            <Button className="h-12 flex-1 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:flex-none" disabled={submitting} onClick={() => void confirmDelete()} type="button">{submitting ? <><LoaderCircle aria-hidden="true" className="animate-spin" size={16} />Удаляем…</> : "Удалить бронирование"}</Button>
          </footer>
        </div>
      ) : (
        <form className="inventory-create-dialog__form" noValidate onSubmit={submit}>
          <header className="inventory-create-dialog__header">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight" id="reservation-management-title">{title}</h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">{eventName}</p>
            </div>
            <Button aria-label="Закрыть" className="size-10 shrink-0 rounded-lg" disabled={submitting} onClick={requestClose} size="icon" type="button" variant="ghost"><X aria-hidden="true" size={17} /></Button>
          </header>
          <div className="inventory-create-dialog__fields">
            {mode === "create" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="reservation-search">Размещение инвентаря</Label>
                  <div className="relative">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input autoComplete="off" className="h-11 rounded-lg bg-white pl-9 text-base sm:text-sm" id="reservation-search" onChange={(change) => setQuery(change.target.value)} placeholder="Найти инвентарь или ячейку" type="search" value={query} />
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-border">
                  {loadingInventory ? (
                    <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="animate-spin" size={16} />Загружаем размещения…</div>
                  ) : inventoryError ? (
                    <p className="p-4 text-sm leading-5 text-destructive" role="alert">{inventoryError}</p>
                  ) : filteredChoices.length ? (
                    <ul className="divide-y divide-border">
                      {filteredChoices.map(({ inventory, placement }) => {
                        const selected = selectedLocation?.id === placement.id;
                        return (
                          <li key={placement.id}>
                            <button aria-pressed={selected} className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50" onClick={() => { setSelectedPlacement({ inventory, placement }); setQuantity("1"); setOperationError(null); }} type="button">
                              <Package aria-hidden="true" className="shrink-0 text-muted-foreground" size={16} />
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-sm font-medium">{inventory.name}</span>
                                <span className="mt-1 flex items-start gap-1 text-xs leading-5 text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={12} />{placement.warehouse.name} · {placement.rack.code} · ячейка {placement.cell.number}</span>
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{placement.quantity} шт.</span>
                              {selected ? <Check aria-label="Выбрано" className="shrink-0" size={15} /> : <Plus aria-hidden="true" className="shrink-0" size={15} />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="p-4 text-center text-sm leading-5 text-muted-foreground">{choices.length ? "Подходящие размещения не найдены." : "Нет свободных ячеек для бронирования или всё уже добавлено в это событие."}</p>
                  )}
                </div>
                {selectedItem && selectedLocation && (
                  <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                    <p className="break-words font-medium">{selectedItem.name}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedLocation.warehouse.name} · стеллаж {selectedLocation.rack.code} · ячейка {selectedLocation.cell.number}</p>
                  </div>
                )}
              </>
            ) : reservation && (
              <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                <p className="break-words font-medium">{reservation.inventory.name}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{reservation.warehouse.name} · стеллаж {reservation.rack.code} · ячейка {reservation.cell.number}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="reservation-quantity">Количество</Label>
              <Input aria-describedby="reservation-quantity-help" aria-invalid={Boolean(quantityError)} className="h-12 rounded-lg bg-white text-base sm:text-sm" disabled={mode === "create" && !selectedPlacement} id="reservation-quantity" inputMode="numeric" max={mode === "create" ? selectedLocation?.quantity : undefined} min={1} onChange={(change) => { setQuantity(change.target.value); setQuantityError(null); }} step={1} type="number" value={quantity} />
              {quantityError && <p className="text-xs text-destructive" role="alert">{quantityError}</p>}
              <p className="text-xs leading-5 text-muted-foreground" id="reservation-quantity-help">
                {mode === "create" && selectedLocation
                  ? `Физически в ячейке: ${selectedLocation.quantity} шт. Пересечение с другими событиями проверит сервер.`
                  : "Доступность физического остатка и периода проверит сервер."}
              </p>
            </div>
            {operationError && <p className="text-sm leading-5 text-destructive" role="alert">{operationError}</p>}
          </div>
          <footer className="inventory-create-dialog__footer">
            <Button className="h-12 flex-1 rounded-lg sm:flex-none" disabled={submitting} onClick={requestClose} type="button" variant="outline">Отмена</Button>
            <Button className="h-12 flex-1 rounded-lg sm:flex-none" disabled={submitting || loadingInventory || Boolean(inventoryError) || (mode === "create" && !selectedPlacement)} type="submit">{submitting ? <><LoaderCircle aria-hidden="true" className="animate-spin" size={16} />Сохраняем…</> : mode === "create" ? "Добавить" : "Сохранить"}</Button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
