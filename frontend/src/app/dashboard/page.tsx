'use client';

export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-slate-500 text-sm font-medium">Pacientes Atendidos</h3>
        <p className="text-3xl font-bold text-slate-800 mt-2">124</p>
      </div>
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-slate-500 text-sm font-medium">Alertas de Stock</h3>
        <p className="text-3xl font-bold text-red-600 mt-2">3 Insumos</p>
      </div>
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-slate-500 text-sm font-medium">Ingresos del Mes</h3>
        <p className="text-3xl font-bold text-emerald-600 mt-2">$45.200</p>
      </div>
    </div>
  );
}