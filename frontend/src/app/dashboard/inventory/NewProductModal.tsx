import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productSchema, ProductFormValues } from '@/schemas/inventory.schema';
import { inventoryService } from '@/services/inventory.service';
import { Save } from 'lucide-react';
import { AccessibleModal } from '@/components/ui/AccessibleModal';
import { isAxiosError } from 'axios';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewProductModal({ isOpen, onClose, onSuccess }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      category: 'INSUMO_MEDICO',
    },
  });

  const onSubmit = async (data: ProductFormValues) => {
    try {
      await inventoryService.createProduct(data);
      reset();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error al crear producto', error);
      const msg = isAxiosError(error)
        ? error.response?.data?.message
        : 'Error al guardar el insumo';
      alert(Array.isArray(msg) ? msg.join(', ') : msg || 'Error al guardar el insumo');
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Insumo"
      titleId="new-product-modal-title"
      isDirty={isDirty}
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
        <div>
          <label
            htmlFor="new-product-name"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Nombre *
          </label>
          <input
            id="new-product-name"
            type="text"
            {...register('name')}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.name && (
            <span role="alert" className="text-red-500 text-xs mt-1 block">
              {errors.name.message}
            </span>
          )}
        </div>

        <div>
          <label
            htmlFor="new-product-category"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Categoría *
          </label>
          <select
            id="new-product-category"
            {...register('category')}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="INSUMO_MEDICO">Insumo Médico / Descartable</option>
            <option value="OFICINA">Limpieza y Oficina</option>
            <option value="ACTIVO_FIJO">Mobiliario y Equipamiento</option>
          </select>
          {errors.category && (
            <span role="alert" className="text-red-500 text-xs mt-1 block">
              {errors.category.message}
            </span>
          )}
        </div>

        <div>
          <label
            htmlFor="new-product-description"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            Descripción
          </label>
          <input
            id="new-product-description"
            type="text"
            {...register('description')}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="new-product-minstock"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Stock Mín. *
            </label>
            <input
              id="new-product-minstock"
              type="number"
              min="0"
              {...register('minStock', { valueAsNumber: true })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.minStock && (
              <span role="alert" className="text-red-500 text-xs mt-1 block">
                {errors.minStock.message}
              </span>
            )}
          </div>
          <div>
            <label
              htmlFor="new-product-price"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Precio Ref. (Gs.)
            </label>
            <input
              id="new-product-price"
              type="number"
              min="0"
              step="any"
              {...register('price', { valueAsNumber: true })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
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
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center gap-2"
          >
            <Save size={18} />
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}
