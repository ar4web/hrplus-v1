// Column allowlist for the public REST API, generated from supabase/migrations.
// dev/check-schema.mjs fails if this drifts from the real Postgres schema, so an
// integration cannot write a field the database does not have (and a rename in a
// migration cannot silently leave this list stale).
export const COLUMNS = {
  assets: ['id', 'tag', 'name', 'category', 'serial_no', 'assigned_to', 'purchase_date', 'cost', 'salvage_value', 'useful_life_years', 'dep_method', 'status', 'warranty_expiry', 'supplier', 'location', 'history', 'created_at'],
  attendance: ['id', 'employee_id', 'date', 'check_in', 'check_out', 'status', 'lat', 'lng', 'distance_m', 'remote', 'source', 'created_at'],
  documents: ['id', 'template_key', 'employee_id', 'title', 'lang', 'fields', 'format', 'created_by', 'created_at'],
  employees: ['id', 'full_name', 'full_name_ar', 'email', 'phone', 'gender', 'age', 'department', 'job_title', 'location', 'hire_date', 'employment_type', 'status', 'nationality', 'is_saudi', 'iqama_number', 'iqama_expiry', 'iqama_renewal_status', 'annual_salary', 'bonus', 'basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowance', 'primary_client', 'bank_code', 'iban', 'created_at'],
  expense_categories: ['id', 'code', 'name_en', 'name_ar', 'color', 'cap_per_claim', 'monthly_budget', 'active', 'created_at'],
  expenses: ['id', 'employee_id', 'category_id', 'amount', 'vat_amount', 'expense_date', 'description', 'receipt_path', 'status', 'approval_chain', 'current_step', 'over_cap', 'created_at'],
  holidays: ['id', 'date', 'name_en', 'name_ar', 'created_at'],
  invoices: ['id', 'number', 'uuid', 'icv', 'prev_hash', 'issue_date', 'issue_time', 'type', 'buyer', 'lines', 'subtotal', 'vat', 'total', 'vendor_id', 'due_date', 'design', 'status', 'notes', 'sent_via', 'hash', 'signature', 'qr', 'xml', 'created_at'],
  leave_requests: ['id', 'employee_id', 'type_id', 'start_date', 'end_date', 'days', 'reason', 'status', 'decided_by', 'decision_note', 'decided_at', 'created_at'],
  leave_types: ['id', 'code', 'name_en', 'name_ar', 'color', 'paid', 'annual_days', 'days_after_5y', 'calendar_days', 'notice_days', 'max_consecutive', 'requires_document', 'gender', 'active', 'created_at'],
  payroll_runs: ['id', 'period', 'status', 'totals', 'finalized_at', 'created_at'],
  payslips: ['id', 'run_id', 'employee_id', 'period', 'basic', 'housing', 'transport', 'other_allowance', 'overtime', 'bonus', 'gross', 'gosi_base', 'gosi_employee', 'gosi_employer', 'deductions', 'net', 'payment_method', 'status', 'created_at'],
  rules: ['id', 'version', 'category', 'title_en', 'title_ar', 'body_en', 'body_ar', 'active', 'published_at', 'history', 'created_at'],
  timesheets: ['id', 'date', 'employee_id', 'vendor_id', 'project', 'regular_hours', 'overtime_hours', 'bill_rate', 'status', 'decided_at', 'created_at'],
  vendors: ['id', 'name', 'name_ar', 'type', 'email', 'phone', 'vat_number', 'cr_number', 'address', 'city', 'country', 'billable_rate', 'payment_terms', 'status', 'created_at'],
};

export const columnsOf = (resource) => COLUMNS[resource] || null;

/** Split a payload into the columns we accept and the ones we reject. */
export function splitColumns(resource, body) {
  const allowed = columnsOf(resource);
  if (!allowed) return { values: {}, rejected: Object.keys(body || {}) };
  const values = {}, rejected = [];
  for (const [k, v] of Object.entries(body || {})) {
    if (allowed.includes(k)) values[k] = v;
    else rejected.push(k);
  }
  return { values, rejected };
}

/** Filters may only target real columns; anything else is a client bug, not a query. */
export const isColumn = (resource, name) => !!columnsOf(resource)?.includes(name);
