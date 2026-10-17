/* =====================================================
   TuitionPro – Application Script (corrected)
   -----------------------------------------------------
   1  Helpers                 6  Students page
   2  Auth (Supabase)         7  Fee management page
   3  Data store              8  Reminders page
   4  Calculations            9  Reports page
   5  Navigation & Dashboard  10 Settings page / Init
===================================================== */
'use strict';


/* =========================================
   TuitionPro — Supabase Connection
========================================= */

const SUPABASE_URL = "https://loelqfshkmpnlyoluprw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BepBa-Rh5ItN7tR4NQrhhQ_b8t1tvww";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

/* ---------- 1. HELPERS ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const uid = () => crypto.randomUUID();
const money = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => (String(n).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase();

function localDate(d = new Date()) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
const curMonth = () => localDate().slice(0, 7);
function monthLabel(m) { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
function monthShort(m) { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'short' }); }
function addMonths(m, n) { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function monthsBetween(a, b) { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1) + 1; }
function fmtDate(s) { if (!s) return '—'; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function lastMonths(n) { const c = curMonth(); return Array.from({ length: n }, (_, i) => addMonths(c, i - n + 1)); }

function toast(msg, type = 'success') {
    const icon = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' }[type];
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + esc(msg) + '</span>';
    $('#toastStack').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
}

function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
}
function toCSV(rows) {
    return '\uFEFF' + rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
}

/* Modal */
const modalOverlay = $('#modalOverlay');
function openModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    modalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    const first = $('#modalBody input, #modalBody select, #modalBody textarea');
    if (first) setTimeout(() => first.focus(), 50);
    return $('#modalBody');
}
function closeModal() { modalOverlay.hidden = true; document.body.style.overflow = ''; $('#modalBody').innerHTML = ''; }
$('#modalClose').addEventListener('click', closeModal);
modalOverlay.addEventListener('mousedown', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalOverlay.hidden) closeModal(); });

/* ---------- 2. AUTH (Supabase) ---------- */
const Auth = {
    async signUp({ name, tuition, email, password }) {
        const cleanEmail = email.trim().toLowerCase();

        const { data, error } = await supabaseClient.auth.signUp({
            email: cleanEmail,
            password,
            options: {
                data: {
                    full_name: name.trim(),
                    institute_name: tuition.trim()
                }
            }
        });

        if (error) throw error;
        if (!data.user) throw new Error('Account creation failed.');

        // With email confirmation enabled, no session may exist yet.
        if (!data.session) {
            return {
                needsEmailConfirmation: true,
                email: cleanEmail
            };
        }

        const user = {
            id: data.user.id,
            name: name.trim(),
            tuition: tuition.trim(),
            email: cleanEmail
        };

        const { error: profileError } = await supabaseClient
            .from('tutors')
            .upsert({
                id: data.user.id,
                full_name: user.name,
                institute_name: user.tuition
            });

        if (profileError) throw profileError;

        return user;
    },

    async signIn(email, password) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
        });

        if (error) throw error;
        if (!data.user) throw new Error('Sign-in failed.');

        const { data: profile, error: profileError } = await supabaseClient
            .from('tutors')
            .select('full_name, institute_name')
            .eq('id', data.user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        const user = {
            id: data.user.id,
            name: profile?.full_name || data.user.user_metadata?.full_name || '',
            tuition: profile?.institute_name || data.user.user_metadata?.institute_name || '',
            email: data.user.email
        };

        const { error: saveError } = await supabaseClient
            .from('tutors')
            .upsert({
                id: user.id,
                full_name: user.name,
                institute_name: user.tuition
            });

        if (saveError) throw saveError;

        return user;
    },

    async signOut() {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
    },

    async resetPassword(email) {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(
            email.trim().toLowerCase(),
            {
                redirectTo: window.location.origin + window.location.pathname
            }
        );

        if (error) throw error;
    },

    async updatePassword(newPassword) {
        const { error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;
    },

    async current() {
        const { data, error } = await supabaseClient.auth.getUser();
        if (error || !data.user) return null;

        const authUser = data.user;
        const { data: profile, error: profileError } = await supabaseClient
            .from('tutors')
            .select('full_name, institute_name')
            .eq('id', authUser.id)
            .maybeSingle();

        if (profileError) throw profileError;

        return {
            id: authUser.id,
            name: profile?.full_name || authUser.user_metadata?.full_name || '',
            tuition: profile?.institute_name || authUser.user_metadata?.institute_name || '',
            email: authUser.email
        };
    }
};


/* ---------- 3. DATA STORE (local cache + Supabase) ---------- */
const DEFAULT_TEMPLATE = 'Hello, this is {tuition}. A friendly reminder that the tuition fee of {amount} for {student} ({month}) is pending. Please pay at your earliest convenience. Thank you.';


const Store = {
    key: id => 'tfm_data_' + id,

    fresh(user = {}) {
        return {
            students: [],
            payments: [],
            settings: {
                tutorName: user.name || '',
                tuitionName: user.tuition || '',
                phone: '',
                email: user.email || '',
                dueDay: 10,
                photo: '',
                template: DEFAULT_TEMPLATE
            }
        };
    },

    load(id) {
        try {
            const d = JSON.parse(localStorage.getItem(this.key(id)));
            if (d) return d;
        } catch {
            // Ignore invalid local data.
        }

        return this.fresh(state.user || {});
    },

    save(id, data) {
        try {
            localStorage.setItem(this.key(id), JSON.stringify(data));
        } catch {
            toast('Could not save – browser storage is full.', 'error');
        }
    }
};


const state = { user: null, data: null, page: 'dashboard' };
function persist() { Store.save(state.user.id, state.data); }

let cloudSaveError = null;

function reportCloudSaveError(error) {
    cloudSaveError = error;
    console.error('TuitionPro cloud save failed:', error);

    toast(
        'Cloud save failed. Your local backup is preserved.',
        'error'
    );
}

const S = () => state.data.settings;

/* ----- Cloud row converters & helpers ----- */
function studentToRow(s) {
    return {
        id: s.id,
        tutor_id: state.user.id,
        name: s.name,
        class_name: s.grade || '',
        subject: s.subject || '',
        parent_name: s.parentName || '',
        parent_phone: s.phone || '',
        monthly_fee: Number(s.fee) || 0,
        joined_on: s.joinDate,
        status: String(s.status || 'Active').toLowerCase(),
        notes: s.notes || ''
    };
}

function paymentToRow(p) {
    return {
        id: p.id,
        tutor_id: state.user.id,
        student_id: p.studentId,
        month: p.month,
        amount: Number(p.amount) || 0,
        payment_date: p.date,
        payment_method: p.method || 'UPI',
        notes: p.note || '',
        status: 'paid'
    };
}

async function cloudDeleteAll(table) {
    const { error } = await supabaseClient
        .from(table)
        .delete()
        .eq('tutor_id', state.user.id);
    if (error) throw error;
}

async function cloudInsertRows(table, rows) {
    if (!rows.length) return;
    const { error } = await supabaseClient.from(table).insert(rows);
    if (error) throw error;
}

/* Replace the tutor's cloud students & payments with the given lists. */
async function cloudReplaceAll(students, payments) {
    await cloudDeleteAll('tuitionpro_payments');
    await cloudDeleteAll('tuitionpro_students');
    await cloudInsertRows('tuitionpro_students', students.map(studentToRow));
    await cloudInsertRows('tuitionpro_payments', payments.map(paymentToRow));
}

/* ---------- 4. CALCULATIONS ---------- */
function paidFor(studentId, month) {
    return state.data.payments.filter(p => p.studentId === studentId && p.month === month).reduce((t, p) => t + Number(p.amount), 0);
}
function feeStatus(student, month) {
    const joined = (student.joinDate || '').slice(0, 7);
    const fee = Number(student.fee), paid = paidFor(student.id, month);
    if (student.status !== 'Active' || (joined && joined > month)) return { status: 'N/A', fee, paid, balance: 0 };
    const balance = Math.max(0, fee - paid);
    let status;
    if (balance === 0) status = 'Paid';
    else if (month < curMonth()) status = 'Overdue';
    else if (month === curMonth()) status = (new Date().getDate() > Number(S().dueDay || 10)) ? 'Overdue' : (paid > 0 ? 'Partial' : 'Pending');
    else status = 'Pending';
    if (status === 'Overdue' && paid > 0) status = 'Overdue';
    else if (status === 'Pending' && paid > 0) status = 'Partial';
    return { status, fee, paid, balance };
}
function monthStats(month) {
    const students = state.data.students.filter(s => s.status === 'Active' && (s.joinDate || '').slice(0, 7) <= month);
    const expected = students.reduce((t, s) => t + Number(s.fee), 0);
    const collected = state.data.payments.filter(p => p.month === month).reduce((t, p) => t + Number(p.amount), 0);
    return { expected, collected };
}
function pendingList(month) {
    return state.data.students.map(s => ({ s, ...feeStatus(s, month) })).filter(r => r.balance > 0);
}
function outstandingTotal(student) {
    if (student.status !== 'Active') return 0;
    const j = (student.joinDate || curMonth()).slice(0, 7);
    const n = Math.max(0, monthsBetween(j, curMonth()));
    const paid = state.data.payments.filter(p => p.studentId === student.id).reduce((t, p) => t + Number(p.amount), 0);
    return Math.max(0, Number(student.fee) * n - paid);
}
function badge(status) {
    const cls = { Paid: 'b-paid', Pending: 'b-pending', Partial: 'b-partial', Overdue: 'b-overdue', Active: 'b-active', Inactive: 'b-inactive', 'N/A': 'b-na' }[status] || 'b-na';
    return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
}
function avatarHTML(name, size = 'sm') { return '<div class="avatar ' + size + '">' + esc(initials(name)) + '</div>'; }
function whatsappLink(student, month) {
    const digits = String(student.phone || '').replace(/\D/g, '');
    if (!digits) return null;
    const phone = digits.length === 10 ? '91' + digits : digits;
    const st = feeStatus(student, month);
    const msg = (S().template || DEFAULT_TEMPLATE)
        .replace(/\{student\}/g, student.name).replace(/\{amount\}/g, money(st.balance || student.fee))
        .replace(/\{month\}/g, monthLabel(month)).replace(/\{tuition\}/g, S().tuitionName || 'your tutor');
    return { url: 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), msg };
}

/* ---------- 5. NAVIGATION & DASHBOARD ---------- */
const views = {
    landing: $('#landingView'),
    auth: $('#authView'),
    app: $('#appView'),
    resetPassword: $('#resetPasswordView')
};
function showView(name) {
    Object.entries(views).forEach(([k, el]) => { if (el) el.hidden = k !== name; });
    window.scrollTo(0, 0);
}
function setAuthTab(tab) {
    $$('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#signinForm').hidden = tab !== 'signin';
    $('#signupForm').hidden = tab !== 'signup';
    $('#siMsg').textContent = ''; $('#suMsg').textContent = '';
}
document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) {
        e.preventDefault();
        const t = go.dataset.go;
        if (t === 'landing') showView('landing');
        else { setAuthTab(t); showView('auth'); }
    }
    const tl = e.target.closest('[data-tab-link]');
    if (tl) { e.preventDefault(); setAuthTab(tl.dataset.tabLink); }
    const tab = e.target.closest('.auth-tab');
    if (tab) setAuthTab(tab.dataset.tab);
    const pw = e.target.closest('[data-toggle-pw]');
    if (pw) {
        const input = document.getElementById(pw.dataset.togglePw);
        input.type = input.type === 'password' ? 'text' : 'password';
        pw.innerHTML = '<i class="fa-regular ' + (input.type === 'password' ? 'fa-eye' : 'fa-eye-slash') + '"></i>';
    }
});

function setMsg(el, text, ok = false) { el.textContent = text; el.classList.toggle('ok', ok); }

$('#signinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#siEmail').value, pw = $('#siPassword').value, msg = $('#siMsg');
    if (!email.trim() || !pw) return setMsg(msg, 'Please enter your email and password.');
    const btn = e.submitter; btn.disabled = true; setMsg(msg, 'Signing in…', true);
    try { const user = await Auth.signIn(email, pw); enterApp(user); e.target.reset(); setMsg(msg, ''); }
    catch (err) { setMsg(msg, err.message); }
    finally { btn.disabled = false; }
});

$('#signupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#suMsg');
    const v = { name: $('#suName').value, tuition: $('#suTuition').value, email: $('#suEmail').value, password: $('#suPassword').value };
    if (!v.name.trim() || !v.tuition.trim()) return setMsg(msg, 'Please enter your name and tuition centre name.');
    if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) {
        return setMsg(msg, 'Please enter a valid email address.');
    }
    if (v.password.length < 6) return setMsg(msg, 'Password must be at least 6 characters.');
    if (v.password !== $('#suConfirm').value) return setMsg(msg, 'Passwords do not match.');
    const btn = e.submitter; btn.disabled = true; setMsg(msg, 'Creating your account…', true);

    try {
        const user = await Auth.signUp(v);

        if (user.needsEmailConfirmation) {
            setMsg(
                msg,
                'Account created! Check ' + user.email +
                ' for the confirmation link, then sign in.',
                true
            );
            e.target.reset();
            return;
        }

        enterApp(user, true);
        e.target.reset();
        setMsg(msg, '');
    } catch (err) {
        setMsg(msg, err.message);
    } finally { btn.disabled = false; }
});


async function loadDataFromSupabase(user) {
    // Start with the current tutor's local settings as a safe fallback.
    const data = Store.load(user.id);

    const { data: cloudStudents, error: studentsError } =
        await supabaseClient
            .from('tuitionpro_students')
            .select('*')
            .eq('tutor_id', user.id);

    if (studentsError) {
        throw new Error('Could not load students: ' + studentsError.message);
    }

    const { data: cloudPayments, error: paymentsError } =
        await supabaseClient
            .from('tuitionpro_payments')
            .select('*')
            .eq('tutor_id', user.id);

    if (paymentsError) {
        throw new Error('Could not load payments: ' + paymentsError.message);
    }

    // Convert Supabase student fields to TuitionPro's existing format.
    data.students = cloudStudents.map(s => ({
        id: s.id,
        name: s.name,
        grade: s.class_name || '',
        subject: s.subject || '',
        parentName: s.parent_name || '',
        phone: s.parent_phone || '',
        fee: Number(s.monthly_fee) || 0,
        joinDate: s.joined_on,
        status: (s.status || 'active').toLowerCase() === 'inactive'
            ? 'Inactive'
            : 'Active',
        notes: s.notes || ''
    }));

    // Convert Supabase payment fields to the existing app format.
    data.payments = cloudPayments.map(p => ({
        id: p.id,
        studentId: p.student_id,
        month: p.month || '',
        amount: Number(p.amount) || 0,
        date: p.payment_date,
        method: p.payment_method || 'UPI',
        note: p.notes || ''
    }));

    // Load the tutor profile, if it exists.
    const { data: profile, error: profileError } =
        await supabaseClient
            .from('tutors')
            .select('full_name, phone, institute_name')
            .eq('id', user.id)
            .maybeSingle();

    if (profileError) {
        throw new Error('Could not load tutor profile: ' + profileError.message);
    }

    if (profile) {
        data.settings.tutorName = profile.full_name || data.settings.tutorName;
        data.settings.phone = profile.phone || data.settings.phone;
        data.settings.tuitionName =
            profile.institute_name || data.settings.tuitionName;
    }

    // Load saved preferences, if available.
    const { data: cloudSettings, error: settingsError } =
        await supabaseClient
            .from('tuitionpro_settings')
            .select('reminder_message, profile_photo_url')
            .eq('tutor_id', user.id)
            .maybeSingle();

    if (settingsError) {
        throw new Error('Could not load tutor settings: ' + settingsError.message);
    }

    if (cloudSettings) {
        if (cloudSettings.reminder_message) {
            data.settings.template = cloudSettings.reminder_message;
        }

        // Profile photo = hosted URL from Supabase Storage (empty if none).
        data.settings.photo = cloudSettings.profile_photo_url || '';
    }

    // Cache the successfully loaded cloud data locally.
    Store.save(user.id, data);

    return data;
}



async function enterApp(user, isNew = false) {
    state.user = user;
    state.data = Store.load(user.id);

    showView('app');
    refreshChrome();
    navigate('dashboard');

    try {
        state.data = await loadDataFromSupabase(user);

        refreshChrome();
        navigate('dashboard');

        toast(
            isNew
                ? 'Welcome to TuitionPro, ' + user.name.split(' ')[0] + '!'
                : 'Welcome back, ' + user.name.split(' ')[0] + '!',
            'success'
        );
    } catch (error) {
        console.error('Cloud data loading failed:', error);

        toast(
            'Could not load cloud data. Please check your connection.',
            'error'
        );
    }
}



$('#logoutBtn').addEventListener('click', async () => {
    if (!confirm('Log out of TuitionPro?')) return;

    try {
        await Auth.signOut();

        state.user = null;
        state.data = null;

        closeSidebar();
        showView('landing');
        toast('You have been logged out.', 'success');
    } catch (err) {
        toast('Could not log out: ' + err.message, 'error');
    }
});


/* Sidebar (mobile) */
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('show'); }
$('#menuBtn').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.add('show'); });
$('#sidebarBackdrop').addEventListener('click', closeSidebar);
$$('.nav-btn[data-page]').forEach(b => b.addEventListener('click', () => { navigate(b.dataset.page); closeSidebar(); }));
$('#bellBtn').addEventListener('click', () => navigate('reminders'));
$('#profileChip').addEventListener('click', () => navigate('settings'));

/* Header / badge refresh */
function refreshChrome() {
    const s = S();
    $('#topName').textContent = s.tutorName || state.user.name;
    $('#topTuition').textContent = s.tuitionName || 'Tuition';
    const av = $('#topAvatar');
    if (s.photo) { av.style.backgroundImage = 'url(' + s.photo + ')'; av.textContent = ''; }
    else { av.style.backgroundImage = ''; av.textContent = initials(s.tutorName || state.user.name); }
    const n = pendingList(curMonth()).length;
    ['#bellBadge', '#navPendingBadge'].forEach(sel => { const el = $(sel); el.textContent = n; el.hidden = n === 0; });
}

const PAGES = {
    dashboard: { title: 'Dashboard', sub: () => 'Overview for ' + monthLabel(curMonth()), render: renderDashboard },
    students: { title: 'Students', sub: () => 'Manage all your student records', render: renderStudents },
    fees: { title: 'Fee Management', sub: () => 'Collect and track monthly fees', render: renderFees },
    reminders: { title: 'WhatsApp Reminders', sub: () => 'Remind parents about pending fees', render: renderReminders },
    reports: { title: 'Reports', sub: () => 'Collections and payment insights', render: renderReports },
    settings: { title: 'Settings', sub: () => 'Profile, preferences and backup', render: renderSettings }
};

function navigate(page) {
    state.page = page;
    const p = PAGES[page];
    $('#pageTitle').textContent = p.title;
    $('#pageSubtitle').textContent = p.sub();
    $$('.nav-btn[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    p.render();
    window.scrollTo(0, 0);
}
function rerender() { PAGES[state.page].render(); refreshChrome(); }

/* Delegated page actions */
const actions = {};
$('#pageRoot').addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el && actions[el.dataset.act]) actions[el.dataset.act](el.dataset.id, el);
});
const inputHandlers = {};
['input', 'change'].forEach(ev => $('#pageRoot').addEventListener(ev, e => { const h = inputHandlers[e.target.id]; if (h) h(e); }));

function emptyState(icon, title, text, btns = '') {
    return '<div class="empty"><i class="fa-solid ' + icon + '"></i><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + btns + '</div>';
}

/* ----- Dashboard ----- */
function chartHTML(months) {
    const data = months.map(m => ({ m, ...monthStats(m) }));
    const max = Math.max(1, ...data.map(d => Math.max(d.expected, d.collected)));
    return '<div class="chart">' + data.map(d =>
        '<div class="chart-col"><div class="chart-bars">' +
        '<div class="bar exp" style="height:' + (d.expected / max * 100) + '%" data-tip="Expected ' + money(d.expected) + '"></div>' +
        '<div class="bar col" style="height:' + (d.collected / max * 100) + '%" data-tip="Collected ' + money(d.collected) + '"></div>' +
        '</div><span class="chart-lbl">' + monthShort(d.m) + '</span></div>').join('') + '</div>' +
        '<div class="legend"><span><i style="background:#e0e7ff"></i>Expected</span><span><i style="background:#4f46e5"></i>Collected</span></div>';
}

function renderDashboard() {
    const cm = curMonth();
    const students = state.data.students;
    const active = students.filter(s => s.status === 'Active').length;
    const { expected, collected } = monthStats(cm);
    const pend = pendingList(cm);
    const pendAmt = pend.reduce((t, r) => t + r.balance, 0);
    const overdue = pend.filter(r => r.status === 'Overdue').length;
    const recent = [...state.data.payments].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 6);
    const name = (S().tutorName || state.user.name).split(' ')[0];

    $('#pageRoot').innerHTML =
        '<div class="card-head"><div><h2>Hello, ' + esc(name) + ' 👋</h2><p>Here is how ' + esc(monthLabel(cm)) + ' is going.</p></div>' +
        '<button class="btn btn-primary" data-act="addPayment"><i class="fa-solid fa-plus"></i> Record Payment</button></div>' +

        '<div class="stats">' +
        stat('ico-blue', 'fa-users', 'Total Students', students.length, active + ' active') +
        stat('ico-green', 'fa-wallet', 'Collected This Month', money(collected), 'of ' + money(expected) + ' expected') +
        stat('ico-amber', 'fa-clock', 'Pending Fees', money(pendAmt), pend.length + ' student(s) unpaid') +
        stat('ico-red', 'fa-calendar-xmark', 'Overdue Students', overdue, 'Past due day ' + (S().dueDay || 10)) +
        '</div>' +

        '<div class="grid-2">' +
        '<div class="card"><div class="card-head"><div><h3>Collections – last 6 months</h3><p>Expected vs. collected fees</p></div></div>' +
        (students.length ? chartHTML(lastMonths(6)) : emptyState('fa-chart-column', 'No data yet', 'Add students and record payments to see your chart.')) + '</div>' +

        '<div class="card"><div class="card-head"><div><h3>Needs attention</h3><p>Unpaid this month</p></div><button class="btn btn-outline btn-sm" data-act="goReminders">View all</button></div>' +
        (pend.length ? pend.slice(0, 6).map(r =>
            '<div class="list-item">' + avatarHTML(r.s.name) + '<div class="grow"><strong>' + esc(r.s.name) + '</strong><small>' + esc(r.s.grade || '') + '</small></div>' +
            '<div style="text-align:right"><div class="amt">' + money(r.balance) + '</div>' + badge(r.status) + '</div></div>').join('')
            : emptyState('fa-circle-check', 'All clear', students.length ? 'Every student has paid this month.' : 'No students added yet.')) +
        '</div></div>' +

        '<div class="card" style="margin-top:20px"><div class="card-head"><div><h3>Recent payments</h3><p>Latest fee transactions</p></div></div>' +
        (recent.length ? paymentsTable(recent, false) : emptyState('fa-receipt', 'No payments yet', 'Recorded payments will show up here.')) + '</div>';
}
function stat(cls, icon, label, val, sub) {
    return '<div class="stat"><div class="stat-ico ' + cls + '"><i class="fa-solid ' + icon + '"></i></div><div class="lbl">' + label + '</div><div class="val">' + val + '</div><div class="sub">' + esc(sub) + '</div></div>';
}
actions.goReminders = () => navigate('reminders');

function paymentsTable(list, withActions = true) {
    return '<div class="table-wrap"><table><thead><tr><th>Student</th><th>For month</th><th>Paid on</th><th>Method</th><th class="num">Amount</th>' + (withActions ? '<th></th>' : '') + '</tr></thead><tbody>' +
        list.map(p => {
            const st = state.data.students.find(s => s.id === p.studentId);
            return '<tr><td><div class="cell-user">' + avatarHTML(st ? st.name : '?') + '<div><strong>' + esc(st ? st.name : 'Deleted student') + '</strong>' + (p.note ? '<small>' + esc(p.note) + '</small>' : '') + '</div></div></td>' +
                '<td>' + monthLabel(p.month) + '</td><td>' + fmtDate(p.date) + '</td><td>' + esc(p.method) + '</td><td class="num"><strong>' + money(p.amount) + '</strong></td>' +
                (withActions ? '<td><div class="row-actions"><button class="btn btn-outline btn-sm" data-act="receipt" data-id="' + p.id + '"><i class="fa-solid fa-print"></i> Receipt</button><button class="btn btn-danger btn-sm" data-act="delPayment" data-id="' + p.id + '" aria-label="Delete payment"><i class="fa-solid fa-trash"></i></button></div></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
}

/* ---------- 6. STUDENTS PAGE ---------- */
const ui = { stSearch: '', stFilter: 'All', feeMonth: curMonth(), feeFilter: 'All', feeSearch: '', remMonth: curMonth(), remSearch: '', remPhone: 'all', repRange: 6 };

function renderStudents() {
    $('#pageRoot').innerHTML =
        '<div class="card"><div class="card-head"><div><h2>All students</h2><p id="stCount"></p></div>' +
        '<button class="btn btn-primary" data-act="addStudent"><i class="fa-solid fa-user-plus"></i> Add Student</button></div>' +
        '<div class="toolbar"><div class="grow search-wrap"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="stSearch" placeholder="Search by name, class or phone…" value="' + esc(ui.stSearch) + '"></div>' +
        '<select id="stFilter" aria-label="Filter by status">' + ['All', 'Active', 'Inactive'].map(o => '<option' + (ui.stFilter === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>' +
        '<button class="btn btn-outline" data-act="exportStudents"><i class="fa-solid fa-download"></i> Export CSV</button></div>' +
        '<div id="stRows"></div></div>';
    renderStudentRows();
}
function renderStudentRows() {
    const q = ui.stSearch.toLowerCase().trim();
    const list = state.data.students.filter(s =>
        (ui.stFilter === 'All' || s.status === ui.stFilter) &&
        (!q || [s.name, s.grade, s.subject, s.phone, s.parentName].some(v => String(v || '').toLowerCase().includes(q))));
    $('#stCount').textContent = list.length + ' of ' + state.data.students.length + ' students';
    const box = $('#stRows');
    if (!state.data.students.length) {
        box.innerHTML = emptyState('fa-users', 'No students yet', 'Add your first student to start tracking fees.',
            '<button class="btn btn-primary" data-act="addStudent"><i class="fa-solid fa-user-plus"></i> Add Student</button><button class="btn btn-outline" data-act="loadSample">Load sample data</button>');
        return;
    }
    if (!list.length) { box.innerHTML = emptyState('fa-magnifying-glass', 'No matches', 'Try a different search or filter.'); return; }
    box.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Student</th><th>Class / Subject</th><th>Parent</th><th class="num">Monthly fee</th><th>Joined</th><th>Status</th><th></th></tr></thead><tbody>' +
        list.map(s => '<tr><td><div class="cell-user">' + avatarHTML(s.name) + '<div><strong>' + esc(s.name) + '</strong></div></div></td>' +
            '<td>' + esc(s.grade || '—') + (s.subject ? '<br><small class="muted">' + esc(s.subject) + '</small>' : '') + '</td>' +
            '<td>' + esc(s.parentName || '—') + '<br><small class="muted">' + esc(s.phone || 'No phone') + '</small></td>' +
            '<td class="num"><strong>' + money(s.fee) + '</strong></td><td>' + fmtDate(s.joinDate) + '</td><td>' + badge(s.status) + '</td>' +
            '<td><div class="row-actions">' +
            '<button class="btn btn-outline btn-sm" data-act="viewStudent" data-id="' + s.id + '"><i class="fa-solid fa-eye"></i> View</button>' +
            '<button class="btn btn-outline btn-sm" data-act="editStudent" data-id="' + s.id + '" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>' +
            '<button class="btn btn-danger btn-sm" data-act="delStudent" data-id="' + s.id + '" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>' +
            '</div></td></tr>').join('') + '</tbody></table></div>';
}
inputHandlers.stSearch = e => { ui.stSearch = e.target.value; renderStudentRows(); };
inputHandlers.stFilter = e => { ui.stFilter = e.target.value; renderStudentRows(); };

function studentForm(s = {}) {
    const f = (id, label, val, extra = '', cls = '') => '<div class="field ' + cls + '"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(val ?? '') + '" ' + extra + '></div>';
    return '<form id="studentForm" novalidate><div class="form-grid">' +
        f('fName', 'Student name *', s.name, 'placeholder="e.g. Aarav Sharma" required', 'full') +
        f('fGrade', 'Class / Grade', s.grade, 'placeholder="e.g. Class 9"') +
        f('fSubject', 'Subject(s)', s.subject, 'placeholder="e.g. Maths, Science"') +
        f('fParent', 'Parent name', s.parentName, 'placeholder="e.g. Mr. Sharma"') +
        f('fPhone', 'Parent WhatsApp number *', s.phone, 'type="tel" inputmode="numeric" maxlength="10" placeholder="10-digit mobile number"') +
        f('fFee', 'Monthly fee (₹) *', s.fee, 'type="number" min="1" step="1" placeholder="e.g. 1500"') +
        f('fJoin', 'Joining date *', s.joinDate || localDate(), 'type="date"') +
        '<div class="field"><label for="fStatus">Status</label><select id="fStatus"><option' + (s.status !== 'Inactive' ? ' selected' : '') + '>Active</option><option' + (s.status === 'Inactive' ? ' selected' : '') + '>Inactive</option></select></div>' +
        '<div class="field full"><label for="fNotes">Notes</label><textarea id="fNotes" placeholder="Timings, remarks…">' + esc(s.notes || '') + '</textarea></div>' +
        '</div><p class="auth-msg" id="fMsg"></p><div class="form-actions"><button type="button" class="btn btn-outline" id="fCancel">Cancel</button><button class="btn btn-primary" type="submit">' + (s.id ? 'Update Student' : 'Save Student') + '</button></div></form>';
}

async function openStudentForm(id) {
    const s = id ? state.data.students.find(x => x.id === id) : {};
    const body = openModal(id ? 'Edit student' : 'Add new student', studentForm(s));

    $('#fCancel', body).addEventListener('click', closeModal);

    $('#fPhone', body).addEventListener('input', e => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });

    $('#studentForm', body).addEventListener('submit', async e => {
        e.preventDefault();

        const rec = {
            name: $('#fName', body).value.trim(),
            grade: $('#fGrade', body).value.trim(),
            subject: $('#fSubject', body).value.trim(),
            parentName: $('#fParent', body).value.trim(),
            phone: $('#fPhone', body).value.trim(),
            fee: Number($('#fFee', body).value),
            joinDate: $('#fJoin', body).value,
            status: $('#fStatus', body).value,
            notes: $('#fNotes', body).value.trim()
        };

        const err = !rec.name
            ? 'Please enter the student name.'
            : !/^\d{10}$/.test(rec.phone)
                ? 'Enter a valid 10-digit parent phone number.'
                : !(rec.fee > 0)
                    ? 'Enter a valid monthly fee.'
                    : !rec.joinDate
                        ? 'Select the joining date.'
                        : '';

        if (err) return setMsg($('#fMsg', body), err);

        const submitButton = $('button[type="submit"]', body);
        if (submitButton) submitButton.disabled = true;

        try {
            const payload = {
                tutor_id: state.user.id,
                name: rec.name,
                class_name: rec.grade,
                subject: rec.subject,
                parent_name: rec.parentName,
                parent_phone: rec.phone,
                monthly_fee: rec.fee,
                joined_on: rec.joinDate,
                status: rec.status.toLowerCase(),
                notes: rec.notes
            };

            if (id) {
                const { data, error } = await supabaseClient
                    .from('tuitionpro_students')
                    .update(payload)
                    .eq('id', id)
                    .eq('tutor_id', state.user.id)
                    .select()
                    .single();

                if (error) throw error;

                Object.assign(s, rec, { id: data.id });
            } else {
                const { data, error } = await supabaseClient
                    .from('tuitionpro_students')
                    .insert(payload)
                    .select()
                    .single();

                if (error) throw error;

                state.data.students.push({ id: data.id, ...rec });
            }

            persist();
            closeModal();
            rerender();

            toast(id ? 'Student updated.' : 'Student added.', 'success');
        } catch (error) {
            reportCloudSaveError(error);
            setMsg(
                $('#fMsg', body),
                'Could not save student to the cloud. Please try again.'
            );

            if (submitButton) submitButton.disabled = false;
        }
    });
}

actions.addStudent = () => openStudentForm();
actions.editStudent = id => openStudentForm(id);

actions.delStudent = async id => {
    const s = state.data.students.find(x => x.id === id);
    if (!s) return;

    if (!confirm(
        'Delete ' + s.name +
        ' and all their payment records? This cannot be undone.'
    )) return;

    try {
        // Remove payments first in case there is no cascade rule in the database.
        const { error: payError } = await supabaseClient
            .from('tuitionpro_payments')
            .delete()
            .eq('student_id', id)
            .eq('tutor_id', state.user.id);

        if (payError) throw payError;

        const { error } = await supabaseClient
            .from('tuitionpro_students')
            .delete()
            .eq('id', id)
            .eq('tutor_id', state.user.id);

        if (error) throw error;

        state.data.students = state.data.students.filter(x => x.id !== id);
        state.data.payments = state.data.payments.filter(p => p.studentId !== id);

        persist();
        rerender();
        toast('Student deleted.', 'success');
    } catch (error) {
        reportCloudSaveError(error);
    }
};

actions.viewStudent = id => {
    const s = state.data.students.find(x => x.id === id);
    const pays = state.data.payments.filter(p => p.studentId === id).sort((a, b) => b.date.localeCompare(a.date));
    const totalPaid = pays.reduce((t, p) => t + Number(p.amount), 0);
    const cur = feeStatus(s, curMonth());
    const body = openModal('Student profile',
        '<div class="photo-row">' + avatarHTML(s.name, 'lg') + '<div><h3>' + esc(s.name) + '</h3><p class="muted">' + esc([s.grade, s.subject].filter(Boolean).join(' • ') || 'No class added') + '</p>' + badge(s.status) + '</div></div>' +
        '<div class="kv"><div><small>Parent</small><strong>' + esc(s.parentName || '—') + '</strong></div><div><small>Phone</small><strong>' + esc(s.phone || '—') + '</strong></div>' +
        '<div><small>Monthly fee</small><strong>' + money(s.fee) + '</strong></div><div><small>Joined</small><strong>' + fmtDate(s.joinDate) + '</strong></div>' +
        '<div><small>This month</small><strong>' + badge(cur.status) + '</strong></div><div><small>Total paid</small><strong>' + money(totalPaid) + '</strong></div>' +
        '<div><small>Total outstanding</small><strong style="color:' + (outstandingTotal(s) ? 'var(--red)' : 'var(--green)') + '">' + money(outstandingTotal(s)) + '</strong></div>' +
        '<div class="full"><small>Notes</small><strong>' + esc(s.notes || '—') + '</strong></div></div>' +
        '<h4 style="margin:22px 0 10px">Payment history</h4>' +
        (pays.length ? paymentsTable(pays, false) : '<p class="muted">No payments recorded yet.</p>') +
        '<div class="form-actions"><button class="btn btn-outline" id="vEdit"><i class="fa-solid fa-pen"></i> Edit</button><button class="btn btn-primary" id="vPay"><i class="fa-solid fa-plus"></i> Record payment</button></div>');
    $('#vEdit', body).addEventListener('click', () => { closeModal(); openStudentForm(id); });
    $('#vPay', body).addEventListener('click', () => { closeModal(); openPaymentForm({ studentId: id }); });
};
actions.exportStudents = () => {
    if (!state.data.students.length) return toast('No students to export.', 'error');
    const rows = [['Name', 'Class', 'Subject', 'Parent', 'Phone', 'Monthly Fee', 'Joined', 'Status', 'Outstanding']];
    state.data.students.forEach(s => rows.push([s.name, s.grade, s.subject, s.parentName, s.phone, s.fee, s.joinDate, s.status, outstandingTotal(s)]));
    downloadFile('students.csv', toCSV(rows), 'text/csv;charset=utf-8'); toast('Students exported.');
};

/* ---------- 7. FEE MANAGEMENT PAGE ---------- */
function renderFees() {
    $('#pageRoot').innerHTML =
        '<div class="toolbar"><input type="month" id="feeMonth" value="' + ui.feeMonth + '" aria-label="Select month">' +
        '<div class="grow search-wrap"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="feeSearch" placeholder="Search student…" value="' + esc(ui.feeSearch) + '"></div>' +
        '<select id="feeFilter" aria-label="Filter by status">' + ['All', 'Paid', 'Partial', 'Pending', 'Overdue'].map(o => '<option' + (ui.feeFilter === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>' +
        '<button class="btn btn-primary" data-act="addPayment"><i class="fa-solid fa-plus"></i> Record Payment</button></div>' +
        '<div class="stats" id="feeStats" style="grid-template-columns:repeat(3,minmax(0,1fr))"></div>' +
        '<div class="card"><div class="card-head"><div><h3>Fee status – <span id="feeMonthLbl"></span></h3><p>Every active student for the selected month</p></div></div><div id="feeRows"></div></div>' +
        '<div class="card" style="margin-top:20px"><div class="card-head"><div><h3>Payments received</h3><p>Transactions for the selected month</p></div></div><div id="feePays"></div></div>';
    renderFeeRows();
}
function renderFeeRows() {
    const m = ui.feeMonth || curMonth();
    $('#feeMonthLbl').textContent = monthLabel(m);
    const all = state.data.students.map(s => ({ s, ...feeStatus(s, m) })).filter(r => r.status !== 'N/A');
    const { expected, collected } = monthStats(m);
    const pendAmt = all.reduce((t, r) => t + r.balance, 0);
    $('#feeStats').innerHTML = stat('ico-blue', 'fa-bullseye', 'Expected', money(expected), all.length + ' active students') +
        stat('ico-green', 'fa-wallet', 'Collected', money(collected), expected ? Math.round(collected / expected * 100) + '% of expected' : '—') +
        stat('ico-amber', 'fa-clock', 'Pending', money(pendAmt), all.filter(r => r.balance > 0).length + ' unpaid');

    const q = ui.feeSearch.toLowerCase().trim();
    const rows = all.filter(r => (ui.feeFilter === 'All' || r.status === ui.feeFilter) && (!q || r.s.name.toLowerCase().includes(q)));
    $('#feeRows').innerHTML = !state.data.students.length
        ? emptyState('fa-users', 'No students yet', 'Add students first, then record their fees.', '<button class="btn btn-primary" data-act="addStudent">Add Student</button>')
        : !rows.length ? emptyState('fa-filter', 'Nothing to show', 'No students match this filter.')
        : '<div class="table-wrap"><table><thead><tr><th>Student</th><th class="num">Fee</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>' +
            rows.map(r => '<tr><td><div class="cell-user">' + avatarHTML(r.s.name) + '<div><strong>' + esc(r.s.name) + '</strong><small>' + esc(r.s.grade || '') + '</small></div></div></td>' +
                '<td class="num">' + money(r.fee) + '</td><td class="num">' + money(r.paid) + '</td><td class="num"><strong>' + money(r.balance) + '</strong></td><td>' + badge(r.status) + '</td>' +
                '<td><div class="row-actions">' + (r.balance > 0
                    ? '<button class="btn btn-primary btn-sm" data-act="collect" data-id="' + r.s.id + '"><i class="fa-solid fa-indian-rupee-sign"></i> Collect</button><button class="btn btn-wa btn-sm" data-act="remind" data-id="' + r.s.id + '" aria-label="WhatsApp reminder"><i class="fa-brands fa-whatsapp"></i></button>'
                    : '<span class="muted"><i class="fa-solid fa-check"></i> Settled</span>') + '</div></td></tr>').join('') + '</tbody></table></div>';

    const pays = state.data.payments.filter(p => p.month === m).sort((a, b) => b.date.localeCompare(a.date));
    $('#feePays').innerHTML = pays.length ? paymentsTable(pays) : emptyState('fa-receipt', 'No payments this month', 'Recorded payments for this month appear here.');
}
inputHandlers.feeMonth = e => { if (e.target.value) { ui.feeMonth = e.target.value; renderFeeRows(); } };
inputHandlers.feeSearch = e => { ui.feeSearch = e.target.value; renderFeeRows(); };
inputHandlers.feeFilter = e => { ui.feeFilter = e.target.value; renderFeeRows(); };

function openPaymentForm({ studentId = '', month = null } = {}) {
    const students = state.data.students.filter(s => s.status === 'Active');
    if (!students.length) { toast('Add an active student first.', 'error'); return; }
    month = month || (state.page === 'fees' ? ui.feeMonth : curMonth());
    const body = openModal('Record payment',
        '<form id="payForm" novalidate><div class="form-grid">' +
        '<div class="field full"><label for="pStudent">Student *</label><select id="pStudent">' + students.map(s => '<option value="' + s.id + '"' + (s.id === studentId ? ' selected' : '') + '>' + esc(s.name) + (s.grade ? ' – ' + esc(s.grade) : '') + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="pMonth">Fee for month *</label><input type="month" id="pMonth" value="' + month + '"></div>' +
        '<div class="field"><label for="pAmount">Amount (₹) *</label><input type="number" id="pAmount" min="1" step="1"><small id="pHint"></small></div>' +
        '<div class="field"><label for="pDate">Payment date *</label><input type="date" id="pDate" value="' + localDate() + '"></div>' +
        '<div class="field"><label for="pMethod">Method</label><select id="pMethod"><option>UPI</option><option>Cash</option><option>Bank Transfer</option><option>Cheque</option></select></div>' +
        '<div class="field full"><label for="pNote">Note (optional)</label><input id="pNote" placeholder="e.g. Paid by father"></div>' +
        '</div><p class="auth-msg" id="pMsg"></p><div class="form-actions"><button type="button" class="btn btn-outline" id="pCancel">Cancel</button><button class="btn btn-primary" type="submit">Save Payment</button></div></form>');
    const sync = () => {
        const s = state.data.students.find(x => x.id === $('#pStudent').value);
        const st = feeStatus(s, $('#pMonth').value || curMonth());
        $('#pAmount').value = st.balance > 0 ? st.balance : s.fee;
        $('#pHint').textContent = 'Fee ' + money(st.fee) + ' • Already paid ' + money(st.paid) + ' • Balance ' + money(st.balance);
    };
    $('#pStudent', body).addEventListener('change', sync);
    $('#pMonth', body).addEventListener('change', sync);
    sync();
    $('#pCancel', body).addEventListener('click', closeModal);

    $('#payForm', body).addEventListener('submit', async e => {
        e.preventDefault();

        const rec = {
            studentId: $('#pStudent').value,
            month: $('#pMonth').value,
            amount: Number($('#pAmount').value),
            date: $('#pDate').value,
            method: $('#pMethod').value,
            note: $('#pNote').value.trim()
        };

        if (!rec.month || !rec.date || !(rec.amount > 0)) {
            return setMsg(
                $('#pMsg'),
                'Please fill in month, date and a valid amount.'
            );
        }

        const student = state.data.students.find(
            x => x.id === rec.studentId
        );

        if (!student) {
            return setMsg($('#pMsg'), 'Please select a valid student.');
        }

        const st = feeStatus(student, rec.month);

        if (
            st.balance > 0 &&
            rec.amount > st.balance &&
            !confirm(
                'This is more than the balance of ' +
                money(st.balance) +
                '. Record anyway?'
            )
        ) {
            return;
        }

        const submitButton = $('button[type="submit"]', body);
        if (submitButton) submitButton.disabled = true;

        try {
            const payload = {
                tutor_id: state.user.id,
                student_id: rec.studentId,
                month: rec.month,
                amount: rec.amount,
                payment_date: rec.date,
                payment_method: rec.method,
                notes: rec.note,
                status: 'paid'
            };

            const { data, error } = await supabaseClient
                .from('tuitionpro_payments')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;

            state.data.payments.push({
                ...rec,
                id: data.id
            });

            persist();
            closeModal();
            rerender();

            toast(
                'Payment of ' + money(rec.amount) + ' saved to the cloud.',
                'success'
            );
        } catch (error) {
            reportCloudSaveError(error);

            setMsg(
                $('#pMsg', body),
                'Could not save payment to the cloud. Please try again.'
            );

            if (submitButton) submitButton.disabled = false;
        }
    });

}
actions.addPayment = () => openPaymentForm();
actions.collect = id => openPaymentForm({ studentId: id, month: ui.feeMonth });
actions.remind = id => sendReminder(id, ui.feeMonth);

actions.delPayment = async id => {
    if (!confirm('Delete this payment record?')) return;

    try {
        const { error } = await supabaseClient
            .from('tuitionpro_payments')
            .delete()
            .eq('id', id)
            .eq('tutor_id', state.user.id);

        if (error) throw error;

        state.data.payments = state.data.payments.filter(p => p.id !== id);
        persist();
        rerender();
        toast('Payment deleted.', 'info');
    } catch (error) {
        reportCloudSaveError(error);
    }
};

actions.receipt = id => {
    const p = state.data.payments.find(x => x.id === id);
    const s = state.data.students.find(x => x.id === p.studentId) || { name: 'Student' };
    const w = window.open('', '_blank');
    if (!w) return toast('Please allow pop-ups to print the receipt.', 'error');
    const no = 'RCPT-' + p.id.slice(-6).toUpperCase();
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(no) + '</title><style>' +
        'body{font-family:Arial,sans-serif;color:#0f172a;max-width:560px;margin:40px auto;padding:0 20px}.box{border:2px solid #4f46e5;border-radius:14px;padding:28px}' +
        'h1{margin:0;color:#4f46e5;font-size:24px}h2{margin:2px 0 18px;font-size:14px;font-weight:400;color:#64748b}table{width:100%;border-collapse:collapse;margin:18px 0}' +
        'td{padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px}td:last-child{text-align:right;font-weight:600}.total td{border:none;font-size:18px;color:#16a34a}' +
        '.meta{display:flex;justify-content:space-between;font-size:13px;color:#64748b}.foot{text-align:center;margin-top:18px;font-size:12px;color:#94a3b8}button{margin-top:20px;padding:10px 18px;border:0;background:#4f46e5;color:#fff;border-radius:8px;cursor:pointer}@media print{button{display:none}}' +
        '</style></head><body><div class="box"><h1>' + esc(S().tuitionName || 'Tuition') + '</h1><h2>Fee Receipt' + (S().phone ? ' • ' + esc(S().phone) : '') + '</h2>' +
        '<div class="meta"><span>Receipt: ' + esc(no) + '</span><span>Date: ' + esc(fmtDate(p.date)) + '</span></div>' +
        '<table><tr><td>Student</td><td>' + esc(s.name) + '</td></tr><tr><td>Class</td><td>' + esc(s.grade || '—') + '</td></tr><tr><td>Fee for</td><td>' + esc(monthLabel(p.month)) + '</td></tr>' +
        '<tr><td>Payment method</td><td>' + esc(p.method) + '</td></tr><tr class="total"><td>Amount received</td><td>' + esc(money(p.amount)) + '</td></tr></table>' +
        '<div class="foot">Received by ' + esc(S().tutorName || '') + '. Thank you!</div></div><button onclick="window.print()">Print / Save as PDF</button></body></html>');
    w.document.close();
};

/* ---------- 8. REMINDERS PAGE ---------- */
function sendReminder(id, month) {
    const s = state.data.students.find(x => x.id === id);
    const link = whatsappLink(s, month);
    if (!link) return toast('Add a parent phone number for ' + s.name + ' first.', 'error');
    window.open(link.url, '_blank', 'noopener,noreferrer');
}
function renderReminders() {
    $('#pageRoot').innerHTML =
        '<div class="toolbar"><input type="month" id="remMonth" value="' + ui.remMonth + '" aria-label="Select month">' +
        '<div class="grow search-wrap"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="remSearch" placeholder="Search student…" value="' + esc(ui.remSearch) + '"></div>' +
        '<select id="remPhone" aria-label="Phone filter"><option value="all"' + (ui.remPhone === 'all' ? ' selected' : '') + '>All pending</option><option value="missing"' + (ui.remPhone === 'missing' ? ' selected' : '') + '>Phone missing</option><option value="available"' + (ui.remPhone === 'available' ? ' selected' : '') + '>Phone available</option></select></div>' +
        '<div class="stats" id="remStats" style="grid-template-columns:repeat(2,minmax(0,1fr))"></div>' +
        '<div class="card"><div class="card-head"><div><h3>Students needing reminders</h3><p>Opens WhatsApp with a ready message. Edit the template in Settings.</p></div></div><div id="remRows"></div></div>';
    renderReminderRows();
}
function renderReminderRows() {
    const m = ui.remMonth || curMonth();
    const all = pendingList(m);
    $('#remStats').innerHTML = stat('ico-amber', 'fa-clock', 'Pending payments', all.length, monthLabel(m)) +
        stat('ico-red', 'fa-indian-rupee-sign', 'Total outstanding', money(all.reduce((t, r) => t + r.balance, 0)), 'For the selected month');
    const q = ui.remSearch.toLowerCase().trim();
    const rows = all.filter(r => {
        const has = /\d/.test(r.s.phone || '');
        return r.s.name.toLowerCase().includes(q) && (ui.remPhone === 'all' || (ui.remPhone === 'missing' ? !has : has));
    });
    $('#remRows').innerHTML = !rows.length
        ? emptyState('fa-circle-check', all.length ? 'No matches' : 'No pending reminders', all.length ? 'Try changing the filters.' : 'Great! Everyone has paid for this month.')
        : '<div class="table-wrap"><table><thead><tr><th>Student</th><th>Parent phone</th><th class="num">Pending</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.map(r => '<tr><td><div class="cell-user">' + avatarHTML(r.s.name) + '<div><strong>' + esc(r.s.name) + '</strong><small>' + esc(r.s.parentName || '') + '</small></div></div></td>' +
            '<td>' + esc(r.s.phone || 'Not added') + '</td><td class="num"><strong>' + money(r.balance) + '</strong></td><td>' + badge(r.status) + '</td>' +
            '<td><div class="row-actions"><button class="btn btn-wa btn-sm" data-act="sendRem" data-id="' + r.s.id + '"><i class="fa-brands fa-whatsapp"></i> Send</button>' +
            '<button class="btn btn-outline btn-sm" data-act="copyRem" data-id="' + r.s.id + '" aria-label="Copy message"><i class="fa-regular fa-copy"></i></button></div></td></tr>').join('') + '</tbody></table></div>';
}
inputHandlers.remMonth = e => { if (e.target.value) { ui.remMonth = e.target.value; renderReminderRows(); } };
inputHandlers.remSearch = e => { ui.remSearch = e.target.value; renderReminderRows(); };
inputHandlers.remPhone = e => { ui.remPhone = e.target.value; renderReminderRows(); };
actions.sendRem = id => sendReminder(id, ui.remMonth);
actions.copyRem = async id => {
    const link = whatsappLink(state.data.students.find(x => x.id === id), ui.remMonth);
    if (!link) return toast('No phone number saved, but you can still copy the message after adding one.', 'error');
    try { await navigator.clipboard.writeText(link.msg); toast('Message copied.'); } catch { toast('Could not copy automatically.', 'error'); }
};

/* ---------- 9. REPORTS PAGE ---------- */
function renderReports() {
    const months = lastMonths(ui.repRange);
    const data = months.map(m => ({ m, ...monthStats(m) }));
    const expected = data.reduce((t, d) => t + d.expected, 0);
    const collected = data.reduce((t, d) => t + d.collected, 0);
    const rate = expected ? Math.min(100, collected / expected * 100) : 0;
    const outstanding = state.data.students.reduce((t, s) => t + outstandingTotal(s), 0);
    const inRange = state.data.payments.filter(p => months.includes(p.month));
    const methods = {}; inRange.forEach(p => { methods[p.method] = (methods[p.method] || 0) + Number(p.amount); });
    const mTotal = Object.values(methods).reduce((a, b) => a + b, 0);
    const defaulters = state.data.students.map(s => ({ s, out: outstandingTotal(s) })).filter(r => r.out > 0).sort((a, b) => b.out - a.out).slice(0, 6);

    $('#pageRoot').innerHTML =
        '<div class="toolbar no-print"><select id="repRange" aria-label="Range">' + [3, 6, 12].map(n => '<option value="' + n + '"' + (ui.repRange === n ? ' selected' : '') + '>Last ' + n + ' months</option>').join('') + '</select>' +
        '<div style="margin-left:auto;display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-outline" data-act="exportPayments"><i class="fa-solid fa-download"></i> Payments CSV</button>' +
        '<button class="btn btn-primary" data-act="printReport"><i class="fa-solid fa-print"></i> Print report</button></div></div>' +
        '<div class="stats">' +
        stat('ico-green', 'fa-indian-rupee-sign', 'Fees collected', money(collected), 'Last ' + ui.repRange + ' months') +
        stat('ico-blue', 'fa-bullseye', 'Fees expected', money(expected), 'Based on active students') +
        stat('ico-purple', 'fa-chart-pie', 'Collection rate', rate.toFixed(1) + '%', 'Collected ÷ expected') +
        stat('ico-red', 'fa-triangle-exclamation', 'Total outstanding', money(outstanding), 'All unpaid months') + '</div>' +

        '<div class="grid-2"><div class="card"><div class="card-head"><div><h3>Monthly collections</h3><p>Expected vs. collected</p></div></div>' + (state.data.students.length ? chartHTML(months) : emptyState('fa-chart-column', 'No data yet', 'Add students and payments to build reports.')) + '</div>' +
        '<div class="card"><div class="card-head"><div><h3>Collection progress</h3><p>' + rate.toFixed(1) + '% of fees received</p></div></div><div class="progress green"><div style="width:' + rate + '%"></div></div>' +
        '<h4 style="margin:26px 0 14px">Payment methods</h4>' +
        (mTotal ? Object.entries(methods).sort((a, b) => b[1] - a[1]).map(([k, v]) => '<div class="method-row"><div class="top"><span>' + esc(k) + '</span><strong>' + money(v) + ' (' + Math.round(v / mTotal * 100) + '%)</strong></div><div class="progress"><div style="width:' + (v / mTotal * 100) + '%"></div></div></div>').join('') : '<p class="muted">No payments in this period.</p>') +
        '</div></div>' +

        '<div class="card" style="margin-top:20px"><div class="card-head"><div><h3>Highest outstanding balances</h3><p>Students with the most unpaid fees</p></div></div>' +
        (defaulters.length ? defaulters.map(r => '<div class="list-item">' + avatarHTML(r.s.name) + '<div class="grow"><strong>' + esc(r.s.name) + '</strong><small>' + esc(r.s.grade || '') + '</small></div><div class="amt" style="color:var(--red)">' + money(r.out) + '</div></div>').join('') : emptyState('fa-circle-check', 'No outstanding balances', 'Everyone is up to date.')) + '</div>';
}
inputHandlers.repRange = e => { ui.repRange = Number(e.target.value); renderReports(); };
actions.printReport = () => window.print();
actions.exportPayments = () => {
    if (!state.data.payments.length) return toast('No payments to export.', 'error');
    const rows = [['Student', 'Fee for month', 'Paid on', 'Method', 'Amount', 'Note']];
    [...state.data.payments].sort((a, b) => b.date.localeCompare(a.date)).forEach(p => {
        const s = state.data.students.find(x => x.id === p.studentId);
        rows.push([s ? s.name : 'Deleted student', monthLabel(p.month), p.date, p.method, p.amount, p.note]);
    });
    downloadFile('payments.csv', toCSV(rows), 'text/csv;charset=utf-8'); toast('Payments exported.');
};

/* ---------- 10. SETTINGS PAGE ---------- */
function renderSettings() {
    const s = S();
    $('#pageRoot').innerHTML =
        '<form id="settingsForm" class="card settings-section" novalidate><div class="card-head"><div><h3>Profile &amp; tuition centre</h3><p>These details appear on receipts and reminders.</p></div></div>' +
        '<div class="photo-row"><div class="avatar lg" id="setAvatar" style="' + (s.photo ? 'background-image:url(' + s.photo + ')' : '') + '">' + (s.photo ? '' : esc(initials(s.tutorName))) + '</div>' +
        '<div><input type="file" id="photoInput" accept="image/*" hidden><button type="button" class="btn btn-outline btn-sm" data-act="pickPhoto"><i class="fa-solid fa-camera"></i> Upload photo</button> ' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="removePhoto">Remove</button><p class="muted" style="font-size:12px;margin-top:6px">JPG, PNG or WEBP. Resized and saved to your account.</p></div></div>' +
        '<div class="form-grid">' +
        '<div class="field"><label for="setName">Tutor name *</label><input id="setName" value="' + esc(s.tutorName) + '"></div>' +
        '<div class="field"><label for="setTuition">Tuition centre name *</label><input id="setTuition" value="' + esc(s.tuitionName) + '"></div>' +
        '<div class="field"><label for="setPhone">Contact number</label><input id="setPhone" type="tel" value="' + esc(s.phone) + '"></div>' +
        '<div class="field"><label for="setEmail">Email</label><input id="setEmail" type="email" value="' + esc(s.email) + '"></div>' +
        '<div class="field"><label for="setDue">Fee due day of month</label><input id="setDue" type="number" min="1" max="28" value="' + esc(s.dueDay || 10) + '"><small>Fees unpaid after this day are marked Overdue.</small></div>' +
        '<div class="field full"><label for="setTpl">WhatsApp reminder message</label><textarea id="setTpl">' + esc(s.template) + '</textarea><small>Placeholders: {student} {amount} {month} {tuition}</small></div></div>' +
        '<p class="auth-msg" id="setMsg"></p><div class="form-actions"><button type="button" class="btn btn-outline" data-act="resetTpl">Reset message</button><button class="btn btn-primary" type="submit">Save Settings</button></div></form>' +

        '<div class="card settings-section"><div class="card-head"><div><h3>Backup &amp; data</h3><p>Download a backup, restore one, or try the app with sample data.</p></div></div>' +
        '<div class="form-actions" style="justify-content:flex-start"><button class="btn btn-outline" data-act="backup"><i class="fa-solid fa-download"></i> Download backup</button>' +
        '<input type="file" id="restoreInput" accept="application/json" hidden><button class="btn btn-outline" data-act="restore"><i class="fa-solid fa-upload"></i> Restore backup</button>' +
        '<button class="btn btn-outline" data-act="loadSample"><i class="fa-solid fa-flask"></i> Load sample data</button></div></div>' +

        '<div class="card settings-section danger-zone"><div class="card-head"><div><h3>Danger zone</h3><p>These actions cannot be undone.</p></div></div>' +
        '<div class="form-actions" style="justify-content:flex-start"><button class="btn btn-danger" data-act="clearData"><i class="fa-solid fa-eraser"></i> Delete all students &amp; payments</button>' +
        '<button class="btn btn-danger" data-act="deleteAccount"><i class="fa-solid fa-user-xmark"></i> Delete account data</button></div></div>';

    $('#settingsForm').addEventListener('submit', async e => {
        e.preventDefault();
        const name = $('#setName').value.trim(), tuition = $('#setTuition').value.trim(), due = Number($('#setDue').value);
        if (!name || !tuition) return setMsg($('#setMsg'), 'Tutor name and tuition centre name are required.');
        if (!(due >= 1 && due <= 28)) return setMsg($('#setMsg'), 'Due day must be between 1 and 28.');

        Object.assign(S(), {
            tutorName: name,
            tuitionName: tuition,
            phone: $('#setPhone').value.trim(),
            email: $('#setEmail').value.trim(),
            dueDay: due,
            template: $('#setTpl').value.trim() || DEFAULT_TEMPLATE
        });
        persist();
        refreshChrome();

        const submitButton = $('button[type="submit"]', $('#settingsForm'));
        if (submitButton) submitButton.disabled = true;

        try {
            const { error: tutorError } = await supabaseClient
                .from('tutors')
                .upsert({
                    id: state.user.id,
                    full_name: S().tutorName,
                    phone: S().phone,
                    institute_name: S().tuitionName
                });
            if (tutorError) throw tutorError;

            const { error: settingsError } = await supabaseClient
                .from('tuitionpro_settings')
                .upsert(
                    {
                        tutor_id: state.user.id,
                        reminder_message: S().template
                    },
                    { onConflict: 'tutor_id' }
                );
            if (settingsError) throw settingsError;

            setMsg($('#setMsg'), 'Settings saved successfully.', true);
            toast('Settings saved.');
        } catch (error) {
            reportCloudSaveError(error);
            setMsg($('#setMsg'), 'Saved on this device, but the cloud save failed.');
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
    $('#photoInput').addEventListener('change', handlePhoto);
    $('#restoreInput').addEventListener('change', handleRestore);
}
actions.pickPhoto = () => $('#photoInput').click();
actions.removePhoto = async () => {
    if (!S().photo) return toast('There is no photo to remove.', 'info');

    try {
        const { error } = await supabaseClient.storage
            .from(PHOTO_BUCKET)
            .remove([photoPath()]);
        if (error) throw error;

        await savePhotoUrl(null);

        S().photo = '';
        persist();
        refreshChrome();
        renderSettings();
        toast('Photo removed.', 'info');
    } catch (error) {
        reportCloudSaveError(error);
    }
};
actions.resetTpl = () => { $('#setTpl').value = DEFAULT_TEMPLATE; };

/* ----- Profile photo (Supabase Storage) ----- */
const PHOTO_BUCKET = 'profile-photos';
const photoPath = () => state.user.id + '/avatar.jpg';

async function savePhotoUrl(url) {
    const { error } = await supabaseClient
        .from('tuitionpro_settings')
        .upsert(
            { tutor_id: state.user.id, profile_photo_url: url },
            { onConflict: 'tutor_id' }
        );
    if (error) throw error;
}

async function uploadProfilePhoto(blob) {
    const path = photoPath();

    const { error } = await supabaseClient.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, {
            upsert: true,
            contentType: 'image/jpeg',
            cacheControl: '3600'
        });
    if (error) throw error;

    const { data } = supabaseClient.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    // ?v= makes the browser fetch the new picture instead of the cached old one.
    const url = data.publicUrl + '?v=' + Date.now();

    await savePhotoUrl(url);

    S().photo = url;
    persist();
    refreshChrome();
    renderSettings();
}

function handlePhoto(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Please choose an image file.', 'error');
    if (file.size > 10 * 1024 * 1024) return toast('Image is too large (max 10 MB).', 'error');

    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            const size = 220, c = document.createElement('canvas'); c.width = c.height = size;
            const min = Math.min(img.width, img.height);
            c.getContext('2d').drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
            c.toBlob(async blob => {
                if (!blob) return toast('Could not process this image.', 'error');
                toast('Uploading photo…', 'info');
                try {
                    await uploadProfilePhoto(blob);
                    toast('Photo updated.');
                } catch (error) {
                    reportCloudSaveError(error);
                }
            }, 'image/jpeg', 0.85);
        };
        img.onerror = () => toast('Could not read this image.', 'error');
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
}

actions.backup = () => {
    downloadFile('tuitionpro-backup-' + localDate() + '.json', JSON.stringify(state.data, null, 2), 'application/json');
    toast('Backup downloaded.');
};
actions.restore = () => $('#restoreInput').click();

function handleRestore(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        let d;
        try {
            d = JSON.parse(reader.result);
            if (!Array.isArray(d.students) || !Array.isArray(d.payments) || typeof d.settings !== 'object') throw new Error('bad');
        } catch {
            toast('This is not a valid TuitionPro backup file.', 'error');
            return;
        }

        if (!confirm('Restoring replaces your current data. Continue?')) return;

        try {
            await cloudReplaceAll(d.students, d.payments);

            state.data = d;
            persist();
            refreshChrome();
            renderSettings();
            toast('Backup restored.');
        } catch (error) {
            reportCloudSaveError(error);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

actions.clearData = async () => {
    if (!confirm('Delete ALL students and payments? This cannot be undone.')) return;

    try {
        await cloudDeleteAll('tuitionpro_payments');
        await cloudDeleteAll('tuitionpro_students');

        state.data.students = [];
        state.data.payments = [];
        persist();
        rerender();
        toast('All records deleted.', 'info');
    } catch (error) {
        reportCloudSaveError(error);
    }
};

actions.deleteAccount = async () => {
    if (!confirm('Permanently delete all your TuitionPro data and sign out?')) return;

    try {
        await cloudDeleteAll('tuitionpro_payments');
        await cloudDeleteAll('tuitionpro_students');
        await cloudDeleteAll('tuitionpro_settings');

        // Remove the profile photo file too (ignore errors if there is none).
        await supabaseClient.storage.from(PHOTO_BUCKET).remove([photoPath()]);

        const { error: tutorError } = await supabaseClient
            .from('tutors')
            .delete()
            .eq('id', state.user.id);
        if (tutorError) throw tutorError;

        localStorage.removeItem(Store.key(state.user.id));

        await Auth.signOut();
        state.user = null;
        state.data = null;
        showView('landing');
        toast('Your data was deleted and you have been signed out.', 'info');
    } catch (error) {
        reportCloudSaveError(error);
    }
};

actions.loadSample = async () => {
    if (state.data.students.length && !confirm('This adds sample students to your existing records. Continue?')) return;
    const names = [['Aarav Sharma', 'Class 9', 'Maths', 'Mr. Sharma', 1500], ['Priya Reddy', 'Class 10', 'Science', 'Mrs. Reddy', 1800], ['Rahul Verma', 'Class 8', 'English', 'Mr. Verma', 1200],
        ['Sneha Patel', 'Class 7', 'Maths', 'Mrs. Patel', 1000], ['Kiran Kumar', 'Class 10', 'Physics', 'Mr. Kumar', 2000], ['Ananya Iyer', 'Class 6', 'All subjects', 'Mrs. Iyer', 1300]];
    const methods = ['UPI', 'Cash', 'UPI', 'Bank Transfer'];
    const cm = curMonth();
    const newStudents = [];
    const newPayments = [];

    names.forEach((n, i) => {
        const s = { id: uid(), name: n[0], grade: n[1], subject: n[2], parentName: n[3], phone: '9' + String(800000000 + i * 1234567).slice(0, 9), fee: n[4], joinDate: addMonths(cm, -3) + '-05', status: 'Active', notes: 'Sample student' };
        newStudents.push(s);
        [-3, -2, -1, 0].forEach(off => {
            const m = addMonths(cm, off);
            if (off === 0 && i % 3 !== 0) return;
            if (off === -1 && i === 3) return;
            newPayments.push({ id: uid(), studentId: s.id, month: m, amount: s.fee, date: m + '-0' + (3 + (i % 5)), method: methods[(i + off + 4) % 4], note: '' });
        });
    });

    try {
        await cloudInsertRows('tuitionpro_students', newStudents.map(studentToRow));
        await cloudInsertRows('tuitionpro_payments', newPayments.map(paymentToRow));

        state.data.students.push(...newStudents);
        state.data.payments.push(...newPayments);
        persist(); rerender(); toast('Sample data added.');
    } catch (error) {
        reportCloudSaveError(error);
    }
};


/* ---------- FORGOT PASSWORD ---------- */
const forgotPasswordLink = document.getElementById('forgotPasswordLink');

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async function (event) {
        event.preventDefault();

        const emailInput = document.getElementById('siEmail');
        const email = emailInput.value.trim();
        const message = document.getElementById('siMsg');

        if (!email) {
            emailInput.focus();
            message.textContent = 'Please enter your email address first.';
            return;
        }

        try {
            await Auth.resetPassword(email);
            message.textContent = 'Password reset email sent. Check your inbox.';
        } catch (error) {
            message.textContent = error.message;
        }
    });
}


/* ---------- PASSWORD RESET SCREEN ---------- */
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) {
        window.__tuitionProRecoveryActive = true;
        showView('resetPassword');
    }
});

const resetPasswordForm = document.getElementById('resetPasswordForm');

if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        const password = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;
        const message = document.getElementById('resetPasswordMsg');
        const button = this.querySelector('button[type="submit"]');

        if (password.length < 6) {
            message.textContent = 'Password must be at least 6 characters.';
            return;
        }

        if (password !== confirmPassword) {
            message.textContent = 'Passwords do not match.';
            return;
        }

        button.disabled = true;
        message.textContent = 'Updating password...';

        try {
            await Auth.updatePassword(password);

            message.textContent = 'Password updated successfully!';

            await Auth.signOut();

            window.__tuitionProRecoveryActive = false;
            this.reset();

            setTimeout(() => {
                setAuthTab('signin');
                showView('auth');

                document.getElementById('siMsg').textContent =
                    'Password changed successfully. Please sign in.';
            }, 1000);
        } catch (error) {
            message.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    });
}


/* ---------- INIT ---------- */
(async function init() {
    const y = new Date().getFullYear();

    $('#footYear').textContent = y;
    $('#appYear').textContent = y;

    const isRecoveryLink = () =>
        window.__tuitionProRecoveryActive === true ||
        window.location.hash.includes('type=recovery') ||
        new URLSearchParams(window.location.search).has('code');

    // Check recovery before restoring the normal session.
    if (isRecoveryLink()) {
        showView('resetPassword');
        return;
    }

    try {
        const user = await Auth.current();

        // Check again in case recovery was detected while loading.
        if (isRecoveryLink()) {
            showView('resetPassword');
            return;
        }

        if (user) {
            enterApp(user);
        } else {
            showView('landing');
        }
    } catch (err) {
        console.error('Session restoration failed:', err);

        if (isRecoveryLink()) {
            showView('resetPassword');
        } else {
            showView('landing');
        }
    }
})();