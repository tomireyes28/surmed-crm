/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader for actual PDF builder. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
const { buildInvoicePDF } = require('../src/utils/pdfGenerator.ts');

for (const status of ['PENDING', 'PAID', 'CANCELLED']) {
  test(`PDF ${status}: no-logo fallback, long names, complete rows and identified pages`, async () => {
    const items = Array.from({ length: 70 }, (_, i) => ({ id: String(i), description: `INICIO_${i} Descripción sintética extensa para comprobar que el concepto completo se conserva junto al cambiar de página, con precio, cantidad y subtotal legibles. FIN_${i}`, quantity: 2, unitPrice: 125000.5, subtotal: 250001 }));
    const invoice = { id: 'abcdef12-0000-4000-8000-000000000000', status, createdAt: '2026-11-09T12:00:00Z', patient: { firstName: 'María José de los Ángeles '.repeat(3), lastName: 'Benítez Fernández de Villalba '.repeat(2), documentId: 'VISUAL-ONLY-0001' }, totalAmount: 17500070, items };
    const { doc, logoLoaded } = await buildInvoicePDF(invoice);
    assert.equal(logoLoaded, false);
    assert.ok(doc.getNumberOfPages() >= 4);
    const pages = doc.internal.pages.slice(1).map(commands => commands.join('\n'));
    for (const page of pages) {
      assert.ok(page.includes('FAC-ABCDEF12'));
      assert.ok(page.includes('SIFEN/DNIT'));
      assert.ok(page.includes('gina ')); // Page footer, without depending on PDF text encoding.
    }
    for (let i = 0; i < 70; i++) {
      const page = pages.find(p => p.includes(`INICIO_${i} `));
      assert.ok(page, `Missing item ${i}`);
      assert.ok(page.includes(`FIN_${i}`), `Item ${i} split across pages`);
    }
    assert.ok(pages.at(-1).includes(status === 'CANCELLED' ? 'ANULADO' : 'Total:'));
    assert.ok(doc.output('arraybuffer').byteLength < 500000);
  });
}
