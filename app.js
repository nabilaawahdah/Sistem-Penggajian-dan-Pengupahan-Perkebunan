const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
const DEFAULT_SUPABASE_URL = 'https://bvxccssjblnuokgkppri.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-r4GgHSONExpKhBhcDy5QA_DY8xsr4-';
const SUPABASE_URL = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_KEY
  || (SUPABASE_URL === DEFAULT_SUPABASE_URL ? DEFAULT_SUPABASE_PUBLISHABLE_KEY : '');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  const allowedOrigins = new Set(['null', `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, ...CORS_ALLOWED_ORIGINS]);
  if (!allowedOrigins.has(origin)) return false;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Max-Age', '600');
  response.setHeader('Vary', 'Origin');
  if (request.headers['access-control-request-private-network'] === 'true') {
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  return true;
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body too large');
  }
  return body ? JSON.parse(body) : {};
}

async function supabase(table, query = '', options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const error = new Error('Atur SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY pada environment backend.');
    error.status = 503;
    throw error;
  }
  if (!SUPABASE_KEY.startsWith('sb_publishable_')) {
    const error = new Error('SUPABASE_PUBLISHABLE_KEY harus berisi publishable key Supabase (sb_publishable_...).');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const text = await response.text();
  if (!response.ok) {
    const details = text ? JSON.parse(text) : {};
    const error = new Error(details.message || details.hint || 'Permintaan Supabase gagal.');
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : [];
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
  if (missing.length) {
    const error = new Error(`Kolom wajib diisi: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
}

function sanitizePayload(body, allowedFields) {
  if (!body || typeof body !== 'object') return {};
  return Object.fromEntries(
    Object.entries(body)
      .filter(([key, value]) => allowedFields.includes(key) && value !== undefined)
  );
}

async function ensurePeriod(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    const error = new Error('Periode harus menggunakan format YYYY-MM.');
    error.status = 400;
    throw error;
  }
  return period;
}

function validAttendance(period, workingDays, leaveDays, absentDays) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) return false;
  const values = [workingDays, leaveDays, absentDays].map(Number);
  const [year, month] = period.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return values.every((value) => Number.isInteger(value) && value >= 0)
    && values.reduce((sum, value) => sum + value, 0) <= daysInMonth;
}

function journalLines(lines) {
  const sideOrder = (line) => Number(line.debit || 0) > 0 ? 0 : Number(line.credit || 0) > 0 ? 1 : 2;
  return [...lines].sort((left, right) =>
    sideOrder(left) - sideOrder(right)
      || String(left.account_code || '').localeCompare(String(right.account_code || ''))
      || String(left.id || '').localeCompare(String(right.id || '')));
}

async function handleApi(request, response, url) {
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(response, 200, {
        configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
        keyType: SUPABASE_KEY.startsWith('sb_publishable_') ? 'publishable' : 'invalid'
      });
    }
    if (request.method === 'GET' && url.pathname === '/api/data') {
      const [employees, salaries, harvests, attendance, dailyAttendance, accounts, journals, journalLines, corrections, auditTrail, harvestBlocks] = await Promise.all([
        supabase('employees', '?select=*&order=created_at.desc'),
        supabase('salary_payments', '?select=*,employees(full_name,employee_code,employment_type,division)&order=created_at.desc'),
        supabase('harvest_records', '?select=*,employees(full_name,employee_code,employment_type,division)&order=created_at.desc'),
        supabase('attendance_records', '?select=*,employees(full_name,employee_code,employment_type,division)&order=period_id.desc,created_at.desc'),
        supabase('daily_attendance', '?select=*,employees(full_name,employee_code,employment_type,division)&order=attendance_date.desc'),
        supabase('accounts', '?select=*&order=code'),
        supabase('journals', '?select=*&order=journal_date.desc,created_at.desc'),
        supabase('journal_lines', '?select=*'),
        supabase('payroll_corrections', '?select=*&order=created_at.desc'),
        supabase('payroll_audit_trail', '?select=*&order=occurred_at.desc'),
        supabase('harvest_blocks', '?select=*&order=code')
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
      const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
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
        payroll_journal_lines: journalLines(journalLinesById.get(journal.id) || [])
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
      return sendJson(response, 200, { employees, periods, salaries, harvests, corrections: correctionsWithEmployees, attendance, dailyAttendance, accounts, journals: mappedJournals, auditTrail, harvestBlocks });
    }
    const employeeRoute = url.pathname.match(/^\/api\/employees\/([^/]+)$/);
    if (request.method === 'PATCH' && employeeRoute) {
      const body = await readJson(request);
      if (body.employment_type && !['staff', 'harvester'].includes(body.employment_type)) {
        return sendJson(response, 400, { error: 'Jenis tenaga kerja tidak valid.' });
      }
      const changes = {};
      if (body.employee_code !== undefined) {
        let employeeCode = String(body.employee_code).trim();
        if (body.employment_type) {
          const employeePrefix = body.employment_type === 'staff' ? 'STF-' : 'PNN-';
          if (!employeeCode.startsWith(employeePrefix)) {
            employeeCode = employeePrefix + employeeCode.replace(/^(STF-|PNN-)/, '');
          }
        }
        changes.employee_code = employeeCode;
      }
      if (body.full_name !== undefined) changes.full_name = String(body.full_name).trim();
      if (body.employment_type !== undefined) {
        changes.employment_type = body.employment_type;
      }
      if (body.division !== undefined) changes.division = String(body.division).trim();
      let salaryEmploymentType = body.employment_type;
      if (body.monthly_salary !== undefined && salaryEmploymentType === undefined) {
        const currentEmployee = await supabase(
          'employees',
          `?id=eq.${encodeURIComponent(decodeURIComponent(employeeRoute[1]))}&select=employment_type`
        );
        if (!currentEmployee.length) return sendJson(response, 404, { error: 'Karyawan tidak ditemukan.' });
        salaryEmploymentType = currentEmployee[0].employment_type;
      }
      if (salaryEmploymentType === 'harvester') {
        changes.monthly_salary = 0;
      } else if (body.monthly_salary !== undefined) {
        changes.monthly_salary = Number(body.monthly_salary);
      }
      if (body.archived_at !== undefined) {
        if (body.archived_at !== null
          && (typeof body.archived_at !== 'string' || !Number.isFinite(Date.parse(body.archived_at)))) {
          return sendJson(response, 400, { error: 'Waktu penghapusan tidak valid.' });
        }
        changes.archived_at = body.archived_at === null ? null : new Date(body.archived_at).toISOString();
      }
      if (!Object.keys(changes).length || Object.values(changes).some((value) => value === '' || (typeof value === 'number' && (!Number.isFinite(value) || value < 0)))) {
        return sendJson(response, 400, { error: 'Data karyawan tidak valid.' });
      }
      const rows = await supabase('employees', `?id=eq.${encodeURIComponent(decodeURIComponent(employeeRoute[1]))}`, {
        method: 'PATCH', prefer: 'return=representation', body: changes
      });
      if (!rows.length) return sendJson(response, 404, { error: 'Karyawan tidak ditemukan.' });
      return sendJson(response, 200, rows[0]);
    }
    if (request.method === 'DELETE' && employeeRoute) {
      const id = encodeURIComponent(decodeURIComponent(employeeRoute[1]));
      const rows = await supabase('employees', `?id=eq.${id}`, {
        method: 'PATCH', prefer: 'return=representation',
        body: { archived_at: new Date().toISOString() }
      });
      if (!rows.length) return sendJson(response, 404, { error: 'Karyawan tidak ditemukan.' });
      return sendJson(response, 200, rows[0]);
    }
    if (request.method === 'POST' && url.pathname === '/api/employees') {
      const body = await readJson(request);
      requireFields(body, ['employee_code', 'full_name', 'employment_type', 'division']);
      if (!['staff', 'harvester'].includes(body.employment_type)) {
        return sendJson(response, 400, { error: 'Jenis tenaga kerja tidak valid.' });
      }
      let employeeCode = String(body.employee_code).trim();
      const employeePrefix = body.employment_type === 'staff' ? 'STF-' : 'PNN-';
      if (!employeeCode.startsWith(employeePrefix)) {
        employeeCode = employeePrefix + employeeCode.replace(/^(STF-|PNN-)/, '');
      }
      const employees = await supabase('employees', '', {
        method: 'POST', prefer: 'return=representation',
        body: {
          employee_code: employeeCode,
          full_name: String(body.full_name).trim(),
          employment_type: body.employment_type,
          division: String(body.division).trim(),
          monthly_salary: body.employment_type === 'harvester' ? 0 : Number(body.monthly_salary || 0)
        }
      });
      return sendJson(response, 201, employees[0]);
    }
    if (request.method === 'POST' && url.pathname === '/api/attendance') {
      const body = sanitizePayload(await readJson(request), ['employee_id', 'period', 'working_days', 'leave_days', 'absent_days']);
      requireFields(body, ['employee_id', 'period', 'working_days', 'leave_days', 'absent_days']);
      const values = {
        working_days: Number(body.working_days),
        leave_days: Number(body.leave_days),
        absent_days: Number(body.absent_days)
      };
      if (!validAttendance(body.period, values.working_days, values.leave_days, values.absent_days)) {
        return sendJson(response, 400, { error: 'Jumlah hari harus bilangan bulat nonnegatif dan totalnya tidak boleh melebihi hari dalam periode.' });
      }
      const duplicates = await supabase('attendance_records', `?employee_id=eq.${encodeURIComponent(body.employee_id)}&period_id=eq.${encodeURIComponent(body.period)}&select=id&limit=1`);
      if (duplicates.length) {
        return sendJson(response, 409, { error: 'Absensi karyawan ini untuk periode tersebut sudah ada. Edit catatan yang sudah ada.' });
      }
      const rows = await supabase('attendance_records', '', {
        method: 'POST', prefer: 'return=representation',
        body: { employee_id: body.employee_id, period_id: body.period, ...values }
      });
      return sendJson(response, 201, rows[0]);
    }
    if (request.method === 'POST' && url.pathname === '/api/attendance/daily') {
      const body = await readJson(request);
      const attendanceDate = new Date(`${body.attendance_date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.attendance_date || '')
        || Number.isNaN(attendanceDate.getTime())
        || attendanceDate.toISOString().slice(0, 10) !== body.attendance_date
        || !Array.isArray(body.records) || !body.records.length) {
        return sendJson(response, 400, { error: 'Tanggal dan daftar status absensi wajib diisi.' });
      }
      if (body.records.some((record) => !record.employee_id || !['present', 'leave', 'absent'].includes(record.status))) {
        return sendJson(response, 400, { error: 'Setiap karyawan harus memiliki status Hadir, Izin, atau Alfa.' });
      }
      const employeeIds = [...new Set(body.records.map((record) => record.employee_id))];
      if (employeeIds.length !== body.records.length) {
        return sendJson(response, 400, { error: 'Karyawan tidak boleh tercatat lebih dari sekali pada tanggal yang sama.' });
      }
      const rows = await supabase('daily_attendance', '?on_conflict=employee_id,attendance_date', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: body.records.map((record) => ({
          employee_id: record.employee_id,
          attendance_date: body.attendance_date,
          status: record.status,
          recorded_by: 'Admin Arboria'
        }))
      });
      return sendJson(response, 200, rows);
    }
    const attendanceRoute = url.pathname.match(/^\/api\/attendance\/([^/]+)$/);
    if (request.method === 'PATCH' && attendanceRoute) {
      const body = await readJson(request);
      const id = decodeURIComponent(attendanceRoute[1]);
      const current = await supabase('attendance_records', `?id=eq.${encodeURIComponent(id)}&select=*`);
      if (!current.length) return sendJson(response, 404, { error: 'Catatan absensi tidak ditemukan.' });
      const existing = current[0];
      const period = body.period || existing.period_id;
      const employeeId = body.employee_id ?? existing.employee_id;
      const values = {
        working_days: Number(body.working_days ?? existing.working_days),
        leave_days: Number(body.leave_days ?? existing.leave_days),
        absent_days: Number(body.absent_days ?? existing.absent_days)
      };
      if (!validAttendance(period, values.working_days, values.leave_days, values.absent_days)) {
        return sendJson(response, 400, { error: 'Jumlah hari harus bilangan bulat nonnegatif dan totalnya tidak boleh melebihi hari dalam periode.' });
      }
      const duplicates = await supabase('attendance_records', `?employee_id=eq.${encodeURIComponent(employeeId)}&period_id=eq.${encodeURIComponent(period)}&select=id`);
      if (duplicates.some((row) => row.id !== id)) {
        return sendJson(response, 409, { error: 'Absensi karyawan ini untuk periode tersebut sudah ada. Edit catatan yang sudah ada.' });
      }
      const changes = { ...values };
      if (body.period !== undefined) changes.period_id = period;
      if (body.employee_id !== undefined) changes.employee_id = body.employee_id;
      const rows = await supabase('attendance_records', `?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', prefer: 'return=representation', body: changes
      });
      return sendJson(response, 200, rows[0]);
    }
    if (request.method === 'DELETE' && attendanceRoute) {
      const rows = await supabase('attendance_records', `?id=eq.${encodeURIComponent(decodeURIComponent(attendanceRoute[1]))}`, {
        method: 'DELETE', prefer: 'return=representation'
      });
      if (!rows.length) return sendJson(response, 404, { error: 'Catatan absensi tidak ditemukan.' });
      return sendJson(response, 200, rows[0]);
    }
    if (request.method === 'POST' && url.pathname === '/api/salaries') {
      const body = sanitizePayload(await readJson(request), ['employee_id', 'period', 'payment_date', 'basic_salary', 'allowances', 'deductions', 'status']);
      requireFields(body, ['employee_id', 'period', 'payment_date', 'basic_salary']);
      const periodId = await ensurePeriod(body.period);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.payment_date) || body.payment_date.slice(0, 7) !== body.period) {
        return sendJson(response, 400, { error: 'Tanggal gaji harus berada pada bulan periode yang dipilih.' });
      }
      const rows = await supabase('salary_payments', '', {
        method: 'POST', prefer: 'return=representation',
        body: {
          employee_id: body.employee_id, period_id: periodId, payment_date: body.payment_date,
          basic_salary: Number(body.basic_salary), allowances: Number(body.allowances || 0),
          deductions: Number(body.deductions || 0), status: body.status || 'paid',
          paid_at: body.status === 'pending' ? null : new Date().toISOString()
        }
      });
      return sendJson(response, 201, rows[0]);
    }
    if (request.method === 'POST' && url.pathname === '/api/harvests') {
      const body = sanitizePayload(await readJson(request), ['employee_id', 'period', 'harvest_date', 'block_code', 'commodity', 'unit', 'weight_kg', 'rate_per_kg', 'deductions', 'status']);
      requireFields(body, ['employee_id', 'period', 'block_code', 'weight_kg', 'rate_per_kg']);
      const periodId = await ensurePeriod(body.period);
      const rows = await supabase('harvest_records', '', {
        method: 'POST', prefer: 'return=representation',
        body: {
          employee_id: body.employee_id, period_id: periodId,
          block_code: String(body.block_code).trim(),
          commodity: String(body.commodity || '').trim() || null,
          unit: String(body.unit || '').trim() || null,
          harvest_date: body.harvest_date || new Date().toISOString().slice(0, 10),
          weight_kg: Number(body.weight_kg), rate_per_kg: Number(body.rate_per_kg),
          deductions: 0,
          status: body.status || 'paid',
          paid_at: (body.status || 'paid') === 'paid' ? new Date().toISOString() : null
        }
      });
      return sendJson(response, 201, rows[0]);
    }
    const payrollRoute = url.pathname.match(/^\/api\/(salaries|harvests)\/([^/]+)$/);
    const cancellationRoute = url.pathname.match(/^\/api\/(salaries|harvests)\/([^/]+)\/cancel$/);
    if (request.method === 'POST' && cancellationRoute) {
      const body = await readJson(request);
      requireFields(body, ['reason']);
      if (!String(body.reason).trim()) return sendJson(response, 400, { error: 'Alasan pembatalan wajib diisi.' });
      const result = await supabase('rpc/cancel_payroll_transaction', '', {
        method: 'POST',
        body: {
          transaction_type: cancellationRoute[1] === 'salaries' ? 'salary' : 'harvest',
          transaction_key: decodeURIComponent(cancellationRoute[2]),
          reason: String(body.reason).trim()
        }
      });
      return sendJson(response, 200, { reversal_journal_id: result });
    }
    const correctionRoute = url.pathname.match(/^\/api\/(salaries|harvests)\/([^/]+)\/correct$/);
    if (request.method === 'POST' && correctionRoute) {
      const body = await readJson(request);
      requireFields(body, ['values', 'reason']);
      if (!String(body.reason).trim()) return sendJson(response, 400, { error: 'Alasan koreksi wajib diisi.' });
      const correctionId = await supabase('rpc/correct_payroll_transaction', '', {
        method: 'POST',
        body: {
          transaction_type: correctionRoute[1] === 'salaries' ? 'salary' : 'harvest',
          transaction_key: decodeURIComponent(correctionRoute[2]),
          correction_values: body.values,
          reason: String(body.reason).trim()
        }
      });
      return sendJson(response, 201, { correction_id: correctionId });
    }
    const correctionPaymentRoute = url.pathname.match(/^\/api\/corrections\/([^/]+)\/pay$/);
    if (request.method === 'POST' && correctionPaymentRoute) {
      const correctionId = await supabase('rpc/payroll_correction_payment', '', {
        method: 'POST',
        body: { correction_key: decodeURIComponent(correctionPaymentRoute[1]) }
      });
      return sendJson(response, 200, { correction_id: correctionId });
    }
    if (request.method === 'PATCH' && payrollRoute) {
      const requestBody = await readJson(request);
      if (Object.prototype.hasOwnProperty.call(requestBody, 'paid_at')) {
        return sendJson(response, 400, { error: 'Tanggal pembayaran transaksi terkunci dan tidak dapat diubah.' });
      }
      const body = sanitizePayload(requestBody, ['employee_id', 'period', 'status', 'basic_salary', 'allowances', 'deductions', 'payment_date', 'harvest_date', 'weight_kg', 'rate_per_kg']);
      const isSalary = payrollRoute[1] === 'salaries';
      const table = isSalary ? 'salary_payments' : 'harvest_records';
      const changes = {};
      if (body.employee_id !== undefined) changes.employee_id = body.employee_id;
      if (body.period !== undefined) changes.period_id = await ensurePeriod(body.period);
      if (body.status !== undefined && !['paid', 'pending'].includes(body.status)) {
        return sendJson(response, 400, { error: 'Status transaksi tidak valid.' });
      }
      if (body.status !== undefined) {
        changes.status = body.status;
        changes.paid_at = body.status === 'paid' ? new Date().toISOString() : null;
      }
      if (isSalary) {
        for (const field of ['basic_salary', 'allowances', 'deductions']) {
          if (body[field] !== undefined) changes[field] = Number(body[field]);
        }
        if (body.payment_date !== undefined) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(body.payment_date) || (body.period && body.payment_date.slice(0, 7) !== body.period)) {
            return sendJson(response, 400, { error: 'Tanggal gaji harus berada pada bulan periode yang dipilih.' });
          }
          changes.payment_date = body.payment_date;
        }
      } else {
        if (body.harvest_date !== undefined) changes.harvest_date = body.harvest_date;
        for (const field of ['weight_kg', 'rate_per_kg', 'deductions']) {
          if (body[field] !== undefined) changes[field] = Number(body[field]);
        }
      }
      if (!Object.keys(changes).length || Object.values(changes).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) {
        return sendJson(response, 400, { error: 'Perubahan transaksi tidak valid.' });
      }
      if (body.employee_id !== undefined) {
        const employees = await supabase('employees', `?id=eq.${encodeURIComponent(body.employee_id)}&select=employment_type`);
        const expectedType = isSalary ? 'staff' : 'harvester';
        if (!employees.length || employees[0].employment_type !== expectedType) {
          return sendJson(response, 400, { error: 'Karyawan tidak sesuai dengan jenis transaksi.' });
        }
      }
      const rows = await supabase(table, `?id=eq.${encodeURIComponent(decodeURIComponent(payrollRoute[2]))}`, {
        method: 'PATCH', prefer: 'return=representation', body: changes
      });
      if (!rows.length) return sendJson(response, 404, { error: 'Transaksi tidak ditemukan.' });
      return sendJson(response, 200, rows[0]);
    }
    if (request.method === 'DELETE' && payrollRoute) {
      return sendJson(response, 405, { error: 'Transaksi terkunci dan tidak dapat dihapus. Gunakan Koreksi atau Batal.' });
    }
    return sendJson(response, 404, { error: 'Endpoint tidak ditemukan.' });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    console.error(`[api] ${request.method} ${url.pathname}: ${error.message}`);
    return sendJson(response, status, { error: error.message });
  }
}

function serveStatic(request, response, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.resolve(FRONTEND_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${FRONTEND_DIR}${path.sep}`) && filePath !== path.join(FRONTEND_DIR, 'index.html')) {
    response.writeHead(403);
    return response.end('Forbidden');
  }
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Not found');
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    response.end(contents);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const corsAllowed = setCorsHeaders(request, response);
  if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    if (!corsAllowed) {
      response.writeHead(403);
      return response.end('Origin not allowed');
    }
    response.writeHead(204);
    return response.end();
  }
  if (url.pathname.startsWith('/api/')) return handleApi(request, response, url);
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end('Method not allowed');
  }
  return serveStatic(request, response, url);
});

server.listen(PORT, () => {
  console.log(`Arboria berjalan di http://localhost:${PORT}`);
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('Supabase belum dikonfigurasi; frontend menggunakan data demo lokal.');
  }
});
