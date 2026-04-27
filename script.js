// 1. ข้อมูลเริ่มต้น
let tasks = [
    { id: 1, title: 'Homework 1', tag: 'CS262', color: '#6db08c', deadline: '2026-04-30T23:59', status: 'pending' },
    { id: 2, title: 'Lab 2', tag: 'CS262', color: '#6db08c', deadline: '2026-05-02T18:00', status: 'pending' },
    { id: 3, title: 'Report Cloud', tag: 'GE101', color: '#4d94ff', deadline: '2026-05-05T12:00', status: 'pending' }
];

let selectedColor = "#6db08c"; // สีเริ่มต้น

// 2. ฟังก์ชันสลับหน้า
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    if(viewId === 'view-add') {
        updateTagSuggestions();
        initColorPicker();
    }
    render();
}

// 3. ระบบ Color Picker ในหน้า Add
function initColorPicker() {
    const opts = document.querySelectorAll('.color-opt');
    opts.forEach(opt => {
        opt.onclick = function() {
            opts.forEach(o => {
                o.style.border = "none";
                o.style.outline = "none";
            });
            this.style.border = "2px solid #fff";
            this.style.outline = `2px solid ${this.dataset.color}`;
            selectedColor = this.dataset.color;
        };
    });
}

// 4. ระบบแนะนำ Tag วิชาที่เคยใช้
function updateTagSuggestions() {
    const container = document.getElementById('suggested-tags');
    if(!container) return;
    
    const usedTags = [...new Set(tasks.map(t => t.tag))]; 
    container.innerHTML = usedTags.length > 0 ? '<small style="color:#888; width:100%; display:block; margin-bottom:5px;">วิชาที่เคยใช้:</small>' : '';
    
    usedTags.forEach(tag => {
        const span = document.createElement('span');
        span.innerText = tag;
        span.style = "background:#eee; padding:3px 10px; border-radius:10px; font-size:12px; cursor:pointer; border:1px solid #ccc; margin-right:5px; margin-bottom:5px; display:inline-block;";
        span.onclick = () => document.getElementById('in-tag').value = tag;
        container.appendChild(span);
    });
}

// 5. เพิ่มงานใหม่
function addTask() {
    const title = document.getElementById('in-title').value;
    const tag = document.getElementById('in-tag').value;
    const date = document.getElementById('in-date').value;

    if (title && tag && date) {
        tasks.push({
            id: Date.now(),
            title: title,
            tag: tag,
            color: selectedColor,
            deadline: date,
            status: 'pending'
        });
        // ล้างค่า
        document.getElementById('in-title').value = '';
        document.getElementById('in-tag').value = '';
        document.getElementById('in-date').value = '';
        showView('view-home');
    } else {
        alert("กรุณากรอกข้อมูลให้ครบถ้วน");
    }
}

// 6. ระบบปฏิทินแบบ Dynamic เปลี่ยนตามเดือนจริง
function renderCalendar(pending) {
    const grid = document.getElementById('home-calendar');
    if(!grid) return;
    grid.innerHTML = '';

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    
    // อัปเดตหัวข้อเดือน (ถ้ามี)
    const calTitle = document.querySelector('.section-title + .calendar-card').previousElementSibling;
    if(calTitle) calTitle.innerText = `CALENDAR (${monthNames[currentMonth]} ${currentYear})`;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        grid.appendChild(document.createElement('div'));
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const d = document.createElement('div');
        d.innerText = i;
        d.style.position = "relative";
        d.style.padding = "5px 0";

        const tasksOnDay = pending.filter(t => {
            const taskDate = new Date(t.deadline);
            return taskDate.getDate() === i && taskDate.getMonth() === currentMonth && taskDate.getFullYear() === currentYear;
        });

        if (tasksOnDay.length > 0) {
            const dot = document.createElement('div');
            dot.style = `width: 5px; height: 5px; background: ${tasksOnDay[0].color}; border-radius: 50%; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);`;
            d.appendChild(dot);
            d.style.fontWeight = "bold";
        }

        if(i === now.getDate()) {
            d.style.background = "#ff4d4d";
            d.style.color = "white";
            d.style.borderRadius = "50%";
        }
        grid.appendChild(d);
    }
}

// 7. ระบบแยกหมวดหมู่ในหน้า More
function renderGroupedList(containerId, taskArray) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';

    const groups = taskArray.reduce((acc, task) => {
        if (!acc[task.tag]) acc[task.tag] = [];
        acc[task.tag].push(task);
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

// 8. ฟังก์ชันสร้าง Card
function createCard(task) {
    const now = new Date().getTime();
    const isExpired = task.status === 'pending' && new Date(task.deadline).getTime() < now;
    const div = document.createElement('div');
    div.className = `task-card ${isExpired ? 'expired' : ''}`;
    div.onclick = () => showDetail(task.id);
    
    if(isExpired) div.style.borderLeft = "5px solid #ff4d4d";

    div.innerHTML = `
        <div>
            <div style="font-weight:bold">${task.title}</div>
            <span class="tag" style="background:${task.color}">${task.tag}</span>
        </div>
        <div style="text-align:right; font-size:11px; color:${isExpired ? '#ff4d4d' : '#666'};">
            ${task.status === 'done' ? '<span style="color:green; font-weight:bold;">DONE ✅</span>' : (isExpired ? 'LATE!' : task.deadline.replace('T', ' '))}
        </div>
    `;
    return div;
}

// 9. หน้าแสดงรายละเอียด
function showDetail(id) {
    const task = tasks.find(t => t.id === id);
    const content = document.getElementById('detail-content');
    showView('view-detail');

    if (task.status === 'pending') {
        content.innerHTML = `
            <h1 style="color:#ff4d4d">${task.title}</h1>
            <span class="tag" style="background:${task.color}">${task.tag}</span>
            <p style="margin-top:20px;">กำหนดส่ง: ${task.deadline.replace('T', ' ')}</p>
            <button class="btn-main" onclick="submitTask(${task.id})">ส่งงานแล้ว ✅</button>
        `;
    } else {
        content.innerHTML = `<h1>${task.title} ✅</h1><p>วิชา: ${task.tag}</p><p>ส่งเมื่อ: ${task.submittedAt}</p>`;
    }
}

function submitTask(id) {
    const task = tasks.find(t => t.id === id);
    task.status = 'done';
    task.submittedAt = new Date().toLocaleString('th-TH');
    showView('view-home');
}

// 10. การ Render ทั้งหมด
function render() {
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

    // Quick Deadline
    const allPending = tasks.filter(t => t.status === 'pending').sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
    if (allPending.length > 0) {
        document.getElementById('home-quick-title').innerText = allPending[0].title;
        document.getElementById('home-quick-tag').innerText = allPending[0].tag;
        document.getElementById('home-quick-tag').style.background = allPending[0].color;
        document.getElementById('home-quick-tag').style.display = 'inline-block';
    } else {
        document.getElementById('home-quick-title').innerText = "ไม่มีงานค้าง";
        document.getElementById('home-quick-tag').style.display = 'none';
        document.getElementById('home-timer').innerText = "00:00:00";
    }
    renderCalendar(allPending);
}

// Countdown Loop
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
}, 1000);

render();
