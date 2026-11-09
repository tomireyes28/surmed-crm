/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node test loader for the actual TS utilities. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const fs = require('node:fs');
// Load the actual TypeScript utilities, without a second implementation or bundler.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { toClinicCalendarDate, getCalendarRange } = require('../src/utils/calendar.ts');
const { formatCivilBirthDateInput, calculateCivilAge } = require('../src/utils/format.ts');

for (const zone of ['UTC', 'America/Los_Angeles', 'Europe/Berlin', 'Pacific/Kiritimati']) {
  test(`Clinic dates and ranges are independent of browser zone: ${zone}`, () => {
    process.env.TZ = zone;
    for (const instant of ['2026-01-10T12:30:00Z', '2026-07-10T12:30:00Z', '2026-03-08T12:30:00Z', '2026-11-01T12:30:00Z']) {
      const date = toClinicCalendarDate(instant);
      assert.equal(date.getHours(), 9); assert.equal(date.getMinutes(), 30);
    }
    const rollover = toClinicCalendarDate('2026-11-01T01:30:00Z');
    assert.deepEqual([rollover.getMonth(), rollover.getDate(), rollover.getHours()], [9, 31, 22]);
    const day = getCalendarRange(new Date(2026, 10, 8), 'day');
    assert.equal(new Date(day.from).toISOString(), '2026-11-08T03:00:00.000Z');
    assert.equal(day.to, '2026-11-09T02:59:59.999Z');
    const week = getCalendarRange(new Date(2026, 10, 8), 'week');
    assert.equal(new Date(week.from).toISOString(), '2026-11-02T03:00:00.000Z');
    assert.equal(week.to, '2026-11-09T02:59:59.999Z');
    const month = getCalendarRange(new Date(2026, 10, 8), 'month');
    assert.equal(new Date(month.from).toISOString(), '2026-10-26T03:00:00.000Z');
    assert.equal(month.to, '2026-12-07T02:59:59.999Z');
    assert.equal(formatCivilBirthDateInput('2000-02-29T12:00:00.000Z'), '2000-02-29');
    assert.equal(calculateCivilAge('2000-02-29', new Date('2026-03-01T02:00:00Z')), 25);
    assert.equal(calculateCivilAge('2000-02-29', new Date('2026-03-01T03:00:00Z')), 26);
  });
}
