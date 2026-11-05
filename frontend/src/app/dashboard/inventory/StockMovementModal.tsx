import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  movementSchema,
  MovementFormValues,
  Product,
} from '@/schemas/inventory.schema';
import { inventoryService } from '@/services/inventory.service';
import { ArrowRightLeft } from 'lucide-react';
import { isAxiosError } from 'axios';
import { AccessibleModal } from '@/components/ui/AccessibleModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preSelectedProduct?: Product | null;
  movementType?: 'IN' | 'OUT';
}

export function StockMovementModal({
  isOpen,
  onClose,
  onSuccess,
  preSelectedProduct,
  movementType,
}: Props) {
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `mov-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<MovementFormValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: {
      type: movementType || 'IN',
      quantity: 1,
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (preSelectedProduct) {
        setValue('productId', preSelectedProduct.id);
      }
      if (movementType) {
        setValue('type', movementType);
        setValue(
          'notes',
          movementType === 'IN' ? 'Ingreso de stock' : 'Uso interno',
        );
      }
    }
  }, [isOpen, preSelectedProduct, movementType, setValue]);

  const onSubmit = async (data: MovementFormValues) => {
    try {
      await inventoryService.registerMovement(data, idempotencyKey);
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        setIdempotencyKey(crypto.randomUUID());
      }
      reset();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error al registrar movimiento', error);
      if (isAxiosError(error)) {
        alert(
          error.response?.data?.message || 'Error al registrar el movimiento',
        );
      } else {
        alert('Error inesperado');
      }
    }
  };

  const isIncome = movementType === 'IN';

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={isIncome ? 'Ingreso de Stock' : 'Descuento de Stock'}
      titleId="stock-movement-modal-title"
      maxWidthClass="max-w-md"
      headerClassName={isIncome ? 'bg-emerald-50' : 'bg-red-50'}
      headerIcon={
        <ArrowRightLeft
          size={20}
          className={isIncome ? 'text-emerald-600' : 'text-red-600'}
        />
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1">
            Insumo Seleccionado
          </span>
          <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium">
            {preSelectedProduct?.name}{' '}
            <span className="text-slate-500 text-sm font-normal">
              (Stock Actual: {preSelectedProduct?.quantity})
            </span>
          </div>
          <input type="hidden" {...register('productId')} />
          {errors.productId && (
            <span role="alert" className="text-red-500 text-xs mt-1 block">
              {errors.productId.message}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1">
              Movimiento
            </span>
            <div
              className={`w-full px-4 py-2 border border-slate-200 rounded-lg font-medium text-center ${
                isIncome
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-red-700 bg-red-50'
              }`}
            >
              {isIncome ? 'Entrada (IN)' : 'Salida (OUT)'}
            </div>
            <input type="hidden" {...register('type')} />
          </div>
          <div>
            <label
              htmlFor="movement-quantity"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Cantidad a {isIncome ? 'Sumar' : 'Restar'} *
            </label>
            <input
              id="movement-quantity"
              type="number"
              {...register('quantity', { valueAsNumber: true })}
              className={`w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 ${
                isIncome
                  ? 'focus:ring-emerald-500 border-emerald-200'
                  : 'focus:ring-red-500 border-red-200'
              }`}
              min="1"
            />
            {errors.quantity && (
              <span role="alert" className="text-red-500 text-xs mt-1 block">
                {errors.quantity.message}
              </span>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="movement-notes"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Notas (Opcional)
          </label>
          <input
            id="movement-notes"
            type="text"
            {...register('notes')}
            placeholder="Ej: Compra a proveedor..."
            className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 ${
              isIncome
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {isSubmitting
              ? 'Guardando...'
              : isIncome
                ? 'Confirmar Ingreso'
                : 'Confirmar Egreso'}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}
