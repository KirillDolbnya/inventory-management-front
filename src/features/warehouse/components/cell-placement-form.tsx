import { ArrowLeft, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InventoryItem } from "@/features/dashboard/types/inventory";

type CellPlacementFormProps = {
  inventoryItems: InventoryItem[];
  onBack: () => void;
  onPlace: (inventoryId: number, quantity: number) => Promise<void>;
};

function getPlacementError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return { message: "Не удалось разместить инвентарь. Попробуйте ещё раз.", quantityError: null };
  }

  const quantityError = error.payload?.errors?.quantity?.[0] ?? null;
  if (quantityError) return { message: null, quantityError };
  if (error.status === 401) return { message: "Сеанс завершён. Войдите в систему снова.", quantityError: null };
  if (error.status === 403) return { message: "У вас нет прав на размещение инвентаря.", quantityError: null };
  if (error.status === 404) return { message: "Инвентарь или ячейка не найдены. Обновите данные и попробуйте снова.", quantityError: null };
  if (error.status === 419) return { message: "Сеанс истёк. Обновите страницу и попробуйте снова.", quantityError: null };
  if (error.status === 422) {
    return { message: error.payload?.message ?? "Проверьте количество и доступный остаток.", quantityError: null };
  }
  if (error.kind === "network") {
    return { message: "Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.", quantityError: null };
  }
  if (error.status >= 500) return { message: "Сервер временно недоступен. Попробуйте ещё раз.", quantityError: null };
  return { message: "Не удалось разместить инвентарь. Попробуйте ещё раз.", quantityError: null };
}

export function CellPlacementForm({ inventoryItems, onBack, onPlace }: CellPlacementFormProps) {
  const [query, setQuery] = useState("");
  const [selectedInventoryId, setSelectedInventoryId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const availableItems = useMemo(
    () => inventoryItems.filter((item) => item.unplaced_quantity > 0),
    [inventoryItems],
  );
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    return availableItems.filter((item) => item.name.toLocaleLowerCase("ru").includes(normalizedQuery));
  }, [availableItems, query]);
  const selectedItem = availableItems.find((item) => item.id === selectedInventoryId) ?? null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestError(null);
    setQuantityError(null);

    if (!selectedItem) {
      setRequestError("Выберите инвентарь для размещения.");
      return;
    }

    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setQuantityError("Укажите целое количество не меньше 1.");
      return;
    }
    if (parsedQuantity > selectedItem.unplaced_quantity) {
      setQuantityError(`Количество не может превышать доступный остаток — ${selectedItem.unplaced_quantity} шт.`);
      return;
    }

    setSubmitting(true);
    try {
      await onPlace(selectedItem.id, parsedQuantity);
    } catch (error) {
      const placementError = getPlacementError(error);
      setRequestError(placementError.message);
      setQuantityError(placementError.quantityError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form aria-busy={submitting} className="cell-placement-form" noValidate onSubmit={submit}>
      <Button className="cell-placement-form__back" onClick={onBack} type="button" variant="ghost">
        <ArrowLeft aria-hidden="true" size={16} />
        Назад к ячейке
      </Button>

      <div>
        <h3 className="cell-placement-form__title">Разместить инвентарь</h3>
        <p className="cell-placement-form__description">Выберите позицию и количество для этой ячейки.</p>
      </div>

      {requestError && <p className="cell-placement-form__error" role="alert">{requestError}</p>}

      {selectedItem ? (
        <div className="cell-placement-form__selected">
          <div className="min-w-0">
            <p className="cell-placement-form__item-name">{selectedItem.name}</p>
            <p className="cell-placement-form__available">
              Доступно: {selectedItem.unplaced_quantity} шт.
            </p>
          </div>
          <Button
            className="shrink-0"
            disabled={submitting}
            onClick={() => {
              setSelectedInventoryId(null);
              setQuantity("1");
              setQuantityError(null);
            }}
            type="button"
            variant="ghost"
          >
            Изменить
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="warehouse-search">
            <Search aria-hidden="true" className="warehouse-search__icon" size={16} />
            <Label className="sr-only" htmlFor="cell-inventory-search">Поиск доступного инвентаря</Label>
            <Input
              autoComplete="off"
              className="h-11 rounded-lg border-zinc-200 bg-white pl-9 text-base md:text-sm"
              id="cell-inventory-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти инвентарь"
              type="search"
              value={query}
            />
          </div>
          {availableItems.length ? (
            filteredItems.length ? (
              <ul aria-label="Доступный инвентарь" className="cell-placement-options">
                {filteredItems.map((item) => (
                  <li key={item.id}>
                    <button
                      className="cell-placement-option"
                      onClick={() => {
                        setSelectedInventoryId(item.id);
                        setQuantity("1");
                        setRequestError(null);
                      }}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="cell-placement-option__name">{item.name}</span>
                        {item.description && <span className="cell-placement-option__description">{item.description}</span>}
                      </span>
                      <span className="cell-placement-option__quantity">{item.unplaced_quantity} шт.</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="warehouse-empty-state">По вашему запросу ничего не найдено.</p>
            )
          ) : (
            <p className="warehouse-empty-state">Нет инвентаря, доступного для размещения.</p>
          )}
        </div>
      )}

      {selectedItem && (
        <div className="cell-placement-form__quantity">
          <Label htmlFor="cell-placement-quantity">Количество</Label>
          <Input
            aria-describedby={quantityError ? "cell-placement-quantity-error" : "cell-placement-quantity-help"}
            aria-invalid={Boolean(quantityError)}
            autoComplete="off"
            className="h-12 rounded-lg text-base md:text-sm"
            id="cell-placement-quantity"
            inputMode="numeric"
            max={selectedItem.unplaced_quantity}
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
            <p className="cell-placement-form__field-error" id="cell-placement-quantity-error" role="alert">
              {quantityError}
            </p>
          ) : (
            <p className="cell-placement-form__help" id="cell-placement-quantity-help">
              Доступно для размещения: {selectedItem.unplaced_quantity} шт.
            </p>
          )}
        </div>
      )}

      <Button className="cell-placement-form__submit" disabled={submitting || !selectedItem} type="submit">
        {submitting ? "Размещаем…" : "Разместить"}
      </Button>
    </form>
  );
}
