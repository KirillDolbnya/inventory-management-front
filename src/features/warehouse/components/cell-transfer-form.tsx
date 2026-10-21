import { ArrowLeft, ArrowRightLeft, Check, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { warehouseDataService } from "@/features/warehouse/services/warehouse-data-service";
import type { Cell, Rack, WarehouseCellItem } from "@/features/warehouse/types";
import type { Warehouse } from "@/features/dashboard/types/warehouse";

type PickedTarget = { rack: Rack; cell: Cell } | null;

type CellTransferFormProps = {
  item: WarehouseCellItem;
  sourceWarehouse: Warehouse;
  sourceRack: Rack;
  sourceCell: Cell;
  sourceRacks: Rack[];
  pickedTarget: PickedTarget;
  selectionNotice: string | null;
  onBack: () => void;
  onPickOnModel: () => void;
  onTransfer: (placementId: number, targetCellId: number, quantity: number) => Promise<void>;
};

type SearchOption = { id: number; label: string; description?: string };

function getTransferError(error: unknown) {
  const result = { message: "Не удалось переместить инвентарь. Проверьте данные и попробуйте ещё раз.", quantityError: null as string | null, targetError: null as string | null };
  if (!(error instanceof ApiError)) return result;

  const quantityError = error.payload?.errors?.quantity?.[0] ?? null;
  const targetError = error.payload?.errors?.target_cell_id?.[0] ?? null;
  if (quantityError || targetError) {
    return { message: null, quantityError, targetError };
  }
  if (error.status === 401) return { ...result, message: "Сеанс завершён. Войдите в систему снова." };
  if (error.status === 403) return { ...result, message: "У вас нет прав на перемещение инвентаря." };
  if (error.status === 404) return { ...result, message: "Размещение или ячейка назначения больше не найдены. Обновите данные и выберите место снова." };
  if (error.status === 419) return { ...result, message: "Сеанс истёк. Обновите страницу и попробуйте снова." };
  if (error.status === 409) return { ...result, message: error.payload?.message ?? "Перемещение ограничено текущими резервами или остатком. Обновите данные и проверьте количество." };
  if (error.status === 422) return { ...result, message: error.payload?.message ?? "Проверьте количество и выбранную ячейку назначения." };
  if (error.kind === "network") return { ...result, message: "Не удалось подключиться к серверу. Проверьте соединение и повторите попытку." };
  if (error.status >= 500) return { ...result, message: "Сервер временно недоступен. Попробуйте ещё раз." };
  return result;
}

function SearchableChoice({
  id,
  label,
  selected,
  options,
  placeholder,
  disabled = false,
  loading = false,
  emptyMessage,
  onSelect,
}: {
  id: string;
  label: string;
  selected: SearchOption | null;
  options: SearchOption[];
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  emptyMessage: string;
  onSelect: (option: SearchOption) => void;
}) {
  const [isOpen, setIsOpen] = useState(!selected);
  const [query, setQuery] = useState("");
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""}`.toLocaleLowerCase("ru").includes(normalizedQuery),
    );
  }, [options, query]);

  return (
    <div className="cell-transfer-choice">
      <Label htmlFor={selected && !isOpen ? undefined : id}>{label}</Label>
      {selected && !isOpen ? (
        <div className="cell-transfer-choice__selected">
          <div className="min-w-0">
            <p>{selected.label}</p>
            {selected.description && <span>{selected.description}</span>}
          </div>
          <Button
            className="shrink-0"
            disabled={disabled}
            onClick={() => {
              setQuery("");
              setIsOpen(true);
            }}
            type="button"
            variant="ghost"
          >
            Изменить
          </Button>
        </div>
      ) : (
        <>
          <div className="warehouse-search cell-transfer-choice__search">
            <Search aria-hidden="true" className="warehouse-search__icon" size={16} />
            <Input
              autoComplete="off"
              className="h-11 rounded-lg border-zinc-200 bg-white pl-9 text-base md:text-sm"
              disabled={disabled || loading}
              id={id}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={loading ? "Загружаем…" : placeholder}
              type="search"
              value={query}
            />
          </div>
          <ul aria-label={label} className="cell-transfer-choice__options">
            {loading ? (
              <li className="cell-transfer-choice__empty">Загружаем варианты…</li>
            ) : filteredOptions.length ? filteredOptions.map((option) => (
              <li key={option.id}>
                <button
                  aria-pressed={selected?.id === option.id}
                  className="cell-transfer-choice__option"
                  disabled={disabled || loading}
                  onClick={() => {
                    onSelect(option);
                    setQuery("");
                    setIsOpen(false);
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span>{option.label}</span>
                    {option.description && <small>{option.description}</small>}
                  </span>
                  {selected?.id === option.id && <Check aria-hidden="true" size={15} />}
                </button>
              </li>
            )) : (
              <li className="cell-transfer-choice__empty">{emptyMessage}</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

export function CellTransferForm({
  item,
  sourceWarehouse,
  sourceRack,
  sourceCell,
  sourceRacks,
  pickedTarget,
  selectionNotice,
  onBack,
  onPickOnModel,
  onTransfer,
}: CellTransferFormProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(true);
  const [warehousesError, setWarehousesError] = useState<string | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(sourceWarehouse.id);
  const [racks, setRacks] = useState<Rack[]>(sourceRacks);
  const [racksLoading, setRacksLoading] = useState(false);
  const [racksError, setRacksError] = useState<string | null>(null);
  const [selectedRackId, setSelectedRackId] = useState<number | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const rackRequestId = useRef(0);

  useEffect(() => {
    let mounted = true;
    setWarehousesLoading(true);
    warehouseDataService.getWarehouses().then((result) => {
      if (!mounted) return;
      setWarehouses(result);
      setWarehousesError(null);
    }).catch(() => {
      if (mounted) setWarehousesError("Не удалось загрузить список складов. Попробуйте ещё раз.");
    }).finally(() => {
      if (mounted) setWarehousesLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!pickedTarget) return;
    setSelectedWarehouseId(sourceWarehouse.id);
    setRacks(sourceRacks);
    setSelectedRackId(pickedTarget.rack.id);
    setSelectedCellId(pickedTarget.cell.id);
    setRacksError(null);
    setTargetError(null);
    setRequestError(null);
  }, [pickedTarget?.cell.id, pickedTarget?.rack.id, sourceRacks, sourceWarehouse.id]);

  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId)
    ?? (sourceWarehouse.id === selectedWarehouseId ? sourceWarehouse : null);
  const selectedRack = racks.find((rack) => rack.id === selectedRackId) ?? null;
  const selectedCell = selectedRack?.cells.find((cell) => cell.id === selectedCellId) ?? null;
  const selectedCellOption = selectedRack && selectedCell ? {
    id: selectedCell.id,
    label: `Ячейка №${selectedCell.number}`,
    description: `Уровень ${selectedCell.level} · позиция ${selectedCell.position}`,
  } : null;

  const warehouseOptions = warehouses.map((warehouse) => ({
    id: warehouse.id,
    label: warehouse.name,
    description: warehouse.address,
  }));
  const rackOptions = racks.map((rack) => ({
    id: rack.id,
    label: `Стеллаж ${rack.code}`,
    description: `${rack.levels_count} ур. · ${rack.cells_per_level} яч. на уровне`,
  }));
  const cellOptions = (selectedRack?.cells ?? [])
    .filter((cell) => cell.id !== sourceCell.id)
    .map((cell) => ({
      id: cell.id,
      label: `Ячейка №${cell.number}`,
      description: `Уровень ${cell.level} · позиция ${cell.position}`,
    }));
  const destination = selectedWarehouse && selectedRack && selectedCell
    ? `${selectedWarehouse.name} · Стеллаж ${selectedRack.code} · ячейка №${selectedCell.number}`
    : null;

  const chooseWarehouse = async (warehouseId: number) => {
    const requestId = ++rackRequestId.current;
    setSelectedWarehouseId(warehouseId);
    setSelectedRackId(null);
    setSelectedCellId(null);
    setTargetError(null);
    setRequestError(null);
    if (warehouseId === sourceWarehouse.id) {
      setRacks(sourceRacks);
      setRacksError(null);
      setRacksLoading(false);
      return;
    }

    setRacks([]);
    setRacksLoading(true);
    setRacksError(null);
    try {
      const result = await warehouseDataService.getRacks(warehouseId);
      if (requestId === rackRequestId.current) setRacks(result);
    } catch {
      if (requestId === rackRequestId.current) setRacksError("Не удалось загрузить стеллажи этого склада.");
    } finally {
      if (requestId === rackRequestId.current) setRacksLoading(false);
    }
  };

  const retryWarehouses = async () => {
    setWarehousesLoading(true);
    setWarehousesError(null);
    try {
      setWarehouses(await warehouseDataService.getWarehouses());
    } catch {
      setWarehousesError("Не удалось загрузить список складов. Попробуйте ещё раз.");
    } finally {
      setWarehousesLoading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestError(null);
    setQuantityError(null);
    setTargetError(null);

    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setQuantityError("Укажите целое количество не меньше 1.");
      return;
    }
    if (parsedQuantity > item.quantity_in_cell) {
      setQuantityError(`Количество не может превышать остаток в ячейке — ${item.quantity_in_cell} шт.`);
      return;
    }
    if (!selectedCell) {
      setTargetError("Выберите склад, стеллаж и ячейку назначения.");
      return;
    }
    if (selectedCell.id === sourceCell.id) {
      setTargetError("Ячейка назначения должна отличаться от исходной.");
      return;
    }

    setSubmitting(true);
    try {
      await onTransfer(item.placement_id, selectedCell.id, parsedQuantity);
    } catch (error) {
      const transferError = getTransferError(error);
      setRequestError(transferError.message);
      setQuantityError(transferError.quantityError);
      setTargetError(transferError.targetError);
    } finally {
      setSubmitting(false);
    }
  };

  const sourceSummary = `${sourceWarehouse.name} · Стеллаж ${sourceRack.code} · ячейка №${sourceCell.number}`;

  return (
    <form aria-busy={submitting} className="cell-transfer-form" noValidate onSubmit={submit}>
      <Button className="cell-placement-form__back" disabled={submitting} onClick={onBack} type="button" variant="ghost">
        <ArrowLeft aria-hidden="true" size={16} />
        Назад к ячейке
      </Button>

      <div>
        <h3 className="cell-placement-form__title">Перемещение инвентаря</h3>
        <p className="cell-placement-form__description">Укажите количество и новое место хранения.</p>
      </div>

      <section aria-label="Перемещаемый инвентарь" className="cell-transfer-summary">
        <div className="cell-transfer-summary__item">
          <p className="cell-transfer-summary__name">{item.name}</p>
          <span>Доступно для перемещения: {item.quantity_in_cell} шт.</span>
        </div>
        <div className="cell-transfer-summary__location">
          <span>Откуда</span>
          <strong>{sourceSummary}</strong>
          <small>Уровень {sourceCell.level} · позиция {sourceCell.position}</small>
        </div>
      </section>

      {requestError && <p className="cell-placement-form__error" role="alert">{requestError}</p>}
      {selectionNotice && <p className="cell-placement-form__error" role="status">{selectionNotice}</p>}
      {warehousesError && (
        <div className="cell-transfer-load-error" role="alert">
          <p>{warehousesError}</p>
          <Button className="mt-2" disabled={warehousesLoading} onClick={() => void retryWarehouses()} type="button" variant="outline">
            Повторить
          </Button>
        </div>
      )}

      <div className="cell-transfer-form__field">
        <Label htmlFor="cell-transfer-quantity">Количество</Label>
        <Input
          aria-describedby={quantityError ? "cell-transfer-quantity-error" : "cell-transfer-quantity-help"}
          aria-invalid={Boolean(quantityError)}
          autoComplete="off"
          className="h-12 rounded-lg text-base md:text-sm"
          disabled={submitting}
          id="cell-transfer-quantity"
          inputMode="numeric"
          max={item.quantity_in_cell}
          min={1}
          onChange={(event) => {
            setQuantity(event.target.value);
            setQuantityError(null);
          }}
          step={1}
          type="number"
          value={quantity}
        />
        {quantityError ? (
          <p className="cell-placement-form__field-error" id="cell-transfer-quantity-error" role="alert">{quantityError}</p>
        ) : (
          <p className="cell-placement-form__help" id="cell-transfer-quantity-help">Можно переместить до {item.quantity_in_cell} шт.</p>
        )}
      </div>

      <div className="cell-transfer-form__destination">
        <div className="cell-transfer-form__section-heading">
          <div>
            <h4>Куда переместить</h4>
            <p>Склад, стеллаж и ячейку можно найти по названию.</p>
          </div>
        </div>
        <SearchableChoice
          disabled={submitting || warehousesLoading || Boolean(warehousesError)}
          emptyMessage="Склады не найдены."
          id="cell-transfer-warehouse"
          label="Склад назначения"
          loading={warehousesLoading}
          onSelect={(option) => void chooseWarehouse(option.id)}
          options={warehouseOptions}
          placeholder="Найти склад"
          selected={selectedWarehouse ? {
            id: selectedWarehouse.id,
            label: selectedWarehouse.name,
            description: selectedWarehouse.address,
          } : null}
        />
        {selectedWarehouse && (
          <>
            <SearchableChoice
              disabled={submitting || racksLoading || Boolean(racksError)}
              emptyMessage={racks.length ? "Стеллажи не найдены." : "В этом складе нет стеллажей."}
              id="cell-transfer-rack"
              label="Стеллаж назначения"
              loading={racksLoading}
              onSelect={(option) => {
                setSelectedRackId(option.id);
                setSelectedCellId(null);
                setTargetError(null);
                setRequestError(null);
              }}
              options={rackOptions}
              placeholder="Найти стеллаж"
              selected={selectedRack ? {
                id: selectedRack.id,
                label: `Стеллаж ${selectedRack.code}`,
                description: `${selectedRack.levels_count} ур. · ${selectedRack.cells_per_level} яч. на уровне`,
              } : null}
            />
            {racksError && (
              <div className="cell-transfer-load-error" role="alert">
                <p>{racksError}</p>
                <Button className="mt-2" disabled={racksLoading} onClick={() => void chooseWarehouse(selectedWarehouse.id)} type="button" variant="outline">
                  Повторить
                </Button>
              </div>
            )}
          </>
        )}
        {selectedRack && (
          <SearchableChoice
            disabled={submitting}
            emptyMessage={cellOptions.length ? "Ячейки не найдены." : "В этом стеллаже нет других ячеек."}
            id="cell-transfer-cell"
            label="Ячейка назначения"
            onSelect={(option) => {
              setSelectedCellId(option.id);
              setTargetError(null);
              setRequestError(null);
            }}
            options={cellOptions}
            placeholder="Найти ячейку"
            selected={selectedCellOption}
          />
        )}
        {targetError && <p className="cell-placement-form__field-error" role="alert">{targetError}</p>}
        <Button
          className="cell-transfer-form__model-button"
          disabled={submitting}
          onClick={onPickOnModel}
          type="button"
          variant="outline"
        >
          <ArrowRightLeft aria-hidden="true" size={16} />
          Выбрать на 3D-модели
        </Button>
      </div>

      <section aria-label="Проверка перемещения" className="cell-transfer-confirmation">
        <div className="cell-transfer-confirmation__heading">
          <ArrowRightLeft aria-hidden="true" size={16} />
          <span>Проверьте перемещение</span>
        </div>
        <p><span>Откуда</span><strong>{sourceSummary}</strong></p>
        <p><span>Количество</span><strong>{quantity || "—"} шт.</strong></p>
        <p><span>Куда</span><strong>{destination ?? "Выберите ячейку назначения"}</strong></p>
      </section>

      <Button className="cell-placement-form__submit" disabled={submitting || !selectedCell || warehousesLoading} type="submit">
        {submitting ? "Перемещаем…" : "Переместить инвентарь"}
      </Button>
    </form>
  );
}
