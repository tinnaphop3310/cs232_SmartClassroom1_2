// 1. ข้อมูลเริ่มต้น
const USERS_KEY = 'classsync-users';
const SESSION_KEY = 'classsync-current-user';
const THEME_KEY = 'classsync-theme';
const NOTIFIED_KEY = 'classsync-deadline-notified';
const ALERT_WINDOW_DAYS = 7;
const DEADLINE_NOTIFY_WINDOW_HOURS = 10;
const DEADLINE_NOTIFY_INTERVAL_MS = 60 * 60 * 1000;
const APP_TOAST_VISIBLE_MS = 9000;

let tasks = [];
let currentUserEmail = null;
let authMode = 'login';
let selectedDayKey = null;
let visibleCalendarDate = new Date();

let selectedColor = "#6db08c";

function getUsers() {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
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

function showAppNotification(task) {
    const stack = document.getElementById('app-notification-stack');
    if (!stack) return;

    const toast = document.createElement('button');
    toast.type = 'button';
    toast.className = 'app-notification';
    toast.onclick = () => {
        toast.remove();
        showDetail(task.id);
    };
    toast.innerHTML = `
        <span class="app-notification-dot" style="background:${getTaskColor(task)}"></span>
        <span>
            <strong>${task.title}</strong>
            <small>${getTaskTag(task)} · Due ${formatCountdown(task.deadline)}</small>
        </span>
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
        const notifyKey = `${task.id}-deadline-hourly`;
        const lastSent = Number(log[userLogKey][notifyKey] || 0);
        if (!options.forceBrowser && now - lastSent < DEADLINE_NOTIFY_INTERVAL_MS) return;

        showAppNotification(task);

        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('ClassSync deadline reminder', {
                body: `${task.title} (${getTaskTag(task)}) is due ${formatCountdown(task.deadline)}.`,
            });
        }

        log[userLogKey][notifyKey] = now;
    });

    saveNotificationLog(log);
}

function getDefaultTasks() {
    return [
        { id: 1, title: 'Homework 1', tag: 'CS262', color: '#6db08c', deadline: '2026-04-30T23:59', status: 'pending', proofImg: null },
    ];
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

function handleAuthSubmit(event) {
    event.preventDefault();

    const email = normalizeEmail(document.getElementById('auth-email').value);
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();
    const users = getUsers();

    if (!email || !password) {
        showAuthMessage('Please enter your email and password.');
        return;
    }

    if (password.length < 6) {
        showAuthMessage('Password must be at least 6 characters.');
        return;
    }

    if (authMode === 'register') {
        if (users[email]) {
            showAuthMessage('This email already has an account. Please login instead.');
            return;
        }

        users[email] = {
            email,
            name: name || email.split('@')[0],
            password,
            tasks: getDefaultTasks(),
            tagColors: { CS262: '#6db08c' }
        };
        saveUsers(users);
        startSession(email, users[email].tasks);
        return;
    }

    if (!users[email] || users[email].password !== password) {
        showAuthMessage('Incorrect email or password.');
        return;
    }

    startSession(email, users[email].tasks || []);
}

function startSession(email, userTasks) {
    currentUserEmail = email;
    tasks = userTasks;
    const users = getUsers();
    if (users[email] && !users[email].tagColors) {
        users[email].tagColors = getRememberedTagColors();
        saveUsers(users);
    }
    localStorage.setItem(SESSION_KEY, email);
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-name').value = '';
    showView('view-home');
    requestDeadlineNotificationsOnStart();
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
    localStorage.removeItem(SESSION_KEY);
    showAuthMessage('');
    setAuthMode('login');
    showView('view-auth');
}

function initAuth() {
    setAuthMode('login');
    const sessionEmail = localStorage.getItem(SESSION_KEY);
    const users = getUsers();

    if (sessionEmail && users[sessionEmail]) {
        currentUserEmail = sessionEmail;
        tasks = users[sessionEmail].tasks || [];
        showView('view-home');
        requestDeadlineNotificationsOnStart();
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
    }
    render();
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

// 4. เพิ่มงานใหม่
function addTask() {
    const title = document.getElementById('in-title').value.trim();
    const rawTag = document.getElementById('in-tag').value.trim();
    const tag = normalizeTag(rawTag);
    const date = document.getElementById('in-date').value;

    if (title && rawTag && date) {
        tasks.push({
            id: Date.now(),
            title: title,
            tag: tag,
            color: selectedColor,
            deadline: date,
            status: 'pending',
            proofImg: null
        });
        saveRememberedTagColor(tag, selectedColor);
        saveCurrentUserTasks();
        document.getElementById('in-title').value = '';
        document.getElementById('in-tag').value = '';
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
    showView('view-detail');

    if (task.status === 'pending') {
        content.innerHTML = `
            <h1 style="color:#ff4d4d; margin-bottom:5px;">${task.title}</h1>
            <span class="tag" style="background:${getTaskColor(task)}; color:white; padding:4px 12px; border-radius:10px;">${getTaskTag(task)}</span>
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
            <p>ส่งเมื่อ: ${task.submittedAt}</p>
            <div style="margin-top:20px;">
                <strong>หลักฐานการส่ง:</strong><br>
                ${task.proofImg ? `<img src="${task.proofImg}" style="width:100%; border-radius:15px; margin-top:10px; border:1px solid #eee;">` : '<p style="color:#999;">ไม่มีการแนบรูปภาพ</p>'}
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
}

// 6. ระบบ Render และ Calendar (คงเดิมตามเวอร์ชันที่แล้ว)
function render() {
    if (!currentUserEmail) return;

    const search = document.getElementById('searchInput').value.toLowerCase();
    const filtered = tasks.filter(t => t.title.toLowerCase().includes(search) || t.tag.toLowerCase().includes(search));
    
    const pending = filtered.filter(t => t.status === 'pending').sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
    const done = filtered.filter(t => t.status === 'done').sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    document.getElementById('home-check-list').innerHTML = '';
    pending.slice(0, 3).forEach(t => document.getElementById('home-check-list').appendChild(createCard(t)));
    document.getElementById('btn-more-check').style.display = pending.length > 3 ? 'block' : 'none';

    document.getElementById('home-done-list').innerHTML = '';
    done.slice(0, 3).forEach(t => document.getElementById('home-done-list').appendChild(createCard(t)));
    document.getElementById('btn-more-done').style.display = done.length > 3 ? 'block' : 'none';

    renderGroupedList('full-check-list', pending);
    renderGroupedList('full-done-list', done);
    renderDayDeadlines();

    const allPending = tasks.filter(t => t.status === 'pending').sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
    updateQuickDeadline(allPending);
    updateProgressChart();
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
    const createdAt = Number(task.id) || Date.now();
    const total = Math.max(deadline - createdAt, 1);
    const remaining = deadline - Date.now();
    return Math.max(0, Math.min(100, (remaining / total) * 100));
}

function createCard(task) {
    const now = new Date().getTime();
    const isExpired = task.status === 'pending' && new Date(task.deadline).getTime() < now;
    const progress = getCountdownProgress(task);
    const div = document.createElement('div');
    div.className = `task-card ${isExpired ? 'expired' : ''}`;
    div.onclick = () => showDetail(task.id);
    div.style = `border-left:${isExpired ? '5px solid #ff4d4d' : '1px solid #eee'};`;
    
    div.innerHTML = `
        <div class="task-card-main">
            <div class="task-card-title">${task.title}</div>
            <span class="tag" style="background:${getTaskColor(task)}; color:white; padding:2px 8px; border-radius:10px; font-size:10px;">${getTaskTag(task)}</span>
        </div>
        <div class="deadline-meter">
            <div class="deadline-time ${isExpired ? 'late' : ''}">
                ${task.status === 'done' ? 'Done' : formatCountdown(task.deadline)}
            </div>
            ${task.status === 'pending' ? `
                <div class="deadline-track" aria-label="Deadline countdown progress">
                    <div class="deadline-fill ${isExpired ? 'late' : ''}" style="width:${isExpired ? 100 : progress}%; background:${isExpired ? '#ff4d4d' : task.color};"></div>
                </div>
                <div class="deadline-date">${task.deadline.replace('T', ' ')}</div>
            ` : `<div class="deadline-date">${task.submittedAt || ''}</div>`}
        </div>
    `;
    return div;
}

function renderGroupedList(containerId, taskArray) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';
    const groups = taskArray.reduce((acc, task) => {
        const tag = getTaskTag(task);
        if (!acc[tag]) acc[tag] = [];
        acc[tag].push(task);
        return acc;
    }, {});
    for (const tag in groups) {
        const header = document.createElement('div');
        header.style = "margin:20px 0 10px; font-weight:bold; color:#333; border-left:4px solid #ff4d4d; padding-left:10px;";
        header.innerText = `วิชา: ${tag}`;
        container.appendChild(header);
        groups[tag].forEach(task => container.appendChild(createCard(task)));
    }
}

function updateQuickDeadline(allPending) {
    if (allPending.length > 0) {
        document.getElementById('home-quick-title').innerText = allPending[0].title;
        document.getElementById('home-quick-tag').innerText = getTaskTag(allPending[0]);
        document.getElementById('home-quick-tag').style.background = getTaskColor(allPending[0]);
        document.getElementById('home-quick-tag').style.display = 'inline-block';
    } else {
        document.getElementById('home-quick-title').innerText = "ไม่มีงานค้าง";
        document.getElementById('home-quick-tag').style.display = 'none';
        document.getElementById('home-timer').innerText = "00:00:00";
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
