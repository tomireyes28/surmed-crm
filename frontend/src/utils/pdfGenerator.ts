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

export const buildInvoicePDF = async (
  invoice: Invoice,
): Promise<{ doc: jsPDF; logoLoaded: boolean }> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const logoImg = await loadLogoSafe('/logo.png');
  let logoLoaded = false;

  if (logoImg) {
    try {
      const ratio = logoImg.naturalWidth / logoImg.naturalHeight || 1;
      const width = Math.min(26, 24 * ratio);
      doc.addImage(
        logoImg,
        'PNG',
        14,
        10,
        width,
        width / ratio,
        undefined,
        'FAST',
      );
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
  doc.text(
    `Fecha de emisión: ${formatClinicDate(invoice.createdAt)}`,
    headerX,
    30,
  );
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
    rowPageBreak: 'avoid',
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
    margin: { top: 28, left: 14, right: 14, bottom: 30 },
  });

  const lastTableY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? currentY + 15;
  const pageHeight = doc.internal.pageSize.getHeight();

  // Control de salto de página para que el total al pie nunca quede cortado (F21)
  let footerY = lastTableY + 12;
  if (footerY > pageHeight - 32) {
    doc.addPage();
    footerY = 38;
  }

  doc.setFontSize(13);
  doc.setTextColor(
    isCancelled ? 148 : 15,
    isCancelled ? 163 : 23,
    isCancelled ? 184 : 42,
  );
  const totalLabel = isCancelled
    ? `Total (ANULADO): ${formatPYG(invoice.totalAmount)}`
    : `Total: ${formatPYG(invoice.totalAmount)}`;
  doc.text(totalLabel, 14, footerY);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`SURMED - ${invoiceCode}`, 14, 12);
      doc.setTextColor(
        isCancelled ? 185 : 71,
        isCancelled ? 28 : 85,
        isCancelled ? 28 : 105,
      );
      doc.text(statusMeta.label.toUpperCase(), 196, 12, { align: 'right' });
      doc.setFontSize(8);
      doc.text('Continuación del comprobante administrativo interno', 14, 18);
    }
    doc.setDrawColor(203, 213, 225);
    doc.line(14, pageHeight - 20, 196, pageHeight - 20);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Uso interno - No es factura electrónica SIFEN/DNIT.',
      14,
      pageHeight - 14,
    );
    doc.text(`Página ${page} de ${pages}`, 196, pageHeight - 14, {
      align: 'right',
    });
  }
  return { doc, logoLoaded };
};

export const generateInvoicePDF = async (
  invoice: Invoice,
): Promise<{ logoLoaded: boolean }> => {
  const { doc, logoLoaded } = await buildInvoicePDF(invoice);

  const safeLastName = invoice.patient.lastName.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(
    `Comprobante_Surmed_${safeLastName}_${invoice.id.substring(0, 6)}.pdf`,
  );

  return { logoLoaded };
};
