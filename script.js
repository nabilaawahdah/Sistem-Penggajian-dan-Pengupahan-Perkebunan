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
        </div>      </div>

      <div style="margin-top: 30px; text-align: center; color: var(--color-text-muted); font-size: 9px; letter-spacing: 0.05em; font-style: italic;">Dokumen ini diterbitkan secara sah melalui Sistem Penggajian dan Pengupahan Perkebunan Arboria.</div>
    </div>
  `;
}
function resizeSlipPreview() {
  const backdrop = document.querySelector('#slip-preview-backdrop');
  const scroll = document.querySelector('.slip-preview-scroll');
  const stage = document.querySelector('#slip-preview-stage');
  const documentSheet = document.querySelector('.payment-slip-document');
  if (backdrop.hidden || !scroll || !stage || !documentSheet) return;
  const scale = Math.min(1, Math.max(0.3, (scroll.clientWidth - 24) / 794));
  stage.style.width = `${794 * scale}px`;
  stage.style.height = `${documentSheet.offsetHeight * scale}px`;
  documentSheet.style.transform = `scale(${scale})`;
  documentSheet.style.transformOrigin = 'top left';
}
function openPaymentSlipPreview(entry) {
  if (!entry?.slip_number) return;
  const employee = employeeFor(entry);
  state.previewSlip = entry;
  document.querySelector('#slip-preview-title').textContent = `Slip Pembayaran ${entry.kind === 'salary' ? 'Gaji' : 'Upah'}`;
  document.querySelector('#slip-preview-employee').textContent = `${employee.full_name || 'Karyawan'} · ${employee.employee_code || '—'}`;
  document.querySelector('#slip-preview-sheet').innerHTML = paymentSlipHtml(entry);
  document.querySelector('#slip-preview-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  document.fonts.ready.then(() => requestAnimationFrame(resizeSlipPreview));
  requestAnimationFrame(resizeSlipPreview);
}
function closePaymentSlipPreview() {
  document.querySelector('#slip-preview-backdrop').hidden = true;
  document.querySelector('#slip-preview-sheet').replaceChildren();
  state.previewSlip = null;
  document.body.style.overflow = '';
}
async function downloadPaymentSlip(entry, button) {
  if (!entry?.slip_number) return;
  if (!window.html2canvas || !window.jspdf) {
    showToast('PDF slip tidak tersedia. Mohon refresh halaman dan coba kembali.');
    return;
  }
  button.disabled = true;
  const wrapper = document.createElement('div');
  wrapper.id = 'slip-render-root';
  const printCount = slipPrintCount(entry);
  wrapper.innerHTML = paymentSlipHtml(entry, printCount);
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = '794px';
  wrapper.style.height = '1123px';
  wrapper.style.overflow = 'hidden';
  document.body.appendChild(wrapper);
  try {
    await document.fonts.ready;
    const canvas = await window.html2canvas(wrapper, {
      scale: 2,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim(),
      useCORS: true,
      width: 794,
      height: 1123,
      onclone: (clonedDocument) => {
        const clonedWrapper = clonedDocument.querySelector('#slip-render-root');
        if (clonedWrapper) {
          clonedWrapper.style.visibility = 'visible';
          clonedWrapper.style.left = '0';
          clonedWrapper.style.top = '0';
        }
      },
    });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageWidth = pageWidth - 48;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/png');
    const finalHeight = Math.min(imageHeight, pageHeight - 48);
    pdf.addImage(imgData, 'PNG', 24, 24, imageWidth, finalHeight);
    pdf.setFontSize(8);
    pdf.text('Halaman 1', pageWidth - 24, pageHeight - 12, { align: 'right' });
    pdf.save(paymentSlipFilename(entry));
    const printCounts = JSON.parse(localStorage.getItem('arboria-slip-print-counts') || '{}');
    printCounts[entry.id] = printCount + 1;
    localStorage.setItem('arboria-slip-print-counts', JSON.stringify(printCounts));
    document.querySelector('#slip-preview-sheet').innerHTML = paymentSlipHtml(entry, printCount + 1);
    document.fonts.ready.then(() => requestAnimationFrame(resizeSlipPreview));
    showToast('Slip pembayaran berhasil diunduh dalam format PDF.');
  } catch (error) {
    showToast(error.message || 'Slip pembayaran gagal dibuat.');
  } finally {
    wrapper.remove();
    button.disabled = false;
  }
}
window.addEventListener('resize', resizeSlipPreview);
function transactionMarkup(entry, withActions = false, hideType = false) {
  const employee = employeeFor(entry);
  const isSalary = entry.kind === 'salary';
  const linkedCorrections = !entry.is_correction
    ? state.data.corrections.filter((correction) => correction.original_transaction_id === entry.id)
    : [];
  const paidBeforeAdjustments = Number(entry.total_amount || 0) + linkedCorrections.reduce((sum, correction) => {
    if (correction.paid_with_original) return sum + Number(correction.net_amount || 0);
    if (correction.slip_number && correction.paid_at && Number(correction.net_amount) > 0) {
      return sum + Number(correction.net_amount);
    }
    return sum;
  }, 0);
  const overpaidAmount = !entry.is_correction && (entry.status === 'paid' || (entry.status === 'cancelled' && entry.paid_at))
    ? Math.max(0, roundAmount(paidBeforeAdjustments - Number(entry.amount || 0)))
    : 0;
  const finalValues = linkedCorrections.length ? correctionBaseline(entry) : null;
  const detail = entry.is_correction
    ? isSalary
      ? `<span>Pokok ${formatSignedMoney(entry.delta_basic_salary)}</span><span>Tunj. ${formatSignedMoney(entry.delta_allowances)}</span><span>Potongan ${formatSignedMoney(entry.delta_deductions)}</span>`
      : `<span>Selisih upah ${formatSignedMoney(entry.delta_gross)}</span>`
    : isSalary
    ? `<span>Pokok ${formatMoney(finalValues?.basic_salary ?? entry.basic_salary)}</span><span>Tunj. ${formatMoney(finalValues?.allowances ?? entry.allowances ?? 0)}</span><span>Potongan ${formatMoney(finalValues?.deductions ?? entry.deductions ?? 0)}</span>`
    : `<span>Blok ${entry.block_code || employee.division || '—'}${entry.commodity || harvestBlockFor(entry.block_code || employee.division).commodity ? ` · ${entry.commodity || harvestBlockFor(entry.block_code || employee.division).commodity}` : ''}</span><span>${number.format(finalValues?.weight_kg ?? entry.weight_kg)} ${entry.unit || harvestBlockFor(entry.block_code || employee.division).unit || 'satuan'} × ${formatMoney(finalValues?.rate_per_kg ?? entry.rate_per_kg)} / ${entry.unit || harvestBlockFor(entry.block_code || employee.division).unit || 'satuan'}</span>`;
  const status = entry.status === 'cancelled' ? 'Dibatalkan'
    : entry.status === 'overpaid' ? 'Kelebihan bayar'
    : entry.status === 'pending' ? 'Menunggu pembayaran' : 'Dibayar';
  const original = entry.is_correction
    ? [...state.data.salaries, ...state.data.harvests].find((item) => item.id === entry.original_transaction_id)
    : null;
  const statusMarkup = entry.status === 'cancelled'
    ? `<span class="status-tag status-cancelled">${status}</span>`
    : entry.status === 'overpaid'
    ? `<span class="status-tag status-overpaid">${status}</span>`
    : entry.status === 'pending'
    ? `<span class="status-tag status-pending">${status}</span>${entry.is_correction
      ? original?.status === 'paid' && Number(entry.net_amount) > 0
        ? `<button class="status-tag status-action" type="button" data-mark-correction-paid="${escapeHtml(entry.id)}">Tandai dibayar</button>`
        : ''
      : `<button class="status-tag status-action" type="button" data-mark-paid="${isSalary ? 'salary' : 'harvest'}" data-entry-id="${escapeHtml(entry.id)}">Tandai dibayar</button>`}`
    : `<span class="status-tag">${status}</span>`;
  const statusDetail = entry.is_correction && entry.status === 'overpaid'
    ? `Kelebihan bayar ${formatMoney(Math.abs(Number(entry.net_amount || 0)))}`
    : !entry.is_correction && overpaidAmount > 0
      ? `Kelebihan bayar ${formatMoney(overpaidAmount)}`
      : statusDetails(entry);
  const overpaidStatus = !entry.is_correction && overpaidAmount > 0
    ? '<span class="status-tag status-overpaid">Kelebihan bayar</span>'
    : '';
  const reference = entry.is_correction && original ? `Koreksi ${original.slip_number || '—'}` : '';
  const amountNote = entry.is_correction
    ? '<small class="status-detail">Dibayar sekarang</small>'
    : linkedCorrections.length ? '<span class="status-tag status-corrected">Dikoreksi</span>' : '';
  return `<tr class="${entry.status === 'cancelled' ? 'cancelled-transaction' : ''}"><td>${personMarkup(employee)}</td><td><span class="slip-number">${escapeHtml(entry.slip_number || '—')}</span>${reference ? `<small class="status-detail">${escapeHtml(reference)}</small>` : ''}</td>${hideType ? '' : `<td><span class="type-tag ${isSalary ? '' : 'harvest'}"><i></i>${isSalary ? 'Gaji staf' : 'Upah panen'}${entry.is_correction ? ' · Koreksi' : ''}</span></td>`}<td><span class="date-cell"><strong>${escapeHtml(transactionDate(entry))}</strong><small>${escapeHtml(monthLabel(periodFor(entry)))}</small></span></td><td><span class="transaction-detail">${detail}</span></td><td class="money-cell">${formatMoney(entry.amount)}${amountNote}</td><td><div class="status-cell">${statusMarkup}${overpaidStatus}${statusDetail ? `<small class="status-detail">${escapeHtml(statusDetail)}</small>` : ''}</div></td>${withActions ? `<td>${transactionActions(entry)}</td>` : ''}</tr>`;
}
function renderTransactions() {
  const recent = currentTransactions().filter((entry) => entry.status !== 'cancelled').slice(0, 5);
  document.querySelector('#recent-transactions').innerHTML = recent.map((entry) => transactionMarkup(entry, true)).join('');
  document.querySelector('#recent-empty').hidden = recent.length > 0;
}
function renderEmployees() {
  const activeEmployees = state.data.employees.filter((employee) => !employee.archived_at);
  const archivedEmployees = state.data.employees.filter((employee) => Boolean(employee.archived_at));
  const staff = activeEmployees.filter((employee) => employee.employment_type === 'staff');
  const harvesters = activeEmployees.filter((employee) => employee.employment_type === 'harvester');
  document.querySelector('#filter-all-count').textContent = activeEmployees.length;
  document.querySelector('#filter-staff-count').textContent = staff.length;
  document.querySelector('#filter-harvester-count').textContent = harvesters.length;
  document.querySelector('#filter-archived-count').textContent = archivedEmployees.length;
  const search = state.search.toLowerCase();
  const employees = state.data.employees.filter((employee) => {
    const matchesStatus = state.employeeFilter === 'deleted'
      ? Boolean(employee.archived_at)
      : !employee.archived_at
        && (state.employeeFilter === 'all' || employee.employment_type === state.employeeFilter);
    return matchesStatus && `${employee.full_name} ${employee.employee_code} ${employee.division}`.toLowerCase().includes(search);
  });
  document.querySelector('#employee-rows').innerHTML = employees.map((employee) => {
    const typeLabel = employee.employment_type === 'staff' ? 'Staf' : 'Pemanen';
    const compensation = employee.employment_type === 'staff' ? `${formatMoney(employee.monthly_salary)} / bulan` : 'Tarif berdasarkan panen';
    return `<tr><td>${personMarkup(employee)}</td><td>${escapeHtml(employee.employee_code)}</td><td><span class="role-tag ${employee.employment_type}">${typeLabel}</span></td><td>${escapeHtml(employee.division)}</td><td class="compensation-cell">${compensation}</td><td>${employeeActions(employee)}</td></tr>`;
  }).join('');
  document.querySelector('#employee-empty').hidden = employees.length > 0;
  document.querySelector('#employee-result-count').textContent = `${employees.length} karyawan`;
}
function attendancePeriodRecords(period = state.attendancePeriod || currentPeriod()) {
  return state.data.dailyAttendance.filter((entry) => reportPeriodMatches(entry.attendance_date, period));
}
function renderAttendance() {
  const dateInput = document.querySelector('#attendance-date');
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  const attendanceDate = dateInput.value;
  const currentDay = new Map(state.data.dailyAttendance.filter((entry) => entry.attendance_date === attendanceDate).map((entry) => [entry.employee_id, entry.status]));
  const dailyQuery = document.querySelector('#attendance-search').value.trim().toLowerCase();
  const dailyType = document.querySelector('#attendance-type-filter').value;
  const dailyEmployees = state.data.employees.filter((employee) => !employee.archived_at
    && (dailyType === 'all' || employee.employment_type === dailyType)
    && `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(dailyQuery));
  document.querySelector('#daily-attendance-rows').innerHTML = dailyEmployees.map((employee) => {
    const status = state.dailyStatuses[employee.id] || currentDay.get(employee.id) || '';
    const choices = [['present', 'Hadir'], ['leave', 'Izin'], ['absent', 'Alfa']].map(([value, label]) =>
      `<label class="attendance-choice ${value} ${status === value ? 'selected' : ''}"><input type="radio" name="daily-${escapeHtml(employee.id)}" value="${value}" data-attendance-status="${escapeHtml(employee.id)}" ${status === value ? 'checked' : ''}><span>${label}</span></label>`).join('');
    const typeLabel = employee.employment_type === 'staff' ? 'Staf' : 'Pemanen';
    return `<tr><td>${personMarkup(employee)}</td><td>${escapeHtml(employee.employee_code)}</td><td><span class="role-tag ${employee.employment_type}">${typeLabel}</span></td><td><div class="attendance-choices">${choices}</div></td></tr>`;
  }).join('');
  document.querySelector('#daily-attendance-empty').hidden = dailyEmployees.length > 0;
  document.querySelector('#daily-attendance-count').textContent = `${dailyEmployees.length} karyawan`;
  document.querySelector('#attendance-count').textContent = attendancePeriodRecords().length;

  const period = state.attendancePeriod || currentPeriod();
  const attendanceRows = attendancePeriodRecords(period);
  const legacyRows = state.data.attendance.filter((entry) => reportPeriodMatches(entry.period_id, period)
    && !state.data.dailyAttendance.some((daily) => daily.employee_id === entry.employee_id && daily.attendance_date.slice(0, 7) === entry.period_id));
  const byEmployee = new Map();
  for (const entry of attendanceRows) {
    const item = byEmployee.get(entry.employee_id) || { present: 0, leave: 0, absent: 0, records: [], legacy: [] };
    item[entry.status] += 1;
    item.records.push(entry);
    byEmployee.set(entry.employee_id, item);
  }
  for (const entry of legacyRows) {
    const item = byEmployee.get(entry.employee_id) || { present: 0, leave: 0, absent: 0, records: [], legacy: [] };
    item.present += Number(entry.working_days || 0);
    item.leave += Number(entry.leave_days || 0);
    item.absent += Number(entry.absent_days || 0);
    item.legacy.push(entry);
    byEmployee.set(entry.employee_id, item);
  }
  const reportType = document.querySelector('#attendance-report-type').value;
  const reportQuery = document.querySelector('#attendance-report-search').value.trim().toLowerCase();
  const employees = state.data.employees.filter((employee) => {
    return (reportType === 'all' || employee.employment_type === reportType)
      && `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(reportQuery);
  });
  const totalLeave = employees.reduce((sum, employee) => sum + (byEmployee.get(employee.id)?.leave || 0), 0);
  const totalAbsent = employees.reduce((sum, employee) => sum + (byEmployee.get(employee.id)?.absent || 0), 0);
  document.querySelector('#attendance-summary').innerHTML = `<article class="summary-item"><span>Total karyawan</span><strong>${employees.length}</strong><small>${escapeHtml(selectionLabel(period))}</small></article><article class="summary-item"><span>Total izin</span><strong>${totalLeave}</strong><small>Total periode terpilih</small></article><article class="summary-item"><span>Total alfa</span><strong>${totalAbsent}</strong><small>Total periode terpilih</small></article>`;
  document.querySelector('#attendance-rows').innerHTML = employees.map((employee) => {
    const detail = byEmployee.get(employee.id) || { present: 0, leave: 0, absent: 0 };
    return `<tr><td><button class="text-button attendance-detail-link" type="button" data-attendance-detail="${escapeHtml(employee.id)}">${escapeHtml(employee.full_name)}</button></td><td>${escapeHtml(employee.employee_code)}</td><td><span class="role-tag ${employee.employment_type}">${employee.employment_type === 'staff' ? 'Staf' : 'Pemanen'}</span></td><td><span class="attendance-status present">${detail.present}</span></td><td><span class="attendance-status leave">${detail.leave}</span></td><td><span class="attendance-status absent">${detail.absent}</span></td></tr>`;
  }).join('');
  document.querySelector('#attendance-empty').hidden = employees.length > 0;
  document.querySelector('#attendance-result-count').textContent = `${employees.length} karyawan`;
}
function renderPayroll() {
  const filtered = currentTransactions().filter((entry) => {
    if (state.payrollFilter === 'pending') return entry.status === 'pending';
    return state.payrollFilter === 'all' || entry.kind === state.payrollFilter;
  });
  const active = filtered.filter((entry) => !entry.is_correction && entry.status !== 'cancelled');
  const salaryTotal = active.filter((entry) => entry.kind === 'salary').reduce((sum, entry) => sum + entry.amount, 0);
  const wageEntries = active.filter((entry) => entry.kind === 'harvest');
  const wageTotal = wageEntries.reduce((sum, entry) => sum + entry.amount, 0);
  document.querySelector('#payroll-summary').innerHTML = `<article class="summary-item"><span>Total gaji staf</span><strong>${formatMoney(salaryTotal)}</strong><small>${active.filter((entry) => entry.kind === 'salary').length} transaksi aktif</small></article><article class="summary-item"><span>Total upah panen</span><strong>${formatMoney(wageTotal)}</strong><small>${number.format(wageEntries.reduce((sum, entry) => sum + Number(entry.weight_kg || 0), 0))} kg tercatat</small></article><article class="summary-item"><span>Total kompensasi</span><strong>${formatMoney(salaryTotal + wageTotal)}</strong><small>${active.length} transaksi aktif</small></article>`;
  document.querySelector('#payroll-rows').innerHTML = filtered.map((entry) => transactionMarkup(entry, true, true)).join('');
  document.querySelector('#payroll-empty').hidden = filtered.length > 0;
  document.querySelector('#payroll-result-count').textContent = `${filtered.length} transaksi`;
}
function reportPeriodMatches(date, period) {
  if (!date) return false;
  return isYearSelection(period) ? date.startsWith(`${period.slice(5)}-`) : date.slice(0, 7) === period;
}
function journalDate(journal) { return String(journal.journal_date || journal.created_at || '').slice(0, 10); }
function journalCreatedAt(journal) { return String(journal.created_at || `${journalDate(journal)}T00:00:00`); }
function journalLines(journal) {
  return (journal.payroll_journal_lines || journal.lines || [])
    .map((line, index) => ({ line, index }))
    .sort((left, right) => {
      const sideOrder = (line) => Number(line.debit || 0) > 0 ? 0 : Number(line.credit || 0) > 0 ? 1 : 2;
      return sideOrder(left.line) - sideOrder(right.line)
        || String(left.line.account_code || '').localeCompare(String(right.line.account_code || ''))
        || String(left.line.id || '').localeCompare(String(right.line.id || ''))
        || left.index - right.index;
    })
    .map(({ line }) => line);
}
function journalTotals(journals) {
  return journals.reduce((total, journal) => journalLines(journal).reduce((sum, line) => ({
    debit: sum.debit + Number(line.debit || 0),
    credit: sum.credit + Number(line.credit || 0)
  }), total), { debit: 0, credit: 0 });
}
function getAccount(code) {
  return state.data.accounts.find((account) => account.code === code) || { code, name: code, normal_balance: 'debit', account_type: '—' };
}
function journalTypeLabel(type) {
  return ({ recognition: 'Pengakuan', salary: 'Pengakuan', harvest: 'Pengakuan', payment: 'Pembayaran', correction: 'Koreksi', reversal: 'Pembalik' })[type] || type;
}
function journalEvidence(journal) {
  const transaction = [...state.data.salaries, ...state.data.harvests, ...state.data.corrections].find((entry) => entry.id === journal.transaction_id);
  const correctionSource = transaction?.original_transaction_id
    ? [...state.data.salaries, ...state.data.harvests].find((entry) => entry.id === transaction.original_transaction_id)
    : null;
  return transaction?.slip_number || correctionSource?.slip_number
    || (/^JU-\d{4}-/.test(journal.journal_number || '') ? '—' : journal.journal_number) || '—';
}
function reversalSourceOrder(journal) {
  const source = state.data.journals.find((item) => item.id === journal.reversal_of);
  if (!source) return ['\uffff', 4, String(journal.reversal_of || journal.id || '')];
  return [journalCreatedAt(source), journalTypeOrder(source), String(source.id || '')];
}
function journalTypeOrder(journal) {
  if (['recognition', 'salary', 'harvest'].includes(journal.journal_type)) return 0;
  if (journal.journal_type === 'correction') return 1;
  if (journal.journal_type === 'payment') return 2;
  if (journal.journal_type === 'reversal') return 3;
  return 4;
}
function compareReversalSourceOrder(left, right) {
  const leftOrder = reversalSourceOrder(left);
  const rightOrder = reversalSourceOrder(right);
  return leftOrder[0].localeCompare(rightOrder[0])
    || leftOrder[1] - rightOrder[1]
    || leftOrder[2].localeCompare(rightOrder[2]);
}
function compareJournalOrder(left, right) {
  const byCreatedAt = journalCreatedAt(left).localeCompare(journalCreatedAt(right));
  if (byCreatedAt) return byCreatedAt;
  const byType = journalTypeOrder(left) - journalTypeOrder(right);
  if (byType) return byType;
  const byDate = journalDate(left).localeCompare(journalDate(right));
  if (byDate) return byDate;
  return String(left.transaction_kind || '').localeCompare(String(right.transaction_kind || ''))
    || String(left.transaction_id || '').localeCompare(String(right.transaction_id || ''))
    || String(left.id || '').localeCompare(String(right.id || ''));
}
function journalBlocks(journals) {
  const blocks = [];
  const reversalBlocks = new Map();
  for (const journal of journals) {
    if (journal.journal_type !== 'reversal') {
      blocks.push({ journals: [journal], isReversalGroup: false });
      continue;
    }
    const key = `${journal.transaction_kind}:${journal.transaction_id || journal.id}`;
    let block = reversalBlocks.get(key);
    if (!block) {
      block = { journals: [], isReversalGroup: true };
      reversalBlocks.set(key, block);
      blocks.push(block);
    }
    block.journals.push(journal);
  }
  for (const block of reversalBlocks.values()) {
    block.journals.sort(compareReversalSourceOrder);
  }
  return blocks;
}
function journalBlockLines(block) {
  return block.journals.flatMap((journal, journalIndex) =>
    journalLines(journal).map((line, lineIndex) => ({ journal, journalIndex, lineIndex, line })));
}
function journalBlockDescription(block) {
  if (!block.isReversalGroup) return block.journals[0].description;
  const first = block.journals[0];
  const transaction = [...state.data.salaries, ...state.data.harvests]
    .find((entry) => entry.id === first.transaction_id);
  const rawDescription = block.journals
    .map((journal) => journal.description || '')
    .find((description) => description.includes(':')) || '';
  const reasonFromDescription = rawDescription.includes(':')
    ? rawDescription.slice(rawDescription.indexOf(':') + 1).trim() : '';
  const reason = first.cancellation_reason || transaction?.cancellation_reason
    || reasonFromDescription
    || 'Pembatalan transaksi';
  return `Pembalik ${journalEvidence(first)}: ${reason}`;
}
function matchingJournals(period, type = 'all') {
  const filtered = state.data.journals.filter((journal) => reportPeriodMatches(journalDate(journal), period)
    && (type === 'all'
      || (type === 'recognition' && ['recognition', 'salary', 'harvest'].includes(journal.journal_type))
      || journal.journal_type === type));
  return filtered.sort(compareJournalOrder);
}
function renderDashboardAccounting() {
  const journals = matchingJournals(state.selectedPeriod);
  const journalTotalsForPeriod = journalTotals(journals);
  document.querySelector('#dashboard-accounting-period').textContent = selectionLabel(state.selectedPeriod);
  document.querySelector('#dashboard-journal-count').textContent = `${journals.length} jurnal`;
  document.querySelector('#dashboard-journal-debit').textContent = formatMoney(journalTotalsForPeriod.debit);
  document.querySelector('#dashboard-journal-credit').textContent = formatMoney(journalTotalsForPeriod.credit);
  const recentJournals = journals.slice(-3);
  document.querySelector('#dashboard-journal-activity').innerHTML = recentJournals.length
    ? recentJournals.map((journal) => `<div class="dashboard-journal-row"><div class="dashboard-journal-description"><strong>${escapeHtml(journalEvidence(journal))}</strong><span>${escapeHtml(journal.description || journalTypeLabel(journal.journal_type))}</span></div><div class="dashboard-journal-meta"><span class="dashboard-journal-type">${escapeHtml(journalTypeLabel(journal.journal_type))}</span><time>${escapeHtml(formatDate(journalDate(journal)))}</time></div></div>`).join('')
    : '<p class="dashboard-journal-empty">Belum ada jurnal pada periode ini.</p>';

  const { end } = periodDateRange(state.selectedPeriod);
  const trialBalance = state.data.accounts.reduce((total, account) => {
    const balance = accountMovements(account, end).balance;
    const debitBalance = account.normal_balance === 'debit' ? balance : -balance;
    total.debit += Math.max(0, debitBalance);
    total.credit += Math.max(0, -debitBalance);
    if (Math.abs(balance) >= 0.005) total.accountsWithBalance += 1;
    return total;
  }, { debit: 0, credit: 0, accountsWithBalance: 0 });
  const balanced = Math.abs(trialBalance.debit - trialBalance.credit) < 0.005;
  document.querySelector('#dashboard-ledger-as-of').textContent = `Saldo hingga ${formatDate(end)}`;
  document.querySelector('#dashboard-ledger-debit').textContent = formatMoney(trialBalance.debit);
  document.querySelector('#dashboard-ledger-credit').textContent = formatMoney(trialBalance.credit);
  document.querySelector('#dashboard-ledger-account-count').textContent = `${trialBalance.accountsWithBalance} akun memiliki saldo`;
  const status = document.querySelector('#dashboard-ledger-status');
  status.className = `balance-indicator ${balanced ? 'balanced' : 'unbalanced'}`;
  status.textContent = balanced ? 'Seimbang' : 'Perlu ditinjau';
}
function renderJournal() {
  const journals = matchingJournals(state.journalPeriod, state.journalType);
  const blocks = journalBlocks(journals);
  const rows = blocks.map((block) => {
    const entries = journalBlockLines(block);
    return entries.map(({ journal, journalIndex, lineIndex, line }, index) => {
      const account = line.accounts || getAccount(line.account_code);
      const credit = Number(line.credit || 0) > 0;
      const startsSubjournal = block.isReversalGroup && journalIndex > 0 && lineIndex === 0;
      const rowClasses = [credit ? 'journal-credit-row' : '', startsSubjournal ? 'journal-group-separator' : ''].filter(Boolean).join(' ');
      const header = index === 0
        ? `<td rowspan="${entries.length}">${escapeHtml(formatDate(journalDate(block.journals[0])))}</td><td rowspan="${entries.length}">${escapeHtml(journalEvidence(block.journals[0]))}</td><td rowspan="${entries.length}">${escapeHtml(journalTypeLabel(block.journals[0].journal_type))}</td><td rowspan="${entries.length}">${escapeHtml(journalBlockDescription(block))}<br><button type="button" class="text-button source-transaction-link" data-transaction-detail="${escapeHtml(block.journals[0].transaction_id || '')}">Lihat transaksi</button></td>`
        : '';
      return `<tr class="${rowClasses}">${header}<td>${escapeHtml(account.code)} · ${escapeHtml(account.name)}</td><td class="money-cell">${Number(line.debit || 0) ? formatMoney(line.debit) : '—'}</td><td class="money-cell">${Number(line.credit || 0) ? formatMoney(line.credit) : '—'}</td></tr>`;
    }).join('');
  }).join('');
  const totals = journalTotals(journals);
  const balanced = Math.abs(totals.debit - totals.credit) < 0.005;
  document.querySelector('#journal-rows').innerHTML = rows;
  document.querySelector('#journal-empty').hidden = journals.length > 0;
  document.querySelector('#journal-totals').innerHTML = `<strong>Total debit: ${formatMoney(totals.debit)}</strong><strong>Total kredit: ${formatMoney(totals.credit)}</strong><span class="balance-indicator ${balanced ? 'balanced' : 'unbalanced'}">${balanced ? 'Seimbang' : 'Tidak seimbang'}</span>`;
}
function periodDateRange(period) {
  if (isYearSelection(period)) return { start: `${period.slice(5)}-01-01`, end: `${period.slice(5)}-12-31` };
  const [year, month] = period.split('-').map(Number);
  return { start: `${period}-01`, end: periodEndDate(period) || `${year}-${String(month).padStart(2, '0')}-31` };
}
function movementFor(line, account) {
  return account.normal_balance === 'credit'
    ? Number(line.credit || 0) - Number(line.debit || 0)
    : Number(line.debit || 0) - Number(line.credit || 0);
}
function accountMovements(account, throughDate = '9999-12-31') {
  const total = { debit: 0, credit: 0, balance: 0 };
  for (const journal of state.data.journals) {
    if (journalDate(journal) > throughDate) continue;
    for (const line of journalLines(journal).filter((item) => item.account_code === account.code)) {
      total.debit += Number(line.debit || 0);
      total.credit += Number(line.credit || 0);
      total.balance += movementFor(line, account);
    }
  }
  return total;
}
function ledgerEntriesForAccount(account, start, end) {
  return state.data.journals
    .filter((journal) => journalDate(journal) >= start && journalDate(journal) <= end)
    .sort(compareJournalOrder)
    .flatMap((journal) => journalLines(journal)
      .filter((line) => line.account_code === account.code)
      .map((line) => ({ journal, line })));
}
function renderLedger() {
  const accountSelect = document.querySelector('#ledger-account-filter');
  accountSelect.innerHTML = `<option value="all">Semua akun</option>${state.data.accounts.map((account) => `<option value="${escapeHtml(account.code)}">${escapeHtml(account.code)} · ${escapeHtml(account.name)}</option>`).join('')}`;
  accountSelect.value = state.ledgerAccount;
  const { start, end } = periodDateRange(state.ledgerPeriod);
  const selectedAccounts = state.data.accounts.filter((account) => state.ledgerAccount === 'all' || account.code === state.ledgerAccount);
  document.querySelector('#ledger-content').innerHTML = selectedAccounts.map((account) => {
    const prior = accountMovements(account, new Date(new Date(`${start}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)).balance;
    const lines = ledgerEntriesForAccount(account, start, end);
    let balance = prior;
    const rows = lines.map(({ journal, line }) => {
      balance += movementFor(line, account);
      return `<tr><td>${escapeHtml(formatDate(journalDate(journal)))}</td><td><button type="button" class="text-button journal-number-link" data-transaction-detail="${escapeHtml(journal.transaction_id || '')}">${escapeHtml(journalEvidence(journal))}</button></td><td>${escapeHtml(journalTypeLabel(journal.journal_type))}</td><td>${escapeHtml(journal.description)}</td><td class="money-cell">${Number(line.debit || 0) ? formatMoney(line.debit) : '—'}</td><td class="money-cell">${Number(line.credit || 0) ? formatMoney(line.credit) : '—'}</td><td class="money-cell">${formatMoney(balance)}</td></tr>`;
    }).join('');
    return `<section class="panel ledger-account-panel"><div class="panel-heading"><div><p class="eyebrow">${escapeHtml(account.code)}</p><h2>${escapeHtml(account.name)}</h2></div><div class="ledger-balances"><span>Saldo akhir</span><strong>${formatMoney(balance)}</strong></div></div><div class="table-scroll"><table><thead><tr><th>TANGGAL</th><th>NO. SLIP</th><th>JENIS</th><th>KETERANGAN</th><th>DEBIT</th><th>KREDIT</th><th>SALDO</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="no-ledger-lines">Tidak ada mutasi pada periode ini.</td></tr>`}</tbody></table></div></section>`;
  }).join('');
  const trialRows = state.data.accounts.map((account) => {
    const balance = accountMovements(account).balance;
    const debitBalance = account.normal_balance === 'debit' ? balance : -balance;
    return `<tr><td>${escapeHtml(account.code)}</td><td>${escapeHtml(account.name)}</td><td class="money-cell">${debitBalance > 0 ? formatMoney(debitBalance) : '—'}</td><td class="money-cell">${debitBalance < 0 ? formatMoney(-debitBalance) : '—'}</td></tr>`;
  }).join('');
  const trialTotals = state.data.accounts.reduce((total, account) => {
    const balance = account.normal_balance === 'debit' ? accountMovements(account).balance : -accountMovements(account).balance;
    total.debit += Math.max(0, balance);
    total.credit += Math.max(0, -balance);
    return total;
  }, { debit: 0, credit: 0 });
  const debit = trialTotals.debit;
  const credit = trialTotals.credit;
  document.querySelector('#trial-balance-panel').hidden = state.ledgerAccount !== 'all';
  document.querySelector('#trial-balance-rows').innerHTML = trialRows;
  document.querySelector('#trial-balance-totals').innerHTML = `<strong>Total debit: ${formatMoney(debit)}</strong><strong>Total kredit: ${formatMoney(credit)}</strong><span class="balance-indicator ${Math.abs(debit - credit) < 0.005 ? 'balanced' : 'unbalanced'}">${Math.abs(debit - credit) < 0.005 ? 'Seimbang' : 'Tidak seimbang'}</span>`;
}
function printReport(title, period, headers, rows, totals = '') {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.');
    return;
  }
  const printedAt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const themeToken = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const printTheme = {
    ink: themeToken('--color-ink'),
    primary: themeToken('--color-primary'),
    primaryHover: themeToken('--color-primary-hover'),
    muted: themeToken('--color-text-muted'),
    line: themeToken('--color-line'),
    mint: themeToken('--color-mint'),
    surface: themeToken('--color-surface')
  };
  printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(title)} - Arboria</title><style>
    :root{--print-ink:${printTheme.ink};--print-primary:${printTheme.primary};--print-primary-hover:${printTheme.primaryHover};--print-muted:${printTheme.muted};--print-line:${printTheme.line};--print-mint:${printTheme.mint};--print-surface:${printTheme.surface}}
    @page{size:A4 landscape;margin:16mm 13mm 22mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:var(--print-ink);margin:0}header{border-bottom:2px solid var(--print-primary);padding-bottom:10px;margin-bottom:14px}h1{font-size:20px;margin:0 0 5px;color:var(--print-primary-hover)}header p{margin:3px 0;color:var(--print-muted)}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid var(--print-line);padding:6px;text-align:left}th{background:var(--print-primary);color:var(--print-surface)}.journal-credit-account{padding-left:22px;color:var(--print-muted)}.journal-group-separator td{border-top:1px solid var(--print-line)}tfoot{font-weight:bold}.totals{display:flex;justify-content:flex-end;gap:22px;margin-top:12px;font-size:11px;font-weight:bold}.signature{display:grid;grid-template-columns:1fr 1fr;gap:35%;margin-top:42px;text-align:center}.signature div{padding-top:55px;border-bottom:1px solid var(--print-muted)}.footer{margin-top:10px;font-size:9px;color:var(--print-muted)}.page-number:after{content:counter(page)}@media print{.footer{position:fixed;bottom:-13mm;left:0;right:0;display:flex;justify-content:space-between}}</style></head><body><header><h1>Perkebunan Arboria</h1><p>${escapeHtml(title)}</p><p>Periode: ${escapeHtml(period)}</p><p>Tanggal cetak: ${escapeHtml(printedAt)}</p></header><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>${totals ? `<div class="totals">${totals}</div>` : ''}<div class="signature"><div>Dibuat oleh</div><div>Disetujui oleh</div></div><div class="footer"><span>Perkebunan Arboria &middot; ${escapeHtml(title)}</span><span>Halaman <b class="page-number"></b></span></div><script>window.onload=()=>window.print();</script></body></html>`);
  printWindow.document.close();
}
function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}
function switchView(viewName) {
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `${viewName}-view`));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
  document.querySelector('#breadcrumb-label').textContent = { dashboard: 'Dashboard', employees: 'Data karyawan', attendance: 'Absensi', payroll: 'Penggajian dan Pengupahan', journal: 'Jurnal Umum', ledger: 'Buku Besar' }[viewName] || 'Dashboard';
  if (viewName === 'payroll') renderPayroll();
  if (viewName === 'employees') renderEmployees();
  if (viewName === 'attendance') renderAttendance();
}
function fieldMarkup(label, name, { type = 'text', required = true, value = '', placeholder = '', min = '', step = '', full = false, options = null, hint = '', readonly = false, containerId = '' } = {}) {
  const className = full ? 'form-field full' : 'form-field';
  const attr = `${required ? 'required' : ''} ${min !== '' ? `min="${min}"` : ''} ${step ? `step="${step}"` : ''} ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''} ${readonly ? 'readonly' : ''}`;
  const control = options ? `<select id="field-${name}" name="${name}" ${required ? 'required' : ''}>${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.selected ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>` : `<input id="field-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${attr}>`;
  return `<div${containerId ? ` id="${escapeHtml(containerId)}"` : ''} class="${className}"><label for="field-${name}">${label}</label>${control}${hint ? `<span class="form-help">${hint}</span>` : ''}</div>`;
}
function openModal(kind, existing = null) {
  const backdrop = document.querySelector('#modal-backdrop');
  const title = document.querySelector('#modal-title');
  const eyebrow = document.querySelector('#modal-eyebrow');
  const form = document.querySelector('#modal-form');
  form.oninput = null;
  if (kind === 'cancel') {
    eyebrow.textContent = 'BATAL TRANSAKSI';
    title.textContent = 'Batalkan transaksi';
    form.innerHTML = `<div class="form-grid"><p class="form-help full">Transaksi ${escapeHtml(existing?.kind === 'salary' ? 'gaji' : 'upah')} ${escapeHtml(employeeFor(existing || {}).full_name)} akan dikunci dengan status Dibatalkan. Sistem membuat jurnal pembalik untuk seluruh jurnal terkait.</p>${fieldMarkup('Alasan pembatalan', 'reason', { type: 'text', full: true, placeholder: 'Wajib diisi' })}<div class="form-error" id="form-error"></div><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Kembali</button><button type="submit" class="button button-primary">Batalkan transaksi</button></div></div>`;
  } else if (kind === 'correction') {
    const baseline = correctionBaseline(existing);
    const isSalary = existing.kind === 'salary';
    const correctionUnit = existing.unit || harvestBlockFor(existing.block_code || employeeFor(existing).division).unit || 'satuan';
    eyebrow.textContent = 'KOREKSI NOMINAL';
    title.textContent = `Koreksi ${isSalary ? 'gaji staf' : 'upah panen'}`;
    const correctionFields = isSalary
      ? `${fieldMarkup('Gaji pokok yang benar (Rp)', 'basic_salary', { type: 'number', min: '0', step: '0.01', value: baseline.basic_salary })}${fieldMarkup('Tunjangan yang benar (Rp)', 'allowances', { type: 'number', min: '0', step: '0.01', value: baseline.allowances })}${fieldMarkup('Potongan yang benar (Rp)', 'deductions', { type: 'number', min: '0', step: '0.01', value: baseline.deductions })}`
      : `${fieldMarkup(`Jumlah panen yang benar (${correctionUnit})`, 'weight_kg', { type: 'number', min: '0.01', step: '0.01', value: baseline.weight_kg })}${fieldMarkup(`Tarif per ${correctionUnit} yang benar (Rp)`, 'rate_per_kg', { type: 'number', min: '0', step: '0.01', value: baseline.rate_per_kg })}`;
    form.innerHTML = `<div class="form-grid"><p class="form-help full">Isi nilai yang benar. Sistem mencatat jurnal hanya sebesar selisih. Jika belum dibayar, koreksi akan digabung ke pembayaran dan slip asli; jika sudah dibayar, selisih positif dibayar dengan slip tambahan.</p>${correctionFields}<div id="correction-preview" class="form-help full"></div>${fieldMarkup('Alasan koreksi', 'reason', { full: true, placeholder: 'Wajib diisi' })}<div class="form-error" id="form-error"></div><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Kembali</button><button type="submit" class="button button-primary">Simpan koreksi</button></div></div>`;
    const updatePreview = () => {
      const value = (name) => Number(form.querySelector(`[name="${name}"]`)?.value || 0);
      let deltas;
      let netDelta;
      if (isSalary) {
        deltas = [
          ['Selisih gaji pokok', value('basic_salary') - baseline.basic_salary],
          ['Selisih tunjangan', value('allowances') - baseline.allowances],
          ['Selisih potongan', value('deductions') - baseline.deductions]
        ];
        netDelta = deltas[0][1] + deltas[1][1] - deltas[2][1];
      } else {
        deltas = [['Selisih upah panen', roundAmount(value('weight_kg') * value('rate_per_kg') - baseline.weight_kg * baseline.rate_per_kg)]];
        netDelta = deltas[0][1];
      }
      const label = existing.status === 'paid' && netDelta < 0
        ? `Kelebihan bayar ${formatMoney(Math.abs(netDelta))}`
        : existing.status === 'paid' && netDelta > 0
          ? 'Tambahan utang akan menunggu pembayaran'
          : `Selisih bersih ${formatSignedMoney(netDelta)}`;
      form.querySelector('#correction-preview').innerHTML = `<strong>Pratinjau selisih</strong><br>${deltas.map(([name, amount]) => `${name}: ${formatSignedMoney(amount)}`).join('<br>')}<br><strong>${escapeHtml(label)}</strong>`;
    };
    form.oninput = updatePreview;
    updatePreview();
  } else if (kind === 'transaction-detail') {
    eyebrow.textContent = 'RIWAYAT AKTIVITAS';
    title.textContent = 'Detail transaksi';
    const audit = state.data.auditTrail.filter((item) => item.transaction_id === existing?.id);
    const events = audit.map((item) => `<li><strong>${escapeHtml(item.action.toUpperCase())} · ${escapeHtml(item.actor || 'Admin Arboria')}</strong><small>${escapeHtml(new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.occurred_at)))}</small>${item.reason ? `<small class="audit-reason">Alasan: ${escapeHtml(item.reason)}</small>` : ''}${item.slip_number ? `<small>No. slip: ${escapeHtml(item.slip_number)}</small>` : ''}</li>`).join('');
    const source = existing?.is_correction
      ? [...state.data.salaries, ...state.data.harvests].find((item) => item.id === existing.original_transaction_id)
      : existing;
    const corrections = source
      ? state.data.corrections.filter((item) => item.original_transaction_id === source.id)
      : [];
    const finalValues = source ? correctionBaseline(source) : null;
    const isSalary = existing?.kind === 'salary';
    const originalValues = source || existing;
    const employeeHomeBlock = employeeFor(source || existing || {}).division;
    const harvestBlockCode = originalValues?.block_code || employeeHomeBlock || '—';
    const harvestBlock = harvestBlockFor(harvestBlockCode);
    const harvestCommodity = originalValues?.commodity || harvestBlock.commodity || 'Belum diatur';
    const harvestUnit = originalValues?.unit || harvestBlock.unit || 'Belum diatur';
    const harvestUnitLabel = harvestUnit === 'Belum diatur' ? 'satuan' : harvestUnit;
    const valueRows = isSalary
      ? [
          ['Gaji pokok', formatMoney(originalValues?.basic_salary || 0), formatMoney(finalValues?.basic_salary ?? originalValues?.basic_salary ?? 0)],
          ['Tunjangan', formatMoney(originalValues?.allowances || 0), formatMoney(finalValues?.allowances ?? originalValues?.allowances ?? 0)],
          ['Potongan', formatMoney(originalValues?.deductions || 0), formatMoney(finalValues?.deductions ?? originalValues?.deductions ?? 0)]
        ]
      : [
          ['Blok panen', harvestBlockCode, harvestBlockCode],
          ['Komoditas', harvestCommodity, harvestCommodity],
          ['Jumlah panen', `${number.format(originalValues?.weight_kg || 0)} ${harvestUnit}`, `${number.format(finalValues?.weight_kg ?? originalValues?.weight_kg ?? 0)} ${harvestUnit}`],
          [`Tarif per ${harvestUnitLabel}`, formatMoney(originalValues?.rate_per_kg || 0), formatMoney(finalValues?.rate_per_kg ?? originalValues?.rate_per_kg ?? 0)]
        ];
    const blockMovementNote = !isSalary && harvestBlockCode !== employeeHomeBlock && employeeHomeBlock
      ? `<p class="form-help full"><span class="block-transfer-label">Dipindah dari ${escapeHtml(employeeHomeBlock)}</span></p>`
      : '';
    const correctionNote = corrections.map((item) =>
      `${item.slip_number || 'Tanpa slip tersendiri'} (${item.status === 'overpaid'
        ? `kelebihan bayar ${formatMoney(Math.abs(Number(item.net_amount || 0)))}`
        : item.reason || 'koreksi'})`).join(', ');
    const correctionHistory = corrections.map((item) => {
      const changes = isSalary
        ? `Pokok ${formatSignedMoney(item.delta_basic_salary)} · Tunjangan ${formatSignedMoney(item.delta_allowances)} · Potongan ${formatSignedMoney(item.delta_deductions)}`
        : `Upah ${formatSignedMoney(item.delta_gross)}`;
      const evidence = item.slip_number || (item.paid_with_original ? source?.slip_number : null) || '—';
      return `<tr><td>${escapeHtml(formatDate(item.correction_date))}</td><td>${escapeHtml(item.reason || '—')}</td><td>${escapeHtml(changes)}</td><td>${escapeHtml(evidence)}</td><td>${formatSignedMoney(item.net_amount)}</td></tr>`;
    }).join('');
    const valueSummary = `<section class="full"><h3>Nilai transaksi</h3><div class="table-scroll"><table><thead><tr><th>KOMPONEN</th><th>ASLI</th><th>NILAI AKHIR</th></tr></thead><tbody>${valueRows.map(([label, originalValue, finalValue]) => `<tr><td>${label}</td><td>${originalValue}</td><td>${finalValue}</td></tr>`).join('')}</tbody></table></div>${corrections.length ? `<h3>Riwayat koreksi</h3><div class="table-scroll"><table><thead><tr><th>TANGGAL</th><th>ALASAN</th><th>RINCIAN SELISIH</th><th>NO. SLIP</th><th>SELISIH BERSIH</th></tr></thead><tbody>${correctionHistory}</tbody></table></div>` : ''}</section>`;
    const dicatatOleh = audit.find((item) => item.action === 'dicatat')?.actor || '—';
    const dikoreksiOleh = audit.find((item) => item.action === 'dikoreksi')?.actor || '—';
    const dibatalkanOleh = audit.find((item) => item.action === 'dibatalkan')?.actor || '—';
    form.innerHTML = `<div class="form-grid"><p class="form-help full">${escapeHtml(employeeFor(existing || {}).full_name)} · ${escapeHtml(existing?.kind === 'salary' ? 'Gaji staf' : 'Upah panen')} · ${escapeHtml(monthLabel(periodFor(existing || {})))}</p><p class="form-help full">Nomor slip: <strong>${escapeHtml(existing?.slip_number || '—')}</strong>${existing?.is_correction && source ? ` · Koreksi atas ${escapeHtml(source.slip_number || '—')}` : ''}</p>${correctionNote ? `<p class="form-help full">Riwayat koreksi: ${escapeHtml(correctionNote)}</p>` : ''}${blockMovementNote}${valueSummary}<p class="form-help full">Dicatat oleh: ${escapeHtml(dicatatOleh)} · Dikoreksi oleh: ${escapeHtml(dikoreksiOleh)} · Dibatalkan oleh: ${escapeHtml(dibatalkanOleh)}</p><ul class="audit-list full">${events || '<li>Riwayat transaksi belum tersedia.</li>'}</ul><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Tutup</button>${!existing?.is_correction && existing?.status !== 'cancelled' ? `<button type="button" class="button button-secondary" data-correct-detail="${escapeHtml(existing.id)}">Koreksi</button><button type="button" class="button button-primary" data-cancel-detail="${escapeHtml(existing.id)}">Batal</button>` : ''}</div></div>`;
  } else if (kind === 'attendance-detail') {
    eyebrow.textContent = isYearSelection(existing.period) ? 'DETAIL ABSENSI TAHUNAN' : 'DETAIL ABSENSI BULANAN';
    title.textContent = `${existing.employee.full_name} · ${selectionLabel(existing.period)}`;
    const entries = state.data.dailyAttendance.filter((item) => item.employee_id === existing.employee.id && reportPeriodMatches(item.attendance_date, existing.period))
      .sort((left, right) => left.attendance_date.localeCompare(right.attendance_date));
    const label = { present: 'Hadir', leave: 'Izin', absent: 'Alfa' };
    const legacyRows = state.data.attendance.filter((item) => item.employee_id === existing.employee.id
      && reportPeriodMatches(item.period_id, existing.period)
      && !state.data.dailyAttendance.some((daily) => daily.employee_id === item.employee_id && daily.attendance_date.slice(0, 7) === item.period_id))
      .map((legacy) => {
        const monthPrefix = isYearSelection(existing.period) ? `${monthLabel(legacy.period_id)} · ` : '';
        return `<tr><td>${escapeHtml(monthPrefix)}Hari hadir (rekap historis)</td><td>${Number(legacy.working_days)}</td></tr><tr><td>${escapeHtml(monthPrefix)}Izin (rekap historis)</td><td>${Number(legacy.leave_days)}</td></tr><tr><td>${escapeHtml(monthPrefix)}Alfa (rekap historis)</td><td>${Number(legacy.absent_days)}</td></tr>`;
      }).join('');
    form.innerHTML = `<div class="table-scroll"><table><thead><tr><th>TANGGAL / KETERANGAN</th><th>STATUS / JUMLAH</th></tr></thead><tbody>${entries.map((entry) => `<tr><td>${escapeHtml(formatDate(entry.attendance_date))}</td><td><span class="attendance-status ${entry.status}">${label[entry.status]}</span></td></tr>`).join('')}${legacyRows}</tbody></table></div><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Tutup</button></div>`;
  } else if (kind === 'journal-detail') {
    eyebrow.textContent = 'DETAIL JURNAL';
    title.textContent = journalEvidence(existing);
    const lines = journalLines(existing).map((line) => {
      const credit = Number(line.credit || 0) > 0;
      return `<tr class="${credit ? 'journal-credit-row' : ''}"><td>${escapeHtml(line.account_code)} · ${escapeHtml((line.accounts || getAccount(line.account_code)).name)}</td><td>${Number(line.debit) ? formatMoney(line.debit) : '—'}</td><td>${Number(line.credit) ? formatMoney(line.credit) : '—'}</td></tr>`;
    }).join('');
    form.innerHTML = `<div class="form-grid"><p class="form-help full">${escapeHtml(formatDate(journalDate(existing)))} · ${escapeHtml(existing.description)}</p><table class="full"><thead><tr><th>AKUN</th><th>DEBIT</th><th>KREDIT</th></tr></thead><tbody>${lines}</tbody></table><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Tutup</button></div></div>`;
  } else if (kind === 'employee') {
    eyebrow.textContent = 'DATA TENAGA KERJA';
    title.textContent = existing ? 'Edit karyawan' : 'Tambah karyawan';
    const initialEmployeeCode = existing?.employee_code || 'STF-';
    const employeeBlockOptions = (selectedDivision, preserveLegacyDivision = false) => {
      const selectedBlock = HARVEST_BLOCK_DETAILS.find((block) => block.code === selectedDivision
        || `${block.code} - ${block.commodity}` === selectedDivision);
      if (!selectedBlock && preserveLegacyDivision && selectedDivision) {
        return [
          { value: selectedDivision, label: selectedDivision, selected: true },
          ...HARVEST_BLOCK_DETAILS.map((block) => ({ value: block.code, label: `${block.code} - ${block.commodity}` }))
        ];
      }
      const selectedCode = selectedBlock?.code || HARVEST_BLOCK_DETAILS[0].code;
      return HARVEST_BLOCK_DETAILS.map((block) => ({
        value: block.code,
        label: `${block.code} - ${block.commodity}`,
        selected: block.code === selectedCode
      }));
    };
    const divisionField = (employmentType, division, preserveLegacyDivision = false) => fieldMarkup(
      'Divisi / blok kebun',
      'division',
      employmentType === 'harvester'
        ? { options: employeeBlockOptions(division, preserveLegacyDivision), containerId: 'division-field' }
        : { value: division, placeholder: 'Contoh: Administrasi', containerId: 'division-field' }
    );
    const initialEmploymentType = existing?.employment_type || 'staff';
    const initialDivision = existing?.division || '';
    form.innerHTML = `<div class="form-grid">${fieldMarkup('Nama lengkap', 'full_name', { value: existing?.full_name || '', placeholder: 'Contoh: Siti Rahmawati' })}${fieldMarkup('ID karyawan', 'employee_code', { value: initialEmployeeCode, placeholder: 'Contoh: STF-004' })}${fieldMarkup('Jenis tenaga kerja', 'employment_type', { options: [{ value: 'staff', label: 'Staf bergaji bulanan', selected: initialEmploymentType === 'staff' }, { value: 'harvester', label: 'Pemanen lapangan', selected: initialEmploymentType === 'harvester' }] })}${divisionField(initialEmploymentType, initialDivision, initialEmploymentType === 'harvester') }<div class="form-field full" id="salary-field">${fieldMarkup('Gaji pokok bulanan (Rp)', 'monthly_salary', { type: 'number', min: '0', step: '1000', value: initialEmploymentType === 'harvester' ? 0 : existing?.monthly_salary ?? '5000000', full: true })}</div><div class="form-error" id="form-error"></div><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Batal</button><button type="submit" class="button button-primary">${existing ? 'Simpan perubahan' : 'Simpan karyawan'}</button></div></div>`;
    const updateEmployeeTypeFields = (employmentType, preserveLegacyDivision = false) => {
      const divisionInput = form.querySelector('[name="division"]');
      const division = divisionInput?.value || initialDivision;
      form.querySelector('#division-field').outerHTML = divisionField(employmentType, division, preserveLegacyDivision);
      const isStaff = employmentType === 'staff';
      form.querySelector('#salary-field').hidden = !isStaff;
      if (!isStaff) form.querySelector('[name="monthly_salary"]').value = '0';
      const codeInput = form.querySelector('[name="employee_code"]');
      const prefix = isStaff ? 'STF-' : 'PNN-';
      codeInput.value = prefix + codeInput.value.replace(/^(STF-|PNN-)/, '');
    };
    form.querySelector('[name="employment_type"]').addEventListener('change', (event) => {
      updateEmployeeTypeFields(event.target.value);
    });
    updateEmployeeTypeFields(initialEmploymentType, initialEmploymentType === 'harvester');
  } else if (kind === 'attendance') {
    const editing = Boolean(existing);
    eyebrow.textContent = 'KEHADIRAN TENAGA KERJA';
    title.textContent = editing ? 'Edit absensi' : 'Catat absensi';
    const employees = state.data.employees.filter((employee) => !employee.archived_at || employee.id === existing?.employee_id).map((employee) => ({
      value: employee.id,
      label: `${employee.full_name} · ${employee.employee_code}`,
      selected: employee.id === existing?.employee_id
    }));
    const period = existing?.period_id || currentPeriod();
    const employeeField = employees.length
      ? fieldMarkup('Karyawan', 'employee_id', { options: employees, full: true })
      : '<div class="form-field full"><span class="form-help">Belum ada karyawan. Tambahkan karyawan terlebih dahulu.</span></div>';
    form.innerHTML = `<div class="form-grid">${employeeField}${fieldMarkup('Periode', 'period', { type: 'month', value: period })}${fieldMarkup('Hari kerja', 'working_days', { type: 'number', min: '0', step: '1', value: existing?.working_days ?? '22' })}${fieldMarkup('Izin', 'leave_days', { type: 'number', min: '0', step: '1', value: existing?.leave_days ?? '0' })}${fieldMarkup('Alfa', 'absent_days', { type: 'number', min: '0', step: '1', value: existing?.absent_days ?? '0' })}<div class="form-error" id="form-error"></div><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Batal</button><button type="submit" class="button button-primary">${editing ? 'Simpan perubahan' : 'Simpan absensi'}</button></div></div>`;
  } else {
    const isSalary = kind === 'salary';
    const editing = Boolean(existing);
    const people = state.data.employees.filter((employee) => !employee.archived_at && employee.employment_type === (isSalary ? 'staff' : 'harvester'));
    eyebrow.textContent = isSalary ? 'GAJI BULANAN TETAP' : 'UPAH BERDASARKAN HASIL PANEN';
    title.textContent = editing ? `Edit ${isSalary ? 'gaji staf' : 'hasil panen'}` : isSalary ? 'Catat gaji staf' : 'Catat hasil panen';
    const employeeOptions = people.map((employee) => ({ value: employee.id, label: `${employee.full_name} · ${employee.employee_code}`, selected: employee.id === existing?.employee_id }));
    const defaultPeriod = isYearSelection(state.selectedPeriod) ? `${state.selectedPeriod.slice(5)}-01` : state.selectedPeriod || currentPeriod();
    const period = existing ? periodFor(existing) : defaultPeriod;
    const employeeField = employeeOptions.length ? fieldMarkup('Karyawan', 'employee_id', { options: employeeOptions, full: true }) : '<div class="form-field full"><span class="form-help">Belum ada karyawan untuk skema ini. Tambahkan karyawan terlebih dahulu.</span></div>';
    const employeeBlockCode = people.find((employee) => employee.id === existing?.employee_id)?.division || people[0]?.division;
    const initialBlockCode = (existing?.block_code && state.data.harvestBlocks.some((block) => block.code === existing.block_code)
      ? existing.block_code
      : state.data.harvestBlocks.some((block) => block.code === employeeBlockCode) ? employeeBlockCode : state.data.harvestBlocks[0]?.code)
      || '';
    const blockOptions = isSalary ? [] : state.data.harvestBlocks.map((block) => ({
      value: block.code,
      label: `${block.code} - ${harvestBlockFor(block.code).commodity || 'Komoditas belum diatur'}`,
      selected: block.code === initialBlockCode
    }));
    const detailFields = isSalary
      ? `${fieldMarkup('Tanggal gaji', 'payment_date', { type: 'date', value: existing?.payment_date || periodEndDate(period), hint: 'Default: hari terakhir periode gaji.' })}${fieldMarkup('Gaji pokok (Rp)', 'basic_salary', { type: 'number', min: '0', step: '1000', value: existing?.basic_salary ?? people[0]?.monthly_salary ?? '0' })}${fieldMarkup('Tunjangan (Rp)', 'allowances', { type: 'number', min: '0', step: '1000', value: existing?.allowances ?? '0' })}${fieldMarkup('Potongan (Rp)', 'deductions', { type: 'number', min: '0', step: '1000', value: existing?.deductions ?? '0' })}`
      : `${fieldMarkup('Blok panen', 'block_code', { options: blockOptions, full: true })}${fieldMarkup('Komoditas', 'commodity_display', { required: false, value: harvestBlockFor(initialBlockCode).commodity || 'Belum diatur', readonly: true })}${fieldMarkup(`Jumlah panen (${harvestBlockFor(initialBlockCode).unit || 'satuan'})`, 'weight_kg', { type: 'number', min: '0.1', step: '0.1', value: existing?.weight_kg ?? '', placeholder: 'Masukkan jumlah panen' })}${fieldMarkup(`Tarif per ${harvestBlockFor(initialBlockCode).unit || 'satuan'} (Rp)`, 'rate_per_kg', { type: 'number', min: '0', step: 'any', value: existing?.rate_per_kg ?? harvestBlockFor(initialBlockCode).standard_rate ?? '', hint: harvestBlockFor(initialBlockCode).standard_rate == null ? 'Tarif standar blok belum diatur; isi tarif untuk transaksi ini.' : 'Tarif standar blok dapat diubah.' })}${fieldMarkup('Tanggal panen', 'harvest_date', { type: 'date', value: existing?.harvest_date || dateForPeriod(period) })}`;
    const total = isSalary ? '<span class="form-total full"><span>Gaji bersih diterima</span><strong id="computed-total">Rp0</strong></span>' : '<span class="form-total full"><span>Perkiraan upah panen</span><strong id="computed-total">Rp0</strong></span>';
    form.innerHTML = `<div class="form-grid">${employeeField}${fieldMarkup('Periode', 'period', { type: 'month', value: period })}${detailFields}${total}${fieldMarkup('Status', 'status', { options: [{ value: 'pending', label: 'Menunggu pembayaran', selected: existing?.status !== 'paid' }, { value: 'paid', label: 'Dibayar', selected: existing?.status === 'paid' }], full: true })}<div class="form-error" id="form-error"></div><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Batal</button><button type="submit" class="button button-primary">${editing ? 'Simpan perubahan' : 'Simpan transaksi'}</button></div></div>`;
    form.querySelector('[name="period"]').addEventListener('change', (event) => {
      if (isSalary) {
        form.querySelector('[name="payment_date"]').value = periodEndDate(event.target.value);
      } else {
        const harvestDate = form.querySelector('[name="harvest_date"]');
        harvestDate.value = dateForPeriod(event.target.value, Number(harvestDate.value.slice(-2)) || new Date().getDate());
      }
    });
    const updateTotal = () => {
      const value = (name) => Number(form.querySelector(`[name="${name}"]`)?.value || 0);
      const amount = isSalary ? value('basic_salary') + value('allowances') - value('deductions') : value('weight_kg') * value('rate_per_kg');
      form.querySelector('#computed-total').textContent = formatMoney(Math.max(0, amount));
    };
    if (isSalary) {
      form.querySelector('[name="employee_id"]').addEventListener('change', (event) => {
        const selectedEmployee = people.find((employee) => employee.id === event.target.value);
        if (selectedEmployee) {
          form.querySelector('[name="basic_salary"]').value = String(Number(selectedEmployee.monthly_salary) || 0);
        }
        updateTotal();
      });
    } else {
      const updateBlockFields = (blockCode, applyStandardRate) => {
        const block = harvestBlockFor(blockCode);
        const unit = block.unit || 'satuan';
        form.querySelector('[name="commodity_display"]').value = block.commodity || 'Belum diatur';
        form.querySelector('label[for="field-weight_kg"]').textContent = `Jumlah panen (${unit})`;
        form.querySelector('label[for="field-rate_per_kg"]').textContent = `Tarif per ${unit} (Rp)`;
        form.querySelector('[name="rate_per_kg"]').closest('.form-field').querySelector('.form-help').textContent =
          block.standard_rate == null ? 'Tarif standar blok belum diatur; isi tarif untuk transaksi ini.' : 'Tarif standar blok dapat diubah.';
        if (applyStandardRate) form.querySelector('[name="rate_per_kg"]').value = block.standard_rate == null ? '' : String(block.standard_rate);
      };
      form.querySelector('[name="block_code"]').addEventListener('change', (event) => {
        updateBlockFields(event.target.value, true);
        updateTotal();
      });
      form.querySelector('[name="employee_id"]').addEventListener('change', (event) => {
        if (existing) return;
        const employee = people.find((item) => item.id === event.target.value);
        const blockOption = [...form.querySelector('[name="block_code"]').options].find((item) => item.value === employee?.division);
        if (blockOption) {
          form.querySelector('[name="block_code"]').value = employee.division;
          updateBlockFields(employee.division, true);
          updateTotal();
        }
      });
    }
    form.oninput = updateTotal;
    updateTotal();
  }
  form.dataset.kind = kind;
  form.dataset.recordId = existing?.id || '';
  form.dataset.recordKind = existing?.kind || '';
  backdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  form.querySelector('input, select')?.focus();
}
function closeModal() {
  document.querySelector('#modal-backdrop').hidden = true;
  document.body.style.overflow = '';
}
async function submitForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const kind = form.dataset.kind;
  const formData = Object.fromEntries(new FormData(form).entries());
  const errorNode = form.querySelector('#form-error');
  errorNode.textContent = '';
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    if (kind === 'correction') {
      const source = transactions().find((item) => item.id === form.dataset.recordId && !item.is_correction);
      if (!source || source.status === 'cancelled') throw new Error('Transaksi tidak ditemukan atau sudah dibatalkan.');
      const reason = String(formData.reason || '').trim();
      if (!reason) throw new Error('Alasan koreksi wajib diisi.');
      const isSalary = source.kind === 'salary';
      const values = isSalary
        ? {
            basic_salary: Number(formData.basic_salary),
            allowances: Number(formData.allowances),
            deductions: Number(formData.deductions)
          }
        : { weight_kg: Number(formData.weight_kg), rate_per_kg: Number(formData.rate_per_kg) };
      if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)
        || (!isSalary && values.weight_kg <= 0)) {
        throw new Error('Nilai koreksi harus berupa angka yang valid dan tidak negatif.');
      }
      const baseline = correctionBaseline(source);
      const deltaBasic = isSalary ? values.basic_salary - baseline.basic_salary : 0;
      const deltaAllowances = isSalary ? values.allowances - baseline.allowances : 0;
      const deltaDeductions = isSalary ? values.deductions - baseline.deductions : 0;
      const deltaGross = isSalary ? 0 : roundAmount(values.weight_kg * values.rate_per_kg - baseline.weight_kg * baseline.rate_per_kg);
      const netAmount = isSalary ? deltaBasic + deltaAllowances - deltaDeductions : deltaGross;
      const hasChange = isSalary
        ? deltaBasic !== 0 || deltaAllowances !== 0 || deltaDeductions !== 0
        : deltaGross !== 0;
      if (!hasChange) throw new Error('Tidak ada perubahan nilai untuk dikoreksi.');
      if (isSalary && values.deductions > values.basic_salary + values.allowances) {
        throw new Error('Potongan tidak boleh melebihi gaji pokok dan tunjangan.');
      }
      const resultingAmount = isSalary
        ? values.basic_salary + values.allowances - values.deductions
        : values.weight_kg * values.rate_per_kg;
      if (source.status === 'pending' && resultingAmount < 0) {
        throw new Error('Jumlah bersih setelah koreksi tidak boleh kurang dari nol.');
      }
      if (state.demo) {
        const now = new Date().toISOString();
        const correction = {
          id: `demo-${crypto.randomUUID()}`,
          transaction_kind: source.kind,
          original_transaction_id: source.id,
          employee_id: source.employee_id,
          period_id: source.period_id,
          correction_date: now.slice(0, 10),
          correction_values: values,
          delta_basic_salary: deltaBasic,
          delta_allowances: deltaAllowances,
          delta_deductions: deltaDeductions,
          delta_gross: deltaGross,
          net_amount: netAmount,
          reason,
          status: source.status === 'pending' ? 'pending' : netAmount > 0 ? 'pending' : netAmount < 0 ? 'overpaid' : 'paid',
          paid_at: source.status === 'paid' && netAmount === 0 ? now : null,
          paid_with_original: false,
          created_at: now,
          employees: employeeFor(source)
        };
        state.data.corrections.unshift(correction);
        state.data.auditTrail.push(
          { transaction_id: source.id, transaction_kind: source.kind, action: 'dikoreksi', actor: 'Admin Arboria', reason, slip_number: null, occurred_at: now },
          { transaction_id: correction.id, transaction_kind: source.kind, action: 'dicatat', actor: 'Admin Arboria', reason, slip_number: null, occurred_at: now }
        );
        if (correction.status === 'overpaid') {
          state.data.auditTrail.push({ transaction_id: correction.id, transaction_kind: source.kind, action: 'dikoreksi', actor: 'Admin Arboria', reason: `Kelebihan bayar ${formatMoney(Math.abs(netAmount))}`, slip_number: null, occurred_at: now });
        } else if (correction.status === 'paid') {
          state.data.auditTrail.push({ transaction_id: correction.id, transaction_kind: source.kind, action: 'dibayar', actor: 'Admin Arboria', slip_number: null, occurred_at: now });
        }
        state.data.journals = buildDemoJournals(state.data);
        persistDemo();
      } else if (backendApiBase() === null) {
        await supabaseRequest('rpc/correct_payroll_transaction', '', 'POST', {
          transaction_type: source.kind,
          transaction_key: source.id,
          correction_values: values,
          reason
        });
        await loadData();
      } else {
        await postJson(`/api/${isSalary ? 'salaries' : 'harvests'}/${encodeURIComponent(source.id)}/correct`, { values, reason });
        await loadData();
      }
      state.selectedPeriod = periodFor(source);
      render();
      closeModal();
      showToast(source.status === 'pending'
        ? 'Koreksi disimpan; pembayaran akan memakai nilai akhir pada satu slip.'
        : 'Koreksi dan jurnal selisih berhasil disimpan.');
      return;
    }
    if (kind === 'cancel') {
      const displayedEntry = transactions().find((item) => item.id === form.dataset.recordId);
      if (!displayedEntry || displayedEntry.is_correction || displayedEntry.status === 'cancelled') throw new Error('Transaksi tidak ditemukan atau sudah dibatalkan.');
      const sourceEntries = displayedEntry.kind === 'salary' ? state.data.salaries : state.data.harvests;
      const sourceEntry = sourceEntries.find((item) => item.id === displayedEntry.id);
      if (!sourceEntry) throw new Error('Transaksi tidak ditemukan.');
      const entry = { ...displayedEntry };
      const reason = String(formData.reason || '').trim();
      if (!reason) throw new Error('Alasan pembatalan wajib diisi.');
      if (state.demo) {
        Object.assign(sourceEntry, { cancelled_at: new Date().toISOString(), status: 'cancelled', cancellation_reason: reason, cancelled_by: 'Admin Arboria' });
        Object.assign(entry, sourceEntry);
        state.data.auditTrail.push({
          transaction_id: entry.id, transaction_kind: entry.kind, action: 'dibatalkan',
          actor: 'Admin Arboria', reason, slip_number: entry.slip_number, occurred_at: new Date().toISOString()
        });
        for (const correction of state.data.corrections.filter((item) => item.original_transaction_id === entry.id && item.status !== 'cancelled')) {
          correction.status = 'cancelled';
          state.data.auditTrail.push({
            transaction_id: correction.id, transaction_kind: entry.kind, action: 'dibatalkan',
            actor: 'Admin Arboria', reason, slip_number: correction.slip_number, occurred_at: new Date().toISOString()
          });
        }
        state.data.journals = buildDemoJournals(state.data);
        persistDemo();
      } else {
        const pluralKind = entry.kind === 'salary' ? 'salaries' : 'harvests';
        if (backendApiBase() === null) {
          await supabaseRequest('rpc/cancel_payroll_transaction', '', 'POST', {
            transaction_type: entry.kind,
            transaction_key: entry.id,
            reason
          });
        } else {
          const response = await fetch(apiUrl(`/api/${pluralKind}/${encodeURIComponent(entry.id)}/cancel`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Pembatalan transaksi gagal.');
        }
        await loadData();
      }
      render();
      closeModal();
      showToast('Transaksi dibatalkan dan jurnal pembalik berhasil dibuat.');
      return;
    }
    if (kind === 'attendance') {
      const payload = {
        employee_id: formData.employee_id,
        period: formData.period,
        working_days: Number(formData.working_days),
        leave_days: Number(formData.leave_days),
        absent_days: Number(formData.absent_days)
      };
      const daysInMonth = new Date(Number(payload.period.slice(0, 4)), Number(payload.period.slice(5, 7)), 0).getDate();
      const dayValues = [payload.working_days, payload.leave_days, payload.absent_days];
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payload.period)
        || dayValues.some((value) => !Number.isInteger(value) || value < 0)
        || dayValues.reduce((sum, value) => sum + value, 0) > daysInMonth) {
        throw new Error(`Jumlah hari harus bilangan bulat nonnegatif dan totalnya tidak boleh melebihi ${daysInMonth} hari.`);
      }
      const attendanceId = form.dataset.recordId;
      if (state.demo) {
        const employee = state.data.employees.find((item) => item.id === payload.employee_id);
        if (attendanceId) {
          const existing = state.data.attendance.find((item) => item.id === attendanceId);
          if (!existing) throw new Error('Catatan absensi tidak ditemukan.');
          Object.assign(existing, payload, { employees: employee });
        } else {
          const duplicate = state.data.attendance.find((item) => item.employee_id === payload.employee_id && item.period_id === payload.period);
          if (duplicate) throw new Error('Absensi karyawan ini untuk periode tersebut sudah ada. Edit catatan yang sudah ada.');
          state.data.attendance.unshift({ ...payload, id: `demo-${crypto.randomUUID()}`, employees: employee, created_at: new Date().toISOString() });
        }
        persistDemo();
      } else if (attendanceId) {
        await patchJson(`/api/attendance/${encodeURIComponent(attendanceId)}`, payload);
        await loadData();
      } else {
        await postJson('/api/attendance', payload);
        await loadData();
      }
      state.selectedPeriod = payload.period;
      render();
      closeModal();
      showToast(attendanceId ? 'Perubahan absensi berhasil disimpan.' : 'Absensi berhasil disimpan.');
      return;
    }
    if (kind === 'employee') {
      const employee = { ...formData, monthly_salary: formData.employment_type === 'staff' ? Number(formData.monthly_salary || 0) : 0 };
      const requiredPrefix = employee.employment_type === 'staff' ? 'STF-' : 'PNN-';
      if (!String(employee.employee_code).startsWith(requiredPrefix) || String(employee.employee_code).trim().length <= requiredPrefix.length) {
        throw new Error(`ID karyawan harus menggunakan format ${requiredPrefix} diikuti nomor.`);
      }
      const employeeId = form.dataset.recordId;
      if (employeeId && state.demo) {
        const existing = state.data.employees.find((item) => item.id === employeeId);
        if (existing) Object.assign(existing, employee);
        persistDemo();
      } else if (employeeId) {
        await patchJson(`/api/employees/${encodeURIComponent(employeeId)}`, employee);
        await loadData();
      } else if (state.demo) {
        employee.id = `demo-${crypto.randomUUID()}`;
        state.data.employees.unshift(employee);
        persistDemo();
      } else {
        await postJson('/api/employees', employee);
        await loadData();      }
      state.employeeFilter = 'all';
      render();
      closeModal();
      showToast(employeeId ? 'Perubahan karyawan berhasil disimpan.' : 'Data karyawan berhasil disimpan.');
      return;
    }
    const isSalary = kind === 'salary';
    const selectedHarvestBlock = isSalary ? null : harvestBlockFor(formData.block_code);
    const harvestFormData = { ...formData };
    delete harvestFormData.commodity_display;
    const payload = isSalary
      ? { ...formData, basic_salary: Number(formData.basic_salary), allowances: Number(formData.allowances || 0), deductions: Number(formData.deductions || 0) }
      : {
          ...harvestFormData,
          block_code: formData.block_code,
          commodity: selectedHarvestBlock.commodity || null,
          unit: selectedHarvestBlock.unit || null,
          weight_kg: Number(formData.weight_kg),
          rate_per_kg: Number(formData.rate_per_kg),
          deductions: 0
        };
    const grossAmount = isSalary
      ? payload.basic_salary + payload.allowances
      : payload.weight_kg * payload.rate_per_kg;
    if (isSalary && payload.deductions > grossAmount) throw new Error('Potongan tidak boleh melebihi nilai kompensasi kotor.');
    if (!isSalary && payload.harvest_date.slice(0, 7) !== payload.period) {
      throw new Error('Tanggal panen harus berada dalam bulan periode yang dipilih.');
    }
    const recordId = form.dataset.recordId;
    if (recordId) {
      const entries = isSalary ? state.data.salaries : state.data.harvests;
      const existing = entries.find((entry) => entry.id === recordId);
      if (!existing) throw new Error('Transaksi tidak ditemukan.');
      const previousStatus = existing.status;
      if (state.demo) {
        let period = state.data.periods.find((item) => item.period === payload.period);
        if (!period) {
          period = { id: `period-${payload.period}`, period: payload.period, status: 'open' };
          state.data.periods.push(period);
        }
        const employee = state.data.employees.find((item) => item.id === payload.employee_id);
        Object.assign(existing, payload, {
          period_id: period.id, payroll_periods: period, employees: employee,
          total_amount: isSalary ? payload.basic_salary + payload.allowances - payload.deductions : payload.weight_kg * payload.rate_per_kg
        });
        if (payload.status !== previousStatus) existing.paid_at = payload.status === 'paid' ? new Date().toISOString() : null;
        persistDemo();
      } else {
        const changes = { ...payload };
        if (payload.status === existing.status) delete changes.status;
        await patchJson(`/api/${isSalary ? 'salaries' : 'harvests'}/${encodeURIComponent(recordId)}`, changes);
        await loadData();
      }
      state.selectedPeriod = payload.period;
      render();
      closeModal();
      showToast('Perubahan transaksi berhasil disimpan.');
      return;
    }
    if (state.demo) {
      let period = state.data.periods.find((item) => item.period === payload.period);
      if (!period) {
        period = { id: `period-${payload.period}`, period: payload.period, status: 'open' };
        state.data.periods.push(period);
      }
      const employee = state.data.employees.find((item) => item.id === payload.employee_id);
      const entry = { ...payload, id: `demo-${crypto.randomUUID()}`, period_id: period.id, employees: employee, payroll_periods: period, created_at: new Date().toISOString(), paid_at: payload.status === 'paid' ? new Date().toISOString() : null };
      if (isSalary) {
        entry.total_amount = payload.basic_salary + payload.allowances - payload.deductions;
        entry.paid_at = payload.status === 'paid' ? new Date().toISOString() : null;
        state.data.salaries.unshift(entry);
      } else {
        entry.total_amount = payload.weight_kg * payload.rate_per_kg;
        state.data.harvests.unshift(entry);
      }
      assignDemoSlipNumbers(isSalary ? state.data.salaries : state.data.harvests, isSalary ? 'GS' : 'UP', isSalary ? 'payment_date' : 'harvest_date');
      state.data.auditTrail.push({ transaction_id: entry.id, transaction_kind: isSalary ? 'salary' : 'harvest', action: 'dicatat', actor: 'Admin Arboria', occurred_at: entry.created_at });
      if (entry.status === 'paid') state.data.auditTrail.push({ transaction_id: entry.id, transaction_kind: isSalary ? 'salary' : 'harvest', action: 'dibayar', actor: 'Admin Arboria', occurred_at: entry.paid_at });
      state.data.journals = buildDemoJournals(state.data);
      persistDemo();
    } else {
      await postJson(isSalary ? '/api/salaries' : '/api/harvests', payload);
      await loadData();
    }
    state.selectedPeriod = payload.period;
    render();
    closeModal();
    showToast(isSalary ? 'Catatan gaji berhasil disimpan.' : 'Catatan panen dan perhitungan upah berhasil disimpan.');
  } catch (error) {
    const message = error.message || 'Transaksi gagal disimpan.';
    errorNode.textContent = /duplicate key|attendance_records_employee_period_key/i.test(message)
      ? 'Absensi karyawan ini untuk periode tersebut sudah ada. Edit catatan yang sudah ada.'
      : message;
  } finally {
    submitButton.disabled = false;
  }
}
async function postJson(url, body) {
  if (backendApiBase() === null) return directSupabaseMutation(url, 'POST', body);
  const response = await fetch(apiUrl(url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Permintaan gagal.');
  return result;
}
async function markTransactionPaid(kind, id, button) {
  const entries = kind === 'salary' ? state.data.salaries : state.data.harvests;
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;
  button.disabled = true;
  try {
    if (state.demo) {
      entry.status = 'paid';
      entry.paid_at = new Date().toISOString();
      assignDemoSlipNumbers(kind === 'salary' ? state.data.salaries : state.data.harvests,
        kind === 'salary' ? 'GS' : 'UP', kind === 'salary' ? 'payment_date' : 'harvest_date');
      state.data.auditTrail.push({ transaction_id: entry.id, transaction_kind: kind, action: 'dibayar', actor: 'Admin Arboria', slip_number: entry.slip_number, occurred_at: entry.paid_at });
      for (const correction of state.data.corrections.filter((item) =>
        item.original_transaction_id === entry.id && item.status === 'pending')) {
        correction.status = 'paid';
        correction.paid_at = entry.paid_at;
        correction.paid_with_original = true;
        correction.slip_number = null;
        state.data.auditTrail.filter((item) => item.transaction_id === correction.id)
          .forEach((item) => { item.slip_number = entry.slip_number; });
        state.data.auditTrail.push({ transaction_id: correction.id, transaction_kind: kind, action: 'dibayar', actor: 'Admin Arboria', slip_number: entry.slip_number, occurred_at: entry.paid_at });
      }
      state.data.journals = buildDemoJournals(state.data);
      persistDemo();
    } else {
      await patchJson(`/api/${kind === 'salary' ? 'salaries' : 'harvests'}/${encodeURIComponent(id)}`, { status: 'paid' });
      await loadData();
    }
    render();
    showToast('Status transaksi berhasil diubah menjadi dibayar.');
  } catch (error) {
    button.disabled = false;
    showToast(error.message || 'Status transaksi gagal diperbarui.');
  }
}
async function markCorrectionPaid(id, button) {
  const correction = state.data.corrections.find((item) => item.id === id);
  if (!correction || correction.status !== 'pending' || Number(correction.net_amount) <= 0) return;
  const source = [...state.data.salaries, ...state.data.harvests].find((item) => item.id === correction.original_transaction_id);
  if (!source || source.status !== 'paid') return;
  button.disabled = true;
  try {
    if (state.demo) {
      correction.status = 'paid';
      correction.paid_at = new Date().toISOString();
      correction.paid_with_original = false;
      assignDemoSlipNumbers([
        ...(correction.transaction_kind === 'salary' ? state.data.salaries : state.data.harvests),
        ...state.data.corrections.filter((item) => item.transaction_kind === correction.transaction_kind)
      ], correction.transaction_kind === 'salary' ? 'GS' : 'UP',
      correction.transaction_kind === 'salary' ? 'payment_date' : 'harvest_date');
      state.data.auditTrail.push({
        transaction_id: correction.id, transaction_kind: correction.transaction_kind,
        action: 'dibayar', actor: 'Admin Arboria', slip_number: correction.slip_number,
        occurred_at: correction.paid_at
      });
      state.data.journals = buildDemoJournals(state.data);
      persistDemo();
    } else if (backendApiBase() === null) {
      await supabaseRequest('rpc/payroll_correction_payment', '', 'POST', { correction_key: id });
      await loadData();
    } else {
      await postJson(`/api/corrections/${encodeURIComponent(id)}/pay`, {});
      await loadData();
    }
    render();
    showToast('Pembayaran koreksi berhasil dicatat.');
  } catch (error) {
    button.disabled = false;
    showToast(error.message || 'Pembayaran koreksi gagal dicatat.');
  }
}
async function saveDailyAttendance() {
  const date = document.querySelector('#attendance-date').value;
  const type = document.querySelector('#attendance-type-filter').value;
  const search = document.querySelector('#attendance-search').value.trim().toLowerCase();
  const employees = state.data.employees.filter((employee) => !employee.archived_at
    && (type === 'all' || employee.employment_type === type)
    && `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(search));
  if (!date) return showToast('Tanggal absensi wajib dipilih.');
  const records = employees.map((employee) => ({
    employee_id: employee.id,
    status: state.dailyStatuses[employee.id] || state.data.dailyAttendance.find((item) => item.employee_id === employee.id && item.attendance_date === date)?.status || ''
  }));
  if (!records.length) return showToast('Tidak ada karyawan pada filter yang dipilih.');
  if (records.some((record) => !record.status)) return showToast('Pilih status absensi untuk setiap karyawan yang ditampilkan.');
  try {
    if (state.demo) {
      for (const record of records) {
        const existing = state.data.dailyAttendance.find((item) => item.employee_id === record.employee_id && item.attendance_date === date);
        const employee = state.data.employees.find((item) => item.id === record.employee_id);
        if (existing) existing.status = record.status;
        else state.data.dailyAttendance.push({ ...record, attendance_date: date, id: `daily-${crypto.randomUUID()}`, recorded_by: 'Admin Arboria', employees: employee });
      }
      persistDemo();
    } else if (backendApiBase() === null) {
      await supabaseRequest('daily_attendance?on_conflict=employee_id,attendance_date', '', 'POST',
        records.map((record) => ({ ...record, attendance_date: date, recorded_by: 'Admin Arboria' })),
        'resolution=merge-duplicates,return=representation');
      await loadData();
    } else {
      const response = await fetch(apiUrl('/api/attendance/daily'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance_date: date, records })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Absensi gagal disimpan.');
      await loadData();
    }
    state.dailyStatuses = {};
    render();
    showToast('Absensi harian berhasil disimpan.');
  } catch (error) {
    showToast(error.message || 'Absensi harian gagal disimpan.');
  }
}
function printJournalReport() {
  const journals = matchingJournals(state.journalPeriod, state.journalType);
  const rows = journalBlocks(journals).map((block) => {
    const entries = journalBlockLines(block);
    return entries.map(({ journal, journalIndex, lineIndex, line }, index) => {
      const account = line.accounts || getAccount(line.account_code);
      const credit = Number(line.credit || 0) > 0;
      const startsSubjournal = block.isReversalGroup && journalIndex > 0 && lineIndex === 0;
      const rowClasses = [startsSubjournal ? 'journal-group-separator' : ''].filter(Boolean).join(' ');
      const header = index === 0
        ? `<td rowspan="${entries.length}">${escapeHtml(formatDate(journalDate(block.journals[0])))}</td><td rowspan="${entries.length}">${escapeHtml(journalEvidence(block.journals[0]))}</td><td rowspan="${entries.length}">${escapeHtml(journalTypeLabel(block.journals[0].journal_type))}</td><td rowspan="${entries.length}">${escapeHtml(journalBlockDescription(block))}</td>`
        : '';
      return `<tr class="${rowClasses}">${header}<td class="${credit ? 'journal-credit-account' : ''}">${escapeHtml(account.code)} · ${escapeHtml(account.name)}</td><td>${Number(line.debit) ? formatMoney(line.debit) : '—'}</td><td>${Number(line.credit) ? formatMoney(line.credit) : '—'}</td></tr>`;
    }).join('');
  }).join('');
  const totals = journalTotals(journals);
  printReport('Jurnal Umum', selectionLabel(state.journalPeriod), ['Tanggal', 'No. Slip', 'Jenis', 'Keterangan', 'Akun', 'Debit', 'Kredit'], rows,
    `Total debit: ${formatMoney(totals.debit)} · Total kredit: ${formatMoney(totals.credit)}`);
}
function printLedgerReport() {
  const { start, end } = periodDateRange(state.ledgerPeriod);
  const accounts = state.data.accounts.filter((account) => state.ledgerAccount === 'all' || account.code === state.ledgerAccount);
  const rows = accounts.flatMap((account) => {
    let balance = accountMovements(account, new Date(new Date(`${start}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)).balance;
    return ledgerEntriesForAccount(account, start, end)
      .map(({ journal, line }) => {
        balance += movementFor(line, account);
        return `<tr><td>${escapeHtml(formatDate(journalDate(journal)))}</td><td>${escapeHtml(journalEvidence(journal))}</td><td>${escapeHtml(journalTypeLabel(journal.journal_type))}</td><td>${escapeHtml(journal.description)}</td><td>${Number(line.debit) ? formatMoney(line.debit) : '—'}</td><td>${Number(line.credit) ? formatMoney(line.credit) : '—'}</td><td>${formatMoney(balance)}</td></tr>`;
      });
  }).join('');
  const totals = state.data.accounts.reduce((accumulator, account) => {
    const balance = account.normal_balance === 'debit' ? accountMovements(account).balance : -accountMovements(account).balance;
    accumulator.debit += Math.max(0, balance);
    accumulator.credit += Math.max(0, -balance);
    return accumulator;
  }, { debit: 0, credit: 0 });
  printReport('Buku Besar', selectionLabel(state.ledgerPeriod), ['Tanggal', 'No. Slip', 'Jenis', 'Keterangan', 'Debit', 'Kredit', 'Saldo'], rows,
    `Neraca saldo — Debit: ${formatMoney(totals.debit)} · Kredit: ${formatMoney(totals.credit)}`);
}
function printAttendanceReport() {
  const period = state.attendancePeriod;
  const type = document.querySelector('#attendance-report-type').value;
  const search = document.querySelector('#attendance-report-search').value.trim().toLowerCase();
  const byEmployee = new Map();
  for (const entry of attendancePeriodRecords(period)) {
    const summary = byEmployee.get(entry.employee_id) || { present: 0, leave: 0, absent: 0 };
    summary[entry.status] += 1;
    byEmployee.set(entry.employee_id, summary);
  }
  const legacyRows = state.data.attendance.filter((entry) => reportPeriodMatches(entry.period_id, period)
    && !state.data.dailyAttendance.some((daily) => daily.employee_id === entry.employee_id && daily.attendance_date.slice(0, 7) === entry.period_id));
  for (const entry of legacyRows) {
    const record = byEmployee.get(entry.employee_id) || { present: 0, leave: 0, absent: 0 };
    record.present += Number(entry.working_days || 0);
    record.leave += Number(entry.leave_days || 0);
    record.absent += Number(entry.absent_days || 0);
    byEmployee.set(entry.employee_id, record);
  }
  const rows = state.data.employees.filter((employee) =>
    (type === 'all' || employee.employment_type === type)
    && `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(search)).map((employee) => {
      const record = byEmployee.get(employee.id) || { present: 0, leave: 0, absent: 0 };
      return `<tr><td>${escapeHtml(employee.full_name)}</td><td>${escapeHtml(employee.employee_code)}</td><td>${employee.employment_type === 'staff' ? 'Staf' : 'Pemanen'}</td><td>${record.present}</td><td>${record.leave}</td><td>${record.absent}</td></tr>`;
    }).join('');
  printReport('Rekap Absensi', selectionLabel(period), ['Nama', 'ID', 'Jenis tenaga kerja', 'Hadir', 'Izin', 'Alfa'], rows);
}
async function patchJson(url, body) {
  if (backendApiBase() === null) return directSupabaseMutation(url, 'PATCH', body);
  const response = await fetch(apiUrl(url), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Permintaan gagal.');
  return result;
}
async function deleteJson(url) {
  if (backendApiBase() === null) return directSupabaseMutation(url, 'DELETE');
  const response = await fetch(apiUrl(url), { method: 'DELETE' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Permintaan gagal.');
  return result;
}
async function deleteEmployee(id) {
  const employee = state.data.employees.find((item) => item.id === id);
  if (!employee || employee.archived_at
    || !window.confirm(`Hapus karyawan ${employee.full_name}? Riwayat gaji, upah panen, koreksi, dan absensi tetap tersimpan dan dapat dilihat kembali.`)) return;
  try {
    if (state.demo) {
      employee.archived_at = new Date().toISOString();
      persistDemo();
    } else {
      await patchJson(`/api/employees/${encodeURIComponent(id)}`, { archived_at: new Date().toISOString() });
      await loadData();
    }
    render();
    showToast('Karyawan dihapus. Semua riwayat tetap tersimpan.');
  } catch (error) {
    showToast(error.message || 'Karyawan gagal dihapus.');
  }
}
async function restoreEmployee(id) {
  const employee = state.data.employees.find((item) => item.id === id);
  if (!employee || !employee.archived_at
    || !window.confirm(`Pulihkan karyawan ${employee.full_name} agar tersedia kembali untuk input baru?`)) return;
  try {
    if (state.demo) {
      employee.archived_at = null;
      persistDemo();
    } else {
      await patchJson(`/api/employees/${encodeURIComponent(id)}`, { archived_at: null });
      await loadData();
    }
    render();
    showToast('Karyawan berhasil dipulihkan.');
  } catch (error) {
    showToast(error.message || 'Karyawan gagal dipulihkan.');
  }
}
async function deleteAttendance(id) {
  const entry = state.data.attendance.find((item) => item.id === id);
  if (!entry || !window.confirm(`Hapus absensi ${employeeFor(entry).full_name} periode ${monthLabel(entry.period_id)}?`)) return;
  try {
    if (state.demo) {
      state.data.attendance = state.data.attendance.filter((item) => item.id !== id);
      persistDemo();
    } else {
      await deleteJson(`/api/attendance/${encodeURIComponent(id)}`);
      await loadData();
    }
    render();
    showToast('Catatan absensi berhasil dihapus.');
  } catch (error) {
    showToast(error.message || 'Catatan absensi gagal dihapus.');
  }
}
document.addEventListener('click', (event) => {
  const notificationPopover = document.querySelector('#notification-popover');
  const notificationButton = event.target.closest('.notification-button');
  if (!event.target.closest('.notification-wrap')) {
    notificationPopover.hidden = true;
    document.querySelector('.notification-button').setAttribute('aria-expanded', 'false');
  }
  if (notificationButton) {
    notificationPopover.hidden = !notificationPopover.hidden;
    notificationButton.setAttribute('aria-expanded', String(!notificationPopover.hidden));
    return;
  }
  const attendanceTab = event.target.closest('[data-attendance-tab]');
  if (attendanceTab) {
    state.attendanceTab = attendanceTab.dataset.attendanceTab;
    document.querySelectorAll('[data-attendance-tab]').forEach((tab) => tab.classList.toggle('active', tab === attendanceTab));
    document.querySelector('#attendance-daily-panel').hidden = state.attendanceTab !== 'daily';
    document.querySelector('#attendance-summary-panel').hidden = state.attendanceTab !== 'summary';
    return;
  }
  const attendanceDetail = event.target.closest('[data-attendance-detail]');
  if (attendanceDetail) {
    const employee = state.data.employees.find((item) => item.id === attendanceDetail.dataset.attendanceDetail);
    if (employee) openModal('attendance-detail', { employee, period: state.attendancePeriod });
    return;
  }
  const journalDetail = event.target.closest('[data-journal-detail]');
  if (journalDetail) {
    const journal = state.data.journals.find((item) => item.id === journalDetail.dataset.journalDetail);
    if (journal) openModal('journal-detail', journal);
    return;
  }
  const transactionDetail = event.target.closest('[data-transaction-detail]');
  if (transactionDetail) {
    const entry = transactions().find((item) => item.id === transactionDetail.dataset.transactionDetail);
    if (entry) openModal('transaction-detail', entry);
    return;
  }
  const cancelTransaction = event.target.closest('[data-cancel-record]');
  if (cancelTransaction) {
    const entry = transactions().find((item) => item.id === cancelTransaction.dataset.cancelRecord);
    if (entry && !entry.is_correction && entry.status !== 'cancelled') openModal('cancel', entry);
    return;
  }
  const correctTransaction = event.target.closest('[data-correct-record]');
  if (correctTransaction) {
    const entry = transactions().find((item) => item.id === correctTransaction.dataset.correctRecord);
    if (entry && !entry.is_correction && entry.status !== 'cancelled') openModal('correction', entry);
    return;
  }
  const cancelFromDetail = event.target.closest('[data-cancel-detail]');
  if (cancelFromDetail) {
    const entry = transactions().find((item) => item.id === cancelFromDetail.dataset.cancelDetail);
    if (entry && !entry.is_correction && entry.status !== 'cancelled') {
      closeModal();
      openModal('cancel', entry);
    }
    return;
  }
  const correctFromDetail = event.target.closest('[data-correct-detail]');
  if (correctFromDetail) {
    const entry = transactions().find((item) => item.id === correctFromDetail.dataset.correctDetail);
    if (entry && !entry.is_correction && entry.status !== 'cancelled') {
      closeModal();
      openModal('correction', entry);
    }
    return;
  }
  const editAttendanceButton = event.target.closest('[data-edit-attendance]');
  if (editAttendanceButton) {
    const entry = state.data.attendance.find((item) => item.id === editAttendanceButton.dataset.editAttendance);
    if (entry) openModal('attendance', entry);
    return;
  }
  const deleteAttendanceButton = event.target.closest('[data-delete-attendance]');
  if (deleteAttendanceButton) {
    deleteAttendance(deleteAttendanceButton.dataset.deleteAttendance);
    return;
  }
  const printSlipButton = event.target.closest('[data-print-slip]');
  if (printSlipButton) {
    const entry = transactions().find((item) => item.id === printSlipButton.dataset.printSlip);
    if (entry && entry.status !== 'pending' && entry.slip_number) openPaymentSlipPreview(entry);
    return;
  }
  const editEmployeeButton = event.target.closest('[data-edit-employee]');
  if (editEmployeeButton) {
    const employee = state.data.employees.find((item) => item.id === editEmployeeButton.dataset.editEmployee);
    if (employee) openModal('employee', employee);
    return;
  }
  const deleteEmployeeButton = event.target.closest('[data-delete-employee]');
  if (deleteEmployeeButton) {
    deleteEmployee(deleteEmployeeButton.dataset.deleteEmployee);
    return;
  }
  const restoreEmployeeButton = event.target.closest('[data-restore-employee]');
  if (restoreEmployeeButton) {
    restoreEmployee(restoreEmployeeButton.dataset.restoreEmployee);
    return;
  }
  const statusButton = event.target.closest('[data-mark-paid]');
  if (statusButton) {
    markTransactionPaid(statusButton.dataset.markPaid, statusButton.dataset.entryId, statusButton);
    return;
  }
  const correctionStatusButton = event.target.closest('[data-mark-correction-paid]');
  if (correctionStatusButton) {
    markCorrectionPaid(correctionStatusButton.dataset.markCorrectionPaid, correctionStatusButton);
    return;
  }
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) { switchView(viewButton.dataset.view); return; }
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === 'close-slip-preview') closePaymentSlipPreview();
    if (action === 'download-slip') downloadPaymentSlip(state.previewSlip, actionButton);
    if (action === 'add-employee') openModal('employee');
    if (action === 'record-salary') openModal('salary');
    if (action === 'record-harvest') openModal('harvest');
    if (action === 'add-attendance') {
      switchView('attendance');
      state.attendanceTab = 'daily';
      document.querySelector('#attendance-daily-panel').hidden = false;
      document.querySelector('#attendance-summary-panel').hidden = true;
      document.querySelectorAll('[data-attendance-tab]').forEach((tab) => tab.classList.toggle('active', tab.dataset.attendanceTab === 'daily'));
    }
    if (action === 'attendance-all-present') {
      const type = document.querySelector('#attendance-type-filter').value;
      const search = document.querySelector('#attendance-search').value.trim().toLowerCase();
      state.data.employees.filter((employee) => !employee.archived_at && (type === 'all' || employee.employment_type === type)
        && `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(search))
        .forEach((employee) => { state.dailyStatuses[employee.id] = 'present'; });
      renderAttendance();
    }
    if (action === 'save-daily-attendance') saveDailyAttendance();
    if (action === 'print-journal') printJournalReport();
    if (action === 'print-ledger') printLedgerReport();
    if (action === 'print-attendance') printAttendanceReport();
    if (action === 'close-modal') closeModal();
    return;
  }
  const employeeFilter = event.target.closest('[data-filter]');
  if (employeeFilter) {
    state.employeeFilter = employeeFilter.dataset.filter;
    document.querySelectorAll('.filter-tab').forEach((tab) => tab.classList.toggle('active', tab === employeeFilter));
    renderEmployees();
  }
  const payrollFilter = event.target.closest('[data-payroll-filter]');
  if (payrollFilter) {
    state.payrollFilter = payrollFilter.dataset.payrollFilter;
    document.querySelectorAll('.payroll-filter').forEach((tab) => tab.classList.toggle('active', tab === payrollFilter));
    renderPayroll();
  }
});
function setReportPeriod(period) {
  state.selectedPeriod = period;
  render();
}
document.querySelector('#period-select').addEventListener('change', (event) => setReportPeriod(event.target.value));
document.querySelector('#sidebar-period-select').addEventListener('change', (event) => {
  document.querySelector('#sidebar-period-label').textContent = event.target.selectedOptions[0]?.textContent || '';
  setReportPeriod(event.target.value);
});
document.querySelector('#payroll-period-filter').addEventListener('change', (event) => setReportPeriod(event.target.value));
document.querySelector('#attendance-period-filter').addEventListener('change', (event) => { state.attendancePeriod = event.target.value; renderAttendance(); });
document.querySelector('#journal-period-filter').addEventListener('change', (event) => { state.journalPeriod = event.target.value; renderJournal(); });
document.querySelector('#journal-type-filter').addEventListener('change', (event) => { state.journalType = event.target.value; renderJournal(); });
document.querySelector('#ledger-period-filter').addEventListener('change', (event) => { state.ledgerPeriod = event.target.value; renderLedger(); });
document.querySelector('#ledger-account-filter').addEventListener('change', (event) => { state.ledgerAccount = event.target.value; renderLedger(); });
document.querySelector('#employee-search').addEventListener('input', (event) => { state.search = event.target.value; renderEmployees(); });
document.querySelector('#attendance-date').addEventListener('change', () => { state.dailyStatuses = {}; renderAttendance(); });
document.querySelector('#attendance-type-filter').addEventListener('change', renderAttendance);
document.querySelector('#attendance-report-type').addEventListener('change', renderAttendance);
document.querySelector('#attendance-search').addEventListener('input', renderAttendance);
document.querySelector('#attendance-report-search').addEventListener('input', renderAttendance);
document.addEventListener('change', (event) => {
  const input = event.target.closest('[data-attendance-status]');
  if (input) {
    state.dailyStatuses[input.dataset.attendanceStatus] = input.value;
    renderAttendance();
  }
});
document.querySelector('#modal-form').addEventListener('submit', submitForm);
document.querySelector('#modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') closeModal(); });
document.querySelector('#slip-preview-backdrop').addEventListener('click', (event) => { if (event.target.id === 'slip-preview-backdrop') closePaymentSlipPreview(); });
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!document.querySelector('#slip-preview-backdrop').hidden) closePaymentSlipPreview();
  else if (!document.querySelector('#modal-backdrop').hidden) closeModal();
});
loadData();