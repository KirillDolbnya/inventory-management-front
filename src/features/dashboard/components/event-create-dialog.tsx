import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CalendarCheck2, Check, CircleAlert, LoaderCircle, MapPin, Package, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dashboardDataService } from "@/features/dashboard/services/dashboard-data-service";
import type { InventoryItem, InventoryPlacement } from "@/features/dashboard/types/inventory";
import type { CreateEventInput } from "@/features/dashboard/types/inventory-event";

type EventCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (eventId: number) => void;
};

type FormValues = {
  name: string;
  description: string;
  starts_at: string;
  ends_at: string;
};

type SelectedPlacement = {
  inventory: InventoryItem;
  placement: InventoryPlacement;
  quantity: number;
};

const eventSchema = z.object({
  name: z.string().trim().min(1, "Укажите название события.").max(255, "Не более 255 символов."),
  description: z.string().max(255, "Не более 255 символов."),
  starts_at: z.string().min(1, "Укажите дату и время начала."),
  ends_at: z.string().min(1, "Укажите дату и время окончания."),
}).superRefine((values, context) => {
  const start = new Date(values.starts_at);
  const end = new Date(values.ends_at);
  if (values.starts_at && Number.isNaN(start.getTime())) {
    context.addIssue({ code: "custom", path: ["starts_at"], message: "Проверьте дату начала." });
  } else if (values.starts_at && start.getTime() < Date.now()) {
    context.addIssue({ code: "custom", path: ["starts_at"], message: "Начало не может быть в прошлом." });
  }
  if (values.ends_at && Number.isNaN(end.getTime())) {
    context.addIssue({ code: "custom", path: ["ends_at"], message: "Проверьте дату окончания." });
  } else if (values.starts_at && values.ends_at && end.getTime() <= start.getTime()) {
    context.addIssue({ code: "custom", path: ["ends_at"], message: "Окончание должно быть позже начала." });
  }
});

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function createDefaultValues(): FormValues {
  const start = new Date(Date.now() + 5 * 60_000);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    name: "",
    description: "",
    starts_at: toDateTimeInput(start),
    ends_at: toDateTimeInput(end),
  };
}

function toDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoWithLocalOffset(value: string) {
  const date = new Date(value);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, "0");
  const offsetRemainder = String(Math.abs(offsetMinutes) % 60).padStart(2, "0");
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${offsetHours}:${offsetRemainder}`;
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function getCreateErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "Не удалось создать событие. Проверьте данные и попробуйте снова.";
  if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
  if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
  if (error.status === 403) return "У вас нет доступа для создания события.";
  if (error.kind === "network") return "Не удалось подключиться к серверу. Данные формы сохранены — попробуйте ещё раз.";
  if (error.kind === "configuration" || error.kind === "response") return "Не удалось обработать ответ сервера. Данные формы сохранены.";

  const serverMessage = error.payload?.message?.toLocaleLowerCase("ru-RU") ?? "";
  if (error.status === 404) return "Одно из размещений больше недоступно. Обновите список инвентаря и повторите попытку.";
  if (error.status === 409 || serverMessage.includes("не будет хватать") || serverMessage.includes("недостаточно") || serverMessage.includes("забронировать")) {
    return "На выбранный период не хватает свободного количества в одной из ячеек. Измените количество или выберите другую ячейку.";
  }
  if (error.status === 422) return "Сервер отклонил данные. Проверьте название, даты и выбранные количества.";
  if (error.status >= 500) return "Сервер не смог завершить создание. Данные формы сохранены — попробуйте позже.";
  return "Не удалось создать событие. Проверьте данные и попробуйте снова.";
}

export function EventCreateDialog({ open, onClose, onCreated }: EventCreateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inventoryRequestId = useRef(0);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [selectedPlacements, setSelectedPlacements] = useState<SelectedPlacement[]>([]);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: createDefaultValues(),
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const requestId = ++inventoryRequestId.current;
    setInventoryLoading(true);
    setInventoryError(null);
    void dashboardDataService.getInventoryItems()
      .then((items) => {
        if (requestId === inventoryRequestId.current) setInventoryItems(items);
      })
      .catch(() => {
        if (requestId === inventoryRequestId.current) {
          setInventoryError("Не удалось загрузить инвентарь. Проверьте соединение и повторите попытку.");
        }
      })
      .finally(() => {
        if (requestId === inventoryRequestId.current) setInventoryLoading(false);
      });
    return () => {
      inventoryRequestId.current += 1;
    };
  }, [open]);

  const filteredItems = useMemo(() => {
    const query = inventoryQuery.trim().toLocaleLowerCase("ru-RU");
    const items = inventoryItems.filter((item) => item.placements.some((placement) => placement.quantity > 0));
    if (!query) return items;
    return items.filter((item) => `${item.name} ${item.description ?? ""}`.toLocaleLowerCase("ru-RU").includes(query));
  }, [inventoryItems, inventoryQuery]);

  const loadInventory = () => {
    setInventoryError(null);
    setInventoryLoading(true);
    const requestId = ++inventoryRequestId.current;
    void dashboardDataService.getInventoryItems()
      .then((items) => {
        if (requestId === inventoryRequestId.current) setInventoryItems(items);
      })
      .catch(() => {
        if (requestId === inventoryRequestId.current) {
          setInventoryError("Не удалось загрузить инвентарь. Проверьте соединение и повторите попытку.");
        }
      })
      .finally(() => {
        if (requestId === inventoryRequestId.current) setInventoryLoading(false);
      });
  };

  const addPlacement = (inventory: InventoryItem, placement: InventoryPlacement) => {
    setReservationError(null);
    setSelectedPlacements((current) => current.some((item) => item.placement.id === placement.id)
      ? current
      : [...current, { inventory, placement, quantity: 1 }]);
  };

  const updateQuantity = (placementId: number, rawValue: string) => {
    const quantity = rawValue === "" ? 0 : Number(rawValue);
    setReservationError(null);
    setSelectedPlacements((current) => current.map((item) => item.placement.id === placementId
      ? { ...item, quantity: Number.isFinite(quantity) ? quantity : 0 }
      : item));
  };

  const submitStep = handleSubmit(async (values) => {
    clearErrors(["name", "description", "starts_at", "ends_at"]);
    setSubmitError(null);
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      const invalid = selectedPlacements.some((item) =>
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > item.placement.quantity,
      );
      if (!selectedPlacements.length) {
        setReservationError("Добавьте хотя бы одну позицию в бронирование.");
        return;
      }
      if (invalid) {
        setReservationError("Укажите целое количество от 1 до остатка в выбранной ячейке.");
        return;
      }
      setStep(3);
      return;
    }

    const input: CreateEventInput = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      starts_at: toIsoWithLocalOffset(values.starts_at),
      ends_at: toIsoWithLocalOffset(values.ends_at),
      reservations: selectedPlacements.map((item) => ({
        inventory_placement_id: item.placement.id,
        quantity: item.quantity,
      })),
    };

    try {
      const createdEvent = await dashboardDataService.createEvent(input);
      reset(createDefaultValues());
      setStep(1);
      setSelectedPlacements([]);
      setInventoryQuery("");
      setSubmitError(null);
      onClose();
      onCreated(createdEvent.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.payload?.errors) {
        const fieldMap = ["name", "description", "starts_at", "ends_at"] as const;
        let hasFieldErrors = false;
        for (const field of fieldMap) {
          const message = error.payload.errors[field]?.[0];
          if (message) {
            setError(field, { type: "server", message });
            hasFieldErrors = true;
          }
        }
        setSubmitError(hasFieldErrors ? "Исправьте отмеченные поля." : getCreateErrorMessage(error));
      } else {
        setSubmitError(getCreateErrorMessage(error));
      }
    }
  });

  const close = () => {
    if (!isSubmitting) onClose();
  };

  const back = () => {
    setSubmitError(null);
    if (step === 1) close();
    else setStep((current) => (current - 1) as 1 | 2 | 3);
  };

  return (
    <dialog
      aria-describedby="event-create-description"
      aria-labelledby="event-create-title"
      className="event-create-dialog"
      onCancel={(event) => {
        if (isSubmitting) event.preventDefault();
        else onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <form className="event-create-dialog__form" noValidate onSubmit={submitStep}>
        <header className="event-create-dialog__header">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight" id="event-create-title">Создать событие</h2>
            <p className="mt-1 text-sm text-muted-foreground" id="event-create-description">
              Укажите время и выберите размещённый инвентарь для бронирования.
            </p>
          </div>
          <Button aria-label="Закрыть" className="size-10 shrink-0 rounded-lg" disabled={isSubmitting} onClick={close} size="icon" type="button" variant="ghost">
            <X aria-hidden="true" size={17} />
          </Button>
        </header>

        <div aria-label={`Шаг ${step} из 3`} className="event-create-dialog__steps">
          {[
            { number: 1, label: "Событие" },
            { number: 2, label: "Инвентарь" },
            { number: 3, label: "Проверка" },
          ].map((item) => (
            <div className="event-create-step" data-current={step === item.number} data-complete={step > item.number} key={item.number}>
              <span className="event-create-step__number">
                {step > item.number ? <Check aria-hidden="true" size={14} /> : item.number}
              </span>
              <span className="event-create-step__label">{item.label}</span>
            </div>
          ))}
        </div>

        <div className="event-create-dialog__body">
          {step === 1 && (
            <div className="mx-auto grid w-full max-w-xl gap-5 py-2">
              <div className="space-y-2">
                <Label htmlFor="event-name">Название</Label>
                <Input aria-invalid={Boolean(errors.name)} className="h-12 rounded-lg bg-white text-base sm:text-sm" id="event-name" maxLength={255} placeholder="Например, Выдача оборудования" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive" role="alert">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-description">Описание <span className="font-normal text-muted-foreground">(необязательно)</span></Label>
                <textarea
                  aria-invalid={Boolean(errors.description)}
                  className="min-h-24 w-full resize-y rounded-lg border border-input bg-white px-3 py-2.5 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm"
                  id="event-description"
                  maxLength={255}
                  placeholder="Дополнительная информация"
                  {...register("description")}
                />
                {errors.description && <p className="text-xs text-destructive" role="alert">{errors.description.message}</p>}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="event-starts-at">Начало</Label>
                  <Input aria-invalid={Boolean(errors.starts_at)} className="h-12 rounded-lg bg-white text-base sm:text-sm" id="event-starts-at" min={toDateTimeInput(new Date())} type="datetime-local" {...register("starts_at")} />
                  {errors.starts_at && <p className="text-xs text-destructive" role="alert">{errors.starts_at.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-ends-at">Окончание</Label>
                  <Input aria-invalid={Boolean(errors.ends_at)} className="h-12 rounded-lg bg-white text-base sm:text-sm" id="event-ends-at" type="datetime-local" {...register("ends_at")} />
                  {errors.ends_at && <p className="text-xs text-destructive" role="alert">{errors.ends_at.message}</p>}
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">Время отправляется с часовым поясом устройства и отображается в вашем местном времени.</p>
            </div>
          )}

          {step === 2 && (
            <div className="grid min-h-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.78fr)]">
              <section className="min-w-0">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">Инвентарь для события</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Выберите ячейки хранения. Физический остаток показан отдельно; свободное количество на выбранный период проверит сервер.
                  </p>
                </div>
                <div className="relative mb-3">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input aria-label="Поиск инвентаря для бронирования" className="h-11 rounded-lg bg-white pl-9 text-base sm:text-sm" onChange={(event) => setInventoryQuery(event.target.value)} placeholder="Найти инвентарь" value={inventoryQuery} />
                </div>
                <div className="event-create-dialog__candidate-list">
                  {inventoryLoading ? (
                    <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                      <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
                      Загружаем размещения…
                    </div>
                  ) : inventoryError ? (
                    <div className="flex min-h-36 flex-col items-center justify-center px-4 text-center">
                      <p className="max-w-64 text-sm text-muted-foreground" role="alert">{inventoryError}</p>
                      <Button className="mt-3 h-9 rounded-lg" onClick={loadInventory} type="button" variant="outline"><RefreshCw aria-hidden="true" size={14} />Повторить</Button>
                    </div>
                  ) : filteredItems.length ? (
                    <ul className="divide-y divide-border rounded-xl border border-border bg-white">
                      {filteredItems.map((inventory) => (
                        <li className="p-3" key={inventory.id}>
                          <div className="mb-2 flex min-w-0 items-start gap-2">
                            <Package aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" size={15} />
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium leading-5">{inventory.name}</p>
                              {inventory.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{inventory.description}</p>}
                            </div>
                          </div>
                          <ul className="space-y-1.5">
                            {inventory.placements.filter((placement) => placement.quantity > 0).map((placement) => {
                              const selected = selectedPlacements.some((item) => item.placement.id === placement.id);
                              return (
                                <li className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-2" key={placement.id}>
                                  <div className="min-w-0">
                                    <p className="flex items-start gap-1 break-words text-xs leading-4 text-foreground">
                                      <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" size={12} />
                                      {placement.warehouse.name} · {placement.rack.code} · ячейка {placement.cell.number}
                                    </p>
                                    <p className="mt-1 pl-4 text-[11px] text-muted-foreground">В ячейке: {placement.quantity.toLocaleString("ru-RU")} шт.</p>
                                  </div>
                                  <Button aria-label={`${selected ? "Добавлено" : "Добавить"}: ${inventory.name}, ${placement.warehouse.name}, стеллаж ${placement.rack.code}, ячейка ${placement.cell.number}`} className="size-9 shrink-0 rounded-lg" disabled={selected} onClick={() => addPlacement(inventory, placement)} size="icon" type="button" variant="outline">
                                    {selected ? <Check aria-hidden="true" size={15} /> : <Plus aria-hidden="true" size={15} />}
                                  </Button>
                                </li>
                              );
                            })}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="flex min-h-36 flex-col items-center justify-center px-4 text-center">
                      <p className="text-sm font-medium">{inventoryItems.some((item) => item.placements.some((placement) => placement.quantity > 0)) ? "Ничего не найдено" : "Нет инвентаря в ячейках"}</p>
                      <p className="mt-1 max-w-64 text-xs leading-5 text-muted-foreground">Для бронирования выберите инвентарь, размещённый в ячейке склада.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="min-w-0">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Выбрано</h3>
                  <span className="text-xs text-muted-foreground">{selectedPlacements.length}</span>
                </div>
                {selectedPlacements.length ? (
                  <ul className="space-y-2">
                    {selectedPlacements.map(({ inventory, placement, quantity }) => (
                      <li className="rounded-xl border border-border bg-white p-3" key={placement.id}>
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium leading-5">{inventory.name}</p>
                            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                              {placement.warehouse.name} · {placement.rack.code} · ячейка {placement.cell.number}
                            </p>
                          </div>
                          <Button aria-label={`Убрать ${inventory.name} из бронирования`} className="size-8 shrink-0 rounded-lg text-muted-foreground" onClick={() => setSelectedPlacements((current) => current.filter((item) => item.placement.id !== placement.id))} size="icon" type="button" variant="ghost">
                            <Trash2 aria-hidden="true" size={15} />
                          </Button>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <Label className="text-xs text-muted-foreground" htmlFor={`reservation-${placement.id}`}>Количество</Label>
                          <Input aria-label={`Количество: ${inventory.name}`} className="h-10 w-24 rounded-lg bg-white text-base tabular-nums sm:text-sm" id={`reservation-${placement.id}`} inputMode="numeric" max={placement.quantity} min={1} onChange={(event) => updateQuantity(placement.id, event.target.value)} step={1} type="number" value={quantity || ""} />
                        </div>
                        <p className="mt-1 text-right text-[11px] text-muted-foreground">Физически в ячейке: {placement.quantity.toLocaleString("ru-RU")} шт.</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs leading-5 text-muted-foreground">
                    Добавьте одну или несколько ячеек из списка.
                  </div>
                )}
                {reservationError && <p className="mt-3 text-xs leading-5 text-destructive" role="alert">{reservationError}</p>}
              </section>
            </div>
          )}

          {step === 3 && (
            <div className="mx-auto w-full max-w-2xl py-2">
              <div className="rounded-xl border border-border bg-white p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><CalendarCheck2 aria-hidden="true" size={17} /></span>
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-semibold">{getValues("name")}</h3>
                    {getValues("description").trim() && <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">{getValues("description").trim()}</p>}
                  </div>
                </div>
                <dl className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">Начало</dt><dd className="mt-1 text-sm font-medium">{formatDateTime(getValues("starts_at"))}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Окончание</dt><dd className="mt-1 text-sm font-medium">{formatDateTime(getValues("ends_at"))}</dd></div>
                </dl>
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Бронирование</h3>
                  <span className="text-xs text-muted-foreground">{selectedPlacements.length}</span>
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border bg-white">
                  {selectedPlacements.map(({ inventory, placement, quantity }) => (
                    <li className="flex min-w-0 items-start gap-3 p-3.5" key={placement.id}>
                      <Package aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" size={16} />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{inventory.name}</p>
                        <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{placement.warehouse.name} · {placement.rack.code} · ячейка {placement.cell.number}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{quantity.toLocaleString("ru-RU")} шт.</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/70 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                  <CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
                  Сервер проверит свободное количество в ячейках на весь выбранный период. Если возникнет конфликт, данные останутся в форме.
                </p>
              </div>
            </div>
          )}

          {submitError && <p className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm leading-5 text-destructive" role="alert">{submitError}</p>}
        </div>

        <footer className="event-create-dialog__footer">
          <Button className="h-11 min-w-24 rounded-lg" disabled={isSubmitting} onClick={back} type="button" variant="outline">
            {step === 1 ? "Отмена" : <><ArrowLeft aria-hidden="true" size={15} />Назад</>}
          </Button>
          <Button className="h-11 min-w-36 rounded-lg" disabled={isSubmitting || (step === 2 && (inventoryLoading || Boolean(inventoryError) || selectedPlacements.length === 0))} type="submit">
            {isSubmitting ? <><LoaderCircle aria-hidden="true" className="animate-spin" size={16} />Создаём…</> : step === 3 ? "Создать событие" : <>Продолжить<ArrowRight aria-hidden="true" size={15} /></>}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
