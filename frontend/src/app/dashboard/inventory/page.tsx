'use client';

import { useEffect, useState, useCallback } from 'react';
import { inventoryService } from '@/services/inventory.service';
import { Product } from '@/schemas/inventory.schema';
import {
  Search,
  Plus,
  Minus,
  AlertTriangle,
  Package,
  Pencil,
  ArchiveX,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { NewProductModal } from './NewProductModal';
import { StockMovementModal } from './StockMovementModal';
import { ErrorAlert } from '@/components/ui/PageState';
import { PRODUCT_CATEGORY_LABELS } from '@/utils/domain-rules';

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<string>('TODOS');

  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [isMovementOpen, setIsMovementOpen] = useState(false);

  const [selectedMovement, setSelectedMovement] = useState<{
    product: Product | null;
    type: 'IN' | 'OUT';
  }>({
    product: null,
    type: 'IN',
  });

  const fetchProducts = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const data = await inventoryService.getProducts(showArchived);
      setProducts(data);
    } catch (error) {
      console.error('Error cargando inventario:', error);
      setLoadError(
        'No se pudo cargar el inventario de insumos. Verifique la conexión.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    const load = async () => {
      await fetchProducts();
    };
    void load();
  }, [fetchProducts]);

  const handleOpenMovement = (product: Product, type: 'IN' | 'OUT') => {
    setSelectedMovement({ product, type });
    setIsMovementOpen(true);
  };

  const handleDeactivate = async (id: string, name: string) => {
    const isConfirmed = window.confirm(
      `¿Está seguro de que desea archivar el insumo "${name}"? Dejará de aparecer en las listas activas.`,
    );
    if (!isConfirmed) return;

    try {
      await inventoryService.deactivateProduct(id);
      await fetchProducts();
    } catch (error) {
      console.error('Error al archivar insumo:', error);
      alert('Hubo un problema al archivar el insumo.');
    }
  };

  const handleReactivate = async (id: string, name: string) => {
    const isConfirmed = window.confirm(
      `¿Desea reactivar el insumo "${name}" en el inventario activo?`,
    );
    if (!isConfirmed) return;

    try {
      await inventoryService.reactivateProduct(id);
      await fetchProducts();
    } catch (error) {
      console.error('Error al reactivar insumo:', error);
      alert('No se pudo reactivar el insumo.');
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategory =
      activeCategory === 'TODOS' || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <NewProductModal
        isOpen={isNewProductOpen}
        onClose={() => setIsNewProductOpen(false)}
        onSuccess={fetchProducts}
      />

      {selectedMovement.product && (
        <StockMovementModal
          isOpen={isMovementOpen}
          onClose={() => {
            setIsMovementOpen(false);
            setTimeout(
              () => setSelectedMovement({ product: null, type: 'IN' }),
              200,
            );
          }}
          onSuccess={fetchProducts}
          preSelectedProduct={selectedMovement.product}
          movementType={selectedMovement.type}
        />
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventario</h1>
          <p className="text-sm text-slate-500">
            Control de insumos médicos, limpieza y activos fijos con movimientos trazables.
          </p>
        </div>

        <div className="flex flex-wrap w-full md:w-auto items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="search"
              aria-label="Buscar insumo por nombre"
              placeholder="Buscar insumo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-2.5 rounded-lg border border-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Incluir archivados
          </label>

          <button
            type="button"
            onClick={() => setIsNewProductOpen(true)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 whitespace-nowrap text-sm shadow-sm"
          >
            <Plus size={18} />
            <span>Nuevo Insumo</span>
          </button>
        </div>
      </div>

      {loadError && (
        <ErrorAlert message={loadError} onRetry={() => void fetchProducts()} />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div
          role="tablist"
          aria-label="Categorías de inventario"
          className="flex border-b border-slate-200 px-4 pt-2 overflow-x-auto hide-scrollbar"
        >
          {[
            { id: 'TODOS', label: 'Todos' },
            { id: 'INSUMO_MEDICO', label: 'Insumos Médicos' },
            { id: 'OFICINA', label: 'Limpieza y Oficina' },
            { id: 'ACTIVO_FIJO', label: 'Mobiliario / Activos' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === tab.id}
              onClick={() => setActiveCategory(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeCategory === tab.id
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Producto</th>
                <th className="px-6 py-4 font-medium text-center">
                  Stock Actual
                </th>
                <th className="px-6 py-4 font-medium text-center">
                  Stock Mínimo
                </th>
                <th className="px-6 py-4 font-medium">Categoría</th>
                <th className="px-6 py-4 font-medium text-center">Estado</th>
                <th className="px-6 py-4 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Cargando inventario...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Package className="text-slate-300 mx-auto" size={32} />
                      <p>No hay productos en esta categoría.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const isArchived = product.isActive === false;
                  return (
                    <tr
                      key={product.id}
                      className={`transition-colors ${
                        isArchived
                          ? 'bg-slate-50/70 text-slate-400'
                          : product.isLowStock
                            ? 'bg-red-50/50 hover:bg-red-50'
                            : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800">
                            {product.name}
                          </p>
                          {isArchived && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-600 rounded uppercase">
                              Archivado
                            </span>
                          )}
                        </div>
                        {product.description && (
                          <p className="text-xs text-slate-500 truncate max-w-xs">
                            {product.description}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-lg font-bold ${
                            product.isLowStock
                              ? 'text-red-600'
                              : 'text-slate-700'
                          }`}
                        >
                          {product.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 text-center">
                        {product.minStock}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {PRODUCT_CATEGORY_LABELS[product.category] ??
                          product.category}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex justify-center">
                          {isArchived ? (
                            <span className="px-2.5 py-1 bg-slate-200 text-slate-600 rounded-full text-xs font-medium">
                              Inactivo
                            </span>
                          ) : product.isLowStock ? (
                            <span className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                              <AlertTriangle size={14} />
                              Stock Bajo
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                              Adecuado
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isArchived && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenMovement(product, 'IN')}
                                aria-label={`Ingresar stock de ${product.name}`}
                                title="Ingresar Stock"
                                className="p-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-md transition-colors"
                              >
                                <Plus size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenMovement(product, 'OUT')
                                }
                                aria-label={`Descontar stock de ${product.name}`}
                                title="Descontar Stock"
                                className="p-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-md transition-colors"
                              >
                                <Minus size={16} />
                              </button>
                              <div className="w-px h-6 bg-slate-200 mx-1" />
                            </>
                          )}

                          <Link
                            href={`/dashboard/inventory/${product.id}/edit`}
                            aria-label={`Editar ${product.name}`}
                            title="Editar Insumo"
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                          >
                            <Pencil size={16} />
                          </Link>

                          {isArchived ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleReactivate(product.id, product.name)
                              }
                              aria-label={`Reactivar ${product.name}`}
                              title="Reactivar Insumo"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                            >
                              <RotateCcw size={16} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void handleDeactivate(product.id, product.name)
                              }
                              aria-label={`Archivar ${product.name}`}
                              title="Archivar Insumo"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            >
                              <ArchiveX size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
