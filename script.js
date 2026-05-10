// 1. ข้อมูลเริ่มต้น
const USERS_KEY = 'classsync-users';
const SESSION_KEY = 'classsync-current-user';
const SESSION_TOKEN_KEY = 'classsync-auth-token';
const THEME_KEY = 'classsync-theme';
const NOTIFIED_KEY = 'classsync-deadline-notified';
const API_BASE_URL = '';
const ALERT_WINDOW_DAYS = 7;
const DEADLINE_NOTIFY_WINDOW_HOURS = 10;
const DEADLINE_NOTIFY_INTERVAL_MS = 60 * 60 * 1000;
const APP_TOAST_VISIBLE_MS = 9000;

let tasks = [];
let currentUserEmail = null;
let authMode = 'login';
let selectedDayKey = null;
let visibleCalendarDate = new Date();
let deadlinePickerDate = new Date();
let selectedInsightTag = null;
let selectedInsightFilter = 'all';
let detailReturnView = 'view-home';
let authToken = localStorage.getItem(SESSION_TOKEN_KEY) || '';
let usersCache = {};

let selectedColor = "#6db08c";

function getUsers() {
    return usersCache;
}

function saveUsers(users) {
    usersCache = users || {};
    if (!authToken) return;

    apiRequest('/api/users/state', {
        method: 'PUT',
        body: JSON.stringify({ users: usersCache })
    }).then(data => {
        usersCache = data.users || usersCache;
        if (currentUserEmail && usersCache[currentUserEmail]) {
            tasks = usersCache[currentUserEmail].tasks || tasks;
        }
    }).catch(error => {
        console.error('Could not save data to the server:', error);
    });
}

async function apiRequest(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || 'Server request failed.');
    }

    return data;
}

function ensureUserSocialData(user) {
    user.friends = Array.isArray(user.friends) ? user.friends : [];
    user.friendRequests = Array.isArray(user.friendRequests) ? user.friendRequests : [];
    user.sentFriendRequests = Array.isArray(user.sentFriendRequests) ? user.sentFriendRequests : [];
    user.groupInvites = Array.isArray(user.groupInvites) ? user.groupInvites : [];
    user.tasks = Array.isArray(user.tasks) ? user.tasks : [];
    user.tagColors = user.tagColors || {};
    return user;
}

function getCurrentUser() {
    if (!currentUserEmail) return null;
    const users = getUsers();
    if (!users[currentUserEmail]) return null;
    return ensureUserSocialData(users[currentUserEmail]);
}

function saveCurrentUser(user) {
    if (!currentUserEmail || !user) return;
    const users = getUsers();
    users[currentUserEmail] = ensureUserSocialData(user);
    saveUsers(users);
}

function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

function normalizeTag(tag) {
    return (tag || 'NO TAG').trim().toUpperCase() || 'NO TAG';
}

function getTaskTag(task) {
    return normalizeTag(task.tag);
}

function getTaskColor(task, fallback = '#6db08c') {
    return task.color || getRememberedTagColors()[getTaskTag(task)] || fallback;
}

function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function normalizeSubmissionUrl(value) {
    const rawUrl = String(value || '').trim();
    if (!rawUrl) return '';

    const urlWithProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try {
        const url = new URL(urlWithProtocol);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.href;
    } catch (error) {
        return null;
    }
}

function getSubmissionLinkHTML(task) {
    const url = normalizeSubmissionUrl(task?.submissionUrl);
    if (!url) return '';

    return `
        <a class="submission-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
            Open submission website
        </a>
    `;
}

function setTheme(theme) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', nextTheme === 'dark');
    localStorage.setItem(THEME_KEY, nextTheme);
    document.querySelectorAll('.theme-option').forEach(button => {
        button.classList.toggle('active', button.dataset.theme === nextTheme);
    });
}

function initTheme() {
    setTheme(localStorage.getItem(THEME_KEY) || 'light');
}

function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateTitle(dateKey) {
    return new Date(`${dateKey}T00:00`).toLocaleDateString('th-TH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatCalendarTitle(date) {
    return date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });
}

function changeCalendarMonth(offset) {
    visibleCalendarDate = new Date(
        visibleCalendarDate.getFullYear(),
        visibleCalendarDate.getMonth() + offset,
        1
    );
    renderCalendar(tasks);
}

function handleProgressCardKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    showView('view-progress-summary');
}

function getDeadlineAlerts() {
    const now = Date.now();
    const alertWindow = ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return tasks
        .filter(task => {
            if (task.status !== 'pending') return false;
            const diff = new Date(task.deadline).getTime() - now;
            return diff > 0 && diff <= alertWindow;
        })
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
}

function getUrgentDeadlineTasks() {
    const now = Date.now();
    const notifyWindow = DEADLINE_NOTIFY_WINDOW_HOURS * 60 * 60 * 1000;
    return tasks
        .filter(task => {
            if (task.status !== 'pending') return false;
            const diff = new Date(task.deadline).getTime() - now;
            return diff > 0 && diff <= notifyWindow;
        })
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
}

function getOverdueDeadlineTasks() {
    const now = Date.now();
    return tasks
        .filter(task => task.status === 'pending' && new Date(task.deadline).getTime() <= now)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
}

function getNotificationLog() {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
}

function saveNotificationLog(log) {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(log));
}

function requestDeadlineNotifications(showResult = true) {
    if (!('Notification' in window)) {
        if (showResult) alert('This browser does not support notifications.');
        return;
    }

    if (Notification.permission === 'granted') {
        sendDeadlineNotifications({ forceBrowser: true });
        if (showResult) alert('Deadline notifications are enabled for this browser.');
        return;
    }

    if (Notification.permission === 'denied') {
        if (showResult) alert('Browser notifications are blocked. ClassSync will still show in-app reminders while this page is open.');
        return;
    }

    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            sendDeadlineNotifications({ forceBrowser: true });
            if (showResult) alert('Deadline notifications are enabled for this browser.');
        } else if (showResult) {
            alert('ClassSync will still show in-app reminders while this page is open.');
        }
    });
}

function requestDeadlineNotificationsOnStart() {
    setTimeout(() => requestDeadlineNotifications(false), 600);
}

function showPendingGroupInviteNotifications() {
    const me = getCurrentUser();
    if (!me || !me.groupInvites.length) return;

    const log = getNotificationLog();
    const userLogKey = currentUserEmail || 'guest';
    log[userLogKey] = log[userLogKey] || {};

    me.groupInvites.forEach(invite => {
        const notifyKey = `${invite.id}-group-invite`;
        if (log[userLogKey][notifyKey]) return;

        showAppNotification(invite.task, {
            label: 'Group invite',
            message: `${getUserDisplayName(invite.from)} invited you to group work.`,
            color: invite.task.color || '#6db08c'
        });
        log[userLogKey][notifyKey] = Date.now();
    });

    saveNotificationLog(log);
}

function getDeadlineMotivation(task) {
    const msLeft = new Date(task.deadline).getTime() - Date.now();
    const hoursLeft = msLeft / (1000 * 60 * 60);

    if (msLeft <= 0) return 'Deadline passed. Check it now.';
    if (hoursLeft <= 1) return 'Final push. Submit it now!';
    if (hoursLeft <= 2) return 'Hurry up, you got this.';
    if (hoursLeft <= 5) return 'Stay focused, almost there.';
    return "Don't miss it.";
}

function showAppNotification(task, options = {}) {
    const stack = document.getElementById('app-notification-stack');
    if (!stack) return;

    const toastColor = options.color || getTaskColor(task);
    const label = options.label || 'Deadline soon';
    const message = options.message || getDeadlineMotivation(task);

    const toast = document.createElement('button');
    toast.type = 'button';
    toast.className = `app-notification ${options.type || ''}`;
    toast.style.setProperty('--toast-color', toastColor);
    toast.style.setProperty('--toast-life', `${APP_TOAST_VISIBLE_MS}ms`);
    toast.onclick = () => {
        toast.remove();
        showDetail(task.id);
    };
    toast.innerHTML = `
        <span class="app-notification-icon">
            <span class="app-notification-dot"></span>
        </span>
        <span class="app-notification-copy">
            <em>${label}</em>
            <strong>${task.title}</strong>
            <small>${getTaskTag(task)} · ${formatCountdown(task.deadline)}</small>
            <span class="app-notification-motivation">${message}</span>
        </span>
        <span class="app-notification-progress"></span>
    `;

    stack.prepend(toast);
    setTimeout(() => toast.remove(), APP_TOAST_VISIBLE_MS);
}

function sendDeadlineNotifications(options = {}) {
    if (!currentUserEmail) return;

    const now = Date.now();
    const log = getNotificationLog();
    const userLogKey = currentUserEmail || 'guest';
    log[userLogKey] = log[userLogKey] || {};

    getUrgentDeadlineTasks().forEach(task => {
        const motivation = getDeadlineMotivation(task);
        const notifyKey = `${task.id}-deadline-hourly`;
        const lastSent = Number(log[userLogKey][notifyKey] || 0);
        if (!options.forceBrowser && now - lastSent < DEADLINE_NOTIFY_INTERVAL_MS) return;

        showAppNotification(task, {
            label: 'Deadline soon',
            message: motivation
        });

        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('ClassSync deadline reminder', {
                body: `${task.title} (${getTaskTag(task)}) is due ${formatCountdown(task.deadline)}. ${motivation}`,
            });
        }

        log[userLogKey][notifyKey] = now;
    });

    getOverdueDeadlineTasks().forEach(task => {
        const motivation = getDeadlineMotivation(task);
        const notifyKey = `${task.id}-deadline-overdue-hourly`;
        const lastSent = Number(log[userLogKey][notifyKey] || 0);
        if (!options.forceBrowser && now - lastSent < DEADLINE_NOTIFY_INTERVAL_MS) return;

        showAppNotification(task, {
            type: 'overdue',
            label: 'Deadline passed',
            message: motivation,
            color: '#ff4d4d'
        });

        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('ClassSync deadline passed', {
                body: `${task.title} (${getTaskTag(task)}) passed the deadline. ${motivation}`,
            });
        }

        log[userLogKey][notifyKey] = now;
    });

    saveNotificationLog(log);
}

function getDefaultTasks() {
    return [];
}

function getRememberedTagColors() {
    const remembered = {};
    tasks.forEach(task => {
        if (task.tag && task.color) remembered[getTaskTag(task)] = task.color;
    });

    if (currentUserEmail) {
        const users = getUsers();
        const savedColors = users[currentUserEmail]?.tagColors || {};
        Object.entries(savedColors).forEach(([tag, color]) => {
            remembered[normalizeTag(tag)] = color;
        });
    }

    return remembered;
}

function saveRememberedTagColor(tag, color) {
    if (!currentUserEmail || !tag || !color) return;
    const users = getUsers();
    if (!users[currentUserEmail]) return;
    users[currentUserEmail].tagColors = users[currentUserEmail].tagColors || {};
    users[currentUserEmail].tagColors[normalizeTag(tag)] = color;
    saveUsers(users);
}

function showAuthMessage(message, type = 'error') {
    const box = document.getElementById('auth-message');
    if (!box) return;
    box.innerText = message;
    box.className = `auth-message ${type}`;
}

function setAuthMode(mode) {
    authMode = mode;
    const isRegister = mode === 'register';
    document.getElementById('tab-login').classList.toggle('active', !isRegister);
    document.getElementById('tab-register').classList.toggle('active', isRegister);
    document.querySelectorAll('.auth-name-field').forEach(el => el.style.display = isRegister ? 'block' : 'none');
    document.getElementById('auth-password').autocomplete = isRegister ? 'new-password' : 'current-password';
    document.getElementById('auth-submit').innerText = isRegister ? 'Create Account' : 'Login';
    showAuthMessage('');
}

async function handleAuthSubmit(event) {
    event.preventDefault();

    const email = normalizeEmail(document.getElementById('auth-email').value);
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();

    if (!email || !password) {
        showAuthMessage('Please enter your email and password.');
        return;
    }

    if (password.length < 6) {
        showAuthMessage('Password must be at least 6 characters.');
        return;
    }

    const submitButton = document.getElementById('auth-submit');
    const originalText = submitButton.innerText;
    submitButton.disabled = true;
    submitButton.innerText = authMode === 'register' ? 'Creating...' : 'Logging in...';

    try {
        const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
        const data = await apiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify({ email, password, name })
        });
        startSession(data.email, data.users, data.token);
    } catch (error) {
        showAuthMessage(error.message || 'Could not connect to the login server.');
    } finally {
        submitButton.disabled = false;
        submitButton.innerText = originalText;
    }
}

function startSession(email, users, token) {
    currentUserEmail = email;
    if (token) {
        authToken = token;
        localStorage.setItem(SESSION_TOKEN_KEY, token);
    }
    usersCache = users || {};
    if (users[email]) {
        ensureUserSocialData(users[email]);
        tasks = users[email].tasks || [];
    }
    if (users[email] && !users[email].tagColors) {
        users[email].tagColors = getRememberedTagColors();
    }
    saveUsers(users);
    localStorage.setItem(SESSION_KEY, email);
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-name').value = '';
    showView('view-home');
    requestDeadlineNotificationsOnStart();
    showPendingGroupInviteNotifications();
}

function saveCurrentUserTasks() {
    if (!currentUserEmail) return;
    const users = getUsers();
    if (!users[currentUserEmail]) return;
    users[currentUserEmail].tasks = tasks;
    saveUsers(users);
}

function logout() {
    currentUserEmail = null;
    tasks = [];
    authToken = '';
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    showAuthMessage('');
    setAuthMode('login');
    showView('view-auth');
}

async function initAuth() {
    setAuthMode('login');

    if (authToken) {
        try {
            const data = await apiRequest('/api/auth/me');
            startSession(data.email, data.users);
            return;
        } catch (error) {
            authToken = '';
            localStorage.removeItem(SESSION_TOKEN_KEY);
            localStorage.removeItem(SESSION_KEY);
            showAuthMessage('Please login again.');
        }
    }

    const legacyUsers = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
    if (Object.keys(legacyUsers).length) {
        showAuthMessage('Local-only accounts found. Please register again so your account is saved on the server.', 'success');
        return;
    }

    showView('view-auth');
}

// 2. ฟังก์ชันสลับหน้า
function showView(viewId) {
    if (viewId !== 'view-auth' && !currentUserEmail) {
        viewId = 'view-auth';
    }

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    if(viewId === 'view-add') {
        updateTagSuggestions();
        initColorPicker();
        renderGroupFriendPicker();
        updateDeadlinePreview();
    }
    if(viewId === 'view-profile') {
        renderProfile();
    }
    if(viewId === 'view-progress-summary') {
        renderProgressSummary();
    }
    if(viewId === 'view-tag-insight') {
        renderTagInsight();
    }
    render();
}

function rememberDetailReturnView() {
    const activeView = document.querySelector('.view.active');
    if (activeView && activeView.id !== 'view-detail') {
        detailReturnView = activeView.id;
    }
}

function goBackFromDetail() {
    showView(detailReturnView || 'view-home');
}

// 3. ระบบ Color Picker และ Tag Suggestions (คงเดิมจากเวอร์ชันที่แล้ว)
function initColorPicker() {
    document.querySelectorAll('.color-opt').forEach(opt => {
        opt.onclick = () => selectColor(opt.dataset.color);
    });
    selectColor(selectedColor);
}

function selectColor(color) {
    selectedColor = color;
    const customColor = document.getElementById('custom-color');
    if (customColor) customColor.value = color;

    document.querySelectorAll('.color-opt').forEach(opt => {
        const isActive = opt.dataset.color.toLowerCase() === color.toLowerCase();
        opt.classList.toggle('active', isActive);
    });
}

function syncColorForTypedTag() {
    const tagInput = document.getElementById('in-tag');
    if (!tagInput) return;
    const rememberedColor = getRememberedTagColors()[normalizeTag(tagInput.value)];
    if (rememberedColor) selectColor(rememberedColor);
}

function padDatePart(value) {
    return String(value).padStart(2, '0');
}

function toDateTimeInputValue(date) {
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function getDeadlineInputDate() {
    const input = document.getElementById('in-date');
    if (!input?.value) return null;
    const date = new Date(input.value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDeadlinePickerTime() {
    let minute = Math.round(deadlinePickerDate.getMinutes() / 5) * 5;
    deadlinePickerDate.setSeconds(0, 0);
    if (minute === 60) {
        deadlinePickerDate.setHours(deadlinePickerDate.getHours() + 1);
        minute = 0;
    }
    deadlinePickerDate.setMinutes(minute);
}

function openDeadlinePicker() {
    const savedDate = getDeadlineInputDate();
    deadlinePickerDate = savedDate || new Date();
    normalizeDeadlinePickerTime();
    renderDeadlinePicker();
    document.getElementById('deadline-picker')?.classList.add('open');
}

function closeDeadlinePicker() {
    document.getElementById('deadline-picker')?.classList.remove('open');
}

function changeDeadlinePickerMonth(offset) {
    deadlinePickerDate = new Date(
        deadlinePickerDate.getFullYear(),
        deadlinePickerDate.getMonth() + offset,
        Math.min(deadlinePickerDate.getDate(), 28),
        deadlinePickerDate.getHours(),
        deadlinePickerDate.getMinutes()
    );
    renderDeadlinePicker();
}

function selectDeadlinePickerDay(day) {
    deadlinePickerDate = new Date(
        deadlinePickerDate.getFullYear(),
        deadlinePickerDate.getMonth(),
        day,
        deadlinePickerDate.getHours(),
        deadlinePickerDate.getMinutes()
    );
    saveDeadlinePickerValue();
    renderDeadlinePicker();
}

function selectDeadlinePickerTime(part, value) {
    if (part === 'hour') deadlinePickerDate.setHours(value);
    if (part === 'minute') deadlinePickerDate.setMinutes(value);
    saveDeadlinePickerValue();
    renderDeadlinePicker();
}

function setDeadlinePickerToday() {
    deadlinePickerDate = new Date();
    normalizeDeadlinePickerTime();
    saveDeadlinePickerValue();
    renderDeadlinePicker();
}

function clearDeadlinePicker() {
    const input = document.getElementById('in-date');
    if (input) input.value = '';
    closeDeadlinePicker();
    updateDeadlinePreview();
}

function confirmDeadlinePicker() {
    saveDeadlinePickerValue();
    closeDeadlinePicker();
}

function saveDeadlinePickerValue() {
    const input = document.getElementById('in-date');
    normalizeDeadlinePickerTime();
    if (input) input.value = toDateTimeInputValue(deadlinePickerDate);
    updateDeadlinePreview();
}

function renderDeadlinePicker() {
    const monthTitle = document.getElementById('deadline-picker-month');
    const dayGrid = document.getElementById('deadline-picker-days');
    const hourList = document.getElementById('deadline-hour-list');
    const minuteList = document.getElementById('deadline-minute-list');
    if (!monthTitle || !dayGrid || !hourList || !minuteList) return;

    const year = deadlinePickerDate.getFullYear();
    const month = deadlinePickerDate.getMonth();
    const selectedDay = deadlinePickerDate.getDate();
    const todayKey = getDateKey(new Date());
    const selectedKey = getDateKey(deadlinePickerDate);
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    monthTitle.innerText = deadlinePickerDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    dayGrid.innerHTML = '';
    for (let i = 0; i < firstDay; i++) {
        dayGrid.appendChild(document.createElement('span'));
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const button = document.createElement('button');
        const dayDate = new Date(year, month, day, deadlinePickerDate.getHours(), deadlinePickerDate.getMinutes());
        const dayKey = getDateKey(dayDate);
        button.type = 'button';
        button.className = 'deadline-day-btn';
        button.innerText = day;
        button.classList.toggle('selected', day === selectedDay);
        button.classList.toggle('today', dayKey === todayKey && dayKey !== selectedKey);
        button.onclick = () => selectDeadlinePickerDay(day);
        dayGrid.appendChild(button);
    }

    hourList.innerHTML = Array.from({ length: 24 }, (_, hour) => `
        <button type="button" class="time-choice ${deadlinePickerDate.getHours() === hour ? 'selected' : ''}" onclick="selectDeadlinePickerTime('hour', ${hour})">
            ${padDatePart(hour)}
        </button>
    `).join('');

    hourList.scrollTop = Math.max(0, deadlinePickerDate.getHours() - 2) * 34;

    hourList.setAttribute('aria-label', 'Select hour');
    minuteList.setAttribute('aria-label', 'Select minute');
    const selectedMinute = Math.min(55, Math.round(deadlinePickerDate.getMinutes() / 5) * 5);
    minuteList.innerHTML = Array.from({ length: 12 }, (_, index) => index * 5).map(minute => `
        <button type="button" class="time-choice ${selectedMinute === minute ? 'selected' : ''}" onclick="selectDeadlinePickerTime('minute', ${minute})">
            ${padDatePart(minute)}
        </button>
    `).join('');
    minuteList.scrollTop = Math.max(0, (selectedMinute / 5) - 2) * 34;
}

function updateDeadlinePreview() {
    const input = document.getElementById('in-date');
    const preview = document.getElementById('deadline-preview');
    const display = document.getElementById('deadline-display');
    if (!input || !preview) return;

    if (!input.value) {
        preview.innerText = 'Choose when this work is due';
        if (display) display.innerText = 'Pick deadline';
        preview.classList.remove('ready', 'late');
        return;
    }

    const deadlineDate = new Date(input.value);
    const isLate = deadlineDate.getTime() <= Date.now();
    preview.innerText = `${deadlineDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    })} at ${deadlineDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    })}${isLate ? ' - already passed' : ''}`;
    if (display) {
        display.innerText = deadlineDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }) + ' · ' + deadlineDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    preview.classList.toggle('ready', !isLate);
    preview.classList.toggle('late', isLate);
}

function updateTagSuggestions() {
    const container = document.getElementById('suggested-tags');
    if(!container) return;
    const rememberedTags = getRememberedTagColors();
    const usedTags = Object.keys(rememberedTags).sort();
    container.innerHTML = usedTags.length > 0 ? '<small>Tags you used before:</small>' : '';
    usedTags.forEach(tag => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tag-suggestion';
        button.innerHTML = `<span class="tag-swatch" style="background:${rememberedTags[tag]}"></span><span>${tag}</span>`;
        button.onclick = () => {
            document.getElementById('in-tag').value = tag;
            selectColor(rememberedTags[tag]);
        };
        container.appendChild(button);
    });
}

function getUserDisplayName(email) {
    const users = getUsers();
    return users[email]?.name || email;
}

function getGroupLeaderEmail(task) {
    return task.leaderEmail || task.ownerEmail || task.participants?.[0] || null;
}

function isGroupLeader(task) {
    return !task.isGroup || getGroupLeaderEmail(task) === currentUserEmail;
}

function getGroupRoleLabel(task) {
    if (!task.isGroup) return '';
    return isGroupLeader(task)
        ? 'Group work - you are the leader'
        : `Group work - leader: ${getUserDisplayName(getGroupLeaderEmail(task))}`;
}

function addFriendByEmail() {
    const input = document.getElementById('friend-email-input');
    const message = document.getElementById('friend-message');
    if (!input || !currentUserEmail) return;

    const friendEmail = normalizeEmail(input.value);
    const users = getUsers();
    const me = ensureUserSocialData(users[currentUserEmail]);
    const friend = users[friendEmail] ? ensureUserSocialData(users[friendEmail]) : null;

    const showMessage = (text, type = 'error') => {
        if (!message) return;
        message.innerText = text;
        message.className = `profile-message ${type}`;
    };

    if (!friendEmail) {
        showMessage('Enter a friend email.');
        return;
    }
    if (friendEmail === currentUserEmail) {
        showMessage('That is your own account.');
        return;
    }
    if (!friend) {
        showMessage('No ClassSync account found for that email.');
        return;
    }
    if (me.friends.includes(friendEmail)) {
        showMessage('You are already friends.', 'success');
        return;
    }
    if (friend.friendRequests.includes(currentUserEmail)) {
        showMessage('Friend request already sent.', 'success');
        return;
    }

    friend.friendRequests.push(currentUserEmail);
    me.sentFriendRequests.push(friendEmail);
    users[currentUserEmail] = me;
    users[friendEmail] = friend;
    saveUsers(users);
    input.value = '';
    showMessage('Friend request sent.', 'success');
    renderProfile();
}

function acceptFriendRequest(email) {
    const friendEmail = normalizeEmail(email);
    const users = getUsers();
    const me = ensureUserSocialData(users[currentUserEmail]);
    const friend = users[friendEmail] ? ensureUserSocialData(users[friendEmail]) : null;
    if (!friend) return;

    me.friendRequests = me.friendRequests.filter(item => item !== friendEmail);
    friend.sentFriendRequests = friend.sentFriendRequests.filter(item => item !== currentUserEmail);
    if (!me.friends.includes(friendEmail)) me.friends.push(friendEmail);
    if (!friend.friends.includes(currentUserEmail)) friend.friends.push(currentUserEmail);

    users[currentUserEmail] = me;
    users[friendEmail] = friend;
    saveUsers(users);
    renderProfile();
    renderGroupFriendPicker();
}

function rejectFriendRequest(email) {
    const friendEmail = normalizeEmail(email);
    const users = getUsers();
    const me = ensureUserSocialData(users[currentUserEmail]);
    const friend = users[friendEmail] ? ensureUserSocialData(users[friendEmail]) : null;

    me.friendRequests = me.friendRequests.filter(item => item !== friendEmail);
    if (friend) friend.sentFriendRequests = friend.sentFriendRequests.filter(item => item !== currentUserEmail);

    users[currentUserEmail] = me;
    if (friend) users[friendEmail] = friend;
    saveUsers(users);
    renderProfile();
}

function acceptGroupInvite(inviteId) {
    const users = getUsers();
    const me = ensureUserSocialData(users[currentUserEmail]);
    const invite = me.groupInvites.find(item => item.id === inviteId);
    if (!invite) return;

    me.tasks.push({
        ...invite.task,
        id: Date.now(),
        createdAt: Date.now(),
        status: invite.task.status || 'pending',
        proofImg: invite.task.proofImg || null,
        submittedAt: invite.task.submittedAt,
        submittedAtMs: invite.task.submittedAtMs,
        leaderEmail: invite.task.leaderEmail || invite.from,
        acceptedGroupInvite: true
    });
    me.groupInvites = me.groupInvites.filter(item => item.id !== inviteId);
    users[currentUserEmail] = me;
    saveUsers(users);
    tasks = me.tasks;
    renderProfile();
    render();
    showAppNotification(invite.task, {
        label: 'Group work added',
        message: `Invitation from ${getUserDisplayName(invite.from)} accepted.`,
        color: invite.task.color || '#6db08c'
    });
}

function rejectGroupInvite(inviteId) {
    const users = getUsers();
    const me = ensureUserSocialData(users[currentUserEmail]);
    me.groupInvites = me.groupInvites.filter(item => item.id !== inviteId);
    users[currentUserEmail] = me;
    saveUsers(users);
    renderProfile();
}

function renderProfile() {
    const container = document.getElementById('profile-content');
    if (!container || !currentUserEmail) return;

    const users = getUsers();
    const me = ensureUserSocialData(users[currentUserEmail]);
    users[currentUserEmail] = me;
    saveUsers(users);

    const friendsHtml = me.friends.length
        ? me.friends.map(email => `
            <div class="profile-list-item">
                <span><strong>${getUserDisplayName(email)}</strong><small>${email}</small></span>
            </div>
        `).join('')
        : '<div class="empty-state">No friends yet</div>';

    const requestsHtml = me.friendRequests.length
        ? me.friendRequests.map(email => `
            <div class="profile-list-item">
                <span><strong>${getUserDisplayName(email)}</strong><small>${email} wants to be friends</small></span>
                <span class="inline-actions">
                    <button class="mini-btn" type="button" onclick="acceptFriendRequest('${email}')">Accept</button>
                    <button class="mini-btn muted" type="button" onclick="rejectFriendRequest('${email}')">Ignore</button>
                </span>
            </div>
        `).join('')
        : '<div class="empty-state">No friend requests</div>';

    const pendingSentHtml = me.sentFriendRequests.length
        ? me.sentFriendRequests.map(email => `<span class="pill">${email}</span>`).join('')
        : '<span class="profile-muted">No sent requests</span>';

    const invitesHtml = me.groupInvites.length
        ? me.groupInvites.map(invite => `
            <div class="profile-list-item group-invite-item">
                <span>
                    <strong>${invite.task.title}</strong>
                    <small>${invite.task.tag} · Due ${invite.task.deadline.replace('T', ' ')} · From ${getUserDisplayName(invite.from)}</small>
                </span>
                <span class="inline-actions">
                    <button class="mini-btn" type="button" onclick="acceptGroupInvite('${invite.id}')">Accept</button>
                    <button class="mini-btn muted" type="button" onclick="rejectGroupInvite('${invite.id}')">Decline</button>
                </span>
            </div>
        `).join('')
        : '<div class="empty-state">No group invitations</div>';

    container.innerHTML = `
        <section class="profile-card">
            <div class="profile-avatar">${(me.name || currentUserEmail)[0].toUpperCase()}</div>
            <div>
                <h2>${me.name || 'ClassSync user'}</h2>
                <p>${currentUserEmail}</p>
            </div>
        </section>

        <section class="profile-panel">
            <div class="section-title">Add friend</div>
            <div class="friend-add-row">
                <input type="email" id="friend-email-input" placeholder="friend@example.com">
                <button class="mini-btn" type="button" onclick="addFriendByEmail()">Send</button>
            </div>
            <p id="friend-message" class="profile-message"></p>
        </section>

        <section class="profile-panel">
            <div class="section-title">Friend requests</div>
            ${requestsHtml}
        </section>

        <section class="profile-panel">
            <div class="section-title">Friends</div>
            ${friendsHtml}
            <div class="sent-requests"><strong>Sent:</strong> ${pendingSentHtml}</div>
        </section>

        <section class="profile-panel">
            <div class="section-title">Group work invitations</div>
            ${invitesHtml}
        </section>
    `;
}

function toggleGroupFriendPicker() {
    const enabled = document.getElementById('in-group-enabled')?.checked;
    const picker = document.getElementById('group-friend-picker');
    if (!picker) return;
    picker.style.display = enabled ? 'grid' : 'none';
    if (enabled) renderGroupFriendPicker();
}

function renderGroupFriendPicker() {
    const picker = document.getElementById('group-friend-picker');
    if (!picker || !currentUserEmail) return;

    const me = getCurrentUser();
    const friends = me?.friends || [];
    const enabled = document.getElementById('in-group-enabled')?.checked;
    picker.style.display = enabled ? 'grid' : 'none';

    if (!friends.length) {
        picker.innerHTML = '<div class="profile-muted">Add friends first to create group work.</div>';
        return;
    }

    picker.innerHTML = `
        <div class="friend-picker-header">
            <span>Select teammates</span>
            <strong id="group-selected-count">0 selected</strong>
        </div>
        ${friends.map(email => `
            <button class="friend-choice" type="button" onclick="toggleGroupFriend('${email}')">
                <span class="friend-choice-avatar">${getUserDisplayName(email).trim()[0].toUpperCase()}</span>
                <span class="friend-choice-copy">
                    <strong>${getUserDisplayName(email)}</strong>
                    <small>${email}</small>
                </span>
                <span class="friend-choice-status">Add</span>
                <input type="checkbox" class="group-friend-checkbox" value="${email}" aria-label="Invite ${getUserDisplayName(email)}">
            </button>
        `).join('')}
    `;
    updateGroupFriendSelectionUI();
}

function toggleGroupFriend(email) {
    const checkbox = Array.from(document.querySelectorAll('.group-friend-checkbox'))
        .find(input => input.value === email);
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    updateGroupFriendSelectionUI();
}

function updateGroupFriendSelectionUI() {
    const selected = getSelectedGroupFriends();
    document.querySelectorAll('.friend-choice').forEach(choice => {
        const checkbox = choice.querySelector('.group-friend-checkbox');
        const isSelected = Boolean(checkbox?.checked);
        choice.classList.toggle('selected', isSelected);
        const status = choice.querySelector('.friend-choice-status');
        if (status) status.innerText = isSelected ? 'Selected' : 'Add';
    });

    const count = document.getElementById('group-selected-count');
    if (count) count.innerText = `${selected.length} selected`;
}

function getSelectedGroupFriends() {
    const enabled = document.getElementById('in-group-enabled')?.checked;
    if (!enabled) return [];
    return Array.from(document.querySelectorAll('.group-friend-checkbox:checked')).map(input => input.value);
}

function sendGroupInvites(task, friendEmails) {
    if (!friendEmails.length) return;
    const users = getUsers();
    const me = ensureUserSocialData(users[currentUserEmail]);

    friendEmails.forEach(email => {
        const friend = users[email] ? ensureUserSocialData(users[email]) : null;
        if (!friend) return;

        friend.groupInvites = friend.groupInvites.filter(invite => invite.groupId !== task.groupId);
        friend.groupInvites.push({
            id: `${task.groupId}-${email}`,
            groupId: task.groupId,
            from: currentUserEmail,
            sentAt: new Date().toISOString(),
            task: {
                ...task,
                status: 'pending',
                proofImg: null
            }
        });
        users[email] = friend;
    });

    users[currentUserEmail] = me;
    saveUsers(users);
}

// 4. เพิ่มงานใหม่
function addTask() {
    const title = document.getElementById('in-title').value.trim();
    const rawTag = document.getElementById('in-tag').value.trim();
    const tag = normalizeTag(rawTag);
    if (!document.getElementById('in-date').value && document.getElementById('deadline-picker')?.classList.contains('open')) {
        saveDeadlinePickerValue();
    }
    const date = document.getElementById('in-date').value;
    const submissionUrlInput = document.getElementById('in-submission-url');
    const submissionUrl = normalizeSubmissionUrl(submissionUrlInput?.value);
    const groupFriends = getSelectedGroupFriends();
    const wantsGroupWork = document.getElementById('in-group-enabled')?.checked;

    if (title && rawTag && date) {
        if (submissionUrl === null) {
            alert('Please enter a valid submission website link.');
            return;
        }

        if (wantsGroupWork && groupFriends.length === 0) {
            alert('Select at least one friend for group work.');
            return;
        }

        const groupId = groupFriends.length ? `group-${Date.now()}` : null;
        const newTask = {
            id: Date.now(),
            createdAt: Date.now(),
            title: title,
            tag: tag,
            color: selectedColor,
            deadline: date,
            submissionUrl,
            status: 'pending',
            proofImg: null,
            isGroup: groupFriends.length > 0,
            groupId,
            ownerEmail: currentUserEmail,
            leaderEmail: currentUserEmail,
            participants: groupFriends.length ? [currentUserEmail, ...groupFriends] : []
        };
        tasks.push(newTask);
        if (groupFriends.length) sendGroupInvites(newTask, groupFriends);
        saveRememberedTagColor(tag, selectedColor);
        saveCurrentUserTasks();
        document.getElementById('in-title').value = '';
        document.getElementById('in-tag').value = '';
        document.getElementById('in-date').value = '';
        if (submissionUrlInput) submissionUrlInput.value = '';
        updateDeadlinePreview();
        const groupEnabled = document.getElementById('in-group-enabled');
        if (groupEnabled) groupEnabled.checked = false;
        toggleGroupFriendPicker();
        updateTagSuggestions();
        showView('view-home');
    } else {
        alert("กรุณากรอกข้อมูลให้ครบถ้วน");
    }
}

// 5. หน้าแสดงรายละเอียด (เพิ่มระบบอัปโหลดรูป)
function showDetail(id) {
    const task = tasks.find(t => t.id === id);
    const content = document.getElementById('detail-content');
    rememberDetailReturnView();
    showView('view-detail');

    if (task.status === 'pending') {
        content.innerHTML = `
            <h1 style="color:#ff4d4d; margin-bottom:5px;">${task.title}</h1>
            <span class="tag" style="background:${getTaskColor(task)}; color:white; padding:4px 12px; border-radius:10px;">${getTaskTag(task)}</span>
            ${task.isGroup ? `<p class="group-detail-line">Group work with ${task.participants.map(email => getUserDisplayName(email)).join(', ')}</p>` : ''}
            <p style="margin-top:20px;">กำหนดส่ง: ${task.deadline.replace('T', ' ')}</p>
            
            <div style="margin-top:30px; border:2px dashed #ccc; padding:20px; border-radius:15px; text-align:center;">
                <label for="proof-upload" style="cursor:pointer;">
                    <div style="font-size:30px; color:#888;">📷</div>
                    <div style="font-size:14px; color:#666;">แนบรูปหลักฐานการส่ง (ถ้ามี)</div>
                    <input type="file" id="proof-upload" accept="image/*" style="display:none;" onchange="handleFileSelect(event)">
                </label>
                <div id="preview-container" style="margin-top:10px; display:none;">
                    <img id="img-preview" src="" style="width:100%; border-radius:10px; border:1px solid #ddd;">
                </div>
            </div>

            <button class="btn-main" onclick="submitTask(${task.id})" style="width:100%; padding:15px; background:#28a745; color:white; border:none; border-radius:15px; margin-top:20px; font-weight:bold;">
                ยืนยันว่าทำงานเสร็จแล้ว ✅
            </button>
        `;
    } else {
        content.innerHTML = `
            <h1>${task.title} ✅</h1>
            <p>วิชา: ${getTaskTag(task)}</p>
            ${task.isGroup ? `<p class="group-detail-line">Group work with ${task.participants.map(email => getUserDisplayName(email)).join(', ')}</p>` : ''}
            <p>ส่งเมื่อ: ${task.submittedAt}</p>
            <div style="margin-top:20px;">
                <strong>หลักฐานการส่ง:</strong><br>
                ${task.proofImg ? `<img src="${task.proofImg}" style="width:100%; border-radius:15px; margin-top:10px; border:1px solid #eee;">` : '<p style="color:#999;">ไม่มีการแนบรูปภาพ</p>'}
            </div>
        `;
    }
}

function showDetail(id) {
    const task = tasks.find(t => t.id === id);
    const content = document.getElementById('detail-content');
    if (!task || !content) return;

    rememberDetailReturnView();
    showView('view-detail');

    const canSubmit = isGroupLeader(task);
    const leaderName = getUserDisplayName(getGroupLeaderEmail(task));
    const submissionLink = getSubmissionLinkHTML(task);
    const groupInfo = task.isGroup ? `
        <p class="group-detail-line">Group work with ${task.participants.map(email => getUserDisplayName(email)).join(', ')}</p>
        <p class="group-role-line">${getGroupRoleLabel(task)}</p>
    ` : '';

    if (task.status === 'pending') {
        content.innerHTML = `
            <h1 style="color:#ff4d4d; margin-bottom:5px;">${task.title}</h1>
            <span class="tag" style="background:${getTaskColor(task)}; color:white; padding:4px 12px; border-radius:10px;">${getTaskTag(task)}</span>
            ${groupInfo}
            <p style="margin-top:20px;">Deadline: ${task.deadline.replace('T', ' ')}</p>
            ${submissionLink}

            ${canSubmit ? `
                <div class="proof-upload-box">
                    <label for="proof-upload" style="cursor:pointer;">
                        <div style="font-size:30px; color:#888;">Photo</div>
                        <div style="font-size:14px; color:#666;">Attach submission proof (optional)</div>
                        <input type="file" id="proof-upload" accept="image/*" style="display:none;" onchange="handleFileSelect(event)">
                    </label>
                    <div id="preview-container" style="margin-top:10px; display:none;">
                        <img id="img-preview" src="" style="width:100%; border-radius:10px; border:1px solid #ddd;">
                    </div>
                </div>

                <button class="btn-main submit-done-btn" onclick="submitTask(${task.id})">
                    Send work and mark done
                </button>
            ` : `
                <div class="leader-only-box">
                    <strong>Leader only</strong>
                    <span>Only ${leaderName} can send this group work and mark it done.</span>
                </div>
            `}
        `;
    } else {
        content.innerHTML = `
            <h1>${task.title} done</h1>
            <p>Subject: ${getTaskTag(task)}</p>
            ${groupInfo}
            <p>Submitted: ${task.submittedAt}</p>
            ${submissionLink}
            <div style="margin-top:20px;">
                <strong>Submission proof:</strong><br>
                ${task.proofImg ? `<img src="${task.proofImg}" style="width:100%; border-radius:15px; margin-top:10px; border:1px solid #eee;">` : '<p style="color:#999;">No image attached</p>'}
            </div>
        `;
    }
}

function showDayDeadlines(dateKey) {
    selectedDayKey = dateKey;
    showView('view-day');
    renderDayDeadlines();
}

function renderDayDeadlines() {
    if (!selectedDayKey) return;

    const title = document.getElementById('day-title');
    const container = document.getElementById('day-deadline-list');
    if (!title || !container) return;

    const dayTasks = tasks
        .filter(task => getDateKey(new Date(task.deadline)) === selectedDayKey)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    title.innerText = formatDateTitle(selectedDayKey);
    container.innerHTML = '';

    if (dayTasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No deadlines on this day</div>';
        return;
    }

    dayTasks.forEach(task => container.appendChild(createCard(task)));
}

// ระบบจัดการพรีวิวรูปภาพ
let currentTempImg = null;
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentTempImg = e.target.result;
            document.getElementById('img-preview').src = currentTempImg;
            document.getElementById('preview-container').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function submitTask(id) {
    const task = tasks.find(t => t.id === id);
    task.status = 'done';
    task.submittedAt = new Date().toLocaleString('th-TH');
    task.proofImg = currentTempImg; // บันทึกรูปที่เลือกไว้
    currentTempImg = null; // ล้างค่าชั่วคราว
    saveCurrentUserTasks();
    showView('view-home');
    showCompletionCelebration(task);
}

function syncGroupSubmission(task, submittedAt, proofImg, submittedAtMs) {
    if (!task.isGroup || !task.groupId) return;

    const users = getUsers();
    (task.participants || []).forEach(email => {
        const user = users[email] ? ensureUserSocialData(users[email]) : null;
        if (!user) return;

        const matchingTask = user.tasks.find(item => item.groupId === task.groupId);
        if (matchingTask) {
            matchingTask.status = 'done';
            matchingTask.submittedAt = submittedAt;
            matchingTask.submittedAtMs = submittedAtMs;
            matchingTask.proofImg = proofImg;
            matchingTask.leaderEmail = getGroupLeaderEmail(task);
        }
        user.groupInvites.forEach(invite => {
            if (invite.groupId !== task.groupId) return;
            invite.task.status = 'done';
            invite.task.submittedAt = submittedAt;
            invite.task.submittedAtMs = submittedAtMs;
            invite.task.proofImg = proofImg;
            invite.task.leaderEmail = getGroupLeaderEmail(task);
        });
        users[email] = user;
    });

    saveUsers(users);
}

function submitTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (!isGroupLeader(task)) {
        alert('Only the group leader can send this work and mark it done.');
        showDetail(id);
        return;
    }

    const submittedAtMs = Date.now();
    const submittedAt = new Date(submittedAtMs).toLocaleString('th-TH');
    task.status = 'done';
    task.submittedAt = submittedAt;
    task.submittedAtMs = submittedAtMs;
    task.proofImg = currentTempImg;
    syncGroupSubmission(task, submittedAt, currentTempImg, submittedAtMs);
    currentTempImg = null;
    saveCurrentUserTasks();
    showView('view-home');
    showCompletionCelebration(task);
}

function showCompletionCelebration(task) {
    const celebration = document.getElementById('completion-celebration');
    if (!celebration) return;

    celebration.innerHTML = `
        <div class="completion-burst" role="status">
            <span class="completion-emoji">🎉</span>
            <strong>Good job!</strong>
            <small>${task.title} is finished</small>
            <span class="confetti c1"></span>
            <span class="confetti c2"></span>
            <span class="confetti c3"></span>
            <span class="confetti c4"></span>
            <span class="confetti c5"></span>
            <span class="confetti c6"></span>
        </div>
    `;
    celebration.classList.add('show');

    setTimeout(() => {
        celebration.classList.remove('show');
        celebration.innerHTML = '';
    }, 2200);
}

// 6. ระบบ Render และ Calendar (คงเดิมตามเวอร์ชันที่แล้ว)
function render() {
    if (!currentUserEmail) return;

    const search = document.getElementById('searchInput').value.toLowerCase();
    const checkSearch = (document.getElementById('checkSearchInput')?.value || '').toLowerCase();
    const doneSearch = (document.getElementById('doneSearchInput')?.value || '').toLowerCase();
    const filtered = tasks.filter(t => t.title.toLowerCase().includes(search) || t.tag.toLowerCase().includes(search));
    const matchesTaskSearch = (task, query) => {
        if (!query) return true;
        return task.title.toLowerCase().includes(query) || getTaskTag(task).toLowerCase().includes(query);
    };
    
    const pending = filtered.filter(t => t.status === 'pending').sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
    const done = filtered.filter(t => t.status === 'done').sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const allPending = tasks.filter(t => t.status === 'pending').sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
    const allDone = tasks.filter(t => t.status === 'done').sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const fullPending = allPending.filter(t => matchesTaskSearch(t, checkSearch));
    const fullDone = allDone.filter(t => matchesTaskSearch(t, doneSearch));

    document.getElementById('home-check-list').innerHTML = '';
    pending.slice(0, 3).forEach(t => document.getElementById('home-check-list').appendChild(createCard(t)));
    document.getElementById('btn-more-check').style.display = pending.length > 3 ? 'block' : 'none';

    document.getElementById('home-done-list').innerHTML = '';
    done.slice(0, 3).forEach(t => document.getElementById('home-done-list').appendChild(createCard(t)));
    document.getElementById('btn-more-done').style.display = done.length > 3 ? 'block' : 'none';

    renderGroupedList('full-check-list', fullPending, checkSearch ? 'No matching checklist homework' : 'No pending homework');
    renderGroupedList('full-done-list', fullDone, doneSearch ? 'No matching done homework' : 'No done homework yet');
    renderDayDeadlines();

    updateQuickDeadline(allPending);
    updateProgressChart();
    if (document.getElementById('view-progress-summary')?.classList.contains('active')) {
        renderProgressSummary();
    }
    if (document.getElementById('view-tag-insight')?.classList.contains('active')) {
        renderTagInsight();
    }
    renderDeadlineAlerts();
    sendDeadlineNotifications();
    renderCalendar(tasks);
}

function renderDeadlineAlerts() {
    const container = document.getElementById('deadline-alert-list');
    if (!container) return;

    const alerts = getDeadlineAlerts();
    container.innerHTML = '';

    if (alerts.length === 0) {
        container.innerHTML = '<div class="empty-state">No deadlines within 7 days</div>';
        return;
    }

    alerts.slice(0, 4).forEach(task => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'alert-item';
        item.onclick = () => showDetail(task.id);
        item.innerHTML = `
            <span class="alert-dot" style="background:${getTaskColor(task)}"></span>
            <span>
                <strong>${task.title}</strong>
                <small>${getTaskTag(task)} · ${formatCountdown(task.deadline)}</small>
            </span>
        `;
        container.appendChild(item);
    });
}

function updateProgressChart() {
    const doneTasks = tasks.filter(t => t.status === 'done');
    const doneCount = doneTasks.length;
    const pendingCount = tasks.filter(t => t.status === 'pending').length;
    const total = tasks.length;
    const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    const ring = document.getElementById('progress-ring');
    const percentText = document.getElementById('progress-percent');
    const doneText = document.getElementById('progress-done-count');
    const pendingText = document.getElementById('progress-pending-count');
    const totalText = document.getElementById('progress-total-count');
    const legend = document.getElementById('progress-tag-legend');

    const doneByTag = doneTasks.reduce((acc, task) => {
        const tag = getTaskTag(task);
        if (!acc[tag]) acc[tag] = { count: 0, color: getTaskColor(task) };
        acc[tag].count += 1;
        return acc;
    }, {});

    let cursor = 0;
    const slices = Object.entries(doneByTag).map(([tag, item]) => {
        const start = cursor;
        const size = total > 0 ? (item.count / total) * 100 : 0;
        cursor += size;
        return `${item.color} ${start}% ${cursor}%`;
    });
    const ringBackground = slices.length > 0
        ? `conic-gradient(${slices.join(', ')}, var(--chart-undone) ${cursor}% 100%)`
        : 'conic-gradient(var(--chart-undone) 0 100%)';

    if (ring) ring.style.background = ringBackground;
    if (percentText) percentText.innerText = `${percent}%`;
    if (doneText) doneText.innerText = `${doneCount} done`;
    if (pendingText) pendingText.innerText = `${pendingCount} undone`;
    if (totalText) totalText.innerText = `${total} homework total`;
    if (legend) {
        const totalByTag = tasks.reduce((acc, task) => {
            const tag = getTaskTag(task);
            if (!acc[tag]) acc[tag] = { count: 0, color: getTaskColor(task) };
            acc[tag].count += 1;
            return acc;
        }, {});
        const entries = Object.entries(totalByTag);
        legend.innerHTML = entries.length > 0
            ? entries.map(([tag, item]) => `
                <div class="progress-tag-item">
                    <span class="stat-dot" style="background:${item.color}"></span>
                    <span>${tag}: ${item.count}</span>
                </div>
            `).join('')
            : '<div class="progress-total">No tags yet</div>';
    }
}

function getTaskSubmittedTime(task) {
    if (Number.isFinite(task.submittedAtMs)) return task.submittedAtMs;
    if (!task.submittedAt) return null;

    const parsed = Date.parse(task.submittedAt);
    if (!Number.isNaN(parsed)) return parsed;

    const thaiMatch = String(task.submittedAt).match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!thaiMatch) return null;

    const [, day, month, rawYear, hour, minute, second = '0'] = thaiMatch;
    const year = Number(rawYear) > 2200 ? Number(rawYear) - 543 : Number(rawYear);
    return new Date(year, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime();
}

function getTaskInsightStatus(task) {
    const deadlineTime = new Date(task.deadline).getTime();
    if (task.status === 'done') {
        const submittedTime = getTaskSubmittedTime(task);
        return submittedTime && submittedTime <= deadlineTime ? 'onTime' : 'lateDone';
    }

    return deadlineTime <= Date.now() ? 'overdue' : 'upcoming';
}

function getTaskInsightStatusLabel(status) {
    return {
        onTime: 'Done in time',
        lateDone: 'Submit late',
        upcoming: 'Undone',
        overdue: 'Undone past deadline'
    }[status] || 'Homework';
}

function getProgressInsights() {
    const now = Date.now();
    const summary = {
        total: tasks.length,
        done: 0,
        pending: 0,
        onTime: 0,
        lateDone: 0,
        overdue: 0,
        upcoming: 0,
        unknownDone: 0,
        tags: {}
    };

    tasks.forEach(task => {
        const tag = getTaskTag(task);
        if (!summary.tags[tag]) {
            summary.tags[tag] = {
                tag,
                color: getTaskColor(task),
                total: 0,
                done: 0,
                pending: 0,
                onTime: 0,
                lateDone: 0,
                overdue: 0,
                upcoming: 0,
                unknownDone: 0
            };
        }

        const bucket = summary.tags[tag];
        const deadlineTime = new Date(task.deadline).getTime();
        bucket.total += 1;

        const status = getTaskInsightStatus(task);

        if (task.status === 'done') {
            summary.done += 1;
            bucket.done += 1;

            if (!getTaskSubmittedTime(task) || Number.isNaN(deadlineTime)) {
                summary.unknownDone += 1;
                bucket.unknownDone += 1;
            }

            if (status === 'onTime') {
                summary.onTime += 1;
                bucket.onTime += 1;
            } else {
                summary.lateDone += 1;
                bucket.lateDone += 1;
            }
            return;
        }

        summary.pending += 1;
        bucket.pending += 1;
        if (status === 'overdue') {
            summary.overdue += 1;
            bucket.overdue += 1;
        } else {
            summary.upcoming += 1;
            bucket.upcoming += 1;
        }
    });

    return summary;
}

function getPercent(value, total) {
    return total > 0 ? Math.round((value / total) * 100) : 0;
}

function openTagInsight(encodedTag, filter = 'all') {
    selectedInsightTag = decodeURIComponent(encodedTag);
    selectedInsightFilter = filter;
    showView('view-tag-insight');
}

function setTagInsightFilter(filter) {
    selectedInsightFilter = filter;
    renderTagInsight();
}

function renderProgressSummary() {
    const container = document.getElementById('progress-summary-content');
    if (!container) return;

    const summary = getProgressInsights();
    const doneRate = getPercent(summary.done, summary.total);
    const onTimeRate = getPercent(summary.onTime, summary.done);
    const lateRate = getPercent(summary.lateDone, summary.done);
    const overdueRate = getPercent(summary.overdue, summary.total);
    const tagRows = Object.values(summary.tags)
        .sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));

    const ringStyle = summary.total
        ? `conic-gradient(var(--green) 0 ${doneRate}%, var(--primary) ${doneRate}% 100%)`
        : 'conic-gradient(var(--chart-undone) 0 100%)';

    const statusStyle = summary.done
        ? `conic-gradient(var(--green) 0 ${onTimeRate}%, var(--danger) ${onTimeRate}% ${onTimeRate + lateRate}%, var(--chart-undone) ${onTimeRate + lateRate}% 100%)`
        : 'conic-gradient(var(--chart-undone) 0 100%)';

    container.innerHTML = `
        <section class="insight-hero">
            <div>
                <span class="insight-kicker">Chart summary</span>
                <h2>${doneRate}% homework done</h2>
                <p>${summary.done} finished, ${summary.pending} still in progress.</p>
            </div>
            <div class="insight-rings">
                <div class="insight-ring" style="background:${ringStyle}">
                    <span>${doneRate}%<small>Done</small></span>
                </div>
                <div class="insight-ring" style="background:${statusStyle}">
                    <span>${onTimeRate}%<small>On time</small></span>
                </div>
            </div>
        </section>

        <section class="insight-stat-grid">
            <div class="insight-stat"><strong>${summary.onTime}</strong><span>Done in time</span></div>
            <div class="insight-stat danger"><strong>${summary.lateDone}</strong><span>Done after deadline</span></div>
            <div class="insight-stat danger"><strong>${summary.overdue}</strong><span>Past deadline</span></div>
            <div class="insight-stat"><strong>${summary.upcoming}</strong><span>Upcoming</span></div>
        </section>

        <section class="insight-panel">
            <div class="header-row">
                <div class="section-title">Tag performance</div>
                <span class="insight-note">${summary.unknownDone ? `${summary.unknownDone} done item needs newer submit data` : 'On-time rate uses submit time vs deadline'}</span>
            </div>
            <div class="tag-insight-list">
                ${tagRows.length ? tagRows.map(tag => {
                    const tagDoneRate = getPercent(tag.done, tag.total);
                    const tagOnTimeRate = getPercent(tag.onTime, tag.total);
                    const tagLateRate = getPercent(tag.lateDone, tag.total);
                    const tagOverdueRate = getPercent(tag.overdue, tag.total);
                    const tagUpcomingRate = getPercent(tag.upcoming, tag.total);
                    return `
                        <button class="tag-insight-card" type="button" onclick="openTagInsight('${encodeURIComponent(tag.tag)}')">
                            <div class="tag-insight-head">
                                <span><i style="background:${tag.color}"></i><strong>${tag.tag}</strong></span>
                                <em>${tag.done}/${tag.total} done</em>
                            </div>
                            <div class="tag-stack-bar" aria-label="${tag.tag} summary">
                                <span class="bar-on-time" style="width:${tagOnTimeRate}%"></span>
                                <span class="bar-late" style="width:${tagLateRate}%"></span>
                                <span class="bar-overdue" style="width:${tagOverdueRate}%"></span>
                                <span class="bar-upcoming" style="width:${tagUpcomingRate}%"></span>
                            </div>
                            <div class="tag-insight-meta">
                                <span>${tagDoneRate}% complete</span>
                                <span>${tag.onTime} in time</span>
                                <span>${tag.lateDone} submit late</span>
                                <span>${tag.upcoming} undone</span>
                                <span>${tag.overdue} overdue</span>
                            </div>
                        </button>
                    `;
                }).join('') : '<div class="empty-state">No homework data yet</div>'}
            </div>
        </section>
    `;
}

function renderTagInsight() {
    const title = document.getElementById('tag-insight-title');
    const container = document.getElementById('tag-insight-content');
    if (!title || !container) return;

    const tag = selectedInsightTag || Object.keys(getProgressInsights().tags)[0] || '';
    selectedInsightTag = tag;
    title.innerText = `${tag || 'Tag'} insight`;

    const tagTasks = tasks
        .filter(task => getTaskTag(task) === tag)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    const counts = tagTasks.reduce((acc, task) => {
        acc[getTaskInsightStatus(task)] += 1;
        return acc;
    }, { onTime: 0, lateDone: 0, upcoming: 0, overdue: 0 });

    const filteredTasks = selectedInsightFilter === 'all'
        ? tagTasks
        : tagTasks.filter(task => getTaskInsightStatus(task) === selectedInsightFilter);
    const filters = [
        ['all', 'All', tagTasks.length],
        ['onTime', 'Done in time', counts.onTime],
        ['lateDone', 'Submit late', counts.lateDone],
        ['upcoming', 'Undone', counts.upcoming],
        ['overdue', 'Undone past deadline', counts.overdue]
    ];

    container.innerHTML = `
        <section class="tag-detail-summary">
            <div class="tag-detail-count good"><strong>${counts.onTime}</strong><span>Done in time</span></div>
            <div class="tag-detail-count warn"><strong>${counts.lateDone}</strong><span>Submit late</span></div>
            <div class="tag-detail-count"><strong>${counts.upcoming}</strong><span>Undone</span></div>
            <div class="tag-detail-count danger"><strong>${counts.overdue}</strong><span>Past deadline</span></div>
        </section>
        <div class="tag-filter-row">
            ${filters.map(([filter, label, count]) => `
                <button type="button" class="tag-filter-btn ${selectedInsightFilter === filter ? 'active' : ''}" onclick="setTagInsightFilter('${filter}')">
                    ${label}<span>${count}</span>
                </button>
            `).join('')}
        </div>
        <div class="tag-task-list">
            ${filteredTasks.length ? filteredTasks.map(task => `
                <div class="tag-task-row" onclick="showDetail(${task.id})">
                    <div>
                        <strong>${task.title}</strong>
                        <small>${task.deadline.replace('T', ' ')}</small>
                    </div>
                    <span class="status-pill ${getTaskInsightStatus(task)}">${getTaskInsightStatusLabel(getTaskInsightStatus(task))}</span>
                </div>
            `).join('') : '<div class="empty-state">No homework in this filter</div>'}
        </div>
    `;
}

function formatCountdown(deadline) {
    const diff = new Date(deadline).getTime() - Date.now();
    const absDiff = Math.abs(diff);
    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absDiff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((absDiff / (1000 * 60)) % 60);

    if (diff <= 0) {
        return days > 0 ? `${days}d late` : `${hours}h ${minutes}m late`;
    }

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
}

function getCountdownProgress(task) {
    const deadline = new Date(task.deadline).getTime();
    const total = DEADLINE_NOTIFY_WINDOW_HOURS * 60 * 60 * 1000;
    const remaining = deadline - Date.now();
    return Math.max(0, Math.min(100, (remaining / total) * 100));
}

function createCard(task) {
    const now = new Date().getTime();
    const isExpired = task.status === 'pending' && new Date(task.deadline).getTime() < now;
    const msUntilDeadline = new Date(task.deadline).getTime() - now;
    const isUrgent = task.status === 'pending' && msUntilDeadline > 0 && msUntilDeadline <= DEADLINE_NOTIFY_WINDOW_HOURS * 60 * 60 * 1000;
    const progress = getCountdownProgress(task);
    const div = document.createElement('div');
    div.className = `task-card ${isExpired ? 'expired' : ''} ${isUrgent ? 'urgent' : ''}`;
    div.onclick = () => showDetail(task.id);
    div.style = `border-left:${isExpired ? '5px solid #ff4d4d' : '1px solid #eee'};`;
    
    div.innerHTML = `
        <div class="task-card-main">
            <div class="task-card-title">${task.title}</div>
            <span class="tag" style="background:${getTaskColor(task)}; color:white; padding:2px 8px; border-radius:10px; font-size:10px;">${getTaskTag(task)}</span>
            ${task.isGroup ? `<span class="group-chip">Group</span><span class="group-chip ${isGroupLeader(task) ? 'leader-chip' : 'member-chip'}">${isGroupLeader(task) ? 'Leader' : 'Member'}</span>` : ''}
        </div>
        <div class="deadline-meter">
            <div class="deadline-time ${isExpired ? 'late' : ''} ${isUrgent ? 'urgent' : ''}">
                ${task.status === 'done' ? 'Done' : formatCountdown(task.deadline)}
            </div>
            ${task.status === 'pending' ? `
                <div class="deadline-track" aria-label="Deadline countdown progress">
                    <div class="deadline-fill ${isExpired ? 'late' : ''} ${isUrgent ? 'urgent' : ''}" style="width:${isExpired ? 100 : progress}%; background:${isExpired || isUrgent ? '#ff4d4d' : task.color};"></div>
                </div>
                <div class="deadline-date">${task.deadline.replace('T', ' ')}</div>
            ` : `<div class="deadline-date">${task.submittedAt || ''}</div>`}
        </div>
    `;
    return div;
}

function renderGroupedList(containerId, taskArray, emptyMessage = 'No tasks yet') {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';
    if (taskArray.length === 0) {
        container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
        return;
    }
    const groups = taskArray.reduce((acc, task) => {
        const tag = getTaskTag(task);
        if (!acc[tag]) acc[tag] = [];
        acc[tag].push(task);
        return acc;
    }, {});
    for (const tag in groups) {
        const header = document.createElement('div');
        header.className = 'task-group-header';
        header.style.setProperty('--tag-color', getTaskColor(groups[tag][0]));
        header.innerText = `วิชา: ${tag}`;
        container.appendChild(header);
        groups[tag].forEach(task => container.appendChild(createCard(task)));
    }
}

function updateQuickDeadline(allPending) {
    const quickCard = document.getElementById('quick-card');
    if (allPending.length > 0) {
        const msUntilDeadline = new Date(allPending[0].deadline).getTime() - Date.now();
        const isUrgent = msUntilDeadline > 0 && msUntilDeadline <= DEADLINE_NOTIFY_WINDOW_HOURS * 60 * 60 * 1000;
        if (quickCard) quickCard.classList.toggle('urgent', isUrgent);
        if (quickCard) quickCard.classList.remove('all-done');
        document.getElementById('home-quick-title').innerText = allPending[0].title;
        document.getElementById('home-quick-tag').innerText = getTaskTag(allPending[0]);
        document.getElementById('home-quick-tag').style.background = getTaskColor(allPending[0]);
        document.getElementById('home-quick-tag').style.display = 'inline-block';
        const quickMeta = document.getElementById('home-quick-meta');
        if (quickMeta) {
            quickMeta.innerText = allPending[0].isGroup ? getGroupRoleLabel(allPending[0]) : '';
            quickMeta.style.display = allPending[0].isGroup ? 'block' : 'none';
        }
    } else {
        if (quickCard) quickCard.classList.remove('urgent');
        if (quickCard) quickCard.classList.add('all-done');
        document.getElementById('home-quick-title').innerText = "Good job, no undone homework!";
        document.getElementById('home-quick-tag').style.display = 'none';
        const quickMeta = document.getElementById('home-quick-meta');
        if (quickMeta) {
            quickMeta.innerText = '';
            quickMeta.style.display = 'none';
        }
        document.getElementById('home-timer').innerText = "🎉";
    }
}

function renderCalendar(calendarTasks) {
    const grid = document.getElementById('home-calendar');
    const title = document.getElementById('calendar-title');
    if(!grid) return;
    grid.innerHTML = '';
    const now = new Date();
    const currentMonth = visibleCalendarDate.getMonth();
    const currentYear = visibleCalendarDate.getFullYear();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    if (title) title.innerText = formatCalendarTitle(visibleCalendarDate);
    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));
    for (let i = 1; i <= daysInMonth; i++) {
        const d = document.createElement('button');
        const dayKey = getDateKey(new Date(currentYear, currentMonth, i));
        d.innerText = i;
        d.type = 'button';
        d.className = 'calendar-day';
        d.onclick = () => showDayDeadlines(dayKey);
        const tasksOnDay = calendarTasks.filter(t => getDateKey(new Date(t.deadline)) === dayKey);
        if (tasksOnDay.length > 0) {
            const dot = document.createElement('div');
            dot.className = 'calendar-dot';
            dot.style.background = getTaskColor(tasksOnDay[0]);
            d.appendChild(dot);
        }
        if(i === now.getDate() && currentMonth === now.getMonth() && currentYear === now.getFullYear()) d.classList.add('today');
        if(tasksOnDay.length > 0) d.classList.add('has-deadline');
        grid.appendChild(d);
    }
}

setInterval(() => {
    const allPending = tasks.filter(t => t.status === 'pending').sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
    if (allPending.length > 0) {
        const diff = Date.parse(allPending[0].deadline) - Date.parse(new Date());
        if (diff > 0) {
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff / 1000 / 60) % 60);
            const s = Math.floor((diff / 1000) % 60);
            document.getElementById('home-timer').innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        } else { document.getElementById('home-timer').innerText = "EXPIRED"; }
    }
    render();
}, 1000);

initTheme();
initAuth();
