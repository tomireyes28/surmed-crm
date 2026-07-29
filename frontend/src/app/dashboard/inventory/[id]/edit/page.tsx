'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { inventoryService, UpdateProductDto } from '@/services/inventory.service';
import { ArrowLeft, Save, PackageSearch } from 'lucide-react';
import Link from 'next/link';

export default function EditInventoryPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [formData, setFormData] = useState<UpdateProductDto>({
    name: '',
    description: '',
    minStock: 5,
    price: 0,
    category: 'INSUMO_MEDICO',
  });

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const product = await inventoryService.getById(productId);
        setFormData({
          name: product.name,
          description: product.description || '',
          minStock: product.minStock,
          price: product.price || 0,
          category: product.category,
        });
      } catch (error) {
        console.error('Error cargando producto:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProduct();
  }, [productId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData({ 
      ...formData, 
      [name]: type === 'number' ? Number(value) : value 
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await inventoryService.updateProduct(productId, formData);
      router.push('/dashboard/inventory');
    } catch (error) {
      console.error('Error al actualizar:', error);
      alert('Hubo un error al actualizar el insumo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-8 text-slate-500">Cargando datos del insumo...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <Link href="/dashboard/inventory" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <PackageSearch className="text-amber-600" />
            Editar Insumo
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Modificá el nombre, la categoría o el límite de stock mínimo.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Insumo *</label>
              <input required type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
              <textarea name="description" value={formData.description} onChange={handleChange} rows={2} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stock Mínimo (Alerta) *</label>
              <input required type="number" min="0" name="minStock" value={formData.minStock} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Categoría *</label>
              <select name="category" value={formData.category} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="INSUMO_MEDICO">Insumo Médico</option>
                <option value="OFICINA">Limpieza y Oficina</option>
                <option value="ACTIVO_FIJO">Mobiliario / Activos</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors flex items-center gap-2 disabled:opacity-70">
              <Save size={20} />
              {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}