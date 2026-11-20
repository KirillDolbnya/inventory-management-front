import { ArrowLeft, LoaderCircle, PackageMinus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WarehouseCellItem } from "@/features/warehouse/types";

type CellUnplaceFormProps = {
  item: WarehouseCellItem;
  onBack: () => void;
  onUnplace: (placementId: number, quantity: number) => Promise<void>;
};

function getUnplaceError(error: unknown) {
  const fallback = "Не удалось снять инвентарь с размещения. Проверьте данные и попробуйте ещё раз.";
  if (!(error instanceof ApiError)) return { message: fallback, quantityError: null as string | null };

  const quantityError = error.payload?.errors?.quantity?.[0] ?? null;
  if (quantityError) return { message: null, quantityError };
  if (error.status === 401) return { message: "Сеанс завершён. Войдите в систему снова.", quantityError: null };
  if (error.status === 403) return { message: "У вас нет прав на снятие инвентаря с размещения.", quantityError: null };
  if (error.status === 404) return { message: "Размещение больше не найдено. Данные ячейки обновлены.", quantityError: null };
  if (error.status === 419) return { message: "Сеанс истёк. Обновите страницу и попробуйте снова.", quantityError: null };
  if (error.status === 409 || error.status === 422) {
    return {
      message: error.payload?.message ?? "Остаток изменился или инвентарь зарезервирован для события. Обновите данные и проверьте количество.",
      quantityError: null,
    };
  }
  if (error.kind === "network") return { message: "Не удалось подключиться к серверу. Проверьте соединение и повторите попытку.", quantityError: null };
  if (error.status >= 500) return { message: "Сервер временно недоступен. Попробуйте ещё раз.", quantityError: null };
  return { message: error.payload?.message ?? fallback, quantityError: null };
}

export function CellUnplaceForm({ item, onBack, onUnplace }: CellUnplaceFormProps) {
  const [quantity, setQuantity] = useState(String(item.quantity_in_cell));
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setQuantity(String(item.quantity_in_cell));
    setQuantityError(null);
    setRequestError(null);
  }, [item.placement_id, item.quantity_in_cell]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuantityError(null);
    setRequestError(null);

    const parsedQuantity = Number(quantity);
    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1) {
      setQuantityError("Укажите целое количество не меньше 1.");
      return;
    }
    if (parsedQuantity > item.quantity_in_cell) {
      setQuantityError(`Количество не может превышать остаток в ячейке — ${item.quantity_in_cell} шт.`);
      return;
    }

    setSubmitting(true);
    try {
      await onUnplace(item.placement_id, parsedQuantity);
    } catch (error) {
      const mapped = getUnplaceError(error);
      setRequestError(mapped.message);
      setQuantityError(mapped.quantityError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form aria-busy={submitting} className="cell-unplace-form" noValidate onSubmit={submit}>
      <Button className="cell-placement-form__back" disabled={submitting} onClick={onBack} type="button" variant="ghost">
        <ArrowLeft aria-hidden="true" size={16} />
        Назад к ячейке
      </Button>

      <div>
        <h3 className="cell-placement-form__title">Снять с размещения</h3>
        <p className="cell-placement-form__description">Подтвердите количество, которое нужно убрать из ячейки.</p>
      </div>

      <section aria-label="Снимаемый инвентарь" className="cell-unplace-summary">
        <p className="cell-unplace-summary__name">{item.name}</p>
        <span>В ячейке сейчас: {item.quantity_in_cell.toLocaleString("ru-RU")} шт.</span>
      </section>

      {requestError && <p className="cell-placement-form__error" role="alert">{requestError}</p>}

      <div className="cell-placement-form__quantity">
        <Label htmlFor="cell-unplace-quantity">Количество для снятия</Label>
        <Input
          aria-describedby={quantityError ? "cell-unplace-quantity-error" : undefined}
          aria-invalid={Boolean(quantityError)}
          autoComplete="off"
          className="h-12 rounded-lg border-zinc-200 bg-white text-base md:text-sm"
          disabled={submitting}
          id="cell-unplace-quantity"
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
        {quantityError && <p className="cell-placement-form__field-error" id="cell-unplace-quantity-error" role="alert">{quantityError}</p>}
        <p className="cell-placement-form__help">Инвентарь останется в общем списке. Будет снято {quantity || "0"} шт.</p>
      </div>

      <Button className="cell-placement-form__submit" disabled={submitting || item.quantity_in_cell < 1} type="submit">
        {submitting ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <PackageMinus aria-hidden="true" size={16} />}
        {submitting ? "Снимаем…" : "Подтвердить снятие"}
      </Button>
    </form>
  );
}
