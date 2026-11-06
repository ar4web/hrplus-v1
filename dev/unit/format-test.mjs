// Date/number helpers must agree with the Riyadh business calendar.
// Run under several TZs: TZ=Asia/Riyadh node dev/unit/format-test.mjs
import assert from 'node:assert/strict';
import { addDays, daysBetween, dow, fmtDate, fmtTime, riyadhToday, periodLabel } from '../../.tmp/format.mjs';

const tz = process.env.TZ || 'system';
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log(`FAIL [${tz}] ${name} — ${e.message}`); } };

t('addDays crosses month end', () => assert.equal(addDays('2026-01-31', 1), '2026-02-01'));
t('addDays crosses year end', () => assert.equal(addDays('2026-12-31', 1), '2027-01-01'));
t('addDays handles leap day', () => assert.equal(addDays('2028-02-28', 1), '2028-02-29'));
t('addDays handles non-leap Feb', () => assert.equal(addDays('2027-02-28', 1), '2027-03-01'));
t('addDays goes backwards', () => assert.equal(addDays('2026-03-01', -1), '2026-02-28'));
t('addDays across a DST switch', () => assert.equal(addDays('2026-03-29', 1), '2026-03-30'));
t('addDays across the autumn DST switch', () => assert.equal(addDays('2026-10-25', 1), '2026-10-26'));
t('addDays tolerates a full timestamp', () => assert.equal(addDays('2026-11-06T22:30:00Z', 1), '2026-11-07'));
t('daysBetween is inclusive-exclusive', () => assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1));
t('daysBetween same day is 0', () => assert.equal(daysBetween('2026-11-06', '2026-11-06'), 0));
t('daysBetween over a month', () => assert.equal(daysBetween('2026-02-01', '2026-03-01'), 28));
t('dow(2026-11-06) is Friday', () => assert.equal(dow('2026-11-06'), 5));
t('dow(2026-11-08) is Sunday', () => assert.equal(dow('2026-11-08'), 0));
t('fmtDate keeps the calendar day', () => {
  const out = fmtDate('2026-11-06');
  assert.match(out, /06/);
  assert.match(out, /Nov/);
  assert.match(out, /2026/);
});
t('fmtDate shows the Riyadh day for a late-UTC timestamp', () => assert.match(fmtDate('2026-11-05T22:30:00Z'), /06/));
t('fmtTime renders Riyadh wall clock', () => assert.equal(fmtTime('2026-11-06T05:30:00Z').slice(0, 5), '08:30'));
t('riyadhToday is a bare date', () => assert.match(riyadhToday(), /^\d{4}-\d{2}-\d{2}$/));
t('periodLabel expands a period', () => assert.match(periodLabel('2026-11'), /November 2026/));

console.log(`${pass}/${pass + fail} date-helper assertions passed${fail ? ` — ${fail} FAILED` : ''} [TZ=${tz}]`);
process.exit(fail ? 1 : 0);
