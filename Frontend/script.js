const STORAGE_KEY = 'arboria-demo-v1';
const SUPABASE_URL = 'https://bvxccssjblnuokgkppri.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-r4GgHSONExpKhBhcDy5QA_DY8xsr4-';
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const HARVEST_BLOCK_DETAILS = [
  { code: 'Blok A', commodity: 'Kakao' },
  { code: 'Blok B', commodity: 'Kelapa Sawit' },
  { code: 'Blok C', commodity: 'Jeruk' },
  { code: 'Blok D', commodity: 'Kopi' }
];
const state = { data: null, demo: false, employeeFilter: 'all', payrollFilter: 'all', selectedPeriod: currentPeriod(), attendancePeriod: currentPeriod(), journalPeriod: currentPeriod(), journalType: 'all', ledgerPeriod: currentPeriod(), ledgerAccount: 'all', attendanceTab: 'daily', dailyStatuses: {}, search: '', toastTimer: null, previewSlip: null };
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--color-sidebar').trim());

function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function harvestBlockFor(code) {
  const block = state.data.harvestBlocks.find((item) => item.code === code) || { code, commodity: null, unit: null, standard_rate: null };
  const defaultBlock = HARVEST_BLOCK_DETAILS.find((item) => item.code === code);
  return { ...block, commodity: block.commodity || defaultBlock?.commodity || null };
}
function monthLabel(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return '—';
  const [year, month] = period.split('-');
  return `${monthNames[Number(month) - 1]} ${year}`;
}
function periodEndDate(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) return '';
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
function dateForPeriod(period, day = new Date().getDate()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) return '';
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const selectedDay = Math.min(Math.max(Number(day) || 1, 1), lastDay);
  return `${period}-${String(selectedDay).padStart(2, '0')}`;
}
function isYearSelection(period) { return /^year:\d{4}$/.test(period); }
function selectionLabel(period) { return isYearSelection(period) ? `Keseluruhan ${period.slice(5)}` : monthLabel(period); }
function formatMoney(amount) { return currency.format(Number(amount) || 0); }
function roundAmount(amount) { return Math.round((Number(amount) + Number.EPSILON) * 100) / 100; }
function formatSignedMoney(amount) {
  const value = Number(amount) || 0;
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatMoney(Math.abs(value))}`;
}
function formatDate(date) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00`));
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function avatarClass(text) { return `avatar-${Array.from(text || '').reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 4}`; }
function initials(name = '') { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function periodParts(period) { const [year, month] = period.split('-').map(Number); return { year, month }; }
function demoData() {
  const now = new Date();
  const periods = Array.from({ length: now.getMonth() + 1 }, (_, index) => {
    const date = new Date(now.getFullYear(), index, 1);
    return { id: `period-${date.getFullYear()}-${date.getMonth() + 1}`, period: currentPeriod(date), status: 'open' };
  });
  const employees = [
    { id: 'demo-1', employee_code: 'STF-001', full_name: 'Ratna Kusuma', employment_type: 'staff', division: 'Administrasi', monthly_salary: 5800000 },
    { id: 'demo-2', employee_code: 'STF-002', full_name: 'Agus Setiawan', employment_type: 'staff', division: 'Manajemen kebun', monthly_salary: 6500000 },
    { id: 'demo-3', employee_code: 'STF-003', full_name: 'Sari Wulandari', employment_type: 'staff', division: 'Keuangan', monthly_salary: 5200000 },
    { id: 'demo-4', employee_code: 'PNN-014', full_name: 'Budi Santoso', employment_type: 'harvester', division: 'Blok A', monthly_salary: 0 },
    { id: 'demo-5', employee_code: 'PNN-021', full_name: 'Maya Lestari', employment_type: 'harvester', division: 'Blok B', monthly_salary: 0 },
    { id: 'demo-6', employee_code: 'PNN-032', full_name: 'Dedi Saputra', employment_type: 'harvester', division: 'Blok A', monthly_salary: 0 },
    { id: 'demo-7', employee_code: 'PNN-037', full_name: 'Nur Aisyah', employment_type: 'harvester', division: 'Blok C', monthly_salary: 0 }
  ];
  const harvestBlocks = ['Blok A', 'Blok B', 'Blok C', 'Blok D']
    .map((code) => ({ code, commodity: null, unit: null, standard_rate: null }));
  const salaries = [];
  const harvests = [];
  const attendance = [];
  const allowanceRates = [0.035, 0.05, 0.065, 0.045, 0.075, 0.055, 0.085, 0.06, 0.08, 0.05, 0.07, 0.055];
  const harvestFactors = [0.78, 0.84, 0.96, 1.08, 1.15, 1.04, 0.93, 1.02, 1.1, 1.06, 0.98, 0.88];
  const harvestRates = [850, 825, 875, 900, 850, 925, 875, 900, 850, 875, 900, 850];
  periods.forEach((period, monthIndex) => {
    employees.filter((employee) => employee.employment_type === 'staff').forEach((employee, employeeIndex) => {
      const allowances = Math.round(employee.monthly_salary * allowanceRates[monthIndex]);
      const deductions = 50000 + employeeIndex * 15000 + monthIndex % 3 * 10000;
      const isPaid = monthIndex < now.getMonth();
      salaries.push({ id: `s-${monthIndex}-${employeeIndex}`, employee_id: employee.id, period_id: period.id, payment_date: periodEndDate(period.period), basic_salary: employee.monthly_salary, allowances, deductions, total_amount: employee.monthly_salary + allowances - deductions, status: isPaid ? 'paid' : 'pending', paid_at: isPaid ? `${period.period}-26T08:00:00Z` : null, employees: employee, payroll_periods: period, created_at: `${period.period}-24T08:00:00Z` });
    });
    employees.filter((employee) => employee.employment_type === 'harvester').forEach((employee, employeeIndex) => {
      const weight = Math.round((420 + employeeIndex * 95 + (monthIndex * 53 + employeeIndex * 37) % 90) * harvestFactors[monthIndex]);
      const rate = harvestRates[monthIndex];
      const isPaid = monthIndex < now.getMonth();
      harvests.push({ id: `h-${monthIndex}-${employeeIndex}`, employee_id: employee.id, block_code: employee.division, commodity: null, unit: 'kg', period_id: period.id, harvest_date: `${period.period}-${String(18 + employeeIndex).padStart(2, '0')}`, weight_kg: weight, rate_per_kg: rate, total_amount: weight * rate, status: isPaid ? 'paid' : 'pending', paid_at: isPaid ? `${period.period}-28T08:00:00Z` : null, employees: employee, payroll_periods: period, created_at: `${period.period}-25T08:00:00Z` });
    });
    employees.forEach((employee, employeeIndex) => {
      const daysInMonth = new Date(Number(period.period.slice(0, 4)), monthIndex + 1, 0).getDate();
      const leaveDays = (monthIndex + employeeIndex) % 6 === 0 ? 1 : 0;
      const absentDays = (monthIndex * 2 + employeeIndex) % 13 === 0 ? 1 : 0;
      const targetWorkDays = employee.employment_type === 'staff'
        ? 20 + ((monthIndex + employeeIndex) % 4)
        : 23 + ((monthIndex * 2 + employeeIndex) % 5);
      const workingDays = Math.min(targetWorkDays, daysInMonth - leaveDays - absentDays);
      attendance.push({ id: `a-${monthIndex}-${employeeIndex}`, employee_id: employee.id, period_id: period.period, working_days: workingDays, leave_days: leaveDays, absent_days: absentDays, employees: employee, created_at: `${period.period}-25T08:00:00Z` });
    });
  });
  return { employees, periods, salaries, harvests, attendance, harvestBlocks };
}
function addMissingDemoHistory(data) {
  const fixtures = demoData();
  const year = String(new Date().getFullYear());
  const latestClosedMonth = new Date().getMonth();
  const periodForData = (entry) => data.periods.find((period) => period.id === entry.period_id)?.period || entry.payroll_periods?.period;
  const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]));

  for (const fixturePeriod of fixtures.periods) {
    const month = Number(fixturePeriod.period.slice(5));
    if (fixturePeriod.period.slice(0, 4) !== year || month > 3 || month > latestClosedMonth) continue;
    let period = data.periods.find((item) => item.period === fixturePeriod.period);
    if (!period) {
      period = fixturePeriod;
      data.periods.push(period);
    }
    for (const [source, target, prefix] of [[fixtures.salaries, data.salaries, 'salary'], [fixtures.harvests, data.harvests, 'harvest']]) {
      const existing = new Set(target.filter((entry) => periodForData(entry) === fixturePeriod.period).map((entry) => entry.employee_id));
      for (const entry of source.filter((item) => item.period_id === fixturePeriod.id && !existing.has(item.employee_id))) {
        const employee = employeeById.get(entry.employee_id);
        if (!employee) continue;
        target.push({ ...entry, id: `history-${prefix}-${fixturePeriod.period}-${entry.employee_id}`, period_id: period.id, employees: employee, payroll_periods: period });
      }
    }
  }
  return data;
}
function assignDemoSlipNumbers(entries, prefix, dateField) {
  const maximumByYear = new Map();
  for (const entry of entries) {
    const match = entry.slip_number?.match(new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`));
    if (match) maximumByYear.set(match[1], Math.max(maximumByYear.get(match[1]) || 0, Number(match[2])));
  }
  const ordered = [...entries].sort((a, b) =>
    String(a.paid_at || a[dateField] || a.correction_date || a.created_at || '').localeCompare(String(b.paid_at || b[dateField] || b.correction_date || b.created_at || ''))
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.id).localeCompare(String(b.id)));
  for (const entry of ordered) {
    const isCorrection = Boolean(entry.transaction_kind);
    const hasPayment = entry.status === 'paid' || (entry.status === 'cancelled' && Boolean(entry.paid_at));
    if (entry.slip_number || !hasPayment
      || (isCorrection && (entry.paid_with_original || Number(entry.net_amount || 0) <= 0))) continue;
    const year = String(entry.paid_at || entry[dateField] || entry.correction_date || entry.created_at || new Date().toISOString()).slice(0, 4);
    const next = (maximumByYear.get(year) || 0) + 1;
    entry.slip_number = `${prefix}-${year}-${String(next).padStart(4, '0')}`;
    maximumByYear.set(year, next);
  }
}
function normalizeData(data) {
  data = { employees: [], periods: [], salaries: [], harvests: [], corrections: [], attendance: [], dailyAttendance: [], accounts: [], journals: [], auditTrail: [], harvestBlocks: [], ...data };
  if (state.demo && !data.harvestBlocks.length) {
    data.harvestBlocks = ['Blok A', 'Blok B', 'Blok C', 'Blok D']
      .map((code) => ({ code, commodity: null, unit: null, standard_rate: null }));
  }
  const employeesById = new Map(data.employees.map((employee) => [employee.id, employee]));
  const periodsById = new Map(data.periods.map((period) => [period.id, period]));
  const attach = (entry) => ({ ...entry, employees: entry.employees || employeesById.get(entry.employee_id), payroll_periods: entry.payroll_periods || periodsById.get(entry.period_id) });
  data.salaries = (data.salaries || []).map(attach);
  data.harvests = (data.harvests || []).map((entry) => attach({
    ...entry,
    block_code: entry.block_code || employeesById.get(entry.employee_id)?.division || entry.employees?.division,
    unit: entry.unit || (entry.block_code ? null : 'kg')
  }));
  data.corrections = (data.corrections || []).map((entry) => ({
    ...entry,
    employees: entry.employees || employeesById.get(entry.employee_id),
    payroll_periods: entry.payroll_periods || periodsById.get(entry.period_id)
  }));
  data.attendance = (data.attendance || []).map((entry) => ({ ...entry, employees: entry.employees || employeesById.get(entry.employee_id) }));
  data.dailyAttendance = (data.dailyAttendance || []).map((entry) => ({ ...entry, employees: entry.employees || employeesById.get(entry.employee_id) }));
  data.periods = data.periods || [];
  data.employees = data.employees || [];
  if (state.demo) {
    for (const entry of [...data.salaries, ...data.harvests]) {
      if (entry.status === 'pending' || (entry.status === 'cancelled' && !entry.paid_at)) entry.slip_number = null;
    }
    for (const correction of data.corrections) {
      if (correction.paid_with_original || Number(correction.net_amount) <= 0
        || correction.status === 'pending' || correction.status === 'overpaid'
        || (correction.status === 'cancelled' && !correction.paid_at)) {
        correction.slip_number = null;
      }
    }
    assignDemoSlipNumbers([
      ...data.salaries,
      ...data.corrections.filter((entry) => entry.transaction_kind === 'salary' && !entry.paid_with_original)
    ], 'GS', 'payment_date');
    assignDemoSlipNumbers([
      ...data.harvests,
      ...data.corrections.filter((entry) => entry.transaction_kind === 'harvest' && !entry.paid_with_original)
    ], 'UP', 'harvest_date');
  }
  const updatedAccounts = [
    { code: '5-103', name: 'Beban Tunjangan', account_type: 'Beban', normal_balance: 'debit' },
    { code: '5-104', name: 'Potongan Gaji', account_type: 'Kontra Beban', normal_balance: 'credit' }
  ];
  const defaultAccounts = [
    ['1-101', 'Kas/Bank', 'Aset', 'debit'], ['2-101', 'Utang Gaji', 'Kewajiban', 'credit'],
    ['2-102', 'Utang Upah', 'Kewajiban', 'credit'], ['5-101', 'Beban Gaji Staf', 'Beban', 'debit'],
    ['5-102', 'Beban Upah Panen', 'Beban', 'debit']
  ].map(([code, name, account_type, normal_balance]) => ({ code, name, account_type, normal_balance }));
  const accountsByCode = new Map(defaultAccounts.map((account) => [account.code, account]));
  data.accounts.forEach((account) => accountsByCode.set(account.code, account));
  updatedAccounts.forEach((account) => accountsByCode.set(account.code, account));
  data.accounts = [...accountsByCode.values()];
  if (state.demo) data.journals = buildDemoJournals(data);
  if (!data.auditTrail.length && state.demo) data.auditTrail = buildDemoAuditTrail(data);
  return data;
}
function buildDemoJournals(data) {
  const journals = [];
  const accounts = new Map((data.accounts || []).map((account) => [account.code, account]));
  const existingJournals = new Map((data.journals || []).map((journal) => [journal.id, journal]));
  const add = (entry, kind, type, date, description, lines, createdAt = entry.created_at) => {
    const id = `demo-journal-${entry.id}-${type}`;
    const existing = existingJournals.get(id);
    const evidenceNumber = existing?.journal_number && !/^JU-\d{4}-/.test(existing.journal_number)
      ? existing.journal_number
      : entry.slip_number || '—';
    const journal = {
      id,
      journal_number: evidenceNumber,
      journal_date: date,
      description,
      journal_type: type,
      transaction_kind: kind,
      transaction_id: entry.id,
      cancellation_reason: entry.cancellation_reason,
      created_at: createdAt,
      payroll_journal_lines: lines.map(([accountCode, debit, credit]) => ({
        account_code: accountCode, debit, credit, accounts: accounts.get(accountCode)
      }))
    };
    journals.push(journal);
    return journal;
  };
  for (const entry of [...(data.salaries || []), ...(data.harvests || [])]) {
    const kind = entry.kind || (data.salaries.includes(entry) ? 'salary' : 'harvest');
    const employee = data.employees.find((person) => person.id === entry.employee_id) || entry.employees || {};
    const date = String(kind === 'salary' ? entry.payment_date : entry.harvest_date || entry.created_at || new Date().toISOString()).slice(0, 10);
    const amount = Number(entry.total_amount || 0);
    const paidCorrectionNet = (data.corrections || [])
      .filter((correction) => correction.original_transaction_id === entry.id && correction.paid_with_original)
      .reduce((sum, correction) => sum + Number(correction.net_amount || 0), 0);
    const paymentAmount = amount + paidCorrectionNet;
    const deduction = kind === 'salary' ? Number(entry.deductions || 0) : 0;
    const expense = kind === 'salary' ? Number(entry.basic_salary || 0) : amount;
    const liability = kind === 'salary' ? '2-101' : '2-102';
    const expenseAccount = kind === 'salary' ? '5-101' : '5-102';
    const period = periodForDemo(entry, data);
    const label = kind === 'salary' ? 'Gaji' : 'Upah panen';
    const originals = [add(entry, kind, kind, date, `${label} ${employee.full_name || 'Karyawan'} - ${monthLabel(period)}`,
      [[expenseAccount, expense, 0],
        ...(kind === 'salary' && Number(entry.allowances || 0) > 0 ? [['5-103', Number(entry.allowances), 0]] : []),
        ...(deduction ? [[kind === 'salary' ? '5-104' : '5-103', 0, deduction]] : []),
        [liability, 0, amount]])];
    if ((entry.status === 'paid' || (entry.status === 'cancelled' && entry.paid_at)) && paymentAmount > 0) {
      originals.push(add(entry, kind, 'payment', String(entry.paid_at || date).slice(0, 10), `Pembayaran ${originals[0].description}`,
        [[liability, paymentAmount, 0], ['1-101', 0, paymentAmount]], entry.paid_at || date));
    }
  }
  for (const correction of data.corrections || []) {
    const kind = correction.transaction_kind;
    const liability = kind === 'salary' ? '2-101' : '2-102';
    const lines = [];
    const addExpenseDelta = (accountCode, delta) => {
      if (delta > 0) lines.push([accountCode, delta, 0], [liability, 0, delta]);
      if (delta < 0) lines.push([liability, Math.abs(delta), 0], [accountCode, 0, Math.abs(delta)]);
    };
    if (kind === 'salary') {
      addExpenseDelta('5-101', Number(correction.delta_basic_salary || 0));
      addExpenseDelta('5-103', Number(correction.delta_allowances || 0));
      const deductionDelta = Number(correction.delta_deductions || 0);
      if (deductionDelta > 0) lines.push([liability, deductionDelta, 0], ['5-104', 0, deductionDelta]);
      if (deductionDelta < 0) lines.push(['5-104', Math.abs(deductionDelta), 0], [liability, 0, Math.abs(deductionDelta)]);
    } else {
      addExpenseDelta('5-102', Number(correction.delta_gross || 0));
    }
    const original = [...data.salaries, ...data.harvests].find((item) => item.id === correction.original_transaction_id);
    const correctionEmployee = data.employees.find((employee) => employee.id === correction.employee_id) || correction.employees || {};
    const correctionDescription = original?.slip_number
      ? `Koreksi ${original.slip_number}: ${correction.reason}`
      : `Koreksi ${correctionEmployee.full_name || 'Karyawan'} - ${formatDate(String(correction.correction_date || correction.created_at || '').slice(0, 10))}: ${correction.reason}`;
    const correctionJournal = {
      id: `demo-journal-${correction.id}-correction`,
      journal_number: correction.slip_number || original?.slip_number || null,
      journal_date: correction.correction_date,
      description: correctionDescription,
      journal_type: 'correction',
      transaction_kind: kind,
      transaction_id: correction.id,
      created_at: correction.created_at || correction.correction_date,
      payroll_journal_lines: lines.map(([accountCode, debit, credit]) => ({
        account_code: accountCode, debit, credit, accounts: accounts.get(accountCode)
      }))
    };
    journals.push(correctionJournal);
    if (!correction.paid_with_original
      && (correction.status === 'paid' || (correction.status === 'cancelled' && correction.paid_at))
      && Number(correction.net_amount) > 0) {
      const paymentId = `demo-journal-${correction.id}-payment`;
      journals.push({
        id: paymentId,
        journal_number: correction.slip_number,
        journal_date: String(correction.paid_at || correction.correction_date).slice(0, 10),
        description: `Pembayaran koreksi ${correction.slip_number}`,
        journal_type: 'payment',
        transaction_kind: kind,
        transaction_id: correction.id,
        created_at: correction.paid_at || correction.correction_date || correction.created_at,
        payroll_journal_lines: [
          { account_code: liability, debit: Number(correction.net_amount), credit: 0, accounts: accounts.get(liability) },
          { account_code: '1-101', debit: 0, credit: Number(correction.net_amount), accounts: accounts.get('1-101') }
        ]
      });
    }
  }
  for (const entry of [...(data.salaries || []), ...(data.harvests || [])]) {
    if (entry.status !== 'cancelled') continue;
    const related = journals.filter((journal) => journal.transaction_id === entry.id
      || (data.corrections || []).some((correction) => correction.id === journal.transaction_id
        && correction.original_transaction_id === entry.id))
      .filter((journal) => journal.journal_type !== 'reversal')
      .sort((left, right) => {
        const sourceRank = (journal) => ['recognition', 'salary', 'harvest'].includes(journal.journal_type) ? 0
          : journal.journal_type === 'payment' ? 1
            : journal.journal_type === 'correction' ? 2 : 3;
        return sourceRank(left) - sourceRank(right)
          || String(left.created_at || '').localeCompare(String(right.created_at || ''))
          || String(left.id).localeCompare(String(right.id));
      });
    if (!related.length) continue;
    const cancellationDate = entry.cancelled_at || new Date().toISOString();
    related.forEach((source, index) => {
      const sourceLabel = ['recognition', 'salary', 'harvest'].includes(source.journal_type) ? 'Pengakuan'
        : source.journal_type === 'payment' ? 'Pembayaran'
          : source.journal_type === 'correction' ? 'Koreksi' : 'Jurnal';
      journals.push({
        id: `demo-journal-${entry.id}-reversal-${source.id}`,
        journal_number: source.journal_number || entry.slip_number,
        journal_date: String(cancellationDate).slice(0, 10),
        description: `Pembalik ${sourceLabel} ${source.journal_number || entry.slip_number || 'Tanpa nomor slip'}: ${entry.cancellation_reason || 'Pembatalan transaksi'}`,
        journal_type: 'reversal',
        transaction_kind: entry.kind || (data.salaries.includes(entry) ? 'salary' : 'harvest'),
        transaction_id: entry.id,
        reversal_of: source.id,
        cancellation_reason: entry.cancellation_reason,
        created_at: new Date(new Date(cancellationDate).getTime() + index).toISOString(),
        payroll_journal_lines: (source.payroll_journal_lines || []).map((line) => ({
          account_code: line.account_code,
          debit: Number(line.credit || 0),
          credit: Number(line.debit || 0),
          accounts: accounts.get(line.account_code)
        }))
      });
    });
  }
  return journals;
}
function buildDemoAuditTrail(data) {
  const sourceEvents = [...data.salaries.map((entry) => ({ entry, kind: 'salary' })),
    ...data.harvests.map((entry) => ({ entry, kind: 'harvest' }))].flatMap(({ entry, kind }) => {
    const events = [{ transaction_id: entry.id, transaction_kind: kind, action: 'dicatat', actor: 'Admin Arboria', slip_number: entry.slip_number, occurred_at: entry.created_at || new Date().toISOString() }];
    if (entry.status === 'paid' || (entry.status === 'cancelled' && entry.paid_at)) {
      events.push({ transaction_id: entry.id, transaction_kind: kind, action: 'dibayar', actor: 'Admin Arboria', slip_number: entry.slip_number, occurred_at: entry.paid_at || entry.created_at || new Date().toISOString() });
    }
    if (entry.status === 'cancelled') {
      events.push({ transaction_id: entry.id, transaction_kind: kind, action: 'dibatalkan', actor: entry.cancelled_by || 'Admin Arboria', reason: entry.cancellation_reason, slip_number: entry.slip_number, occurred_at: entry.cancelled_at || new Date().toISOString() });
    }
    return events;
  });
  const correctionEvents = (data.corrections || []).flatMap((correction) => {
    const source = [...data.salaries, ...data.harvests].find((entry) => entry.id === correction.original_transaction_id);
    const events = [
      { transaction_id: source?.id, transaction_kind: correction.transaction_kind, action: 'dikoreksi', actor: 'Admin Arboria', reason: correction.reason, slip_number: correction.slip_number, occurred_at: correction.created_at },
      { transaction_id: correction.id, transaction_kind: correction.transaction_kind, action: 'dicatat', actor: correction.created_by || 'Admin Arboria', reason: correction.reason, slip_number: correction.slip_number, occurred_at: correction.created_at }
    ];
    if (correction.status === 'paid' || (correction.status === 'cancelled' && correction.paid_at)) {
      events.push({ transaction_id: correction.id, transaction_kind: correction.transaction_kind, action: 'dibayar', actor: 'Admin Arboria', slip_number: correction.slip_number, occurred_at: correction.paid_at || correction.created_at });
    }
    if (correction.status === 'overpaid') {
      events.push({ transaction_id: correction.id, transaction_kind: correction.transaction_kind, action: 'dikoreksi', actor: 'Admin Arboria', reason: `Kelebihan bayar ${formatMoney(Math.abs(Number(correction.net_amount || 0)))}`, slip_number: correction.slip_number, occurred_at: correction.created_at });
    }
    if (correction.status === 'cancelled') {
      events.push({ transaction_id: correction.id, transaction_kind: correction.transaction_kind, action: 'dibatalkan', actor: source?.cancelled_by || 'Admin Arboria', reason: source?.cancellation_reason, slip_number: correction.slip_number, occurred_at: source?.cancelled_at || new Date().toISOString() });
    }
    return events.filter((item) => item.transaction_id);
  });
  return [...sourceEvents, ...correctionEvents];
}
function periodForDemo(entry, data) {
  return data.periods.find((period) => period.id === entry.period_id)?.period
    || entry.period_id || entry.period || String(entry.payment_date || entry.harvest_date || '').slice(0, 7);
}
async function loadData() {
  let connectionError = '';
  state.demo = false;
  try {
    const backendBase = backendApiBase();
    if (backendBase === null) {
      state.data = normalizeData(await loadSupabaseData());
    } else {
      const response = await fetch(`${backendBase}/api/data`);
      if (!response.ok) {
        let result = {};
        try { result = await response.json(); } catch {}
        throw new Error(result.error || `Server mengembalikan status ${response.status}.`);
      }
      state.data = normalizeData(await response.json());
    }
    state.demo = false;
  } catch (error) {
    const reason = error.message === 'Failed to fetch'
      ? backendApiBase() === null
        ? 'Supabase tidak dapat dijangkau. Periksa URL, publishable key, dan policy RLS.'
        : `Backend API tidak dapat dijangkau (${backendApiBase()}/api/data). Pastikan server berjalan dan origin sudah diizinkan CORS.`
      : error.message || 'Supabase gagal dimuat.';
    const remoteHost = window.location.protocol !== 'file:'
      && !['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (remoteHost) {
      state.demo = false;
      state.data = normalizeData({ employees: [], periods: [], salaries: [], harvests: [], attendance: [] });
      state.demo = false;
      render();
      showToast(`${reason} Data belum tersinkron; muat ulang halaman setelah koneksi pulih.`);
      return;
    }
    connectionError = `${reason} Data demo ditampilkan.`;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { saved = null; }
    state.demo = true;
    state.data = normalizeData(saved || demoData());
    if (saved) state.data = normalizeData(addMissingDemoHistory(state.data));
    state.demo = true;
  }
  if (!/^\d{4}-\d{2}$/.test(state.selectedPeriod) && !isYearSelection(state.selectedPeriod)) {
    state.selectedPeriod = state.data.periods.map((period) => period.period).sort().at(-1) || currentPeriod();
  }
  const currentYear = String(new Date().getFullYear());
  if (state.selectedPeriod === currentPeriod()
    && currentTransactions(state.selectedPeriod).length === 0
    && currentTransactions(`year:${currentYear}`).length > 0) {
    state.selectedPeriod = `year:${currentYear}`;
  }
  render();
  if (connectionError) showToast(connectionError);
}
function persistDemo() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}
function apiUrl(path) {
  const configuredApi = new URLSearchParams(window.location.search).get('api');
  const baseUrl = configuredApi
    ? configuredApi.replace(/\/+$/, '')
    : window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
  return `${baseUrl}${path}`;
}
function backendApiBase() {
  const configuredApi = new URLSearchParams(window.location.search).get('api');
  if (configuredApi) return configuredApi.replace(/\/+$/, '');
  if (window.location.protocol === 'file:') return null;
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return '';
  return null;
}
async function supabaseRequest(table, query = '', method = 'GET', body = null, preferOverride = '') {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(['POST', 'PATCH', 'DELETE'].includes(method) ? { Prefer: preferOverride || 'return=representation' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) : [];
  if (!response.ok) throw new Error(result.message || result.hint || result.error || `Supabase mengembalikan status ${response.status}.`);
  return result;
}
async function loadSupabaseData() {
  const [employees, salaries, harvests, attendance, dailyAttendance, accounts, journals, journalLines, corrections, auditTrail, harvestBlocks] = await Promise.all([
    supabaseRequest('employees', '?select=*&order=created_at.desc'),
    supabaseRequest('salary_payments', '?select=*,employees(full_name,employee_code,employment_type,division)&order=created_at.desc'),
    supabaseRequest('harvest_records', '?select=*,employees(full_name,employee_code,employment_type,division)&order=created_at.desc'),
    supabaseRequest('attendance_records', '?select=*,employees(full_name,employee_code,employment_type,division)&order=period_id.desc,created_at.desc'),
    supabaseRequest('daily_attendance', '?select=*,employees(full_name,employee_code,employment_type,division)&order=attendance_date.desc'),
    supabaseRequest('accounts', '?select=*&order=code'),
    supabaseRequest('journals', '?select=*&order=journal_date.desc,created_at.desc'),
    supabaseRequest('journal_lines', '?select=*'),
    supabaseRequest('payroll_corrections', '?select=*&order=created_at.desc'),
    supabaseRequest('payroll_audit_trail', '?select=*&order=occurred_at.desc'),
    supabaseRequest('harvest_blocks', '?select=*&order=code')
  ]);
  const correctionsWithValues = corrections.map((correction) => ({
    ...correction,
    correction_values: correction.transaction_kind === 'salary'
      ? {
        basic_salary: correction.target_basic_salary,
        allowances: correction.target_allowances,
        deductions: correction.target_deductions
      }
      : {
        weight_kg: correction.target_weight_kg,
        rate_per_kg: correction.target_rate_per_kg
      }
  }));
  const accountsByCode = new Map(accounts.map((account) => [account.code, {
    code: account.code,
    name: account.name,
    normal_balance: account.normal_balance
  }]));
  const journalLinesById = new Map();
  journalLines.forEach((line) => {
    const account = accountsByCode.get(line.account_code);
    const grouped = journalLinesById.get(line.journal_id) || [];
    grouped.push({ ...line, accounts: account || null });
    journalLinesById.set(line.journal_id, grouped);
  });
  const mappedJournals = journals.map((journal) => ({
    ...journal,
    transaction_id: journal.correction_id && journal.journal_type !== 'reversal'
      ? journal.correction_id
      : journal.transaction_id,
    reversal_of: journal.reverses_journal_id,
    cancellation_reason: journal.reason,
    payroll_journal_lines: journalLinesById.get(journal.id) || []
  }))
    .sort((left, right) => right.journal_date.localeCompare(left.journal_date)
      || String(right.journal_number || '').localeCompare(String(left.journal_number || '')));
  const employeesById = new Map(employees.map((employee) => [employee.id, {
    full_name: employee.full_name,
    employee_code: employee.employee_code,
    employment_type: employee.employment_type,
    division: employee.division
  }]));
  const correctionsWithEmployees = correctionsWithValues.map((correction) => ({
    ...correction,
    employees: employeesById.get(correction.employee_id) || null
  }));
  const periods = [...new Set([...salaries, ...harvests, ...correctionsWithEmployees].map((entry) => entry.period_id))]
    .filter((period) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    .sort((left, right) => right.localeCompare(left))
    .map((period) => ({ id: period, period }));
  return { employees, periods, salaries, harvests, corrections: correctionsWithEmployees, attendance, dailyAttendance, accounts, journals: mappedJournals, auditTrail, harvestBlocks };
}
async function directSupabaseMutation(url, method, body) {
  const match = new URL(url, 'http://localhost').pathname.match(/^\/api\/(employees|salaries|harvests|attendance)(?:\/([^/]+))?$/);
  if (!match) throw new Error('Endpoint API tidak dikenal.');
  const [, resource, encodedId] = match;
  const table = resource === 'employees' ? 'employees' : resource === 'salaries' ? 'salary_payments' : resource === 'harvests' ? 'harvest_records' : 'attendance_records';
  let payload = body ? { ...body } : null;
  if (method === 'POST' && resource === 'attendance') {
    payload.period_id = payload.period;
    delete payload.period;
    const duplicates = await supabaseRequest('attendance_records', `?employee_id=eq.${encodeURIComponent(payload.employee_id)}&period_id=eq.${encodeURIComponent(payload.period_id)}&select=id&limit=1`);
    if (duplicates.length) throw new Error('Absensi karyawan ini untuk periode tersebut sudah ada. Edit catatan yang sudah ada.');
  } else if (method === 'PATCH' && resource === 'attendance') {
    if (payload.period !== undefined) {
      payload.period_id = payload.period;
      delete payload.period;
    }
    if (payload.employee_id !== undefined || payload.period_id !== undefined) {
      const current = await supabaseRequest('attendance_records', `?id=eq.${encodeURIComponent(decodeURIComponent(encodedId))}&select=employee_id,period_id`);
      const employeeId = payload.employee_id ?? current[0]?.employee_id;
      const periodId = payload.period_id ?? current[0]?.period_id;
      if (employeeId && periodId) {
        const duplicates = await supabaseRequest('attendance_records', `?employee_id=eq.${encodeURIComponent(employeeId)}&period_id=eq.${encodeURIComponent(periodId)}&select=id`);
        if (duplicates.some((row) => row.id !== decodeURIComponent(encodedId))) {
          throw new Error('Absensi karyawan ini untuk periode tersebut sudah ada. Edit catatan yang sudah ada.');
        }
      }
    }
  } else if (method === 'POST' && resource === 'salaries') {
    payload.period_id = payload.period;
    payload.payment_date = payload.payment_date || periodEndDate(payload.period);
    payload.paid_at = payload.status === 'pending' ? null : new Date().toISOString();
    delete payload.period;
  } else if (method === 'POST' && resource === 'harvests') {
    payload.period_id = payload.period;
    payload.paid_at = payload.status === 'pending' ? null : new Date().toISOString();
    delete payload.period;
  } else if (method === 'PATCH' && resource !== 'employees') {
    if (payload.period !== undefined) {
      payload.period_id = payload.period;
      delete payload.period;
    }
    if (payload.status !== undefined) payload.paid_at = payload.status === 'pending' ? null : new Date().toISOString();
  }
  const query = encodedId ? `?id=eq.${encodeURIComponent(decodeURIComponent(encodedId))}` : '';
  return supabaseRequest(table, query, method, payload);
}
function periodFor(entry) { return entry.payroll_periods?.period || state.data.periods.find((period) => period.id === entry.period_id)?.period || ''; }
function employeeFor(entry) {
  const employee = state.data.employees.find((item) => item.id === entry.employee_id) || {};
  return { full_name: 'Karyawan', employee_code: '—', ...employee, ...(entry.employees || {}) };
}
function transactionDate(entry) {
  if (entry.is_correction) return formatDate(String(entry.paid_at || entry.correction_date || entry.created_at || '').slice(0, 10));
  const date = entry.kind === 'harvest' ? entry.harvest_date : entry.payment_date || periodEndDate(periodFor(entry)) || entry.created_at;
  return date ? formatDate(String(date).slice(0, 10)) : '—';
}
function statusDetails(entry) {
  if (entry.status === 'cancelled') {
    const cancellation = state.data.auditTrail.find((item) => item.transaction_id === entry.id && item.action === 'dibatalkan');
    return cancellation?.occurred_at ? `Dibatalkan ${formatDate(String(cancellation.occurred_at).slice(0, 10))}` : '';
  }
  if (entry.status === 'overpaid') return `Kelebihan bayar ${formatMoney(Math.abs(Number(entry.net_amount || 0)))}`;
  if (entry.status === 'pending') return '';
  return entry.paid_at ? `Dibayar ${formatDate(String(entry.paid_at).slice(0, 10))}` : 'Tanggal pembayaran belum tercatat';
}
function transactions() {
  const sourceEntries = [...state.data.salaries, ...state.data.harvests];
  const adjustmentRows = state.data.corrections.filter((correction) => {
    const source = sourceEntries.find((entry) => entry.id === correction.original_transaction_id);
    return Number(correction.net_amount) > 0
      && !correction.paid_with_original
      && (Boolean(correction.slip_number) || (source?.status === 'paid' && correction.status === 'pending'));
  });
  return [
    ...state.data.salaries.map((entry) => ({
      ...entry, kind: 'salary',
      amount: Number(entry.total_amount ?? Number(entry.basic_salary) + Number(entry.allowances || 0) - Number(entry.deductions || 0))
        + state.data.corrections.filter((correction) =>
          correction.original_transaction_id === entry.id && (entry.status === 'cancelled' || correction.status !== 'cancelled'))
          .reduce((sum, correction) => sum + Number(correction.net_amount || 0), 0)
    })),
    ...state.data.harvests.map((entry) => ({
      ...entry, kind: 'harvest',
      amount: Number(entry.total_amount ?? Number(entry.weight_kg) * Number(entry.rate_per_kg))
        + state.data.corrections.filter((correction) =>
          correction.original_transaction_id === entry.id && (entry.status === 'cancelled' || correction.status !== 'cancelled'))
          .reduce((sum, correction) => sum + Number(correction.net_amount || 0), 0)
    })),
    ...adjustmentRows.map((entry) => ({
      ...entry,
      kind: entry.transaction_kind,
      is_correction: true,
      amount: Number(entry.net_amount || 0)
    }))
  ].sort((left, right) => `${periodFor(right)}-${right.created_at || ''}`.localeCompare(`${periodFor(left)}-${left.created_at || ''}`));
}
function correctionBaseline(entry, includeCorrection = () => true) {
  const kind = entry.kind || entry.transaction_kind
    || (state.data.salaries.some((item) => item.id === entry.id) ? 'salary' : 'harvest');
  const baseline = kind === 'salary'
    ? { basic_salary: Number(entry.basic_salary || 0), allowances: Number(entry.allowances || 0), deductions: Number(entry.deductions || 0) }
    : { weight_kg: Number(entry.weight_kg || 0), rate_per_kg: Number(entry.rate_per_kg || 0) };
  const corrections = state.data.corrections.filter((item) =>
    item.transaction_kind === kind && item.original_transaction_id === entry.id
      && (entry.status === 'cancelled' || item.status !== 'cancelled') && includeCorrection(item))
    .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
  for (const correction of corrections) {
    if (kind === 'salary') {
      baseline.basic_salary += Number(correction.delta_basic_salary || 0);
      baseline.allowances += Number(correction.delta_allowances || 0);
      baseline.deductions += Number(correction.delta_deductions || 0);
    } else {
      const values = correction.correction_values || {};
      baseline.weight_kg = Number(values.weight_kg ?? baseline.weight_kg);
      baseline.rate_per_kg = Number(values.rate_per_kg ?? baseline.rate_per_kg);
    }
  }
  return baseline;
}
function currentTransactions(period = state.selectedPeriod) {
  if (isYearSelection(period)) {
    const yearPrefix = `${period.slice(5)}-`;
    return transactions().filter((entry) => periodFor(entry).startsWith(yearPrefix));
  }
  return transactions().filter((entry) => periodFor(entry) === period);
}
function render() {
  const activeEmployees = state.data.employees.filter((employee) => !employee.archived_at);
  const staff = activeEmployees.filter((employee) => employee.employment_type === 'staff');
  const harvesters = activeEmployees.filter((employee) => employee.employment_type === 'harvester');
  const current = currentTransactions().filter((entry) => !entry.is_correction && entry.status !== 'cancelled');
  const salaries = current.filter((entry) => entry.kind === 'salary');
  const harvests = current.filter((entry) => entry.kind === 'harvest');
  document.querySelector('#employee-count').textContent = activeEmployees.length;
  document.querySelector('#stat-employees').textContent = activeEmployees.length;
  document.querySelector('#stat-staff').textContent = `${staff.length} staf`;
  document.querySelector('#stat-harvesters').textContent = `${harvesters.length} pemanen`;
  document.querySelector('#stat-salaries').textContent = formatMoney(salaries.reduce((sum, entry) => sum + entry.amount, 0));
  document.querySelector('#stat-wages').textContent = formatMoney(harvests.reduce((sum, entry) => sum + entry.amount, 0));
  const quantityByUnit = new Map();
  for (const entry of harvests) {
    const employee = employeeFor(entry);
    const unit = entry.unit || harvestBlockFor(entry.block_code || employee.division).unit || 'Belum diatur';
    quantityByUnit.set(unit, (quantityByUnit.get(unit) || 0) + Number(entry.weight_kg || 0));
  }
  document.querySelector('#stat-weight').innerHTML = quantityByUnit.size === 1
    ? `${number.format([...quantityByUnit.values()][0])} <small>${escapeHtml([...quantityByUnit.keys()][0])}</small>`
    : quantityByUnit.size > 1 ? 'Beragam <small>satuan</small>' : '0 <small>—</small>';
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  document.querySelector('#heading-date').textContent = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();
  document.querySelector('.dashboard-heading .heading-day').textContent = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date()).toUpperCase();
  renderPeriodOptions();
  renderChart();
  renderDashboardAccounting();
  renderTransactions();
  renderEmployees();
  renderAttendance();
  renderPayroll();
  renderJournal();
  renderLedger();
}
function reportYears() {
  const years = new Set([String(new Date().getFullYear())]);
  state.data.periods.forEach((period) => years.add(period.period.slice(0, 4)));
  transactions().forEach((entry) => {
    const period = periodFor(entry);
    if (period) years.add(period.slice(0, 4));
  });
  state.data.attendance.forEach((entry) => {
    if (entry.period_id) years.add(entry.period_id.slice(0, 4));
  });
  state.data.dailyAttendance.forEach((entry) => {
    if (entry.attendance_date) years.add(entry.attendance_date.slice(0, 4));
  });
  return [...years].sort((left, right) => right.localeCompare(left));
}
function renderPeriodOptions() {
  const years = reportYears();
  const options = years.map((year) => {
    const months = monthNames.map((name, index) => {
      const period = `${year}-${String(index + 1).padStart(2, '0')}`;
      return `<option value="${period}">${escapeHtml(name)} ${year}</option>`;
    }).join('');
    return `<option value="year:${year}">Keseluruhan ${year}</option>${months}`;
  }).join('');
  const dashboard = document.querySelector('#period-select');
  const sidebar = document.querySelector('#sidebar-period-select');
  const payroll = document.querySelector('#payroll-period-filter');
  const attendance = document.querySelector('#attendance-period-filter');
  const journal = document.querySelector('#journal-period-filter');
  const ledger = document.querySelector('#ledger-period-filter');
  dashboard.innerHTML = options;
  dashboard.value = state.selectedPeriod;
  sidebar.innerHTML = options;
  sidebar.value = state.selectedPeriod;
  document.querySelector('#sidebar-period-label').textContent = sidebar.selectedOptions[0]?.textContent || '';
  payroll.innerHTML = options;
  payroll.value = state.selectedPeriod;
  attendance.innerHTML = options;
  attendance.value = state.attendancePeriod;
  journal.innerHTML = options;
  journal.value = state.journalPeriod;
  ledger.innerHTML = options;
  ledger.value = state.ledgerPeriod;
}
function renderChart() {
  const year = isYearSelection(state.selectedPeriod) ? state.selectedPeriod.slice(5) : state.selectedPeriod.slice(0, 4);
  const periods = isYearSelection(state.selectedPeriod)
    ? monthNames.map((_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
    : [state.selectedPeriod];
  const values = periods.map((period) => {
    const entries = currentTransactions(period).filter((entry) => !entry.is_correction && entry.status !== 'cancelled');
    return { period, salary: entries.filter((entry) => entry.kind === 'salary').reduce((sum, entry) => sum + entry.amount, 0), wage: entries.filter((entry) => entry.kind === 'harvest').reduce((sum, entry) => sum + entry.amount, 0) };
  });
  const max = Math.max(1, ...values.map((value) => value.salary + value.wage));
  const chart = document.querySelector('#payroll-chart');
  const hasTransactions = values.some((value) => value.salary + value.wage > 0);
  chart.innerHTML = hasTransactions ? values.map((value) => {
    const salaryHeight = value.salary ? Math.max(5, value.salary / max * 96) : 0;
    const wageHeight = value.wage ? Math.max(5, value.wage / max * 96) : 0;
    const month = monthLabel(value.period);
    const totalTitle = `${month} · Total kompensasi: ${formatMoney(value.salary + value.wage)}`;
    const salaryTitle = `${month} · Gaji staf: ${formatMoney(value.salary)}`;
    const wageTitle = `${month} · Upah panen: ${formatMoney(value.wage)}`;
    return `<div class="bar-group" title="${escapeHtml(totalTitle)}"><span class="bar" title="${escapeHtml(salaryTitle)}" style="height:${salaryHeight}%"></span><span class="bar wage" title="${escapeHtml(wageTitle)}" style="height:${wageHeight}%"></span></div>`;
  }).join('') : `<div class="chart-empty-state"><span class="chart-empty-mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><div><strong>Belum ada pembayaran</strong><span>Tidak ada transaksi kompensasi pada ${escapeHtml(selectionLabel(state.selectedPeriod))}.</span></div><div class="chart-empty-actions"><button type="button" data-action="record-salary">Catat gaji</button><button type="button" data-action="record-harvest">Catat panen</button></div></div>`;
  chart.classList.toggle('chart-empty', !hasTransactions);
  chart.setAttribute('role', hasTransactions ? 'img' : 'group');
  chart.setAttribute('aria-label', `Grafik pengeluaran kompensasi ${selectionLabel(state.selectedPeriod)}`);
  const chartMonths = document.querySelector('#chart-months');
  chartMonths.hidden = !hasTransactions;
  chartMonths.innerHTML = values.map((value) => `<span>${escapeHtml(monthLabel(value.period).split(' ')[0].slice(0, 3))}</span>`).join('');
  document.querySelector('#chart-period-label').textContent = selectionLabel(state.selectedPeriod);
  const selected = currentTransactions().filter((entry) => !entry.is_correction && entry.status !== 'cancelled');
  document.querySelector('#chart-total').textContent = formatMoney(selected.reduce((sum, entry) => sum + entry.amount, 0));
}
function personMarkup(employee) {
  const deletedLabel = employee.archived_at ? '<small class="status-detail">Dihapus</small>' : '';
  return `<div class="person-cell"><span class="person-avatar ${avatarClass(employee.full_name)}">${escapeHtml(initials(employee.full_name))}</span><span class="person-name"><strong>${escapeHtml(employee.full_name)}</strong><span>${escapeHtml(employee.division)}</span>${deletedLabel}</span></div>`;
}
function actionButton(action, id, label, icon) {
  return `<button class="icon-button row-action" type="button" data-${action}="${escapeHtml(id)}" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24">${icon}</svg></button>`;
}
function employeeActions(employee) {
  if (employee.archived_at) {
    return `<div class="row-actions">${actionButton('restore-employee', employee.id, 'Pulihkan karyawan', '<path d="M3 12a9 9 0 1 0 2.64-6.36M3 4v5h5"/>')}</div>`;
  }
  return `<div class="row-actions">${actionButton('edit-employee', employee.id, 'Edit karyawan', '<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>')}${actionButton('delete-employee', employee.id, 'Hapus karyawan', '<path d="M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>')}</div>`;
}
function attendanceActions(entry) {
  return `<div class="row-actions">${actionButton('edit-attendance', entry.id, 'Edit absensi', '<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>')}${actionButton('delete-attendance', entry.id, 'Hapus absensi', '<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6"/>')}</div>`;
}
function slipPrintCount(entry) {
  const counts = JSON.parse(localStorage.getItem('arboria-slip-print-counts') || '{}');
  return Number(counts[entry.id] || 0);
}
function slipPrintLabel(count) {
  return count === 0 ? 'Cetakan pertama' : `Cetakan ke-${count + 1}`;
}
function transactionActions(entry) {
  if (entry.is_correction) {
    if (!entry.slip_number) return '<div class="row-actions"></div>';
    const printCount = slipPrintCount(entry);
    const printLabel = printCount === 0 ? 'Cetak slip' : 'Cetak ulang';
    const printSlipAction = `<button class="slip-print-action" type="button" data-print-slip="${escapeHtml(entry.id)}" aria-label="${printLabel} ${escapeHtml(entry.slip_number || '')}" title="${printLabel}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 18h10v-5H7zm-2 0h14a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2z"/><path d="M17 14h.01"/></svg><span>${printLabel}</span></button>`;
    return `<div class="row-actions">${printSlipAction}</div>`;
  }
  if (entry.status === 'cancelled') {
    if (!entry.slip_number) return '<div class="row-actions"></div>';
    const printCount = slipPrintCount(entry);
    const printLabel = printCount === 0 ? 'Cetak slip' : 'Cetak ulang';
    return `<div class="row-actions"><button class="slip-print-action" type="button" data-print-slip="${escapeHtml(entry.id)}" aria-label="${printLabel} ${escapeHtml(entry.slip_number || '')}" title="${printLabel}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 18h10v-5H7zm-2 0h14a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2z"/><path d="M17 14h.01"/></svg><span>${printLabel}</span></button></div>`;
  }
  const printCount = slipPrintCount(entry);
  const printLabel = printCount === 0 ? 'Cetak slip' : 'Cetak ulang';
  const printSlipAction = entry.status !== 'pending' && entry.slip_number
    ? `<button class="slip-print-action" type="button" data-print-slip="${escapeHtml(entry.id)}" aria-label="${printLabel} ${escapeHtml(entry.slip_number || '')}" title="${printLabel}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 18h10v-5H7zm-2 0h14a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2z"/><path d="M17 14h.01"/></svg><span>${printLabel}</span></button>`
    : '';
  return `<div class="row-actions">${printSlipAction}<button class="button button-secondary cancel-transaction-button" type="button" data-correct-record="${escapeHtml(entry.id)}">Koreksi</button><button class="button button-secondary cancel-transaction-button" type="button" data-cancel-record="${escapeHtml(entry.id)}">Batal</button></div>`;
}
function signatureText(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}
function paymentSlipFilename(entry) {
  const slipNumber = entry.slip_number || (entry.kind === 'salary' ? 'GS' : 'UP');
  return `Slip_${slipNumber}.pdf`;
}
function paymentSlipHtml(entry, printCount = slipPrintCount(entry)) {
  const employee = employeeFor(entry);
  const isSalary = entry.kind === 'salary';
  const paymentLabel = isSalary ? 'Gaji Staf' : 'Upah Panen';
  const original = entry.is_correction
    ? [...state.data.salaries, ...state.data.harvests].find((item) => item.id === entry.original_transaction_id)
    : null;
  const correctionSourceId = entry.is_correction ? original?.id : entry.id;
  const linkedCorrections = correctionSourceId
    ? state.data.corrections.filter((item) => item.original_transaction_id === correctionSourceId)
    : [];
  const correctionDate = entry.is_correction ? entry.created_at || entry.correction_date : null;
  const correctionValues = entry.is_correction && original
    ? correctionBaseline(original, (item) => !correctionDate || String(item.created_at || item.correction_date) <= String(correctionDate))
    : null;
  const originalPaidValues = !entry.is_correction && linkedCorrections.length
    ? correctionBaseline(entry, (item) => item.paid_with_original)
    : entry;
  const paymentSource = entry.is_correction ? original : entry;
  const harvestBlock = harvestBlockFor(paymentSource?.block_code || entry.block_code || employee.division);
  const harvestCommodity = paymentSource?.commodity || entry.commodity || harvestBlock.commodity || 'Belum diatur';
  const harvestUnit = paymentSource?.unit || entry.unit || harvestBlock.unit || 'Belum diatur';
  const harvestUnitLabel = harvestUnit === 'Belum diatur' ? 'satuan' : harvestUnit;
  const originalPaymentAmount = paymentSource
    ? Number(paymentSource.total_amount ?? (isSalary
      ? Number(paymentSource.basic_salary || 0) + Number(paymentSource.allowances || 0) - Number(paymentSource.deductions || 0)
      : Number(paymentSource.weight_kg || 0) * Number(paymentSource.rate_per_kg || 0)))
      + linkedCorrections.filter((item) => item.paid_with_original)
        .reduce((sum, item) => sum + Number(item.net_amount || 0), 0)
    : 0;
  const earlierCorrectionPayments = entry.is_correction
    ? linkedCorrections.filter((item) => item.id !== entry.id && !item.paid_with_original
      && item.slip_number && Number(item.net_amount) > 0 && item.paid_at
      && String(item.paid_at) <= String(entry.paid_at || entry.created_at))
      .reduce((sum, item) => sum + Number(item.net_amount), 0)
    : 0;
  const alreadyPaidAmount = originalPaymentAmount + earlierCorrectionPayments;
  const paymentDate = entry.is_correction
    ? entry.paid_at || entry.correction_date || entry.created_at
    : (entry.status === 'cancelled'
    ? state.data.auditTrail.find((item) => item.transaction_id === entry.id && item.action === 'dibatalkan')?.occurred_at || entry.payment_date || entry.harvest_date
    : entry.paid_at || entry.payment_date || entry.harvest_date) || new Date().toISOString();
  const formattedDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${String(paymentDate).slice(0, 10)}T12:00:00`));
  const totalAmount = entry.is_correction ? formatMoney(entry.net_amount) : formatMoney(originalPaymentAmount);
  const printedDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date());
  const statusLabel = entry.status === 'cancelled' ? 'Dibatalkan'
    : entry.status === 'overpaid' ? `Kelebihan bayar ${formatMoney(Math.abs(Number(entry.net_amount || 0)))}`
    : entry.status === 'paid' ? 'Dibayar' : 'Belum dibayar';
  const detailRows = entry.is_correction
    ? isSalary
      ? [
          ['Gaji Pokok Akhir', formatMoney(correctionValues?.basic_salary || 0)],
          ['Tunjangan Akhir', formatMoney(correctionValues?.allowances || 0)],
          ['Potongan Akhir', `- ${formatMoney(correctionValues?.deductions || 0)}`],
          ['Nilai akhir transaksi', formatMoney((correctionValues?.basic_salary || 0)
            + (correctionValues?.allowances || 0) - (correctionValues?.deductions || 0))],
          [`Sudah dibayar (${original?.slip_number || '—'})`, formatMoney(alreadyPaidAmount)],
          ['Dibayar sekarang', totalAmount]
        ]
      : [
          ['Blok panen', harvestBlock.code],
          ['Komoditas', harvestCommodity],
          ['Jumlah akhir', `${number.format(correctionValues?.weight_kg || 0)} ${harvestUnit}`],
          [`Tarif per ${harvestUnitLabel} akhir`, formatMoney(correctionValues?.rate_per_kg || 0)],
          ['Nilai akhir transaksi', formatMoney((correctionValues?.weight_kg || 0) * (correctionValues?.rate_per_kg || 0))],
          [`Sudah dibayar (${original?.slip_number || '—'})`, formatMoney(alreadyPaidAmount)],
          ['Dibayar sekarang', totalAmount]
        ]
    : isSalary
    ? [
        ['Gaji Pokok', formatMoney(originalPaidValues.basic_salary || 0)],
        ['Tunjangan', formatMoney(originalPaidValues.allowances || 0)],
        ['Potongan', `- ${formatMoney(originalPaidValues.deductions || 0)}`],
        ['Total Jumlah Dibayarkan', totalAmount]
      ]
    : [
        ['Blok panen', harvestBlock.code],
        ['Komoditas', harvestCommodity],
        ['Jumlah Panen', `${number.format(originalPaidValues.weight_kg || 0)} ${harvestUnit}`],
        [`Tarif per ${harvestUnitLabel}`, formatMoney(originalPaidValues.rate_per_kg || 0)],
        ['Total Jumlah Dibayarkan', totalAmount]
      ];
  const details = detailRows.map(([label, value]) => `
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--color-surface-soft); font-size: 13px; color: var(--color-sidebar);">
      <span>${escapeHtml(label)}</span>
      <strong style="color: var(--color-sidebar);">${escapeHtml(value)}</strong>
    </div>
  `).join('');
  const overpaidCorrection = linkedCorrections.find((item) => Number(item.net_amount) < 0);
  const correctionPaymentSlips = linkedCorrections.filter((item) =>
    !item.paid_with_original && item.slip_number && Number(item.net_amount) > 0);
  const totalPaidForSource = originalPaymentAmount + linkedCorrections
    .filter((item) => !item.paid_with_original && item.slip_number && item.paid_at && Number(item.net_amount) > 0)
    .reduce((sum, item) => sum + Number(item.net_amount), 0);
  const overpaidAmount = Math.max(0, roundAmount(totalPaidForSource - Number(entry.amount || 0)));
  const correctionNotes = [];
  if (!entry.is_correction && linkedCorrections.some((item) => item.paid_with_original)) correctionNotes.push('Sudah termasuk koreksi');
  if (!entry.is_correction && correctionPaymentSlips.length) {
    correctionNotes.push(`Dikoreksi oleh ${correctionPaymentSlips.map((item) => item.slip_number).join(', ')}`);
  }
  if (!entry.is_correction && overpaidCorrection && overpaidAmount > 0) {
    correctionNotes.push(`Dikoreksi (kelebihan bayar ${formatMoney(overpaidAmount)}) pada ${formatDate(overpaidCorrection.correction_date)}`);
  }
  const employeeSignature = signatureText(employee.full_name || 'Penerima');
  return `
    <div class="payment-slip-document" style="position:relative;overflow:hidden;width:794px;min-height:1123px;background:var(--color-surface);color:var(--color-sidebar);padding:30px 36px;font-family:'DM Sans',sans-serif;box-sizing:border-box;">
      ${entry.status === 'cancelled' ? '<div style="position:absolute;z-index:2;top:43%;left:5%;width:90%;transform:rotate(-25deg);border:8px solid var(--color-danger);color:var(--color-danger);opacity:.22;text-align:center;font-size:72px;font-weight:800;letter-spacing:.12em;pointer-events:none;">DIBATALKAN</div>' : ''}
      <div style="display: flex; justify-content: space-between; align-items: end; border-bottom: 2px solid var(--color-mint); padding-bottom: 12px; margin-bottom: 18px;">
        <div>
          <div style="font-size: 22px; font-weight: 800; color: var(--color-sidebar);">Perkebunan Arboria</div>
        </div>
        <div style="text-align:right;color:var(--color-sidebar);"><strong style="font-size:18px;letter-spacing:.08em;">${entry.is_correction ? 'SLIP KOREKSI' : 'SLIP PEMBAYARAN'} ${isSalary ? 'GAJI' : 'UPAH'}</strong><small style="display:block;margin-top:5px;font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--color-orange);">${escapeHtml(slipPrintLabel(printCount))} · ${escapeHtml(entry.slip_number || 'Nomor slip belum tersedia')}</small><small style="display:block;margin-top:4px;font-size:10px;font-weight:500;letter-spacing:0;color:var(--color-text-muted);">Dicetak ${escapeHtml(printedDate)}</small></div>
      </div>
      ${entry.is_correction
        ? `<p style="margin:0 0 16px;padding:10px 12px;background:var(--color-mint);border-radius:8px;font-size:12px;">Koreksi atas ${escapeHtml(original?.slip_number || '—')} · Alasan: ${escapeHtml(entry.reason || '—')}</p>`
        : correctionNotes.length
          ? `<p style="margin:0 0 16px;padding:10px 12px;background:var(--color-mint);border-radius:8px;font-size:12px;">${correctionNotes.map(escapeHtml).join('<br>')}</p>`
          : ''}

      <div style="display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 18px; margin-bottom: 18px;">
        <div style="border: 1px solid var(--color-surface-soft); border-radius: 10px; padding: 14px 16px; background: var(--color-mint);">
          <div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 6px;">Data Karyawan</div>
          <div style="display: grid; gap: 6px; font-size: 14px;">
            <div><strong style="display: inline-block; width: 134px; color: var(--color-text-muted);">Nama</strong> ${escapeHtml(employee.full_name || '—')}</div>
            <div><strong style="display: inline-block; width: 134px; color: var(--color-text-muted);">ID Karyawan</strong> ${escapeHtml(employee.employee_code || '—')}</div>
            <div><strong style="display: inline-block; width: 134px; color: var(--color-text-muted);">Jenis</strong> ${escapeHtml(employee.employment_type === 'staff' ? 'Staf' : 'Pemanen')}</div>
            <div><strong style="display: inline-block; width: 134px; color: var(--color-text-muted);">Divisi / Blok</strong> ${escapeHtml(employee.division || '—')}</div>
          </div>
        </div>
        <div style="border: 1px solid var(--color-surface-soft); border-radius: 10px; padding: 14px 16px; background: var(--color-mint);">
          <div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 6px;">Pembayaran</div>
          <div style="display: grid; gap: 6px; font-size: 14px;">
            <div><strong style="display: inline-block; width: 118px; color: var(--color-text-muted);">Skema</strong> ${escapeHtml(paymentLabel)}</div>
            <div><strong style="display: inline-block; width: 118px; color: var(--color-text-muted);">Nomor Slip</strong> ${escapeHtml(entry.slip_number || '—')}</div>
            <div><strong style="display: inline-block; width: 118px; color: var(--color-text-muted);">Periode</strong> ${escapeHtml(monthLabel(periodFor(entry)))}</div>
            <div><strong style="display: inline-block; width: 118px; color: var(--color-text-muted);">Tanggal</strong> ${escapeHtml(formattedDate)}</div>
            <div><strong style="display: inline-block; width: 118px; color: var(--color-text-muted);">Status</strong> ${escapeHtml(statusLabel)}</div>
            <div><strong style="display: inline-block; width: 118px; color: var(--color-text-muted);">Total</strong> <span style="color:var(--color-sidebar); font-weight:700;">${escapeHtml(totalAmount)}</span></div>
          </div>
        </div>
      </div>

      <div style="border: 1px solid var(--color-surface-soft); border-radius: 10px; overflow: hidden; margin-bottom: 26px; background: var(--color-surface);">
        <div style="display: flex; justify-content: space-between; padding: 12px 16px; background: var(--color-mint); border-bottom: 1px solid var(--color-surface-soft); font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted); font-weight: 700;">
          <span>Rincian</span>
          <span>Nilai</span>
        </div>
        ${details}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:10px;padding-top:18px;border-top:1px solid var(--color-surface-soft);">
        <div style="text-align: center;">
          <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 14px;">Dibuat oleh</div>
          <div style="font-family: 'Great Vibes', 'Segoe Script', 'Lucida Handwriting', cursive; font-size: 25px; min-height: 52px; color: var(--color-sidebar); margin-bottom: 10px;">Admin Arboria</div>
          <div style="height: 2px; background: linear-gradient(to right, var(--color-line), var(--color-sidebar), var(--color-line)); margin: 0 auto 10px; width: 90%;"></div>
          <div style="font-size: 13px; font-weight: 700; color: var(--color-sidebar);">Admin Arboria</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:14px;">Diterima oleh</div>
          <div style="font-family: 'Great Vibes', 'Segoe Script', 'Lucida Handwriting', cursive; font-size: 25px; min-height: 52px; color: var(--color-sidebar); margin-bottom: 10px;">${escapeHtml(employeeSignature)}</div>
          <div style="height: 2px; background: linear-gradient(to right, var(--color-line), var(--color-sidebar), var(--color-line)); margin: 0 auto 10px; width: 90%;"></div>
          <div style="font-size: 13px; font-weight: 700; color: var(--color-sidebar);">${escapeHtml(employee.full_name || 'Nama Karyawan')}</div>
        </div>