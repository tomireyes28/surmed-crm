import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Invoice } from '../schemas/invoice.schema';

export const generateInvoicePDF = (invoice: Invoice) => {
  // Creamos el documento en formato A4
  const doc = new jsPDF();

  // --- Cabecera / Logo ---
  doc.setFontSize(22);
  doc.setTextColor(37, 99, 235); // Azul Tailwind (blue-600)
  doc.text('SURMED CRM', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100); // Gris
  doc.text('Centro Médico Integral', 14, 26);
  doc.text(`Fecha: ${new Date(invoice.createdAt).toLocaleDateString('es-AR')}`, 14, 32);
  doc.text(`Comprobante: FAC-${invoice.id.split('-')[0].toUpperCase()}`, 14, 38);

  // --- Datos del Paciente ---
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.text('Facturado a:', 14, 50);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Paciente: ${invoice.patient.lastName}, ${invoice.patient.firstName}`, 14, 56);
  doc.text(`DNI: ${invoice.patient.documentId}`, 14, 62);

  // --- Tabla de Ítems ---
  const tableColumn = ["Descripción", "Cantidad", "Precio Unit.", "Subtotal"];
  const tableRows = invoice.items.map(item => [
    item.description,
    item.quantity.toString(),
    `$${item.unitPrice.toLocaleString('es-AR')}`,
    `$${item.subtotal.toLocaleString('es-AR')}`
  ]);

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 70, // Empezamos a dibujar la tabla más abajo
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] }, // Cabecera azul
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 70;
  
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total: $${invoice.totalAmount.toLocaleString('es-AR')}`, 14, finalY + 10);

  // --- Generar y Descargar ---
  doc.save(`Factura_Surmed_${invoice.patient.lastName}_${invoice.id.substring(0, 4)}.pdf`);
};