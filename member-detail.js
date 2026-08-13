let currentMember = null;
let allMembers = [];
let selectedAdminMonth = new Date().getMonth();

function getActiveMonthIndex() {
    const val = localStorage.getItem("fund-dashboard-active-month");
    return val !== null ? Number(val) : new Date().getMonth();
}

function getActiveWeekIndex() {
    const val = localStorage.getItem("fund-dashboard-active-week");
    return val !== null ? Number(val) : 0;
}

function getMemberIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return Number(params.get("id"));
}

async function loadMemberData() {
    const id = getMemberIdFromUrl();
    if (!id) {
        alert("กรุณาเลือกรายชื่อสมาชิกจากหน้าหลัก");
        window.location.href = "admin.html";
        return;
    }

    let loadedFromStorage = false;
    const saved = localStorage.getItem("fund-dashboard-members");
    if (saved) {
        try {
            allMembers = JSON.parse(saved);
            loadedFromStorage = true;
        } catch(e) { }
    }
    
    if (!loadedFromStorage) {
        try {
            const response = await fetch("data.json", { cache: "no-store" });
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    allMembers = data;
                }
            }
        } catch (e) { }
    }

    currentMember = allMembers.find(m => m.id === id);

    if (!currentMember) {
        alert("ไม่พบข้อมูลสมาชิกท่านนี้");
        window.location.href = "admin.html";
        return;
    }

    // กำหนดค่าเริ่มต้นให้รองรับทั้งรายสัปดาห์และรายเดือน
    const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
    if (!currentMember.paidWeeks) currentMember.paidWeeks = Array(totalWeeks).fill(false);
    if (!currentMember.paidMonths) currentMember.paidMonths = Array(12).fill(false);

    renderMonthFilter();
    renderMemberDetail();
}

function renderMonthFilter() {
    const summaryEl = document.getElementById("detail-summary");
    if (!summaryEl || document.getElementById("admin-month-select")) return;

    const optionsHTML = THAI_MONTHS.map((m, idx) => 
        `<option value="${idx}" ${idx === selectedAdminMonth ? 'selected' : ''}>${m} (${CURRENT_YEAR})</option>`
    ).join("");

    const wrap = document.createElement("div");
    wrap.id = "admin-month-filter-wrap";
    wrap.className = "month-select-wrapper";
    wrap.style.marginTop = "12px";
    wrap.innerHTML = `
        <label for="admin-month-select"><i class="ti ti-calendar"></i> เลือกแสดงตามประจำเดือน:</label>
        <select id="admin-month-select" class="month-dropdown" onchange="onAdminMonthChange(this.value)">
            ${optionsHTML}
        </select>
    `;

    summaryEl.parentNode.insertBefore(wrap, summaryEl.nextSibling);
}

function onAdminMonthChange(val) {
    selectedAdminMonth = Number(val);
    renderMemberDetail();
}

function renderMemberDetail() {
    const nameEl = document.getElementById("detail-name");
    const avatarEl = document.getElementById("detail-avatar");
    if (nameEl) nameEl.textContent = currentMember.name;
    if (avatarEl) avatarEl.textContent = currentMember.id;

    const rate = Number(currentMember.amount) || 100;
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";
    const filterWrap = document.getElementById("admin-month-filter-wrap");

    const activeMonthIndex = getActiveMonthIndex();
    const activeWeekIndex = getActiveWeekIndex();

    let totalActualPaid = 0;
    if (mode === "month") {
        totalActualPaid = (currentMember.paidMonths || []).reduce((sum, isPaid) => sum + (isPaid ? rate : 0), 0);
    } else {
        totalActualPaid = (currentMember.paidWeeks || []).reduce((sum, isPaid) => sum + (isPaid ? rate : 0), 0);
    }
    if (totalActualPaid === 0 && currentMember.paid) totalActualPaid = rate;

    const summaryEl = document.getElementById("detail-summary");
    const totalPaidEl = document.getElementById("detail-total-paid");

    if (totalPaidEl) totalPaidEl.textContent = `฿${totalActualPaid.toLocaleString()}`;

    const grid = document.getElementById("months-grid");
    if (!grid) return; 

    grid.style.maxHeight = "none";

    if (mode === "month") {
        if (filterWrap) filterWrap.style.display = "none"; 

        const paidMonthsCount = (currentMember.paidMonths || []).filter(Boolean).length;
        if (summaryEl) {
            summaryEl.textContent = `ประจำปี ${CURRENT_YEAR} • ชำระแล้ว ${paidMonthsCount} / 12 เดือน (เดือนละ ฿${rate})`;
        }

        grid.innerHTML = THAI_MONTHS.map((mName, idx) => {
            const isPaid = Boolean(currentMember.paidMonths[idx]);
            const isCurrent = (idx === activeMonthIndex);
            const isOverdue = (idx < activeMonthIndex && !isPaid);

            let statusClass = "is-unpaid";
            let badgeText = '<i class="ti ti-x"></i> ยังไม่ได้จ่าย';

            if (isPaid) {
                statusClass = "is-paid";
                badgeText = '<i class="ti ti-check"></i> จ่ายแล้ว';
            } else if (isOverdue) {
                statusClass = "is-unpaid is-overdue overdue";
                badgeText = '<i class="ti ti-alert-circle"></i> ค้างชำระ';
            } else if (isCurrent) {
                statusClass = "is-unpaid active";
                badgeText = '<i class="ti ti-clock"></i> งวดปัจจุบัน';
            }

            return `
                <div class="month-card ${statusClass}" onclick="toggleMonthPayment(${idx}, ${rate})">
                    <div class="month-name">
                        <span>เดือน ${mName}</span>
                    </div>
                    <div class="status-badge">${badgeText}</div>
                    <div class="month-amount">ยอดชำระ: ฿${rate}</div>
                </div>
            `;
        }).join("");

    } else {
        if (filterWrap) filterWrap.style.display = "block"; // แสดงตัวกรองเดือนถ้าอยู่โหมดรายสัปดาห์

        const weeksInMonth = WEEKS_LIST.filter(w => w.monthIndex === selectedAdminMonth);
        const paidCountInMonth = weeksInMonth.filter(w => Boolean(currentMember.paidWeeks[w.index])).length;

        if (summaryEl) {
            summaryEl.textContent = `ประจำเดือน ${THAI_MONTHS[selectedAdminMonth]} • ชำระแล้ว ${paidCountInMonth} / ${weeksInMonth.length} สัปดาห์ (สัปดาห์ละ ฿${rate})`;
        }

        grid.innerHTML = weeksInMonth.map((item, localIdx) => {
            const isPaid = Boolean(currentMember.paidWeeks[item.index]);
            const isCurrent = (item.index === activeWeekIndex);
            const isOverdue = (item.index < activeWeekIndex && !isPaid);

            let statusClass = "is-unpaid";
            let badgeText = '<i class="ti ti-X"></i> ยังไม่ได้จ่าย';

            if (isPaid) {
                statusClass = "is-paid";
                badgeText = '<i class="ti ti-check"></i> จ่ายแล้ว';
            } else if (isOverdue) {
                statusClass = "is-unpaid is-overdue overdue";
                badgeText = '<i class="ti ti-alert-circle"></i> ค้างชำระ';
            } else if (isCurrent) {
                statusClass = "is-unpaid active";
                badgeText = '<i class="ti ti-clock"></i> งวดปัจจุบัน';
            }

            return `
                <div class="month-card ${statusClass}" onclick="toggleWeekPayment(${item.index}, ${rate})">
                    <div class="month-name">
                        <span>สัปดาห์ที่ ${localIdx + 1}</span>
                        <small style="font-size:11px; color:#6b7280; display:block;">${item.dateRange}</small>
                    </div>
                    <div class="status-badge">${badgeText}</div>
                    <div class="month-amount">ยอดชำระ: ฿${rate}</div>
                </div>
            `;
        }).join("");
    }
}



function toggleMonthPayment(monthIndex, rate) {
    if (!currentMember.paidMonths) currentMember.paidMonths = Array(12).fill(false);

    const newStatus = !Boolean(currentMember.paidMonths[monthIndex]);
    currentMember.paidMonths[monthIndex] = !Boolean(currentMember.paidMonths[monthIndex]);

    currentMember.paid = currentMember.paidMonths.every(Boolean);

    if (!currentMember.history) currentMember.history = [];
    const nowDate = new Date().toLocaleDateString("th-TH");

    currentMember.history.push({
        date: nowDate,
        method: newStatus ? "Admin บันทึกชำระเงิน" : "Admin ยกเลิกการชำระ",
        amount: newStatus ? rate : -rate,
        months: [monthIndex]
    });

    saveAllMembersToStorage();
    renderMemberDetail();
}

function toggleWeekPayment(weekIndex, rate) {
    const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
    if (!currentMember.paidWeeks) currentMember.paidWeeks = Array(totalWeeks).fill(false);

    const currentStatus = Boolean(currentMember.paidWeeks[weekIndex]);
    const newStatus = !currentStatus;
    currentMember.paidWeeks[weekIndex] = newStatus;

    currentMember.paid = currentMember.paidWeeks.every(Boolean);

    if (!currentMember.history) currentMember.history = [];
    const nowDate = new Date().toLocaleDateString("th-TH");

    currentMember.history.push({
        date: nowDate,
        method: newStatus ? "Admin บันทึกชำระเงิน" : "Admin ยกเลิกการชำระ",
        amount: newStatus ? rate : -rate,
        weeks: [weekIndex]
    });

    saveAllMembersToStorage();
    renderMemberDetail();
}

function saveAllMembersToStorage() {
    const idx = allMembers.findIndex(m => m.id === currentMember.id);
    if (idx !== -1) {
        allMembers[idx] = currentMember;
        localStorage.setItem("fund-dashboard-members", JSON.stringify(allMembers));
        fetch("save.php", {
            method: "POST",
            headers: { "Content-Type" : "application/json" },
            body: JSON.stringify(allMembers, null, 2)
        })
        .then(r => r.text())
        .then(t => console.log("บันทึกไปยังเซิร์ฟเรียบร้อย:", t))
        .catch(e => console.log("ไม่สามารถบันทึกลงเซิร์ฟเวอร์ได้:", e));
    }
}

document.addEventListener("DOMContentLoaded", loadMemberData);