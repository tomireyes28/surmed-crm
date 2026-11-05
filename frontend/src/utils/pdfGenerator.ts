import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Invoice } from '../schemas/invoice.schema';
import { formatClinicDate, formatPYG } from './format';
import { INVOICE_STATUS_META } from './domain-rules';

const LOGO_TIMEOUT_MS = 2500;

/**
 * Carga el logo de la clínica de manera segura con manejo de `onerror` y `timeout` (`F21`).
 * Si el archivo de imagen falla o tarda demasiado, resuelve `null` para no bloquear la generación del PDF.
 */
async function loadLogoSafe(src: string): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return null;
  }

  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;

    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), LOGO_TIMEOUT_MS);

    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = src;
  });
}

export const generateInvoicePDF = async (
  invoice: Invoice,
): Promise<{ logoLoaded: boolean }> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const logoImg = await loadLogoSafe('/logo.png');
  let logoLoaded = false;

  if (logoImg) {
    try {
      doc.addImage(logoImg, 'PNG', 14, 10, 24, 24);
      logoLoaded = true;
    } catch {
      logoLoaded = false;
    }
  }

  const headerX = logoLoaded ? 44 : 14;
  const invoiceCode = `FAC-${invoice.id.split('-')[0].toUpperCase()}`;
  const isCancelled = invoice.status === 'CANCELLED';
  const statusMeta =
    INVOICE_STATUS_META[invoice.status] ?? INVOICE_STATUS_META.PENDING;

  // Cabecera institucional
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129);
  doc.text('SURMED', headerX, 18);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Centro Médico Integral — Asunción, Paraguay', headerX, 24);
  doc.text(`Fecha de emisión: ${formatClinicDate(invoice.createdAt)}`, headerX, 30);
  doc.text(`Comprobante Nº: ${invoiceCode}`, headerX, 36);

  // Aviso explícito de alcance no fiscal (SIFEN / DNIT)
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Comprobante administrativo interno — No equivale a factura electrónica SIFEN/DNIT.',
    14,
    44,
  );

  // Estado del comprobante y marca de anulación (F21)
  let currentY = 52;
  if (isCancelled) {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(239, 68, 68);
    doc.roundedRect(14, currentY - 5, 182, 12, 2, 2, 'FD');
    doc.setFontSize(11);
    doc.setTextColor(185, 28, 28);
    doc.text(
      'COMPROBANTE ANULADO — CARECE DE VALIDEZ DE COBRO',
      18,
      currentY + 2,
    );
    currentY += 14;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Estado: ${statusMeta.label.toUpperCase()}`, 14, currentY);
    currentY += 8;
  }

  // Datos del paciente
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Datos del Paciente:', 14, currentY);
  currentY += 6;

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const fullName = `${invoice.patient.lastName}, ${invoice.patient.firstName}`;
  const wrappedName = doc.splitTextToSize(`Paciente: ${fullName}`, 180);
  doc.text(wrappedName, 14, currentY);
  currentY += wrappedName.length * 5;

  doc.text(`Documento / C.I.: ${invoice.patient.documentId}`, 14, currentY);
  currentY += 8;

  // Tabla de ítems con soporte de salto de página y textos largos
  const tableColumn = [
    'Descripción del concepto',
    'Cant.',
    'Precio Unit. (PYG)',
    'Subtotal (PYG)',
  ];
  const tableRows = invoice.items.map((item) => [
    item.description,
    String(item.quantity),
    formatPYG(item.unitPrice),
    formatPYG(item.subtotal),
  ]);

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: currentY,
    theme: 'striped',
    headStyles: {
      fillColor: isCancelled ? [148, 163, 184] : [16, 185, 129],
    },
    columnStyles: {
      0: { cellWidth: 96 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 33, halign: 'right' },
      3: { cellWidth: 33, halign: 'right' },
    },
    styles: {
      fontSize: 9,
      overflow: 'linebreak',
      cellPadding: 3,
    },
    margin: { left: 14, right: 14, bottom: 25 },
  });

  const lastTableY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? currentY + 15;
  const pageHeight = doc.internal.pageSize.getHeight();

  // Control de salto de página para que el total al pie nunca quede cortado (F21)
  let footerY = lastTableY + 12;
  if (footerY + 20 > pageHeight) {
    doc.addPage();
    footerY = 25;
  }

  doc.setFontSize(13);
  doc.setTextColor(isCancelled ? 148 : 15, isCancelled ? 163 : 23, isCancelled ? 184 : 42);
  const totalLabel = isCancelled
    ? `Total (ANULADO): ${formatPYG(invoice.totalAmount)}`
    : `Total: ${formatPYG(invoice.totalAmount)}`;
  doc.text(totalLabel, 14, footerY);

  const safeLastName = invoice.patient.lastName.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(
    `Comprobante_Surmed_${safeLastName}_${invoice.id.substring(0, 6)}.pdf`,
  );

  return { logoLoaded };
};
