'use client';

import { useEffect, useState, useCallback } from 'react';
import { inventoryService } from '@/services/inventory.service';
import { Product } from '@/schemas/inventory.schema';
import { Search, Plus, AlertTriangle, ArrowRightLeft, Package } from 'lucide-react';
import { NewProductModal } from './NewProductModal';
import { StockMovementModal } from './StockMovementModal';

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Nuevo estado para la categoría seleccionada
  const [activeCategory, setActiveCategory] = useState<string>('TODOS');
  
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [isMovementOpen, setIsMovementOpen] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const data = await inventoryService.getProducts();
      setProducts(data);
    } catch (error) {
      console.error('Error cargando inventario:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await fetchProducts();
    };
    load();
  }, [fetchProducts]);

  // Filtramos por búsqueda de texto Y por la pestaña activa
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
      
      <StockMovementModal 
        isOpen={isMovementOpen} 
        onClose={() => setIsMovementOpen(false)} 
        onSuccess={fetchProducts}
        products={products}
      />

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
            onClick={() => setIsMovementOpen(true)}
            className="bg-slate-100 text-slate-700 border border-slate-300 px-4 py-2 rounded-lg font-medium hover:bg-slate-200 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <ArrowRightLeft size={20} />
            <span className="hidden sm:inline">Movimiento</span>
          </button>

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
        
        {/* PESTAÑAS (TABS) */}
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

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">Producto</th>
                <th className="px-6 py-4 font-medium text-center">Stock Actual</th>
                <th className="px-6 py-4 font-medium text-center">Stock Mínimo</th>
                <th className="px-6 py-4 font-medium">Categoría</th>
                <th className="px-6 py-4 font-medium text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Cargando inventario...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 flex flex-col items-center gap-2">
                    <Package className="text-slate-300 mx-auto" size={32} />
                    <p>No hay productos en esta categoría.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr 
                    key={product.id} 
                    className={`transition-colors ${product.isLowStock ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-slate-50'}`}
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