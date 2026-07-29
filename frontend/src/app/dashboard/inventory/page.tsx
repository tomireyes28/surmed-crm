'use client';

import { useEffect, useState, useCallback } from 'react';
import { inventoryService } from '@/services/inventory.service';
import { Product } from '@/schemas/inventory.schema';
import { Search, Plus, Minus, AlertTriangle, Package, Pencil, ArchiveX } from 'lucide-react';
import Link from 'next/link';
import { NewProductModal } from './NewProductModal';
import { StockMovementModal } from './StockMovementModal';

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [activeCategory, setActiveCategory] = useState<string>('TODOS');
  
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [isMovementOpen, setIsMovementOpen] = useState(false);
  
  const [selectedMovement, setSelectedMovement] = useState<{product: Product | null, type: 'IN' | 'OUT'}>({
    product: null,
    type: 'IN'
  });

  const fetchProducts = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await inventoryService.getProducts();
      setProducts(data);
    } catch (error) {
      console.error('Error cargando inventario:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleOpenMovement = (product: Product, type: 'IN' | 'OUT') => {
    setSelectedMovement({ product, type });
    setIsMovementOpen(true);
  };

  // NUEVO: Función para desactivar/archivar un insumo
  const handleDeactivate = async (id: string, name: string) => {
    const isConfirmed = window.confirm(`¿Estás seguro de que deseas archivar el insumo "${name}"? Dejará de aparecer en las listas activas.`);
    if (isConfirmed) {
      try {
        await inventoryService.deactivateProduct(id);
        fetchProducts(); // Recargamos la tabla
      } catch (error) {
        console.error('Error al archivar insumo:', error);
        alert('Hubo un problema al archivar el insumo.');
      }
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'TODOS' || p.category === activeCategory;
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
            setTimeout(() => setSelectedMovement({ product: null, type: 'IN' }), 300);
          }} 
          onSuccess={fetchProducts}
          preSelectedProduct={selectedMovement.product}
          movementType={selectedMovement.type}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Inventario</h1>
        
        <div className="flex w-full sm:w-auto gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar insumo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          
          <button 
            onClick={() => setIsNewProductOpen(true)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Nuevo Insumo</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        
        <div className="flex border-b border-slate-200 px-4 pt-2 overflow-x-auto hide-scrollbar">
          {[
            { id: 'TODOS', label: 'Todos' },
            { id: 'INSUMO_MEDICO', label: 'Insumos Médicos' },
            { id: 'OFICINA', label: 'Limpieza y Oficina' },
            { id: 'ACTIVO_FIJO', label: 'Mobiliario / Activos' }
          ].map((tab) => (
            <button
              key={tab.id}
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
                <th className="px-6 py-4 font-medium text-center">Stock Actual</th>
                <th className="px-6 py-4 font-medium text-center">Stock Mínimo</th>
                <th className="px-6 py-4 font-medium">Categoría</th>
                <th className="px-6 py-4 font-medium text-center">Estado</th>
                <th className="px-6 py-4 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Cargando inventario...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500 flex flex-col items-center gap-2">
                    <Package className="text-slate-300 mx-auto" size={32} />
                    <p>No hay productos en esta categoría.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr 
                    key={product.id} 
                    className={`transition-colors group ${product.isLowStock ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-800">{product.name}</p>
                      {product.description && (
                        <p className="text-xs text-slate-500 truncate max-w-xs">{product.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-lg font-bold ${product.isLowStock ? 'text-red-600' : 'text-slate-700'}`}>
                        {product.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 text-center">
                      {product.minStock}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {product.category === 'INSUMO_MEDICO' ? 'Insumo Médico' : 
                       product.category === 'OFICINA' ? 'Oficina/Limpieza' : 'Activo Fijo'}
                    </td>
                    <td className="px-6 py-4 flex justify-center">
                      {product.isLowStock ? (
                        <span className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                          <AlertTriangle size={14} />
                          Stock Bajo
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                          Adecuado
                        </span>
                      )}
                    </td>
                    
                    {/* NUEVO: Columna de Acciones con botones integrados */}
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        
                        {/* Controles de Stock */}
                        <button 
                          onClick={() => handleOpenMovement(product, 'IN')}
                          title="Ingresar Stock"
                          className="p-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-md transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                        <button 
                          onClick={() => handleOpenMovement(product, 'OUT')}
                          title="Descontar Stock"
                          className="p-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-md transition-colors"
                        >
                          <Minus size={16} />
                        </button>

                        <div className="w-px h-6 bg-slate-200 mx-1"></div> {/* Separador Visual */}

                        {/* Controles Administrativos */}
                        <Link 
                          href={`/dashboard/inventory/${product.id}/edit`}
                          title="Editar Insumo"
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                        >
                          <Pencil size={16} />
                        </Link>
                        <button 
                          onClick={() => handleDeactivate(product.id, product.name)}
                          title="Archivar Insumo"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <ArchiveX size={16} />
                        </button>

                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}