import { useCallback, useEffect, useRef, useState, type BaseSyntheticEvent } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn } from "react-hook-form";
import { AlertTriangle, Box, Boxes, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { warehouseApi } from "@/features/warehouse/api/warehouse-api";
import type { Rack } from "@/features/warehouse/types";
import "@/features/warehouse/warehouse-rack-management.css";

const rackSchema = z.object({
  code: z.string().trim().min(1, "Введите код стеллажа.").max(20, "Не более 20 символов."),
  levels_count: z.number({ message: "Введите количество уровней." }).int("Введите целое число.").min(1, "Минимум 1 уровень.").max(10, "Максимум 10 уровней."),
  cells_per_level: z.number({ message: "Введите количество ячеек." }).int("Введите целое число.").min(1, "Минимум 1 ячейка.").max(10, "Максимум 10 ячеек."),
});

type RackFormValues = z.infer<typeof rackSchema>;
type RackChange = { rackId: number; deleted: boolean };
type RackManagementDialogProps = {
  open: boolean;
  warehouseId: number;
  warehouseName: string;
  placedRackIds: number[];
  onClose: () => void;
  onRacksChange: (racks: Rack[], change: RackChange) => void;
  onOpenLayout: () => void;
};

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

function messageForRackError(error: unknown, operation: "load" | "create" | "update" | "delete", reducingStructure = false) {
  if (!(error instanceof ApiError)) return "Не удалось выполнить действие со стеллажом. Попробуйте ещё раз.";
  if (error.status === 0 || error.kind === "network") return "Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.";
  if (error.status === 401) return "Сеанс завершён. Войдите в систему снова.";
  if (error.status === 403) return "У вас нет доступа для изменения стеллажей этого склада.";
  if (error.status === 404) return "Склад или стеллаж уже не существует. Обновите список.";
  if (error.status === 409) {
    if (operation === "delete") return "Стеллаж нельзя удалить, пока в его ячейках есть активные размещения инвентаря.";
    if (operation === "update" && reducingStructure) return "Нельзя уменьшить структуру: в ячейках, которые нужно удалить, есть активные размещения инвентаря.";
    return "Сервер не может выполнить действие из-за текущего состояния стеллажа.";
  }
  if (error.status === 419) return "Сеанс истёк. Обновите страницу и попробуйте снова.";
  if (error.status === 422) return "Проверьте код, количество уровней и ячеек на уровне.";
  if (error.status >= 500) return "Сервер не смог выполнить запрос. Попробуйте позже.";
  return operation === "load" ? "Не удалось загрузить стеллажи этого склада." : "Не удалось сохранить изменения стеллажа.";
}

function getFieldError(error: unknown, name: "code" | "levels_count" | "cells_per_level") {
  if (!(error instanceof ApiError)) return undefined;
  const errors = error.payload?.errors;
  return errors?.[name]?.[0] ?? errors?.[`racks.0.${name}`]?.[0];
}

export function WarehouseRackManagementDialog({
  open,
  warehouseId,
  warehouseName,
  placedRackIds,
  onClose,
  onRacksChange,
  onOpenLayout,
}: RackManagementDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const loadRequestId = useRef(0);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formMode, setFormMode] = useState<{ kind: "create" } | { kind: "edit"; rackId: number } | null>(null);
  const [deleteRack, setDeleteRack] = useState<Rack | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [pending, setPending] = useState(false);
  const form = useForm<RackFormValues>({
    resolver: zodResolver(rackSchema),
    defaultValues: { code: "A", levels_count: 3, cells_per_level: 4 },
  });
  const watchedLevels = form.watch("levels_count");
  const watchedCells = form.watch("cells_per_level");
  const editingRack = formMode?.kind === "edit" ? racks.find((rack) => rack.id === formMode.rackId) : undefined;
  const unplacedRacks = racks.filter((rack) => !placedRackIds.includes(rack.id));

  const loadRacks = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await warehouseApi.getRacks(warehouseId);
      if (requestId === loadRequestId.current) setRacks(result);
    } catch (error) {
      if (requestId === loadRequestId.current) setLoadError(messageForRackError(error, "load"));
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.show();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadRacks();
    setFormMode(null);
    setDeleteRack(null);
    setSubmitError("");
    return () => { loadRequestId.current += 1; };
  }, [loadRacks, open]);

  const startCreate = () => {
    setSubmitError("");
    setDeleteRack(null);
    form.reset({ code: nextRackCode(racks), levels_count: 3, cells_per_level: 4 });
    setFormMode({ kind: "create" });
  };

  const startEdit = (rack: Rack) => {
    setSubmitError("");
    setDeleteRack(null);
    form.reset({ code: rack.code, levels_count: rack.levels_count, cells_per_level: rack.cells_per_level });
    setFormMode({ kind: "edit", rackId: rack.id });
  };

  const cancelForm = () => {
    if (pending) return;
    setFormMode(null);
    setSubmitError("");
    form.clearErrors();
  };

  const saveRack = form.handleSubmit(async (values) => {
    if (!formMode) return;
    const code = values.code.trim().toUpperCase();
    const currentRack = formMode.kind === "edit" ? racks.find((rack) => rack.id === formMode.rackId) : undefined;
    if (racks.some((rack) => rack.id !== currentRack?.id && rack.code.toUpperCase() === code)) {
      form.setError("code", { message: `Код «${code}» уже используется на этом складе.` });
      return;
    }

    const reducing = Boolean(currentRack && (
      values.levels_count < currentRack.levels_count || values.cells_per_level < currentRack.cells_per_level
    ));
    setPending(true);
    setSubmitError("");
    try {
      let changedRack: Rack;
      if (currentRack) {
        if (
          code === currentRack.code &&
          values.levels_count === currentRack.levels_count &&
          values.cells_per_level === currentRack.cells_per_level
        ) {
          setFormMode(null);
          return;
        }
        changedRack = await warehouseApi.updateRack(warehouseId, currentRack.id, {
          code,
          levels_count: values.levels_count,
          cells_per_level: values.cells_per_level,
        });
      } else {
        changedRack = await warehouseApi.createRack(warehouseId, {
          code,
          levels_count: values.levels_count,
          cells_per_level: values.cells_per_level,
        });
      }
      const nextRacks = currentRack
        ? racks.map((rack) => rack.id === changedRack.id ? changedRack : rack)
        : [...racks, changedRack];
      setRacks(nextRacks);
      onRacksChange(nextRacks, { rackId: changedRack.id, deleted: false });
      setFormMode(null);
      setSubmitError("");
    } catch (error) {
      let hasFieldError = false;
      if (error instanceof ApiError && error.status === 422) {
        const codeError = getFieldError(error, "code");
        if (codeError) {
          hasFieldError = true;
          const isCodeConflict = codeError === code || codeError.toUpperCase() === code;
          form.setError("code", {
            message: isCodeConflict ? `Код «${code}» уже используется на этом складе.` : codeError,
          });
        }
        for (const field of ["levels_count", "cells_per_level"] as const) {
          const message = getFieldError(error, field);
          if (message) {
            hasFieldError = true;
            form.setError(field, { message });
          }
        }
      }
      setSubmitError(hasFieldError ? "" : messageForRackError(error, currentRack ? "update" : "create", reducing));
    } finally {
      setPending(false);
    }
  });

  const confirmDelete = async (rack: Rack) => {
    setPending(true);
    setSubmitError("");
    try {
      await warehouseApi.deleteRack(warehouseId, rack.id);
      const nextRacks = racks.filter((item) => item.id !== rack.id);
      setRacks(nextRacks);
      onRacksChange(nextRacks, { rackId: rack.id, deleted: true });
      setDeleteRack(null);
    } catch (error) {
      setSubmitError(messageForRackError(error, "delete"));
      if (error instanceof ApiError && error.status === 404) void loadRacks();
    } finally {
      setPending(false);
    }
  };

  return (
    <dialog
      aria-labelledby={`warehouse-racks-title-${warehouseId}`}
      className="warehouse-management-dialog warehouse-rack-management-dialog"
      onCancel={(event) => { if (pending) event.preventDefault(); else onClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current && !pending) onClose(); }}
      onClose={onClose}
      ref={dialogRef}
    >
      <section className="warehouse-management-dialog__surface">
        <header className="warehouse-management-dialog__header">
          <div className="min-w-0">
            <h2 id={`warehouse-racks-title-${warehouseId}`}>Стеллажи склада</h2>
            <p>{warehouseName}</p>
          </div>
          <Button aria-label="Закрыть управление стеллажами" className="size-10 shrink-0 rounded-lg" disabled={pending} onClick={onClose} size="icon" type="button" variant="ghost">
            <X aria-hidden="true" size={17} />
          </Button>
        </header>

        <div className="warehouse-management-dialog__body warehouse-rack-management-dialog__body">
          <div className="warehouse-rack-management-dialog__summary">
            <div>
              <p className="warehouse-rack-management-dialog__eyebrow">Структура склада</p>
              <p className="warehouse-rack-management-dialog__count">{racks.length} стеллажей <span>·</span> {racks.reduce((sum, rack) => sum + rack.cells.length, 0)} ячеек</p>
            </div>
            <Button className="h-10 rounded-lg px-3" disabled={loading || pending} onClick={startCreate} type="button">
              <Plus aria-hidden="true" size={16} /> Добавить
            </Button>
          </div>

          {unplacedRacks.length > 0 && (
            <div className="warehouse-rack-management-dialog__unplaced" role="status">
              <div><Boxes aria-hidden="true" size={17} /><span>{unplacedRacks.length === 1 ? `Стеллаж ${unplacedRacks[0].code} ещё не размещён на 3D-плане.` : `${unplacedRacks.length} стеллажей ещё не размещены на 3D-плане.`}</span></div>
              <Button className="h-9 rounded-lg px-3" disabled={pending} onClick={() => { onClose(); onOpenLayout(); }} type="button" variant="outline">Настроить планировку</Button>
            </div>
          )}

          {loading ? (
            <div className="warehouse-rack-management-dialog__state" role="status"><LoaderCircle aria-hidden="true" className="animate-spin" size={17} /> Загружаем стеллажи…</div>
          ) : loadError ? (
            <div className="warehouse-rack-management-dialog__state warehouse-rack-management-dialog__state--error" role="alert">
              <span>{loadError}</span>
              <Button className="h-9 rounded-lg px-3" onClick={() => void loadRacks()} type="button" variant="outline"><RefreshCw aria-hidden="true" size={14} /> Повторить</Button>
            </div>
          ) : racks.length === 0 ? (
            <div className="warehouse-rack-management-dialog__empty">
              <span><Box aria-hidden="true" size={20} /></span>
              <strong>Пока нет стеллажей</strong>
              <p>Добавьте первый стеллаж — сервер создаст его ячейки автоматически.</p>
            </div>
          ) : (
            <div aria-label="Список стеллажей" className="warehouse-rack-management-dialog__list">
              {racks.map((rack) => (
                <article className="warehouse-rack-management-dialog__rack" key={rack.id}>
                  <div className="warehouse-rack-management-dialog__rack-main">
                    <span className="warehouse-rack-management-dialog__rack-icon"><Box aria-hidden="true" size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <h3>Стеллаж {rack.code}</h3>
                      <p>{rack.levels_count} ур. <span>·</span> {rack.cells_per_level} яч. на уровне <span>·</span> {rack.cells.length} ячеек</p>
                      {!placedRackIds.includes(rack.id) && <span className="warehouse-rack-management-dialog__badge">Не размещён</span>}
                    </div>
                    <div className="warehouse-rack-management-dialog__rack-actions">
                      <Button aria-label={`Изменить стеллаж ${rack.code}`} className="size-10 rounded-lg" disabled={pending} onClick={() => startEdit(rack)} size="icon" type="button" variant="outline"><Pencil aria-hidden="true" size={15} /></Button>
                      <Button aria-label={`Удалить стеллаж ${rack.code}`} className="size-10 rounded-lg text-destructive hover:text-destructive" disabled={pending} onClick={() => { setFormMode(null); setSubmitError(""); setDeleteRack(rack); }} size="icon" type="button" variant="outline"><Trash2 aria-hidden="true" size={15} /></Button>
                    </div>
                  </div>

                  {formMode?.kind === "edit" && formMode.rackId === rack.id && (
                    <RackForm
                      form={form}
                      onCancel={cancelForm}
                      onSubmit={saveRack}
                      pending={pending}
                      submitError={submitError}
                      watchedCells={watchedCells}
                      watchedLevels={watchedLevels}
                      rack={rack}
                    />
                  )}

                  {deleteRack?.id === rack.id && (
                    <div className="warehouse-rack-management-dialog__confirm">
                      <div className="warehouse-rack-management-dialog__confirm-copy">
                        <AlertTriangle aria-hidden="true" size={17} />
                        <p>Вместе со стеллажом будут удалены его ячейки. Если в них есть активные размещения, backend отклонит удаление.</p>
                      </div>
                      {submitError && <p className="warehouse-management-dialog__error" role="alert">{submitError}</p>}
                      <div className="warehouse-rack-management-dialog__confirm-actions">
                        <Button className="h-10 rounded-lg" disabled={pending} onClick={() => { setDeleteRack(null); setSubmitError(""); }} type="button" variant="outline">Отмена</Button>
                        <Button className="h-10 rounded-lg border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700" disabled={pending} onClick={() => void confirmDelete(rack)} type="button" variant="outline">
                          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" size={15} /> : <Trash2 aria-hidden="true" size={15} />}
                          Удалить стеллаж
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {formMode?.kind === "create" && (
            <RackForm
              form={form}
              onCancel={cancelForm}
              onSubmit={saveRack}
              pending={pending}
              submitError={submitError}
              watchedCells={watchedCells}
              watchedLevels={watchedLevels}
            />
          )}
        </div>

        <footer className="warehouse-rack-management-dialog__footer">
          <Button className="h-11 rounded-lg" disabled={pending} onClick={onClose} type="button" variant="outline">Готово</Button>
          <Button className="h-11 rounded-lg" disabled={pending} onClick={() => { onClose(); onOpenLayout(); }} type="button" variant="outline"><Boxes aria-hidden="true" size={15} /> Редактор планировки</Button>
        </footer>
      </section>
    </dialog>
  );
}

type RackFormProps = {
  form: UseFormReturn<RackFormValues>;
  onSubmit: (event?: BaseSyntheticEvent) => Promise<void>;
  onCancel: () => void;
  pending: boolean;
  submitError: string;
  watchedLevels: number;
  watchedCells: number;
  rack?: Rack;
};

function RackForm({
  form,
  onSubmit,
  onCancel,
  pending,
  submitError,
  watchedLevels,
  watchedCells,
  rack,
}: RackFormProps) {
  const errors = form.formState.errors;
  const cellCount = Math.max(1, Math.min(10, watchedLevels || 1)) * Math.max(1, Math.min(10, watchedCells || 1));
  const removedCellCount = rack
    ? rack.cells.filter((cell) => cell.level > (watchedLevels || 1) || cell.position > (watchedCells || 1)).length
    : 0;
  const reducingStructure = Boolean(rack && (
    watchedLevels < rack.levels_count || watchedCells < rack.cells_per_level
  ));

  return (
    <form className="warehouse-rack-management-dialog__form" noValidate onSubmit={onSubmit}>
      <div className="warehouse-rack-management-dialog__form-title">
        <div><h3>{rack ? `Изменить стеллаж ${rack.code}` : "Новый стеллаж"}</h3><p>Сервер сформирует ячейки по заданной структуре.</p></div>
      </div>
      <div className="warehouse-rack-management-dialog__fields">
        <div className="space-y-2">
          <Label htmlFor="rack-management-code">Код стеллажа</Label>
          <Input id="rack-management-code" autoCapitalize="characters" autoComplete="off" className="h-11 rounded-lg bg-white text-base sm:text-sm" maxLength={20} {...form.register("code")} />
          {errors.code && <p className="text-xs text-destructive" role="alert">{errors.code.message}</p>}
        </div>
        <div className="warehouse-rack-management-dialog__number-fields">
          <div className="space-y-2">
            <Label htmlFor="rack-management-levels">Уровни</Label>
            <Input id="rack-management-levels" className="h-11 rounded-lg bg-white text-base sm:text-sm" inputMode="numeric" max={10} min={1} type="number" {...form.register("levels_count", { valueAsNumber: true })} />
            {errors.levels_count && <p className="text-xs text-destructive" role="alert">{errors.levels_count.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rack-management-cells">Ячейки на уровне</Label>
            <Input id="rack-management-cells" className="h-11 rounded-lg bg-white text-base sm:text-sm" inputMode="numeric" max={10} min={1} type="number" {...form.register("cells_per_level", { valueAsNumber: true })} />
            {errors.cells_per_level && <p className="text-xs text-destructive" role="alert">{errors.cells_per_level.message}</p>}
          </div>
        </div>
      </div>
      <div aria-label={`Предпросмотр: ${watchedLevels} уровней, ${watchedCells} ячеек на каждом`} className="warehouse-rack-management-dialog__preview">
        <span>{cellCount} ячеек</span>
        <div className="warehouse-rack-management-dialog__preview-grid">
          {Array.from({ length: cellCount }, (_, index) => <i aria-hidden="true" key={index} />)}
        </div>
      </div>
      {rack && reducingStructure && removedCellCount > 0 && (
        <div className="warehouse-rack-management-dialog__warning" role="status">
          <AlertTriangle aria-hidden="true" size={16} />
          <p>Структура уменьшит количество ячеек на {removedCellCount}. Если в удаляемых ячейках есть инвентарь, сервер отклонит изменение; содержимое здесь не перемещается.</p>
        </div>
      )}
      {submitError && <p className="warehouse-management-dialog__error" role="alert">{submitError}</p>}
      <div className="warehouse-rack-management-dialog__form-actions">
        <Button className="h-10 rounded-lg" disabled={pending} onClick={onCancel} type="button" variant="outline">Отмена</Button>
        <Button className="h-10 rounded-lg" disabled={pending} type="submit">
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" size={15} /> : rack ? <Pencil aria-hidden="true" size={14} /> : <Plus aria-hidden="true" size={15} />}
          {pending ? "Сохраняем…" : rack ? "Сохранить" : "Создать стеллаж"}
        </Button>
      </div>
    </form>
  );
}
