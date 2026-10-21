import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, LoaderCircle, MapPin, Plus, Warehouse as WarehouseIcon, X } from "lucide-react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Warehouse } from "@/features/dashboard/types/warehouse";
import { WarehouseLayoutEditor } from "@/features/warehouse-creation/components/warehouse-layout-editor";
import { createWarehouseModelFile, makeDefaultLayout, readWarehouseModelLayout } from "@/features/warehouse-creation/services/layout-model";
import { validateWarehouseLayout } from "@/features/warehouse-creation/services/layout-validation";
import { warehouseApi, type AddressSuggestion } from "@/features/warehouse/api/warehouse-api";
import type { Rack, WarehouseLayout } from "@/features/warehouse/types";
import "@/features/warehouse-creation/warehouse-creation.css";

const warehouseDetailsSchema = z.object({
  name: z.string().trim().min(1, "Введите название склада.").max(255, "Не более 255 символов."),
  address: z.string().trim().min(2, "Введите не менее двух символов.").max(300, "Не более 300 символов."),
});

const rackSchema = z.object({
  code: z.string().trim().min(1, "Введите код стеллажа.").max(20, "Не более 20 символов."),
  levels_count: z.string().regex(/^\d+$/, "Введите целое число.").refine((value) => Number(value) >= 1 && Number(value) <= 10, "От 1 до 10 уровней."),
  cells_per_level: z.string().regex(/^\d+$/, "Введите целое число.").refine((value) => Number(value) >= 1 && Number(value) <= 10, "От 1 до 10 ячеек."),
});

type WarehouseFormValues = z.infer<typeof warehouseDetailsSchema>;
type RackFormValues = z.infer<typeof rackSchema>;
type WizardStep = 1 | 2 | 3 | 4;

function nextRackCode(racks: Rack[]) {
  const used = new Set(racks.map((rack) => rack.code.toUpperCase()));
  for (let index = 0; index < 26; index += 1) {
    const code = String.fromCharCode(65 + index);
    if (!used.has(code)) return code;
  }
  let suffix = racks.length + 1;
  while (used.has(`R${suffix}`)) suffix += 1;
  return `R${suffix}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) return "Сеанс завершён. Войдите в систему и повторите попытку.";
  if (error.status === 0) return "Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.";
  if (error.status === 503) return "Не удалось получить подсказки адреса. Попробуйте позже.";
  if (error.status === 502) return "Сервис адресов вернул некорректные данные. Попробуйте ещё раз.";
  return error.message || fallback;
}

function firstFieldError(error: unknown, field: string) {
  if (!(error instanceof ApiError)) return undefined;
  return error.payload?.errors?.[field]?.[0];
}

export type WarehouseCreationWizardProps = {
  open: boolean;
  initialWarehouseId?: number | null;
  onClose: () => void;
  onWarehouseCreated: (warehouse: Warehouse) => void;
  onOpenWarehouse: (warehouseId: number) => void;
};

export function WarehouseCreationWizard({
  open,
  initialWarehouseId = null,
  onClose,
  onWarehouseCreated,
  onOpenWarehouse,
}: WarehouseCreationWizardProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const addressListId = "warehouse-address-suggestions";
  const [step, setStep] = useState<WizardStep>(1);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [layout, setLayout] = useState<WarehouseLayout>(() => makeDefaultLayout([]));
  const [selectedSuggestion, setSelectedSuggestion] = useState<AddressSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState("");
  const [warehouseError, setWarehouseError] = useState("");
  const [rackError, setRackError] = useState("");
  const [layoutError, setLayoutError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [creatingWarehouse, setCreatingWarehouse] = useState(false);
  const [creatingRack, setCreatingRack] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [layoutSaved, setLayoutSaved] = useState(false);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const warehouseForm = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseDetailsSchema),
    defaultValues: { name: "", address: "" },
  });
  const rackForm = useForm<RackFormValues>({
    resolver: zodResolver(rackSchema),
    defaultValues: { code: "A", levels_count: "3", cells_per_level: "4" },
  });
  const resetWarehouseForm = warehouseForm.reset;
  const resetRackForm = rackForm.reset;
  const addressValue = warehouseForm.watch("address");
  const layoutValidation = useMemo(() => validateWarehouseLayout(layout, racks), [layout, racks]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || initialWarehouseId) return;
    setStep(1);
    setWarehouse(null);
    setRacks([]);
    setLayout(makeDefaultLayout([]));
    setSelectedSuggestion(null);
    setSuggestions([]);
    setSuggestionsError("");
    setWarehouseError("");
    setRackError("");
    setLayoutError("");
    setLoadError("");
    setLayoutSaved(false);
    setLayoutDirty(false);
    setShowCloseConfirm(false);
    resetWarehouseForm({ name: "", address: "" });
    resetRackForm({ code: "A", levels_count: "3", cells_per_level: "4" });
  }, [initialWarehouseId, open, resetRackForm, resetWarehouseForm]);

  useEffect(() => {
    if (!open || !initialWarehouseId) return;
    let current = true;
    setLoadingExisting(true);
    setLoadError("");
    setWarehouseError("");
    setRackError("");
    setLayoutError("");
    setShowCloseConfirm(false);
    setLayoutDirty(false);

    Promise.all([warehouseApi.getWarehouse(initialWarehouseId), warehouseApi.getRacks(initialWarehouseId)])
      .then(async ([loadedWarehouse, loadedRacks]) => {
        if (!current) return;
        let savedLayout: Awaited<ReturnType<typeof warehouseApi.getLayout>> | null = null;
        try {
          savedLayout = await warehouseApi.getLayout(initialWarehouseId);
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
        }
        if (!current) return;

        setWarehouse(loadedWarehouse);
        setRacks(loadedRacks);
        resetWarehouseForm({ name: loadedWarehouse.name, address: loadedWarehouse.address });

        if (savedLayout) {
          const metadata = await readWarehouseModelLayout(savedLayout.model.url).catch(() => null);
          if (!current) return;
          const room = metadata?.room ?? { width: 14.4, length: 8.2, height: 5.2 };
          const defaultLayout = makeDefaultLayout(loadedRacks, room);
          const savedRackIds = new Set(savedLayout.racks.map((rack) => rack.id));
          setLayout({
            ...defaultLayout,
            columns: metadata?.columns ?? [],
            model: savedLayout.model,
            racks: defaultLayout.racks.map((defaultRack) => {
              const savedRack = savedLayout.racks.find((rack) => rack.id === defaultRack.rackId);
              return savedRack ? {
                rackId: savedRack.id,
                position: savedRack.position,
                rotation_y_deg: savedRack.rotation_y_deg,
                dimensions: savedRack.dimensions,
              } : defaultRack;
            }),
          });
          const everyRackConfigured = loadedRacks.every((rack) => savedRackIds.has(rack.id));
          setLayoutSaved(everyRackConfigured);
          setLayoutDirty(!everyRackConfigured);
          setStep(3);
        } else {
          setLayout(makeDefaultLayout(loadedRacks));
          setLayoutSaved(false);
          setStep(loadedRacks.length ? 3 : 2);
          if (loadedRacks.length) setLayoutDirty(true);
        }
        setLoadingExisting(false);
      })
      .catch((error: unknown) => {
        if (!current) return;
        setLoadError(getErrorMessage(error, "Не удалось загрузить данные склада."));
        setLoadingExisting(false);
      });

    return () => {
      current = false;
    };
  }, [initialWarehouseId, open, resetWarehouseForm]);

  useEffect(() => {
    if (!open || warehouse || initialWarehouseId) return;
    const query = addressValue?.trim() ?? "";
    if (query.length < 2 || selectedSuggestion?.address === query) {
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
        .then((result) => {
          if (current) setSuggestions(result);
        })
        .catch((error: unknown) => {
          if (current) {
            setSuggestions([]);
            setSuggestionsError(getErrorMessage(error, "Не удалось загрузить адресные подсказки."));
          }
        })
        .finally(() => {
          if (current) setSuggestionsLoading(false);
        });
    }, 320);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [addressValue, initialWarehouseId, open, selectedSuggestion, warehouse]);

  const requestClose = () => {
    if (layoutDirty && !layoutSaved) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  const handleCreateWarehouse = async (values: WarehouseFormValues) => {
    if (!selectedSuggestion) {
      setWarehouseError("Выберите адрес из списка подсказок.");
      return;
    }
    setCreatingWarehouse(true);
    setWarehouseError("");
    try {
      const createdWarehouse = await warehouseApi.createWarehouse({
        name: values.name.trim(),
        fias_id: selectedSuggestion.fias_id,
      });
      setWarehouse(createdWarehouse);
      setLayout(makeDefaultLayout([]));
      setLayoutSaved(false);
      setLayoutDirty(false);
      onWarehouseCreated(createdWarehouse);
      setStep(2);
    } catch (error) {
      const nameError = firstFieldError(error, "name");
      const fiasError = firstFieldError(error, "fias_id");
      if (nameError) warehouseForm.setError("name", { message: nameError });
      if (fiasError) setWarehouseError(fiasError);
      else setWarehouseError(getErrorMessage(error, "Не удалось создать склад."));
    } finally {
      setCreatingWarehouse(false);
    }
  };

  const handleCreateRack = async (values: RackFormValues) => {
    if (!warehouse) return;
    const code = values.code.trim().toUpperCase();
    if (racks.some((rack) => rack.code.toUpperCase() === code)) {
      rackForm.setError("code", { message: "Такой код уже есть на этом складе." });
      return;
    }

    setCreatingRack(true);
    setRackError("");
    try {
      const createdRack = await warehouseApi.createRack(warehouse.id, {
        code,
        levels_count: Number(values.levels_count),
        cells_per_level: Number(values.cells_per_level),
      });
      const nextRacks = [...racks, createdRack];
      setRacks(nextRacks);
      setLayout((current) => {
        const suggested = makeDefaultLayout(nextRacks, current.room);
        const rackLayout = suggested.racks.find((item) => item.rackId === createdRack.id);
        return {
          ...current,
          model: undefined,
          racks: rackLayout ? [...current.racks, rackLayout] : current.racks,
        };
      });
      setLayoutDirty(true);
      setLayoutSaved(false);
      rackForm.reset({ code: nextRackCode(nextRacks), levels_count: "3", cells_per_level: "4" });
    } catch (error) {
      const backendCodeError = firstFieldError(error, "racks.0.code");
      if (backendCodeError) rackForm.setError("code", { message: backendCodeError });
      setRackError(getErrorMessage(error, "Не удалось создать стеллаж."));
    } finally {
      setCreatingRack(false);
    }
  };

  const goToLayout = () => {
    const hasEveryRack = layout.racks.length === racks.length &&
      racks.every((rack) => layout.racks.some((item) => item.rackId === rack.id));
    if (!hasEveryRack) {
      setLayout((current) => {
        const next = makeDefaultLayout(racks, current.room);
        return { ...next, columns: current.columns };
      });
    }
    if (!layoutSaved) {
      setLayoutDirty(true);
    }
    setStep(3);
  };

  const handleSaveLayout = async () => {
    if (!warehouse || layoutValidation.length || savingLayout) return;
    setSavingLayout(true);
    setLayoutError("");
    try {
      const modelFile = await createWarehouseModelFile(layout);
      if (modelFile.size > 2 * 1024 * 1024) {
        throw new Error("Файл 3D-модели не должен превышать 2 МБ.");
      }
      const response = await warehouseApi.saveLayout(
        warehouse.id,
        modelFile,
        layout.racks.map((rack) => ({
          id: rack.rackId,
          position: rack.position,
          rotation_y_deg: rack.rotation_y_deg,
          dimensions: rack.dimensions,
        })),
      );
      setLayout((current) => ({ ...current, model: response.model }));
      setLayoutSaved(true);
      setLayoutDirty(false);
      setStep(4);
    } catch (error) {
      setLayoutError(getErrorMessage(error, "Не удалось сохранить планировку. Данные остались в мастере."));
    } finally {
      setSavingLayout(false);
    }
  };

  const openSavedWarehouse = () => {
    if (!warehouse) return;
    onClose();
    onOpenWarehouse(warehouse.id);
  };

  const nextStep = (nextStep: WizardStep) => {
    if (nextStep === 3) goToLayout();
    else setStep(nextStep);
  };

  const steps = [
    { id: 1 as const, label: "Склад" },
    { id: 2 as const, label: "Стеллажи" },
    { id: 3 as const, label: "Планировка" },
  ];

  return (
    <dialog
      aria-labelledby="warehouse-wizard-title"
      className="warehouse-wizard-dialog"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
      ref={dialogRef}
    >
      <div className="warehouse-wizard">
        <header className="warehouse-wizard__header">
          <div className="warehouse-wizard__heading">
            <div aria-hidden="true" className="warehouse-wizard__icon"><WarehouseIcon size={18} /></div>
            <div className="min-w-0">
              <p className="warehouse-wizard__eyebrow">Настройка склада</p>
              <h1 id="warehouse-wizard-title">{step === 4 ? "Склад готов" : warehouse?.name ?? "Создать склад"}</h1>
            </div>
          </div>
          <div className="warehouse-wizard__header-right">
            {warehouse && step !== 4 && (
              <span className="warehouse-wizard__saved-pill"><Check size={13} /> Склад сохранён</span>
            )}
            <Button
              aria-label="Закрыть мастер создания склада"
              className="warehouse-wizard__close"
              onClick={requestClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X size={19} />
            </Button>
          </div>
        </header>

        {step !== 4 && (
          <nav aria-label="Этапы создания склада" className="warehouse-wizard-steps">
            {steps.map((item, index) => {
              const completed = item.id === 1 ? Boolean(warehouse) : item.id === 2 ? racks.length > 0 : layoutSaved;
              const current = step === item.id;
              const enabled = item.id === 1 || Boolean(warehouse) && (item.id === 2 || racks.length > 0);
              return (
                <div className="warehouse-wizard-steps__item-wrap" key={item.id}>
                  <button
                    aria-current={current ? "step" : undefined}
                    className={`warehouse-wizard-steps__item${current ? " is-current" : ""}${completed ? " is-complete" : ""}`}
                    disabled={!enabled}
                    onClick={() => nextStep(item.id)}
                    type="button"
                  >
                    <span className="warehouse-wizard-steps__number">
                      {completed && !current ? <Check size={13} /> : `0${item.id}`}
                    </span>
                    <span>{item.label}</span>
                  </button>
                  {index < steps.length - 1 && <span className="warehouse-wizard-steps__connector" />}
                </div>
              );
            })}
            <span className="warehouse-wizard-steps__progress">Шаг {step} из 3</span>
          </nav>
        )}

        <main className={`warehouse-wizard__content${step === 3 ? " warehouse-wizard__content--layout" : ""}`}>
          {loadingExisting ? (
            <div className="warehouse-wizard-state" aria-busy="true">
              <LoaderCircle className="animate-spin" size={20} /> Загружаем сохранённый прогресс…
            </div>
          ) : loadError ? (
            <div className="warehouse-wizard-state warehouse-wizard-state--error" role="alert">
              <AlertCircle size={20} />
              <div><p>{loadError}</p><Button onClick={onClose} type="button" variant="outline">Закрыть</Button></div>
            </div>
          ) : step === 1 ? (
            <section className="warehouse-wizard-step warehouse-wizard-step--details">
              <div className="warehouse-wizard-step__intro">
                <span className="warehouse-wizard-step__index">01</span>
                <div>
                  <h2>Основные данные</h2>
                  <p>Укажите название и выберите адрес склада из подсказок.</p>
                </div>
              </div>

              {warehouse ? (
                <div className="warehouse-wizard-warehouse-summary">
                  <div className="warehouse-wizard-warehouse-summary__icon"><CheckCircle2 size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{warehouse.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{warehouse.address}</p>
      <p className="mt-2 text-xs text-muted-foreground">
                      Координаты: {warehouse.latitude.toFixed(6)}, {warehouse.longitude.toFixed(6)}
                    </p>
                  </div>
                </div>
              ) : (
                <form
                  className="warehouse-wizard-form"
                  id="warehouse-details-form"
                  noValidate
                  onSubmit={warehouseForm.handleSubmit(handleCreateWarehouse)}
                >
                  <div className="warehouse-wizard-form__field">
                    <Label htmlFor="warehouse-name">Название склада</Label>
                    <Input
                      autoComplete="organization"
                      autoFocus
                      aria-invalid={Boolean(warehouseForm.formState.errors.name)}
                      id="warehouse-name"
                      maxLength={255}
                      placeholder="Например, Центральный склад"
                      {...warehouseForm.register("name")}
                    />
                    {warehouseForm.formState.errors.name && <p className="warehouse-wizard-field-error">{warehouseForm.formState.errors.name.message}</p>}
                  </div>

                  <div className="warehouse-wizard-form__field warehouse-address-field">
                    <Label htmlFor="warehouse-address">Адрес склада</Label>
                    <div className="warehouse-address-field__input-wrap">
                      <MapPin aria-hidden="true" className="warehouse-address-field__icon" size={16} />
                      <Input
                        aria-activedescendant={undefined}
                        aria-autocomplete="list"
                        aria-controls={addressListId}
                        aria-expanded={suggestions.length > 0}
                        aria-invalid={Boolean(warehouseForm.formState.errors.address || suggestionsError)}
                        autoComplete="street-address"
                        id="warehouse-address"
                        maxLength={300}
                        placeholder="Начните вводить адрес"
                        role="combobox"
                        {...warehouseForm.register("address", {
                          onChange: () => {
                            setSelectedSuggestion(null);
                            setWarehouseError("");
                          },
                        })}
                      />
                      {suggestionsLoading && <LoaderCircle aria-label="Ищем адрес" className="warehouse-address-field__spinner animate-spin" size={16} />}
                    </div>
                    {warehouseForm.formState.errors.address && <p className="warehouse-wizard-field-error">{warehouseForm.formState.errors.address.message}</p>}
                    {suggestionsError && <p className="warehouse-wizard-field-error" role="alert">{suggestionsError}</p>}
                    {suggestions.length > 0 && (
                      <ul className="warehouse-address-suggestions" id={addressListId} role="listbox">
                        {suggestions.map((suggestion) => (
                          <li key={suggestion.fias_id} role="option" aria-selected={selectedSuggestion?.fias_id === suggestion.fias_id}>
                            <button
                              className="warehouse-address-suggestions__option"
                              onClick={() => {
                                setSelectedSuggestion(suggestion);
                                warehouseForm.setValue("address", suggestion.address, { shouldValidate: true });
                                setSuggestions([]);
                                setSuggestionsError("");
                              }}
                              onMouseDown={(event) => event.preventDefault()}
                              type="button"
                            >
                              <MapPin aria-hidden="true" size={15} />
                              <span>{suggestion.address}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {addressValue?.trim().length >= 2 && !selectedSuggestion && !suggestionsLoading && !suggestionsError && suggestions.length === 0 && (
                      <p className="warehouse-wizard-field-hint">Выберите подходящий адрес из выпадающего списка.</p>
                    )}
                  </div>

                  <div className="warehouse-wizard-info-note">
                    <MapPin aria-hidden="true" size={16} />
                    <p>Укажите адрес и выберите подходящий вариант из списка.</p>
                  </div>

                  {warehouseError && <div className="warehouse-wizard-error" role="alert"><AlertCircle size={16} />{warehouseError}</div>}
                </form>
              )}
            </section>
          ) : step === 2 ? (
            <section className="warehouse-wizard-step warehouse-wizard-step--racks">
              <div className="warehouse-wizard-step__intro">
                <span className="warehouse-wizard-step__index">02</span>
                <div>
                  <h2>Стеллажи</h2>
                  <p>Создайте стеллажи. Ячейки будут добавлены автоматически.</p>
                </div>
                <span className="warehouse-wizard-count">{racks.length} {racks.length === 1 ? "стеллаж" : "стеллажей"}</span>
              </div>

              <div className="warehouse-rack-creation-grid">
                <form className="warehouse-rack-create-card" id="rack-create-form" noValidate onSubmit={rackForm.handleSubmit(handleCreateRack)}>
                  <div className="warehouse-rack-create-card__heading">
                    <div className="warehouse-wizard-step__icon"><Plus size={17} /></div>
                    <div><h3>Добавить стеллаж</h3><p>Новая позиция сохранится на сервере сразу.</p></div>
                  </div>
                  <div className="warehouse-wizard-form__field">
                    <Label htmlFor="rack-code">Код</Label>
                    <Input
                      aria-invalid={Boolean(rackForm.formState.errors.code)}
                      autoCapitalize="characters"
                      autoComplete="off"
                      id="rack-code"
                      maxLength={20}
                      placeholder="A"
                      {...rackForm.register("code", {
                        onChange: (event) => rackForm.setValue("code", event.target.value.toUpperCase()),
                      })}
                    />
                    {rackForm.formState.errors.code && <p className="warehouse-wizard-field-error">{rackForm.formState.errors.code.message}</p>}
                  </div>
                  <div className="warehouse-rack-create-card__numbers">
                    <div className="warehouse-wizard-form__field">
                      <Label htmlFor="rack-levels">Уровни</Label>
                      <Input aria-invalid={Boolean(rackForm.formState.errors.levels_count)} id="rack-levels" inputMode="numeric" max="10" min="1" type="number" {...rackForm.register("levels_count")} />
                      {rackForm.formState.errors.levels_count && <p className="warehouse-wizard-field-error">{rackForm.formState.errors.levels_count.message}</p>}
                    </div>
                    <div className="warehouse-wizard-form__field">
                      <Label htmlFor="rack-cells">Ячеек на уровне</Label>
                      <Input aria-invalid={Boolean(rackForm.formState.errors.cells_per_level)} id="rack-cells" inputMode="numeric" max="10" min="1" type="number" {...rackForm.register("cells_per_level")} />
                      {rackForm.formState.errors.cells_per_level && <p className="warehouse-wizard-field-error">{rackForm.formState.errors.cells_per_level.message}</p>}
                    </div>
                  </div>
                  <div aria-label={`Предпросмотр стеллажа: ${rackForm.watch("levels_count")} уровней, ${rackForm.watch("cells_per_level")} ячеек на уровне`} className="warehouse-rack-mini-preview" role="img">
                    {Array.from({ length: Math.max(1, Math.min(10, Number(rackForm.watch("levels_count")) || 1)) }, (_, row) => (
                      <div className="warehouse-rack-mini-preview__row" key={row} style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(10, Number(rackForm.watch("cells_per_level")) || 1))}, minmax(0, 38px))` }}>
                        {Array.from({ length: Math.max(1, Math.min(10, Number(rackForm.watch("cells_per_level")) || 1)) }, (_, cell) => (
                          <span key={cell} />
                        ))}
                      </div>
                    ))}
                  </div>
                  {rackError && <div className="warehouse-wizard-error" role="alert"><AlertCircle size={16} />{rackError}</div>}
                  <Button className="warehouse-rack-create-card__submit" disabled={creatingRack || !warehouse} type="submit">
                    {creatingRack ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}
                    {creatingRack ? "Создаём…" : "Создать стеллаж"}
                  </Button>
                  <p className="warehouse-rack-create-card__hint">От 1 до 10 уровней и ячеек · код до 20 символов, заглавными буквами.</p>
                </form>

                <div className="warehouse-rack-list-card">
                  <div className="warehouse-rack-list-card__heading">
                    <div><h3>На складе</h3><p>{warehouse?.name}</p></div>
                    <span>{racks.length}</span>
                  </div>
                  {racks.length ? (
                    <div className="warehouse-rack-list">
                      {racks.map((rack) => (
                        <article className="warehouse-rack-list__item" key={rack.id}>
                          <div className="warehouse-rack-list__icon"><BoxIcon /></div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">Стеллаж {rack.code}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{rack.levels_count} уровня · {rack.cells_per_level} ячейки на уровне</p>
                          </div>
                          <span className="warehouse-rack-list__total">{rack.cells.length || rack.levels_count * rack.cells_per_level}<small>ячеек</small></span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="warehouse-rack-list__empty">
                      <div><BoxIcon /></div><p>Пока нет стеллажей</p><span>Добавьте хотя бы один, чтобы перейти к планировке.</span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : step === 3 ? (
            <section className="warehouse-wizard-step warehouse-wizard-step--layout">
              <div className="warehouse-wizard-step__intro warehouse-wizard-step__intro--layout">
                <span className="warehouse-wizard-step__index">03</span>
                <div>
                  <h2>Планировка склада</h2>
                  <p>Настройте размеры помещения и расположение всех стеллажей.</p>
                </div>
                <span className="warehouse-wizard-count">{racks.length} стеллажей</span>
              </div>
              <WarehouseLayoutEditor
                layout={layout}
                onDirty={() => {
                  setLayoutDirty(true);
                  setLayoutSaved(false);
                  setLayoutError("");
                }}
                onLayoutChange={setLayout}
                racks={racks}
              />
              {layoutError && <div className="warehouse-wizard-error warehouse-wizard-error--layout" role="alert"><AlertCircle size={16} />{layoutError}</div>}
            </section>
          ) : (
            <section className="warehouse-wizard-success">
              <div className="warehouse-wizard-success__icon"><Check size={26} /></div>
              <p className="warehouse-wizard-success__eyebrow">Настройка завершена</p>
              <h2>Склад успешно настроен</h2>
              <p className="warehouse-wizard-success__description">{warehouse?.name} и его 3D-планировка сохранены. Теперь можно открыть склад.</p>
              <div className="warehouse-wizard-success__summary">
                <span><WarehouseIcon size={16} />{warehouse?.address}</span>
                <span><BoxIcon />{racks.length} стеллажей · {racks.reduce((total, rack) => total + rack.cells.length, 0)} ячеек</span>
              </div>
            </section>
          )}
        </main>

        <footer className="warehouse-wizard__footer">
          {step === 4 ? (
            <>
              <Button onClick={onClose} type="button" variant="outline">Закрыть</Button>
              <Button onClick={openSavedWarehouse} type="button">Открыть склад <ArrowRight size={16} /></Button>
            </>
          ) : (
            <>
              <Button
                className="warehouse-wizard__back"
                disabled={step === 1 || loadingExisting || creatingWarehouse || creatingRack || savingLayout}
                onClick={() => setStep((current) => current === 3 ? 2 : 1)}
                type="button"
                variant="outline"
              >
                <ArrowLeft size={15} /> Назад
              </Button>
              <div className="warehouse-wizard__footer-status">
                {step === 1 && warehouse ? <><Check size={14} /> Данные склада сохранены</> : null}
                {step === 2 && racks.length ? <><Check size={14} /> {racks.length} стеллажей сохранено</> : null}
                {step === 3 && layoutSaved ? <><Check size={14} /> Планировка сохранена</> : null}
              </div>
              {step === 1 ? (
                warehouse ? (
                  <Button onClick={() => setStep(2)} type="button">К стеллажам <ArrowRight size={16} /></Button>
                ) : (
                  <Button disabled={creatingWarehouse} form="warehouse-details-form" type="submit">
                    {creatingWarehouse ? <LoaderCircle className="animate-spin" size={16} /> : null}
                    {creatingWarehouse ? "Создаём склад…" : "Создать склад и продолжить"}
                    {!creatingWarehouse && <ArrowRight size={16} />}
                  </Button>
                )
              ) : step === 2 ? (
                <Button disabled={!racks.length || creatingRack} onClick={goToLayout} type="button">
                  К планировке <ArrowRight size={16} />
                </Button>
              ) : (
                <Button disabled={savingLayout || layoutValidation.length > 0 || !racks.length} onClick={() => void handleSaveLayout()} type="button">
                  {savingLayout ? <LoaderCircle className="animate-spin" size={16} /> : null}
                  {savingLayout ? "Сохраняем…" : "Сохранить планировку"}
                  {!savingLayout && <Check size={16} />}
                </Button>
              )}
            </>
          )}
        </footer>

        {showCloseConfirm && (
          <div className="warehouse-wizard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="warehouse-wizard-confirm-title">
            <div className="warehouse-wizard-confirm__card">
              <span className="warehouse-wizard-confirm__icon"><AlertCircle size={18} /></span>
              <h2 id="warehouse-wizard-confirm-title">Планировка не сохранена</h2>
              <p>Склад и созданные стеллажи уже сохранены на сервере. Текущие изменения планировки пропадут, если закрыть мастер.</p>
              <div className="warehouse-wizard-confirm__actions">
                <Button onClick={() => setShowCloseConfirm(false)} type="button" variant="outline">Продолжить работу</Button>
                <Button onClick={onClose} type="button" variant="default">Закрыть мастер</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

function BoxIcon() {
  return <span aria-hidden="true" className="warehouse-box-icon"><BoxIconSvg /></span>;
}

function BoxIconSvg() {
  return <svg fill="none" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg"><path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9L12 3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7"/><path d="m3.5 7.5 8.5 5 8.5-5M12 22v-9.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7"/></svg>;
}
