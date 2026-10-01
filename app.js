const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://bvxccssjblnuokgkppri.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_-r4GgHSONExpKhBhcDy5QA_DY8xsr4-';
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

async function handleApi(request, response, url) {
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(response, 200, {
        configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
        keyType: SUPABASE_KEY.startsWith('sb_publishable_') ? 'publishable' : 'invalid'
      });
    }
    if (request.method === 'GET' && url.pathname === '/api/data') {
      const [employees, salaries, harvests, attendance] = await Promise.all([
        supabase('employees', '?select=*&order=created_at.desc'),
        supabase('salary_payments', '?select=*,employees(full_name,employee_code,employment_type,division)&order=created_at.desc'),
        supabase('harvest_records', '?select=*,employees(full_name,employee_code,employment_type,division)&order=created_at.desc'),
        supabase('attendance_records', '?select=*,employees(full_name,employee_code,employment_type,division)&order=period_id.desc,created_at.desc')
      ]);
      const periods = [...new Set([...salaries, ...harvests].map((entry) => entry.period_id))]
        .filter((period) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period))
        .sort((left, right) => right.localeCompare(left))
        .map((period) => ({ id: period, period }));
      return sendJson(response, 200, { employees, periods, salaries, harvests, attendance });
    }
    const employeeRoute = url.pathname.match(/^\/api\/employees\/([^/]+)$/);
    if (request.method === 'PATCH' && employeeRoute) {
      const body = await readJson(request);
      if (body.employment_type && !['staff', 'harvester'].includes(body.employment_type)) {
        return sendJson(response, 400, { error: 'Jenis tenaga kerja tidak valid.' });
      }
      const changes = {};
      if (body.employee_code !== undefined) changes.employee_code = String(body.employee_code).trim();
      if (body.full_name !== undefined) changes.full_name = String(body.full_name).trim();
      if (body.employment_type !== undefined) changes.employment_type = body.employment_type;
      if (body.division !== undefined) changes.division = String(body.division).trim();
      if (body.monthly_salary !== undefined) changes.monthly_salary = Number(body.monthly_salary);
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
      const employeeFilter = `?employee_id=eq.${id}&select=id&limit=1`;
      const [salaries, harvests, attendance] = await Promise.all([
        supabase('salary_payments', employeeFilter),
        supabase('harvest_records', employeeFilter),
        supabase('attendance_records', employeeFilter)
      ]);
      if (salaries.length || harvests.length || attendance.length) {
        return sendJson(response, 409, { error: 'Karyawan memiliki transaksi atau absensi. Hapus catatan terkait terlebih dahulu.' });
      }
      const rows = await supabase('employees', `?id=eq.${id}`, { method: 'DELETE', prefer: 'return=representation' });
      if (!rows.length) return sendJson(response, 404, { error: 'Karyawan tidak ditemukan.' });
      return sendJson(response, 200, rows[0]);
    }
    if (request.method === 'POST' && url.pathname === '/api/employees') {
      const body = await readJson(request);
      requireFields(body, ['employee_code', 'full_name', 'employment_type', 'division']);
      if (!['staff', 'harvester'].includes(body.employment_type)) {
        return sendJson(response, 400, { error: 'Jenis tenaga kerja tidak valid.' });
      }
      const employees = await supabase('employees', '', {
        method: 'POST', prefer: 'return=representation',
        body: {
          employee_code: String(body.employee_code).trim(),
          full_name: String(body.full_name).trim(),
          employment_type: body.employment_type,
          division: String(body.division).trim(),
          monthly_salary: Number(body.monthly_salary || 0)
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
      const body = sanitizePayload(await readJson(request), ['employee_id', 'period', 'harvest_date', 'weight_kg', 'rate_per_kg', 'status']);
      requireFields(body, ['employee_id', 'period', 'weight_kg', 'rate_per_kg']);
      const periodId = await ensurePeriod(body.period);
      const rows = await supabase('harvest_records', '', {
        method: 'POST', prefer: 'return=representation',
        body: {
          employee_id: body.employee_id, period_id: periodId,
          harvest_date: body.harvest_date || new Date().toISOString().slice(0, 10),
          weight_kg: Number(body.weight_kg), rate_per_kg: Number(body.rate_per_kg),
          status: body.status || 'paid',
          paid_at: (body.status || 'paid') === 'paid' ? new Date().toISOString() : null
        }
      });
      return sendJson(response, 201, rows[0]);
    }
    const payrollRoute = url.pathname.match(/^\/api\/(salaries|harvests)\/([^/]+)$/);
    if (request.method === 'PATCH' && payrollRoute) {
      const body = sanitizePayload(await readJson(request), ['employee_id', 'period', 'status', 'paid_at', 'basic_salary', 'allowances', 'deductions', 'payment_date', 'harvest_date', 'weight_kg', 'rate_per_kg']);
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
      if (body.paid_at !== undefined) {
        const paidDate = new Date(`${body.paid_at}T12:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.paid_at) || Number.isNaN(paidDate.getTime()) || paidDate.toISOString().slice(0, 10) !== body.paid_at) {
          return sendJson(response, 400, { error: 'Tanggal pembayaran tidak valid.' });
        }
        changes.paid_at = paidDate.toISOString();
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
        for (const field of ['weight_kg', 'rate_per_kg']) {
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
      const table = payrollRoute[1] === 'salaries' ? 'salary_payments' : 'harvest_records';
      const rows = await supabase(table, `?id=eq.${encodeURIComponent(decodeURIComponent(payrollRoute[2]))}`, {
        method: 'DELETE', prefer: 'return=representation'
      });
      if (!rows.length) return sendJson(response, 404, { error: 'Transaksi tidak ditemukan.' });
      return sendJson(response, 200, rows[0]);
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
