// Reference data that the upstream Supabase project normally holds in its
// migrations (company profile, clients/vendors, leave types, holidays, expense
// categories, policy rules, FAQs). The app's seeder (api/seed.js) assumes these
// rows already exist, so we create them before running it.
import { store, table, touch, flush, UPDATED_AT_TABLES } from './store.mjs';

const CLIENTS = [
  { id: 1, name: 'Acme Tech Solutions', name_ar: 'أكمي تِك سوليوشنز', type: 'client', email: 'ap@acmetech.sa', phone: '+966112345001', vat_number: '310122393500003', cr_number: '1010223344', address: 'King Fahd Road, Al Olaya', city: 'Riyadh', billable_rate: 135, payment_terms: 30 },
  { id: 2, name: 'Apex Global Systems', name_ar: 'أبيكس العالمية للأنظمة', type: 'client', email: 'accounts@apexglobal.sa', phone: '+966112345002', vat_number: '310456789100003', cr_number: '2050334455', address: 'Prince Sultan Road, Al Rawdah', city: 'Jeddah', billable_rate: 150, payment_terms: 30 },
  { id: 3, name: 'Gulf Cloud Infrastructure', name_ar: 'الخليج للبنية السحابية', type: 'client', email: 'vendor@hrplus.sa', phone: '+966500000005', vat_number: '311234567800003', cr_number: '2051445566', address: 'King Salman Energy Park', city: 'Dammam', billable_rate: 165, payment_terms: 45 },
  { id: 4, name: 'RetailX Logistics', name_ar: 'ريتيل إكس للخدمات اللوجستية', type: 'client', email: 'finance@retailx.sa', phone: '+966112345004', vat_number: '312345678900003', cr_number: '1010556677', address: 'Anas Ibn Malik Road, Al Malqa', city: 'Riyadh', billable_rate: 110, payment_terms: 30 },
  { id: 5, name: 'Internal R&D', name_ar: 'البحث والتطوير الداخلي', type: 'client', email: 'rnd@hrplus.sa', phone: '+966500000009', vat_number: '313456789000003', cr_number: '1010667788', address: 'Digital City, Al Nakheel', city: 'Riyadh', billable_rate: 85, payment_terms: 30 },
  { id: 6, name: 'Al Rajhi Bank', name_ar: 'مصرف الراجحي', type: 'supplier', email: 'business@alrajhibank.com.sa', phone: '+966112345006', vat_number: '300123456700003', cr_number: '1010000001', address: 'Al Ahsa Street', city: 'Riyadh', billable_rate: 0, payment_terms: 30 },
  { id: 7, name: 'Jarir Bookstore', name_ar: 'مكتبة جرير', type: 'supplier', email: 'corporate@jarir.com', phone: '+966112345007', vat_number: '300987654300003', cr_number: '1010000002', address: 'Olaya Street', city: 'Riyadh', billable_rate: 0, payment_terms: 15 },
  { id: 8, name: 'Gulf Business Machines', name_ar: 'الخليج لآلات الأعمال', type: 'supplier', email: 'sales@gbm.sa', phone: '+966112345008', vat_number: '301345678200003', cr_number: '2050000003', address: 'Al Khobar Corniche', city: 'Al Khobar', billable_rate: 0, payment_terms: 30 },
];

const LEAVE_TYPES = [
  { id: 1, code: 'ANNUAL', name_en: 'Annual Leave', name_ar: 'إجازة سنوية', color: '#0fa89a', paid: true, annual_days: 21, days_after_5y: 30, calendar_days: false, notice_days: 7, max_consecutive: 30, active: true },
  { id: 2, code: 'SICK', name_en: 'Sick Leave', name_ar: 'إجازة مرضية', color: '#e0523f', paid: true, annual_days: 30, calendar_days: true, max_consecutive: 30, requires_document: true, active: true },
  { id: 3, code: 'MARRIAGE', name_en: 'Marriage Leave', name_ar: 'إجازة زواج', color: '#8b5cf6', paid: true, annual_days: 3, calendar_days: true, max_consecutive: 3, requires_document: true, active: true },
  { id: 4, code: 'HAJJ', name_en: 'Hajj Leave', name_ar: 'إجازة حج', color: '#0ea5e9', paid: true, annual_days: 10, calendar_days: true, max_consecutive: 10, active: true },
  { id: 5, code: 'MATERNITY', name_en: 'Maternity Leave', name_ar: 'إجازة أمومة', color: '#d9467b', paid: true, annual_days: 70, calendar_days: true, gender: 'Female', requires_document: true, active: true },
  { id: 6, code: 'PATERNITY', name_en: 'Paternity Leave', name_ar: 'إجازة مولود', color: '#f59e0b', paid: true, annual_days: 3, calendar_days: true, gender: 'Male', active: true },
  { id: 7, code: 'UNPAID', name_en: 'Unpaid Leave', name_ar: 'إجازة بدون راتب', color: '#64748b', paid: false, annual_days: 0, calendar_days: false, max_consecutive: 20, active: true },
];

const HOLIDAYS = [
  { id: 1, date: '2026-02-22', name_en: 'Founding Day', name_ar: 'يوم التأسيس' },
  { id: 2, date: '2026-03-19', name_en: 'Eid Al-Fitr', name_ar: 'عيد al-Fitr' },
  { id: 3, date: '2026-03-20', name_en: 'Eid Al-Fitr Holiday', name_ar: 'إجازة عيد الفطر' },
  { id: 4, date: '2026-03-21', name_en: 'Eid Al-Fitr Holiday', name_ar: 'إجازة عيد الفطر' },
  { id: 5, date: '2026-03-22', name_en: 'Eid Al-Fitr Holiday', name_ar: 'إجازة عيد الفطر' },
  { id: 6, date: '2026-03-23', name_en: 'Eid Al-Fitr Holiday', name_ar: 'إجازة عيد الفطر' },
  { id: 7, date: '2026-05-26', name_en: 'Eid Al-Adha', name_ar: 'عيد الأضحى' },
  { id: 8, date: '2026-05-27', name_en: 'Eid Al-Adha Holiday', name_ar: 'إجازة عيد الأضحى' },
  { id: 9, date: '2026-05-28', name_en: 'Eid Al-Adha Holiday', name_ar: 'إجازة عيد الأضحى' },
  { id: 10, date: '2026-05-29', name_en: 'Eid Al-Adha Holiday', name_ar: 'إجازة عيد الأضحى' },
  { id: 11, date: '2026-09-23', name_en: 'National Day', name_ar: 'اليوم الوطني' },
  { id: 12, date: '2026-09-24', name_en: 'National Day Holiday', name_ar: 'إجازة اليوم الوطني' },
];

const EXPENSE_CATEGORIES = [
  { id: 1, code: 'TRAVEL', name_en: 'Travel', name_ar: 'سفر', color: '#0ea5e9', cap_per_claim: 7000, monthly_budget: 60000, active: true },
  { id: 2, code: 'MEALS', name_en: 'Meals & Entertainment', name_ar: 'وجبات وضيافة', color: '#f59e0b', cap_per_claim: 800, monthly_budget: 12000, active: true },
  { id: 3, code: 'TRAINING', name_en: 'Training & Certification', name_ar: 'تدريب وشهادات', color: '#8b5cf6', cap_per_claim: 9000, monthly_budget: 40000, active: true },
  { id: 4, code: 'OFFICE', name_en: 'Office Supplies', name_ar: 'مستلزمات مكتبية', color: '#64748b', cap_per_claim: 2000, monthly_budget: 8000, active: true },
  { id: 5, code: 'TRANSPORT', name_en: 'Transport', name_ar: 'مواصلات', color: '#0fa89a', cap_per_claim: 1000, monthly_budget: 9000, active: true },
  { id: 6, code: 'TELECOM', name_en: 'Telecom', name_ar: 'اتصالات', color: '#e0523f', cap_per_claim: 500, monthly_budget: 5000, active: true },
  { id: 7, code: 'ACCOM', name_en: 'Accommodation', name_ar: 'إقامة', color: '#d9467b', cap_per_claim: 4000, monthly_budget: 25000, active: true },
];

const RULES = [
  {
    id: 1, version: 2, category: 'Attendance', active: true,
    title_en: 'Attendance & Punctuality', title_ar: 'الحضور والانضباط',
    body_en: 'Working hours are 08:00–17:00 (Sun–Thu) with a 15-minute grace period. Check-in is recorded from the office geofence unless you are registered as a remote worker. Three late arrivals in a rolling 30-day period are escalated to your line manager. Field and client-site work must be logged the same day.',
    body_ar: 'ساعات العمل من 08:00 إلى 17:00 (الأحد–الخميس) مع فترة سماح 15 دقيقة. يُسجل الحضور من نطاق المكتب ما لم تكن مسجلاً كعامل عن بُعد. ثلاث حالات تأخير خلال 30 يوماً تُرفع إلى مديرك المباشر. يجب تسجيل العمل الميداني في نفس اليوم.',
  },
  {
    id: 2, version: 1, category: 'Expense', active: true,
    title_en: 'Expense & Reimbursement Policy', title_ar: 'سياسة المصروفات والاسترداد',
    body_en: 'Claims above SAR 100 require an itemised receipt. Claims are routed to your line manager, then Finance, with CEO approval above SAR 5,000 or where a category cap is exceeded. Submit within 30 days of the expense date; VAT must be shown separately. Personal purchases, fines and traffic violations are not reimbursable.',
    body_ar: 'المطالبات التي تتجاوز 100 ر.س تتطلب فاتورة مفصلة. تُحال المطالبة إلى مديرك المباشر ثم الإدارة المالية، مع اعتماد الرئيس التنفيذي لما يتجاوز 5,000 ر.س أو عند تجاوز حد الفئة. يُقدَّم الطلب خلال 30 يوماً من تاريخ المصروف. لا تُسترد المشتريات الشخصية والغرامات.',
  },
  {
    id: 3, version: 1, category: 'Security', active: true,
    title_en: 'Information Security & Data Handling', title_ar: 'أمن المعلومات والتعامل مع البيانات',
    body_en: 'Employee and payroll data is classified Confidential. Access is role-based and every action is written to the audit log. Do not share payslips, Iqama copies or client invoices outside approved channels. Report suspected incidents to the IT desk within 24 hours. Sessions expire after 30 minutes of inactivity.',
    body_ar: 'تُصنَّف بيانات الموظفين والرواتب على أنها سرية. الوصول مبني على الأدوار وتُسجل كل عملية في سجل التدقيق. لا تشارك قسائم الرواتب أو نسخ الإقامة أو فواتير العملاء خارج القنوات المعتمدة. أبلغ مكتب تقنية المعلومات عن أي حادث مشتبه خلال 24 ساعة. تنتهي الجلسة بعد 30 دقيقة من عدم النشاط.',
  },
  {
    id: 4, version: 1, category: 'Conduct', active: true,
    title_en: 'Code of Conduct', title_ar: 'مدونة السلوك',
    body_en: 'Treat colleagues and clients with respect and act with integrity in every transaction. Gifts above SAR 250 must be declared to Compliance. Conflicts of interest, including outside employment, must be disclosed to HR. Harassment and discrimination are grounds for immediate disciplinary action under the Saudi Labor Law.',
    body_ar: 'أُعامل الزملاء والعملاء باحترام والتزم بالنزاهة في كل تعامل. يجب الإفصاح عن أي هدايا تتجاوز 250 ر.س إلى الالتزام. يجب الإفصاح عن تعارض المصالح، بما في ذلك العمل خارج الشركة، إلى الموارد البشرية. التحرش والتمييز يستوجبان إجراءات تأديبية فورية وفق نظام العمل.',
  },
];

const FAQS = [
  { id: 1, question_en: 'When is payroll processed?', question_ar: 'متى تُصرف الرواتب؟', answer_en: 'Salaries are paid on the 27th of each month through the WPS system. If the 27th falls on a weekend, payment moves to the preceding Thursday.', answer_ar: 'تُصرف الرواتب في السابع والعشرين من كل شهر عبر نظام حماية الأجور. إذا وافق يوم السبت أو الجمعة يُصرف الخميس السابق.', category: 'Payroll', active: true },
  { id: 2, question_en: 'How do I request annual leave?', question_ar: 'كيف أطلب إجازة سنوية؟', answer_en: 'Submit the request from Leave → New request at least 7 days in advance. Your line manager is notified and the balance is deducted once approved.', answer_ar: 'قدّم الطلب من صفحة الإجازات قبل 7 أيام على الأقل. يُ notified مديرك المباشر ويُخصم الرصيد بعد الموافقة.', category: 'Leave', active: true },
  { id: 3, question_en: 'How is the expense approval chain decided?', question_ar: 'كيف تُحدد سلسلة اعتماد المصروفات؟', answer_en: 'Up to SAR 1,000 goes to your line manager; up to SAR 5,000 adds Finance; above that, or above a category cap, CEO approval is added.', answer_ar: 'حتى 1,000 ر.س لمديرك المباشر؛ حتى 5,000 ر.س تُضاف الإدارة المالية؛ وما زاد أو تجاوز حد الفئة تُضاف موافقة الرئيس التنفيذي.', category: 'Expenses', active: true },
  { id: 4, question_en: 'Where can I download my payslip?', question_ar: 'من أين أحمّل قسيمة الراتب؟', answer_en: 'Open Payroll, choose the period and press Download. The payslip is a signed PDF that matches the WPS transfer.', answer_ar: 'افتح صفحة الرواتب واختر الفترة ثم اضغط تنزيل. القسيمة بصيغة PDF موقعة وتطابق التحويل في نظام حماية الأجور.', category: 'Payroll', active: true },
  { id: 5, question_en: 'How do I renew my Iqama?', question_ar: 'كيف أُجدد إقامتي؟', answer_en: 'HR starts the renewal 60 days before expiry on Muqeem. You will be asked for a photo, medical insurance confirmation and the fee receipt.', answer_ar: 'تبدأ الموارد البشرية التجديد 60 يوماً قبل الانتهاء عبر مقيم. سيُطلب منك صورة وتأكيد التأمين الطبي وإيصال الرسوم.', category: 'Government', active: true },
];

const APP_LINKS = [
  { id: 1, title_en: 'Muqeem (Iqama services)', title_ar: 'مقيم (خدمات الإقامة)', url: 'https://www.muqeem.sa', category: 'Government', active: true },
  { id: 2, title_en: 'GOSI portal', title_ar: 'بوابة التأمينات الاجتماعية', url: 'https://www.gosi.gov.sa', category: 'Government', active: true },
  { id: 3, title_en: 'ZATCA Fatoora', title_ar: 'فاتورة - هيئة الزكاة والضريبة', url: 'https://fatoora.zatca.gov.sa', category: 'Finance', active: true },
  { id: 4, title_en: 'Qiwa labor platform', title_ar: 'منصة قوى', url: 'https://www.qiwa.sa', category: 'Government', active: true },
];

const COMPANY = {
  id: 1,
  legal_name_en: 'HRplus Consulting Company',
  legal_name_ar: 'شركة إتش آر بلس للاستشارات',
  trade_name_en: 'HRplus',
  trade_name_ar: 'إتش آر بلس',
  vat_number: '310122393500003',
  cr_number: '1010223344',
  street: 'King Fahd Road',
  building_no: '7412',
  district: 'Al Olaya',
  city: 'Riyadh',
  postal_code: '12212',
  country: 'SA',
  phone: '+966112000000',
  email: 'info@hrplus.sa',
  website: 'https://hrplus.sa',
  logo_url: null,
  primary_color: '#0f8f83',
  secondary_color: '#12333f',
  branch_name: 'Riyadh HQ',
  geofence_lat: 24.6995,
  geofence_lng: 46.6853,
  geofence_radius: 200,
  working_hours: { start: '08:00', end: '17:00', days: [0, 1, 2, 3, 4] },
  settings: {
    security: { session_timeout_minutes: 30, require_mfa_for_admin: false, password_min_length: 10 },
    attendance: { grace_minutes: 15, remote_exempt: true },
    expense: { receipt_required_above: 100 },
    expense_chain: [
      { max: 1000, steps: ['Line Manager'] },
      { max: 5000, steps: ['Line Manager', 'Finance'] },
      { max: null, steps: ['Line Manager', 'Finance', 'CEO'] },
    ],
    gosi: { saudi_employee: 0.0975, saudi_employer: 0.1175, expat_employee: 0, expat_employer: 0.02, cap: 45000, floor: 1500 },
    invoicing: { payment_terms_days: 30, prefix: 'INV', default_design: 'classic', vat_rate: 0.15 },
    integrations: { google: false, whatsapp: false },
  },
};

export function seedBase({ force = false } = {}) {
  const has = (name) => table(name).length > 0 && !force;
  // Mirrors the column defaults: created_at everywhere, updated_at where the schema has it.
  const put = (name, rows) => {
    if (has(name)) return;
    const now = new Date().toISOString();
    const stamp = UPDATED_AT_TABLES.has(name) ? { created_at: now, updated_at: now } : { created_at: now };
    table(name).splice(0, table(name).length, ...rows.map((r) => ({ ...stamp, ...r })));
  };

  put('company', [COMPANY]);
  put('vendors', CLIENTS);
  put('leave_types', LEAVE_TYPES);
  put('holidays', HOLIDAYS);
  put('expense_categories', EXPENSE_CATEGORIES);
  put('rules', RULES.map((r) => ({ ...r, published_at: '2026-09-01T09:00:00Z' })));
  put('faqs', FAQS);
  put('app_links', APP_LINKS);
  put('webhooks', []);
  put('api_keys', []);
  put('secrets', [{ key: 'seed_token', value: 'local-seed-token' }]);
  // keep the id sequence ahead of the seeded rows so inserts don't collide
  for (const [name, rows] of [['vendors', CLIENTS], ['company', [COMPANY]], ['holidays', HOLIDAYS], ['leave_types', LEAVE_TYPES], ['expense_categories', EXPENSE_CATEGORIES], ['rules', RULES], ['faqs', FAQS], ['app_links', APP_LINKS]]) {
    const maxId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
    store.seq[name] = Math.max(store.seq[name] || 0, maxId);
  }
  touch(); flush();
}
