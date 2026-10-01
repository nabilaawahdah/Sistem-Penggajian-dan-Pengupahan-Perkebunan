const STORAGE_KEY = 'arboria-demo-v1';
const SUPABASE_URL = 'https://bvxccssjblnuokgkppri.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-r4GgHSONExpKhBhcDy5QA_DY8xsr4-';
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const state = { data: null, demo: false, employeeFilter: 'all', payrollFilter: 'all', selectedPeriod: currentPeriod(), search: '', toastTimer: null, previewSlip: null };

function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
      harvests.push({ id: `h-${monthIndex}-${employeeIndex}`, employee_id: employee.id, period_id: period.id, harvest_date: `${period.period}-${String(18 + employeeIndex).padStart(2, '0')}`, weight_kg: weight, rate_per_kg: rate, total_amount: weight * rate, status: isPaid ? 'paid' : 'pending', paid_at: isPaid ? `${period.period}-28T08:00:00Z` : null, employees: employee, payroll_periods: period, created_at: `${period.period}-25T08:00:00Z` });
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
  return { employees, periods, salaries, harvests, attendance };
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
function normalizeData(data) {
  const employeesById = new Map(data.employees.map((employee) => [employee.id, employee]));
  const periodsById = new Map(data.periods.map((period) => [period.id, period]));
  const attach = (entry) => ({ ...entry, employees: entry.employees || employeesById.get(entry.employee_id), payroll_periods: entry.payroll_periods || periodsById.get(entry.period_id) });
  data.salaries = (data.salaries || []).map(attach);
  data.harvests = (data.harvests || []).map(attach);
  data.attendance = (data.attendance || []).map((entry) => ({ ...entry, employees: entry.employees || employeesById.get(entry.employee_id) }));
  data.periods = data.periods || [];
  data.employees = data.employees || [];
  return data;
}
async function loadData() {
  let connectionError = '';
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
      state.data = normalizeData({ employees: [], periods: [], salaries: [], harvests: [], attendance: [] });
      state.demo = false;
      render();
      showToast(`${reason} Data belum tersinkron; muat ulang halaman setelah koneksi pulih.`);
      return;
    }
    connectionError = `${reason} Data demo ditampilkan.`;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { saved = null; }
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
async function supabaseRequest(table, query = '', method = 'GET', body = null) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(['POST', 'PATCH', 'DELETE'].includes(method) ? { Prefer: 'return=representation' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) : [];
  if (!response.ok) throw new Error(result.message || result.hint || result.error || `Supabase mengembalikan status ${response.status}.`);
  return result;
}
async function loadSupabaseData() {
  const [employees, salaries, harvests, attendance] = await Promise.all([
    supabaseRequest('employees', '?select=*&order=created_at.desc'),
    supabaseRequest('salary_payments', '?select=*,employees(full_name,employee_code,employment_type,division)&order=created_at.desc'),
    supabaseRequest('harvest_records', '?select=*,employees(full_name,employee_code,employment_type,division)&order=created_at.desc'),
    supabaseRequest('attendance_records', '?select=*,employees(full_name,employee_code,employment_type,division)&order=period_id.desc,created_at.desc')
  ]);
  const periods = [...new Set([...salaries, ...harvests].map((entry) => entry.period_id))]
    .filter((period) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    .sort((left, right) => right.localeCompare(left))
    .map((period) => ({ id: period, period }));
  return { employees, periods, salaries, harvests, attendance };
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
    if (payload.paid_at && /^\d{4}-\d{2}-\d{2}$/.test(payload.paid_at)) payload.paid_at = paymentTimestamp(payload.paid_at);
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
  const date = entry.kind === 'harvest' ? entry.harvest_date : entry.payment_date || periodEndDate(periodFor(entry)) || entry.created_at;
  return date ? formatDate(String(date).slice(0, 10)) : '—';
}
function statusDetails(entry) {
  if (entry.status === 'pending') return '';
  return entry.paid_at ? `Dibayar ${formatDate(String(entry.paid_at).slice(0, 10))}` : 'Tanggal pembayaran belum tercatat';
}
function transactions() {
  return [
    ...state.data.salaries.map((entry) => ({ ...entry, kind: 'salary', amount: Number(entry.total_amount ?? Number(entry.basic_salary) + Number(entry.allowances || 0) - Number(entry.deductions || 0)) })),
    ...state.data.harvests.map((entry) => ({ ...entry, kind: 'harvest', amount: Number(entry.total_amount ?? Number(entry.weight_kg) * Number(entry.rate_per_kg)) }))
  ].sort((left, right) => `${periodFor(right)}-${right.created_at || ''}`.localeCompare(`${periodFor(left)}-${left.created_at || ''}`));
}
function currentTransactions(period = state.selectedPeriod) {
  if (isYearSelection(period)) {
    const yearPrefix = `${period.slice(5)}-`;
    return transactions().filter((entry) => periodFor(entry).startsWith(yearPrefix));
  }
  return transactions().filter((entry) => periodFor(entry) === period);
}
function render() {
  const staff = state.data.employees.filter((employee) => employee.employment_type === 'staff');
  const harvesters = state.data.employees.filter((employee) => employee.employment_type === 'harvester');
  const current = currentTransactions();
  const salaries = current.filter((entry) => entry.kind === 'salary');
  const harvests = current.filter((entry) => entry.kind === 'harvest');
  document.querySelector('#employee-count').textContent = state.data.employees.length;
  document.querySelector('#active-period').textContent = selectionLabel(state.selectedPeriod);
  document.querySelector('#stat-employees').textContent = state.data.employees.length;
  document.querySelector('#stat-staff').textContent = `${staff.length} staf`;
  document.querySelector('#stat-harvesters').textContent = `${harvesters.length} pemanen`;
  document.querySelector('#stat-salaries').textContent = formatMoney(salaries.reduce((sum, entry) => sum + entry.amount, 0));
  document.querySelector('#stat-wages').textContent = formatMoney(harvests.reduce((sum, entry) => sum + entry.amount, 0));
  document.querySelector('#stat-weight').innerHTML = `${number.format(harvests.reduce((sum, entry) => sum + Number(entry.weight_kg || 0), 0))} <small>kg</small>`;
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  document.querySelector('#heading-date').textContent = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();
  document.querySelector('.dashboard-heading .heading-day').textContent = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date()).toUpperCase();
  renderPeriodOptions();
  renderChart();
  renderTransactions();
  renderEmployees();
  renderAttendance();
  renderPayroll();
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
  return [...years].sort((left, right) => right.localeCompare(left));
}
function renderPeriodOptions() {
  const options = reportYears().map((year) => {
    const months = monthNames.map((name, index) => {
      const period = `${year}-${String(index + 1).padStart(2, '0')}`;
      return `<option value="${period}">${escapeHtml(name)} ${year}</option>`;
    }).join('');
    return `<option value="year:${year}">Keseluruhan ${year}</option>${months}`;
  }).join('');
  const dashboard = document.querySelector('#period-select');
  const payroll = document.querySelector('#payroll-period-filter');
  const attendance = document.querySelector('#attendance-period-filter');
  dashboard.innerHTML = options;
  dashboard.value = state.selectedPeriod;
  payroll.innerHTML = options;
  payroll.value = state.selectedPeriod;
  attendance.innerHTML = options;
  attendance.value = state.selectedPeriod;
}
function renderChart() {
  const year = isYearSelection(state.selectedPeriod) ? state.selectedPeriod.slice(5) : state.selectedPeriod.slice(0, 4);
  const periods = isYearSelection(state.selectedPeriod)
    ? monthNames.map((_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
    : [state.selectedPeriod];
  const values = periods.map((period) => {
    const entries = currentTransactions(period);
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
  const selected = currentTransactions();
  document.querySelector('#chart-total').textContent = formatMoney(selected.reduce((sum, entry) => sum + entry.amount, 0));
}
function personMarkup(employee) {
  return `<div class="person-cell"><span class="person-avatar ${avatarClass(employee.full_name)}">${escapeHtml(initials(employee.full_name))}</span><span class="person-name"><strong>${escapeHtml(employee.full_name)}</strong><span>${escapeHtml(employee.division)}</span></span></div>`;
}
function actionButton(action, id, label, icon) {
  return `<button class="icon-button row-action" type="button" data-${action}="${escapeHtml(id)}" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24">${icon}</svg></button>`;
}
function employeeActions(employee) {
  return `<div class="row-actions">${actionButton('edit-employee', employee.id, 'Edit karyawan', '<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>')}${actionButton('delete-employee', employee.id, 'Hapus karyawan', '<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6"/>')}</div>`;
}
function attendanceActions(entry) {
  return `<div class="row-actions">${actionButton('edit-attendance', entry.id, 'Edit absensi', '<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>')}${actionButton('delete-attendance', entry.id, 'Hapus absensi', '<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6"/>')}</div>`;
}
function transactionActions(entry) {
  const paymentDateAction = entry.status === 'paid'
    ? actionButton('edit-payment-date', entry.id, 'Edit tanggal pembayaran', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-8 4-2 2-1-1"/>')
    : '';
  const printSlipAction = entry.status === 'paid'
    ? actionButton('print-slip', entry.id, 'Cetak Slip PDF', '<path d="M7 9V4h10v5M7 18h10v-5H7zm-2 0h14a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2z"/>')
    : '';
  return `<div class="row-actions">${printSlipAction}${actionButton('edit-record', entry.id, 'Edit transaksi', '<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>')}${paymentDateAction}${actionButton('delete-record', entry.id, 'Hapus transaksi', '<path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6"/>')}</div>`;
}
function signatureText(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}
function paymentSlipFilename(entry) {
  const employee = employeeFor(entry);
  const prefix = entry.kind === 'salary' ? 'Gaji' : 'Upah';
  const dateStamp = (entry.paid_at || entry.payment_date || entry.harvest_date || new Date().toISOString()).slice(0, 10);
  const safeName = (employee.full_name || 'Karyawan').replace(/[^a-zA-Z0-9]+/g, ' ').trim().replace(/\s+/g, '_') || 'Karyawan';
  return `Slip_${prefix}_${safeName}_${dateStamp}.pdf`;
}
function paymentSlipHtml(entry) {
  const employee = employeeFor(entry);
  const isSalary = entry.kind === 'salary';
  const paymentLabel = isSalary ? 'Gaji Staf' : 'Upah Panen';
  const paymentDate = entry.paid_at || entry.payment_date || entry.harvest_date || new Date().toISOString();
  const formattedDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${String(paymentDate).slice(0, 10)}T12:00:00`));
  const totalAmount = formatMoney(entry.amount || 0);
  const detailRows = isSalary
    ? [
        ['Gaji Pokok', formatMoney(entry.basic_salary || 0)],
        ['Tunjangan', formatMoney(entry.allowances || 0)],
        ['Potongan', `- ${formatMoney(entry.deductions || 0)}`],
        ['Total Jumlah Dibayarkan', totalAmount]
      ]
    : [
        ['Kalkulasi Upah', `${number.format(entry.weight_kg || 0)} kg × ${formatMoney(entry.rate_per_kg || 0)} = ${totalAmount}`],
        ['Total Jumlah Dibayarkan', totalAmount]
      ];
  const details = detailRows.map(([label, value]) => `
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #edf0ee; font-size: 13px; color: #294334;">
      <span>${escapeHtml(label)}</span>
      <strong style="color: #173a2a;">${escapeHtml(value)}</strong>
    </div>
  `).join('');
  const employeeSignature = signatureText(employee.full_name || 'Penerima');
  const managerSignature = 'Nabila';
  return `
    <div class="payment-slip-document" style="width: 794px; background: #fff; color: #1f2d27; padding: 30px 36px; font-family: 'DM Sans', sans-serif; box-sizing: border-box;">
      <div style="display: flex; justify-content: space-between; align-items: end; border-bottom: 2px solid #dfe9e3; padding-bottom: 12px; margin-bottom: 18px;">
        <div>
          <div style="font-size: 22px; font-weight: 800; color: #1f4d3d;">Perkebunan Arboria</div>
        </div>
        <div style="text-align: right; font-weight: 800; color: #1d362d; font-size: 18px; letter-spacing: 0.08em;">SLIP PEMBAYARAN KOMPENSASI</div>
      </div>

      <div style="display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 18px; margin-bottom: 18px;">
        <div style="border: 1px solid #e6ece7; border-radius: 10px; padding: 14px 16px; background: #f9faf8;">
          <div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #7d8c82; margin-bottom: 6px;">Data Karyawan</div>
          <div style="display: grid; gap: 6px; font-size: 14px;">
            <div><strong style="display: inline-block; width: 134px; color: #64746b;">Nama</strong> ${escapeHtml(employee.full_name || '—')}</div>
            <div><strong style="display: inline-block; width: 134px; color: #64746b;">ID Karyawan</strong> ${escapeHtml(employee.employee_code || '—')}</div>
            <div><strong style="display: inline-block; width: 134px; color: #64746b;">Jenis</strong> ${escapeHtml(employee.employment_type === 'staff' ? 'Staf' : 'Pemanen')}</div>
            <div><strong style="display: inline-block; width: 134px; color: #64746b;">Divisi / Blok</strong> ${escapeHtml(employee.division || '—')}</div>
          </div>
        </div>
        <div style="border: 1px solid #e6ece7; border-radius: 10px; padding: 14px 16px; background: #f9faf8;">
          <div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #7d8c82; margin-bottom: 6px;">Pembayaran</div>
          <div style="display: grid; gap: 6px; font-size: 14px;">
            <div><strong style="display: inline-block; width: 118px; color: #64746b;">Skema</strong> ${escapeHtml(paymentLabel)}</div>
            <div><strong style="display: inline-block; width: 118px; color: #64746b;">Tanggal</strong> Dibayar ${escapeHtml(formattedDate)}</div>
            <div><strong style="display: inline-block; width: 118px; color: #64746b;">Status</strong> Dibayar</div>
            <div><strong style="display: inline-block; width: 118px; color: #64746b;">Total</strong> <span style="color:#1d553d; font-weight:700;">${escapeHtml(totalAmount)}</span></div>
          </div>
        </div>
      </div>

      <div style="border: 1px solid #e6ece7; border-radius: 10px; overflow: hidden; margin-bottom: 26px; background: #fff;">
        <div style="display: flex; justify-content: space-between; padding: 12px 16px; background: #edf3ed; border-bottom: 1px solid #e6ece7; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #57665e; font-weight: 700;">
          <span>Rincian</span>
          <span>Nilai</span>
        </div>
        ${details}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 10px; padding-top: 18px; border-top: 1px solid #e3e9e4;">
        <div style="text-align: center;">
          <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #64746b; margin-bottom: 14px;">Penerima</div>
          <div style="font-family: 'Great Vibes', 'Segoe Script', 'Lucida Handwriting', cursive; font-size: 30px; min-height: 52px; color: #1d352d; margin-bottom: 10px;">${escapeHtml(employeeSignature)}</div>
          <div style="height: 2px; background: linear-gradient(to right, #c8d4ce, #1d352d, #c8d4ce); margin: 0 auto 10px; width: 90%;"></div>
          <div style="font-size: 13px; font-weight: 700; color: #34493f;">${escapeHtml(employee.full_name || 'Nama Karyawan')}</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #64746b; margin-bottom: 14px;">Manager Administrasi &amp; Keuangan</div>
          <div style="font-family: 'Great Vibes', 'Segoe Script', 'Lucida Handwriting', cursive; font-size: 30px; min-height: 52px; color: #1d352d; margin-bottom: 10px;">${escapeHtml(managerSignature)}</div>
          <div style="height: 2px; background: linear-gradient(to right, #c8d4ce, #1d352d, #c8d4ce); margin: 0 auto 10px; width: 90%;"></div>
          <div style="font-size: 13px; font-weight: 700; color: #34493f;">Nabila</div>
        </div>
      </div>

      <div style="margin-top: 30px; text-align: center; color: #7b8a83; font-size: 9px; letter-spacing: 0.05em; font-style: italic;">Dokumen ini diterbitkan secara sah melalui Sistem Penggajian dan Pengupahan Perkebunan Arboria.</div>
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
  if (!entry || entry.status !== 'paid') return;
  const employee = employeeFor(entry);
  state.previewSlip = entry;
  document.querySelector('#slip-preview-title').textContent = entry.kind === 'salary' ? 'Slip Gaji' : 'Slip Upah Panen';
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
  if (!entry || entry.status !== 'paid') return;
  if (!window.html2canvas || !window.jspdf) {
    showToast('PDF slip tidak tersedia. Mohon refresh halaman dan coba kembali.');
    return;
  }
  button.disabled = true;
  const wrapper = document.createElement('div');
  wrapper.id = 'slip-render-root';
  wrapper.innerHTML = paymentSlipHtml(entry);
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
      backgroundColor: '#ffffff',
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
    pdf.save(paymentSlipFilename(entry));
    showToast('Slip pembayaran berhasil diunduh dalam format PDF.');
  } catch (error) {
    showToast(error.message || 'Slip pembayaran gagal dibuat.');
  } finally {
    wrapper.remove();
    button.disabled = false;
  }
}
window.addEventListener('resize', resizeSlipPreview);
function transactionMarkup(entry, withActions = false) {
  const employee = employeeFor(entry);
  const isSalary = entry.kind === 'salary';
  const detail = isSalary ? `Pokok ${formatMoney(entry.basic_salary)} · Tunj. ${formatMoney(entry.allowances || 0)}` : `${number.format(entry.weight_kg)} kg × ${formatMoney(entry.rate_per_kg)}`;
  const status = entry.status === 'pending' ? 'Menunggu pembayaran' : 'Dibayar';
  const statusMarkup = entry.status === 'pending'
    ? `<span class="status-tag status-pending">${status}</span><button class="status-tag status-action" type="button" data-mark-paid="${isSalary ? 'salary' : 'harvest'}" data-entry-id="${escapeHtml(entry.id)}">Tandai dibayar</button>`
    : `<span class="status-tag">${status}</span>`;
  const statusDetail = statusDetails(entry);
  return `<tr><td>${personMarkup(employee)}</td><td><span class="type-tag ${isSalary ? '' : 'harvest'}"><i></i>${isSalary ? 'Gaji staf' : 'Upah panen'}</span></td><td><span class="date-cell"><strong>${escapeHtml(transactionDate(entry))}</strong><small>${escapeHtml(monthLabel(periodFor(entry)))}</small></span></td><td><span class="transaction-detail">${detail}</span></td><td class="money-cell">${formatMoney(entry.amount)}</td><td><div class="status-cell">${statusMarkup}${statusDetail ? `<small class="status-detail">${escapeHtml(statusDetail)}</small>` : ''}</div></td>${withActions ? `<td>${transactionActions(entry)}</td>` : ''}</tr>`;
}
function renderTransactions() {
  const recent = currentTransactions().slice(0, 5);
  document.querySelector('#recent-transactions').innerHTML = recent.map((entry) => transactionMarkup(entry, true)).join('');
  document.querySelector('#recent-empty').hidden = recent.length > 0;
}
function renderEmployees() {
  const staff = state.data.employees.filter((employee) => employee.employment_type === 'staff');
  const harvesters = state.data.employees.filter((employee) => employee.employment_type === 'harvester');
  document.querySelector('#filter-all-count').textContent = state.data.employees.length;
  document.querySelector('#filter-staff-count').textContent = staff.length;
  document.querySelector('#filter-harvester-count').textContent = harvesters.length;
  const search = state.search.toLowerCase();
  const employees = state.data.employees.filter((employee) => (state.employeeFilter === 'all' || employee.employment_type === state.employeeFilter) && `${employee.full_name} ${employee.employee_code} ${employee.division}`.toLowerCase().includes(search));
  document.querySelector('#employee-rows').innerHTML = employees.map((employee) => {
    const typeLabel = employee.employment_type === 'staff' ? 'Staf' : 'Pemanen';
    const compensation = employee.employment_type === 'staff' ? `${formatMoney(employee.monthly_salary)} / bulan` : 'Tarif berdasarkan panen';
    return `<tr><td>${personMarkup(employee)}</td><td>${escapeHtml(employee.employee_code)}</td><td><span class="role-tag ${employee.employment_type}">${typeLabel}</span></td><td>${escapeHtml(employee.division)}</td><td class="compensation-cell">${compensation}</td><td>${employeeActions(employee)}</td></tr>`;
  }).join('');
  document.querySelector('#employee-empty').hidden = employees.length > 0;
  document.querySelector('#employee-result-count').textContent = `${employees.length} karyawan`;
}
function renderAttendance() {
  const rows = state.data.attendance.filter((entry) => isYearSelection(state.selectedPeriod)
    ? entry.period_id.startsWith(`${state.selectedPeriod.slice(5)}-`)
    : entry.period_id === state.selectedPeriod
  ).sort((left, right) => `${right.period_id}-${right.created_at || ''}`.localeCompare(`${left.period_id}-${left.created_at || ''}`));
  const total = (field) => rows.reduce((sum, entry) => sum + Number(entry[field] || 0), 0);
  document.querySelector('#attendance-count').textContent = rows.length;
  document.querySelector('#attendance-summary').innerHTML = `<article class="summary-item"><span>Karyawan tercatat</span><strong>${new Set(rows.map((entry) => entry.employee_id)).size}</strong><small>${escapeHtml(selectionLabel(state.selectedPeriod))}</small></article><article class="summary-item"><span>Hari kerja</span><strong>${total('working_days')}</strong><small>Total periode terpilih</small></article><article class="summary-item"><span>Izin</span><strong>${total('leave_days')}</strong><small>Total periode terpilih</small></article><article class="summary-item"><span>Alfa</span><strong>${total('absent_days')}</strong><small>Total periode terpilih</small></article>`;
  document.querySelector('#attendance-rows').innerHTML = rows.map((entry) => {
    const employee = employeeFor(entry);
    const label = employee.employment_type === 'staff' ? 'Staf' : 'Pemanen';
    return `<tr><td>${personMarkup(employee)}</td><td><span class="role-tag ${employee.employment_type}">${label}</span></td><td>${escapeHtml(monthLabel(entry.period_id))}</td><td class="attendance-number">${Number(entry.working_days)}</td><td class="attendance-number">${Number(entry.leave_days)}</td><td class="attendance-number">${Number(entry.absent_days)}</td><td>${attendanceActions(entry)}</td></tr>`;
  }).join('');
  document.querySelector('#attendance-empty').hidden = rows.length > 0;
  document.querySelector('#attendance-result-count').textContent = `${rows.length} catatan`;
}
function renderPayroll() {
  const filtered = currentTransactions().filter((entry) => {
    if (state.payrollFilter === 'pending') return entry.status === 'pending';
    return state.payrollFilter === 'all' || entry.kind === state.payrollFilter;
  });
  const salaryTotal = filtered.filter((entry) => entry.kind === 'salary').reduce((sum, entry) => sum + entry.amount, 0);
  const wageEntries = filtered.filter((entry) => entry.kind === 'harvest');
  const wageTotal = wageEntries.reduce((sum, entry) => sum + entry.amount, 0);
  document.querySelector('#payroll-summary').innerHTML = `<article class="summary-item"><span>Total gaji staf</span><strong>${formatMoney(salaryTotal)}</strong><small>${filtered.filter((entry) => entry.kind === 'salary').length} transaksi</small></article><article class="summary-item"><span>Total upah panen</span><strong>${formatMoney(wageTotal)}</strong><small>${number.format(wageEntries.reduce((sum, entry) => sum + Number(entry.weight_kg || 0), 0))} kg tercatat</small></article><article class="summary-item"><span>Total kompensasi</span><strong>${formatMoney(salaryTotal + wageTotal)}</strong><small>${filtered.length} transaksi terpilih</small></article>`;
  document.querySelector('#payroll-rows').innerHTML = filtered.map((entry) => transactionMarkup(entry, true)).join('');
  document.querySelector('#payroll-empty').hidden = filtered.length > 0;
  document.querySelector('#payroll-result-count').textContent = `${filtered.length} transaksi`;
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
  document.querySelector('#breadcrumb-label').textContent = { dashboard: 'Dashboard', employees: 'Data karyawan', attendance: 'Absensi', payroll: 'Penggajian dan Pengupahan' }[viewName] || 'Dashboard';
  if (viewName === 'payroll') renderPayroll();
  if (viewName === 'employees') renderEmployees();
  if (viewName === 'attendance') renderAttendance();
}
function fieldMarkup(label, name, { type = 'text', required = true, value = '', placeholder = '', min = '', step = '', full = false, options = null, hint = '' } = {}) {
  const className = full ? 'form-field full' : 'form-field';
  const attr = `${required ? 'required' : ''} ${min !== '' ? `min="${min}"` : ''} ${step ? `step="${step}"` : ''} ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''}`;
  const control = options ? `<select id="field-${name}" name="${name}" ${required ? 'required' : ''}>${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.selected ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>` : `<input id="field-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${attr}>`;
  return `<div class="${className}"><label for="field-${name}">${label}</label>${control}${hint ? `<span class="form-help">${hint}</span>` : ''}</div>`;
}
function openModal(kind, existing = null) {
  const backdrop = document.querySelector('#modal-backdrop');
  const title = document.querySelector('#modal-title');
  const eyebrow = document.querySelector('#modal-eyebrow');
  const form = document.querySelector('#modal-form');
  if (kind === 'employee') {
    eyebrow.textContent = 'DATA TENAGA KERJA';
    title.textContent = existing ? 'Edit karyawan' : 'Tambah karyawan';
    form.innerHTML = `<div class="form-grid">${fieldMarkup('Nama lengkap', 'full_name', { value: existing?.full_name || '', placeholder: 'Contoh: Siti Rahmawati' })}${fieldMarkup('ID karyawan', 'employee_code', { value: existing?.employee_code || '', placeholder: 'Contoh: STF-004' })}${fieldMarkup('Jenis tenaga kerja', 'employment_type', { options: [{ value: 'staff', label: 'Staf bergaji bulanan', selected: !existing || existing.employment_type === 'staff' }, { value: 'harvester', label: 'Pemanen lapangan', selected: existing?.employment_type === 'harvester' }] })}${fieldMarkup('Divisi / blok kebun', 'division', { value: existing?.division || '', placeholder: 'Contoh: Administrasi' })}<div class="form-field full" id="salary-field">${fieldMarkup('Gaji pokok bulanan (Rp)', 'monthly_salary', { type: 'number', min: '0', step: '1000', value: existing?.monthly_salary ?? '5000000', full: true })}</div><div class="form-error" id="form-error"></div><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Batal</button><button type="submit" class="button button-primary">${existing ? 'Simpan perubahan' : 'Simpan karyawan'}</button></div></div>`;
    form.querySelector('[name="employment_type"]').addEventListener('change', (event) => { form.querySelector('#salary-field').hidden = event.target.value !== 'staff'; });
    form.querySelector('[name="employment_type"]').dispatchEvent(new Event('change'));
  } else if (kind === 'payment-date') {
    eyebrow.textContent = 'RIWAYAT PEMBAYARAN';
    title.textContent = 'Edit tanggal pembayaran';
    const paymentDate = existing?.paid_at ? String(existing.paid_at).slice(0, 10) : '';
    form.innerHTML = `<div class="form-grid">${fieldMarkup('Tanggal pembayaran', 'paid_at', { type: 'date', value: paymentDate, full: true, hint: 'Isi tanggal saat pembayaran benar-benar dilakukan.' })}<div class="form-error" id="form-error"></div><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Batal</button><button type="submit" class="button button-primary">Simpan tanggal</button></div></div>`;
  } else if (kind === 'attendance') {
    const editing = Boolean(existing);
    eyebrow.textContent = 'KEHADIRAN TENAGA KERJA';
    title.textContent = editing ? 'Edit absensi' : 'Catat absensi';
    const employees = state.data.employees.map((employee) => ({
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
    const people = state.data.employees.filter((employee) => employee.employment_type === (isSalary ? 'staff' : 'harvester'));
    eyebrow.textContent = isSalary ? 'GAJI BULANAN TETAP' : 'UPAH BERDASARKAN HASIL PANEN';
    title.textContent = editing ? `Edit ${isSalary ? 'gaji staf' : 'hasil panen'}` : isSalary ? 'Catat gaji staf' : 'Catat hasil panen';
    const employeeOptions = people.map((employee) => ({ value: employee.id, label: `${employee.full_name} · ${employee.employee_code}`, selected: employee.id === existing?.employee_id }));
    const defaultPeriod = isYearSelection(state.selectedPeriod) ? `${state.selectedPeriod.slice(5)}-01` : state.selectedPeriod || currentPeriod();
    const period = existing ? periodFor(existing) : defaultPeriod;
    const employeeField = employeeOptions.length ? fieldMarkup('Karyawan', 'employee_id', { options: employeeOptions, full: true }) : '<div class="form-field full"><span class="form-help">Belum ada karyawan untuk skema ini. Tambahkan karyawan terlebih dahulu.</span></div>';
    const detailFields = isSalary
      ? `${fieldMarkup('Tanggal gaji', 'payment_date', { type: 'date', value: existing?.payment_date || periodEndDate(period), hint: 'Default: hari terakhir periode gaji.' })}${fieldMarkup('Gaji pokok (Rp)', 'basic_salary', { type: 'number', min: '0', step: '1000', value: existing?.basic_salary ?? people[0]?.monthly_salary ?? '0' })}${fieldMarkup('Tunjangan (Rp)', 'allowances', { type: 'number', min: '0', step: '1000', value: existing?.allowances ?? '0' })}${fieldMarkup('Potongan (Rp)', 'deductions', { type: 'number', min: '0', step: '1000', value: existing?.deductions ?? '0' })}`
      : `${fieldMarkup('Bobot panen (kg)', 'weight_kg', { type: 'number', min: '0.1', step: '0.1', value: existing?.weight_kg ?? '', placeholder: 'Contoh: 520' })}${fieldMarkup('Tarif per kg (Rp)', 'rate_per_kg', { type: 'number', min: '0', step: 'any', value: existing?.rate_per_kg ?? '850' })}${fieldMarkup('Tanggal panen', 'harvest_date', { type: 'date', value: existing?.harvest_date || dateForPeriod(period) })}`;
    const total = isSalary ? '<span class="form-total full"><span>Gaji bersih diterima</span><strong id="computed-total">Rp0</strong></span>' : '<span class="form-total full"><span>Perkiraan upah panen</span><strong id="computed-total">Rp0</strong></span>';
    form.innerHTML = `<div class="form-grid">${employeeField}${fieldMarkup('Periode', 'period', { type: 'month', value: period })}${detailFields}${total}${fieldMarkup('Status', 'status', { options: [{ value: 'paid', label: 'Dibayar', selected: existing?.status === 'paid' || !existing }, { value: 'pending', label: 'Menunggu pembayaran', selected: existing?.status === 'pending' }], full: true })}<div class="form-error" id="form-error"></div><div class="form-actions full"><button type="button" class="button button-secondary" data-action="close-modal">Batal</button><button type="submit" class="button button-primary">${editing ? 'Simpan perubahan' : 'Simpan transaksi'}</button></div></div>`;
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
    }
    form.addEventListener('input', updateTotal);
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
    if (kind === 'payment-date') {
      const timestamp = paymentTimestamp(formData.paid_at);
      if (!timestamp) throw new Error('Tanggal pembayaran tidak valid.');
      const recordKind = form.dataset.recordKind;
      const entries = recordKind === 'salary' ? state.data.salaries : state.data.harvests;
      const existing = entries.find((entry) => entry.id === form.dataset.recordId);
      if (!existing || existing.status !== 'paid') throw new Error('Transaksi belum berstatus dibayar.');
      if (state.demo) {
        existing.paid_at = timestamp;
        persistDemo();
      } else {
        await patchJson(`/api/${recordKind === 'salary' ? 'salaries' : 'harvests'}/${encodeURIComponent(existing.id)}`, { paid_at: formData.paid_at });
        await loadData();
      }
      render();
      closeModal();
      showToast('Tanggal pembayaran berhasil diperbarui.');
      return;
    }
    if (kind === 'employee') {
      const employee = { ...formData, monthly_salary: formData.employment_type === 'staff' ? Number(formData.monthly_salary || 0) : 0 };
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
        await loadData();
      }
      render();
      closeModal();
      showToast(employeeId ? 'Perubahan karyawan berhasil disimpan.' : 'Data karyawan berhasil disimpan.');
      return;
    }
    const isSalary = kind === 'salary';
    const payload = isSalary
      ? { ...formData, basic_salary: Number(formData.basic_salary), allowances: Number(formData.allowances || 0), deductions: Number(formData.deductions || 0) }
      : { ...formData, weight_kg: Number(formData.weight_kg), rate_per_kg: Number(formData.rate_per_kg) };
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
async function patchJson(url, body) {
  if (backendApiBase() === null) return directSupabaseMutation(url, 'PATCH', body);
  const response = await fetch(apiUrl(url), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Permintaan gagal.');
  return result;
}
function paymentTimestamp(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const timestamp = new Date(`${date}T12:00:00.000Z`);
  return Number.isNaN(timestamp.getTime()) || timestamp.toISOString().slice(0, 10) !== date ? null : timestamp.toISOString();
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
  if (!employee || !window.confirm(`Hapus data karyawan ${employee.full_name}?`)) return;
  const hasTransactions = state.data.salaries.some((entry) => entry.employee_id === id)
    || state.data.harvests.some((entry) => entry.employee_id === id)
    || state.data.attendance.some((entry) => entry.employee_id === id);
  if (hasTransactions) {
    showToast('Karyawan masih memiliki catatan gaji, upah panen, atau absensi. Hapus catatan terkait terlebih dahulu.');
    return;
  }
  try {
    if (state.demo) {
      state.data.employees = state.data.employees.filter((item) => item.id !== id);
      persistDemo();
    } else {
      await deleteJson(`/api/employees/${encodeURIComponent(id)}`);
      await loadData();
    }
    render();
    showToast('Data karyawan berhasil dihapus.');
  } catch (error) {
    showToast(error.message || 'Data karyawan gagal dihapus.');
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
async function deleteTransaction(id) {
  const entry = transactions().find((item) => item.id === id);
  if (!entry || !window.confirm(`Hapus catatan ${entry.kind === 'salary' ? 'gaji' : 'upah panen'} ${employeeFor(entry).full_name} tanggal ${transactionDate(entry)}?`)) return;
  const entries = entry.kind === 'salary' ? state.data.salaries : state.data.harvests;
  try {
    if (state.demo) {
      const index = entries.findIndex((item) => item.id === id);
      entries.splice(index, 1);
      persistDemo();
    } else {
      await deleteJson(`/api/${entry.kind === 'salary' ? 'salaries' : 'harvests'}/${encodeURIComponent(id)}`);
      await loadData();
    }
    render();
    showToast('Transaksi berhasil dihapus.');
  } catch (error) {
    showToast(error.message || 'Transaksi gagal dihapus.');
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
  const editPaymentDateButton = event.target.closest('[data-edit-payment-date]');
  if (editPaymentDateButton) {
    const entry = transactions().find((item) => item.id === editPaymentDateButton.dataset.editPaymentDate);
    if (entry?.status === 'paid') openModal('payment-date', entry);
    return;
  }
  const editRecordButton = event.target.closest('[data-edit-record]');
  if (editRecordButton) {
    const entry = transactions().find((item) => item.id === editRecordButton.dataset.editRecord);
    if (entry) openModal(entry.kind, entry);
    return;
  }
  const deleteRecordButton = event.target.closest('[data-delete-record]');
  if (deleteRecordButton) {
    deleteTransaction(deleteRecordButton.dataset.deleteRecord);
    return;
  }
  const printSlipButton = event.target.closest('[data-print-slip]');
  if (printSlipButton) {
    const entry = transactions().find((item) => item.id === printSlipButton.dataset.printSlip);
    if (entry && entry.status === 'paid') openPaymentSlipPreview(entry);
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
  const statusButton = event.target.closest('[data-mark-paid]');
  if (statusButton) {
    markTransactionPaid(statusButton.dataset.markPaid, statusButton.dataset.entryId, statusButton);
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
    if (action === 'add-attendance') openModal('attendance');
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
document.querySelector('#payroll-period-filter').addEventListener('change', (event) => setReportPeriod(event.target.value));
document.querySelector('#attendance-period-filter').addEventListener('change', (event) => setReportPeriod(event.target.value));
document.querySelector('#employee-search').addEventListener('input', (event) => { state.search = event.target.value; renderEmployees(); });
document.querySelector('#modal-form').addEventListener('submit', submitForm);
document.querySelector('#modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') closeModal(); });
document.querySelector('#slip-preview-backdrop').addEventListener('click', (event) => { if (event.target.id === 'slip-preview-backdrop') closePaymentSlipPreview(); });
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!document.querySelector('#slip-preview-backdrop').hidden) closePaymentSlipPreview();
  else if (!document.querySelector('#modal-backdrop').hidden) closeModal();
});
loadData();
