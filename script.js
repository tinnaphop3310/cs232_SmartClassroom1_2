// 1. ข้อมูลเริ่มต้น
let tasks = [
    { id: 1, title: 'Homework 1', tag: 'CS262', color: '#6db08c', deadline: '2026-04-30T23:59', status: 'pending', proofImg: null },
];

let selectedColor = "#6db08c";

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

// 3. ระบบ Color Picker และ Tag Suggestions (คงเดิมจากเวอร์ชันที่แล้ว)
function initColorPicker() {
    const opts = document.querySelectorAll('.color-opt');
    opts.forEach(opt => {
        opt.onclick = function() {
            opts.forEach(o => { o.style.border = "none"; o.style.outline = "none"; });
            this.style.border = "2px solid #fff";
            this.style.outline = `2px solid ${this.dataset.color}`;
            selectedColor = this.dataset.color;
        };
    });
}

function updateTagSuggestions() {
    const container = document.getElementById('suggested-tags');
    if(!container) return;
    const usedTags = [...new Set(tasks.map(t => t.tag))]; 
    container.innerHTML = usedTags.length > 0 ? '<small style="color:#888; width:100%; display:block;">วิชาที่เคยใช้:</small>' : '';
    usedTags.forEach(tag => {
        const span = document.createElement('span');
        span.innerText = tag;
        span.style = "background:#eee; padding:3px 10px; border-radius:10px; font-size:12px; cursor:pointer; border:1px solid #ccc; margin:5px 5px 0 0; display:inline-block;";
        span.onclick = () => document.getElementById('in-tag').value = tag;
        container.appendChild(span);
    });
}

// 4. เพิ่มงานใหม่
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
            status: 'pending',
            proofImg: null
        });
        document.getElementById('in-title').value = '';
        document.getElementById('in-tag').value = '';
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
            <span class="tag" style="background:${task.color}; color:white; padding:4px 12px; border-radius:10px;">${task.tag}</span>
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
            <p>วิชา: ${task.tag}</p>
            <p>ส่งเมื่อ: ${task.submittedAt}</p>
            <div style="margin-top:20px;">
                <strong>หลักฐานการส่ง:</strong><br>
                ${task.proofImg ? `<img src="${task.proofImg}" style="width:100%; border-radius:15px; margin-top:10px; border:1px solid #eee;">` : '<p style="color:#999;">ไม่มีการแนบรูปภาพ</p>'}
            </div>
        `;
    }
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
    showView('view-home');
}

// 6. ระบบ Render และ Calendar (คงเดิมตามเวอร์ชันที่แล้ว)
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

    const allPending = tasks.filter(t => t.status === 'pending').sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
    updateQuickDeadline(allPending);
    renderCalendar(allPending);
}

function createCard(task) {
    const now = new Date().getTime();
    const isExpired = task.status === 'pending' && new Date(task.deadline).getTime() < now;
    const div = document.createElement('div');
    div.className = `task-card ${isExpired ? 'expired' : ''}`;
    div.onclick = () => showDetail(task.id);
    div.style = `background:#f9f9f9; border-radius:15px; padding:15px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; border-left:${isExpired ? '5px solid #ff4d4d' : '1px solid #eee'};`;
    
    div.innerHTML = `
        <div>
            <div style="font-weight:bold">${task.title}</div>
            <span class="tag" style="background:${task.color}; color:white; padding:2px 8px; border-radius:10px; font-size:10px;">${task.tag}</span>
        </div>
        <div style="text-align:right; font-size:11px; color:${isExpired ? '#ff4d4d' : '#666'};">
            ${task.status === 'done' ? '✅' : (isExpired ? 'LATE!' : task.deadline.replace('T', ' '))}
        </div>
    `;
    return div;
}

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

function updateQuickDeadline(allPending) {
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
}

function renderCalendar(pending) {
    const grid = document.getElementById('home-calendar');
    if(!grid) return;
    grid.innerHTML = '';
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));
    for (let i = 1; i <= daysInMonth; i++) {
        const d = document.createElement('div');
        d.innerText = i;
        d.style.position = "relative"; d.style.padding = "5px 0";
        const tasksOnDay = pending.filter(t => {
            const date = new Date(t.deadline);
            return date.getDate() === i && date.getMonth() === currentMonth;
        });
        if (tasksOnDay.length > 0) {
            const dot = document.createElement('div');
            dot.style = `width:5px; height:5px; background:${tasksOnDay[0].color}; border-radius:50%; position:absolute; bottom:2px; left:50%; transform:translateX(-50%);`;
            d.appendChild(dot);
        }
        if(i === now.getDate()) { d.style.background = "#ff4d4d"; d.style.color = "white"; d.style.borderRadius = "50%"; }
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
}, 1000);

render();
