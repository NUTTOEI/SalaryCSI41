const urlParams = new URLSearchParams(window.location.search);
const currentBranch = (urlParams.get('branch') || 'comsci41').toLowerCase();

const STORAGE_KEY = {
    MEMBERS: `memberList_${currentBranch}`,
    TITLE: `branchTitle_${currentBranch}`,
    RATE: `monthlyRate_${currentBranch}`,
    TARGET: `targetAmount_${currentBranch}`
};

function getMembersList() {
    const data = localStorage.getItem(STORAGE_KEY.MEMBERS);
    return data ? JSON.parse(data) : [];
}

function saveMemberList(list) {
    localStorage.setItem(STORAGE_KEY.MEMBERS, JSON.stringify(list));
}


if (typeof MEMBERS === "undefined") MEMBERS = [];
if (typeof TARGET_AMOUNT === "undefined") TARGET_AMOUNT = 0;

function getActiveMonthIndex() {
    const val = localStorage.getItem("fund-dashboard-active-month");
    return val !== null ? Number(val) : new Date().getMonth();
}

function getActiveWeekIndex() {
    const val = localStorage.getItem("fund-dashboard-active-week");
    return val !== null ? Number(val) : 0;
}

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function safeFmtMoney(val) {
    return typeof fmtMoney === "function" ? fmtMoney(val) : `฿${Number(val || 0).toLocaleString()}`;
}

function persistAll() {
    if (typeof MEMBERS !== "undefined") {
        localStorage.setItem("KEYS.MEMBERS", JSON.stringify(MEMBERS));
    }
    if (typeof TARGET_AMOUNT !== "undefined") {
        localStorage.setItem("KEYS.TARGET", TARGET_AMOUNT);
    }
}

let selectedAdminMonth = new Date().getMonth();

let state = { query: "", filter: "all", sort: "index", ratePreview: 100 };

function isMemberPaidCurrent(m) {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";
    if (mode === "month") {
        const currentMonth = new Date().getMonth(); // ดึงเดือนปัจจุบัน (0 = ม.ค., 7 = ส.ค.)
        const paidMonths = m.paidMonths || Array(12).fill(false);
        return Boolean(paidMonths[currentMonth]);
    } else {
        const activeWeek = Number(localStorage.getItem("fund-dashboard-active-week")) || 0;
        const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
        const paidWeeks = m.paidWeeks || Array(totalWeeks).fill(false);
        return Boolean(paidWeeks[activeWeek]);
    }
}

function computeStats() {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";
    const paid = MEMBERS.filter(m => isMemberPaidCurrent(m)).length;
    const unpaid = MEMBERS.length - paid;
    const target = typeof getTargetData === "function" ? (getTargetData() || 0) : TARGET_AMOUNT;

    const collected = MEMBERS.reduce((sum, m) => {
        const rate = Number(m.amount) || 100;
        if (mode === "month") {
            const paidMonthsCount = (m.paidMonths || []).filter(Boolean).length;
            return sum + (paidMonthsCount * rate); 
        } else {
            const paidWeeksCount = (m.paidWeeks || []).filter(Boolean).length;
            return sum + (paidWeeksCount * rate);
        }
    }, 0);

    const pct = target > 0 ? Math.round((collected / target) * 100) : 0;
    return { paid, unpaid, collected, target, pct };
}

function sortedFilteredMembers() {
    let items = MEMBERS.filter(m => {
        const isPaid = isMemberPaidCurrent(m);
        const q = m.name ? m.name.includes(state.query.trim()) : false;
        const f = state.filter === "all" ? true : state.filter === "paid" ? isPaid : !isPaid;
        return q && f;
    });
    if (state.sort === "name") {
        items = items.slice().sort((a, b) => a.name.localeCompare(b.name, "th"));
    } else if (state.sort === "unpaid-first") {
        items = items.slice().sort((a, b) => Number(isMemberPaidCurrent(a)) - Number(isMemberPaidCurrent(b)));
    }
    return items;
}

function togglePaid(id) {
    const m = MEMBERS.find(x => x.id === id);
    if (m) {
        const mode = localStorage.getItem("fund-dashboard-mode") || "month";
        const currentMonth = getActiveMonthIndex();
        const activeWeek = Number(localStorage.getItem("fund-dashboard-active-week")) || 0;

        if (!m.paidMonths) m.paidMonths = Array(12).fill(false);
        if (!m.paidWeeks && typeof WEEKS_LIST !== "undefined") m.paidWeeks = Array(WEEKS_LIST.length).fill(false);

        if (mode === "month") {
            const nextStatus = !m.paidMonths[currentMonth];
            m.paidMonths[currentMonth] = nextStatus;
            m.paid = nextStatus;
        } else {
            const nextStatus = !m.paidWeeks[activeWeek];
            m.paidWeeks[activeWeek] = nextStatus;
            m.paid = nextStatus;
        }

        const isNowPaid = isMemberPaidCurrent(m);
        if (isNowPaid) {
            m.date = new Date().toLocaleDateString("th-TH");
            if (!m.history) m.history = [];
            m.history.push({
                date: m.date,
                method: "ชำระผ่านแอดมิน",
                amount: m.amount
            });
        } else {
            m.date = null;
        }

        persistAll();
        render();
    }
}

function openResetModal() {
    const modal = document.getElementById("reset-modal");
    if (modal) modal.style.display = "flex";
}

function closeResetModal() {
    const modal = document.getElementById("reset-modal");
    if (modal) modal.style.display = "none";
}

// ===== ฟังก์ชันรีเซ็ตระบบจ่ายเงินทั้งหมด =====
function resetAllPayments() {
        MEMBERS.forEach(m => {
            m.paid = false;
            m.date = null;
            m.history = [];
            m.paidMonths = Array(12).fill(false);
            if (typeof WEEKS_LIST !== "undefined") {
                m.paidWeeks = Array(WEEKS_LIST.length).fill(false);
            }
        });

        persistAll();
        render();
        closeResetModal();
    }

function setFilter(f) { state.filter = f; render(); }
function setQuery(v) { state.query = v; render(); }
function setSort(s) { state.sort = s; render(); }
function setRatePreview(v) {
    const n = Number(v);
    state.ratePreview = isFinite(n) && n >= 0 ? n : state.ratePreview;
}

function applyRateToAll() {
    MEMBERS.forEach(m => { m.amount = state.ratePreview; });
    persistAll();
    render();
}

function addMember(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextId = MEMBERS.length > 0 ? Math.max(...MEMBERS.map(m => m.id)) + 1 : 1;
    MEMBERS.push({
        id: nextId,
        name: trimmed,
        amount: state.ratePreview,
        paid: false,
        date: null,
        paidMonths: Array(12).fill(false),
        paidWeeks: typeof WEEKS_LIST !== "undefined" ? Array(WEEKS_LIST.length).fill(false) : []
    });
    persistAll();
    render();
}

function deleteMember(id) {
    if (confirm("ลบรายชื่อนี้?")) {
        const index = MEMBERS.findIndex(m => m.id === id);
        if (index !== -1) {
            MEMBERS.splice(index, 1);
            persistAll();
            render();
        }
    }
}

function render() {
    loadBranchTitle();
    const s = computeStats();
    safeSetText("stat-collected", safeFmtMoney(s.collected));
    safeSetText("stat-target", safeFmtMoney(s.target));
    safeSetText("stat-paid", s.paid);
    safeSetText("stat-unpaid", s.unpaid);
    safeSetText("stat-total", MEMBERS.length);
    safeSetText("progress-pct", s.pct + "%");
    safeSetText("summary-line", `เก็บได้แล้ว ${safeFmtMoney(s.collected)} - จ่ายแล้ว ${s.paid} คน ยังไม่จ่าย ${s.unpaid} คน จากทั้งหมด ${MEMBERS.length} คน`);
    safeSetText("summary-projected", `ยอดเงินสะสมปัจจุบันคิดเป็น ${s.pct}% ของเป้าหมายทั้งหมด (${safeFmtMoney(s.target)})`);

    const ring = document.getElementById("progress-ring-fg");
    if (ring) {
        const circumference = 2 * Math.PI * 52;
        ring.style.strokeDasharray = circumference;
        ring.style.strokeDashoffset = circumference * (1 - Math.min(s.pct, 100) / 100);
    }

    const list = document.getElementById("member-list");
    if (list) {
        const items = sortedFilteredMembers();
        safeSetText("count-line", `แสดง ${items.length} จาก ${MEMBERS.length} คน`);

        if (items.length === 0) {
            list.innerHTML = '<div class="empty"><i class="ti ti-search-off"></i>ไม่พบสมาชิกที่ตรงกับคำค้นหา</div>';
            return;
        }
        list.innerHTML = items.map(renderRow).join("");
    }
}

function renderRow(m, index) {
    const displayNum = index + 1;
    const tint = typeof tintFor === "function" ? tintFor(m.id) : { bg: "#eef0fb", fg: "#4c5fd5" };
    const total = Number(m.amount) || 0;

    const statusInfo = getMemberStatus(m);
    const pill = `<span class="pill ${statusInfo.class}">${statusInfo.text}</span>`;
    const subText = statusInfo.subText;
    const historyCount = m.history ? m.history.length : 0;

    return `
    <div class="member-row" data-toggle-id="${m.id}">
        <div class="m-avatar" style="background:${tint.bg};color:${tint.fg}">${displayNum}</div>
        <div class="m-text">
            <div class="m-name">${m.name}</div>
            <div class="m-sub">${subText}</div>
        </div>
        <div class="m-right">
            <div class="m-amount" data-edit-amount="${m.id}" title="คลิกเพื่อแก้ยอดของคนนี้">${safeFmtMoney(total)}</div>
            ${pill}
            
            <button class="history-btn" data-history-id="${m.id}" title="ดูประวัติการจ่าย (${historyCount})" style="background:none; border:none; cursor:pointer; color:#777; padding:4px; margin-left:4px;">
                <i class="ti ti-history" style="font-size: 1.2rem;"></i>
            </button>
            
            <a href="detailmember.html?id=${m.id}&branch=${currentBranch}" title="ดูรายละเอียด" onclick="event.stopPropagation();" style="display:flex; align-items:center; gap:4px; text-decoration: none; background:#EEF0FB; border:1px solid #C7CCEB; border-radius:6px; cursor:pointer; color:#4C5FD5; padding:4px 8px; font-size:12px; font-family:'Kanit'; white-space: nowrap;">
                <i class="ti ti-calendar-event" style="font-size: 1.1rem;"></i> รายรายละเอียด
            </a>

            <button class="delete-btn" data-delete-id="${m.id}" title="ลบสมาชิก" style="background:none; border:none; cursor:pointer; color:#ff5252; padding:4px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"></path><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1 v3"></path></svg> 
            </button>
        </div>
    </div>
    `;
}

function startEditAmount(el) {
    const id = Number(el.getAttribute("data-edit-amount"));
    const m = MEMBERS.find(x => x.id === id);
    if (!m) return;
    el.innerHTML = '<input type="number" class="amount-input" data-amount-id="' + id + '" value="' + m.amount + '">';
    const input = el.querySelector("input");
    if (input) {
        input.focus();
        input.select();
    }
}

function saveEditAmount(input) {
    const id = Number(input.getAttribute("data-amount-id"));
    const m = MEMBERS.find(x => x.id === id);
    if (!m) return;
    const n = Number(input.value);
    if (isFinite(n) && n >= 0) {
        m.amount = n;
        persistAll();
        render();
    }
}

document.addEventListener("click", (e) => {
    const resetBtn = e.target.closest("#reset-all-btn");
    if (resetBtn) {
        openResetModal();
        return;
    }

    const confirmResetBtn = e.target.closest("#btn-confirm-reset");
    if (confirmResetBtn) {
        resetAllPayments();
        return;
    }

    if (e.target.classList.contains("modal-overlay")) {
        closeResetModal();
        closeTargetModal();
    }

    const deleteBtn = e.target.closest("[data-delete-id]");
    if (deleteBtn) {
        e.stopPropagation();
        deleteMember(Number(deleteBtn.getAttribute("data-delete-id")));
        return;
    }

    const historyBtn = e.target.closest("[data-history-id]");
    if (historyBtn) {
        e.stopPropagation();
        viewHistory(Number(historyBtn.getAttribute("data-history-id")));
        return;
    }

    const amountEl = e.target.closest("[data-edit-amount]");
    if (amountEl && !e.target.closest(".amount-input")) {
        startEditAmount(amountEl);
        return;
    }

    const filterBtn = e.target.closest("[data-filter]");
    if (filterBtn) {
        document.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("active"));
        filterBtn.classList.add("active");
        setFilter(filterBtn.getAttribute("data-filter"));
        return;
    }

    const sortBtn = e.target.closest("[data-sort]");
    if (sortBtn) {
        document.querySelectorAll("[data-sort]").forEach(b => b.classList.remove("active"));
        setSort(sortBtn.getAttribute("data-sort"));
        return;
    }

    const row = e.target.closest("[data-toggle-id]");
    if (row && !e.target.closest(".amount-input") && !e.target.closest("button") && !e.target.closest("a")) {
        togglePaid(Number(row.getAttribute("data-toggle-id")));
        return;
    }
});

document.addEventListener("focusout", (e) => {
    const input = e.target.closest(".amount-input");
    if (input) saveEditAmount(input);
});

document.addEventListener("keydown", (e) => {
    const targetModal = document.getElementById("target-modal");
    const resetModal = document.getElementById("reset-modal");

    if (e.key === "Escape") {
        closeTargetModal();
        closeResetModal();
    }

    if (targetModal && targetModal.style.display === "flex") {
        if (e.key === "Enter") {
            e.preventDefault();
            saveTargetAmount();
        }
    }
});

if (document.getElementById("search-input")) {
    document.getElementById("search-input").addEventListener("input", (e) => setQuery(e.target.value));
}
if (document.getElementById("rate-input")) {
    document.getElementById("rate-input").addEventListener("input", (e) => setRatePreview(e.target.value));
}
if (document.getElementById("apply-rate-btn")) {
    document.getElementById("apply-rate-btn").addEventListener("click", applyRateToAll);
}

const addBtn = document.getElementById("add-member-btn");
const nameInput = document.getElementById("new-name-input");
if (addBtn && nameInput) {
    addBtn.addEventListener("click", () => {
        addMember(nameInput.value);
        nameInput.value = "";
        nameInput.focus();
    });
    nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addBtn.click();
        }
    });
}

function viewHistory(memberId) {
   const member = MEMBERS.find(m => Number(m.id) === Number(memberId));
   if (!member) return;

   safeSetText("modal-member-name", `ประวัติชำระเงิน: ${member.name}`);

   const listEl = document.getElementById("modal-history-list");
   if (listEl) {
    listEl.innerHTML = "";
        if (member.history && member.history.length > 0) {
            member.history.forEach((h, index) => {
                const li = document.createElement("li");
                li.style.marginBottom = "8px";
                li.innerText = `ครั้งที่ ${index + 1}: วันที่ ${h.date} - ชำระ ${safeFmtMoney(h.amount)} (${h.method || 'โอนเงิน'})`;
                listEl.appendChild(li);
            });
        } else {
            listEl.innerHTML = "<li>ยังไม่มีประวัติการชำระเงิน</li>";
        }
   }

   const modal = document.getElementById("history-modal");
   if (modal) modal.style.display = "flex";
}

function closeHistoryModal() {
    const modal = document.getElementById("history-modal");
    if (modal) modal.style.display = "none";
}

async function loadFromStorage() {
    let loaded = false;

    try {
        const savedMembers = localStorage.getItem("KEYS.MEMBERS");
        if (savedMembers) {
            const parsed = JSON.parse(savedMembers);
            if (Array.isArray(parsed) && parsed.length > 0) {
                MEMBERS = parsed;
                loaded = true;
            }
        }
    } catch (e) {
        console.log("Error loading localStorage:", e);
    }

    if (!loaded) {
        try {
            const response = await fetch("data.json", { cache: "no-store" });
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    MEMBERS = data;
                    loaded = true;
                }
            }
        } catch (e) {
            console.log("ไม่สามารถอ่าน data.json ได้ ใช้ข้อมูลสำรองแทน");
        }
    }

    if (!loaded && typeof DEFAULT_MEMBERS !== "undefined") {
        MEMBERS = DEFAULT_MEMBERS;
    }

    const rawTarget = typeof getTargetData === "function" ? getTargetData() : TARGET_AMOUNT;
    TARGET_AMOUNT = typeof rawTarget === "number" ? rawTarget : 4000;
    render();
}

function openTargetModal() {
    const modal = document.getElementById("target-modal");
    const input = document.getElementById("target-modal-input");
    if (modal && input) {
        input.value = typeof getTargetData === "function" ? getTargetData() : TARGET_AMOUNT;
        modal.style.display = "flex";
        setTimeout(() => {
            input.focus();
            input.select();
        }, 50);
    }
}

function closeTargetModal() {
    const modal = document.getElementById("target-modal");
    if (modal) modal.style.display = "none";
}

function saveTargetAmount() {
    const input = document.getElementById("target-modal-input");
    if (input) {
        const num = Number(input.value);
        if (isFinite(num) && num > 0) {
            TARGET_AMOUNT = num;
            persistAll();
            render();
            closeTargetModal();
        } else {
            alert("กรุณาระบุจำนวนเงินเป้าหมายที่ถูกต้อง");
        }
    }
}

if (document.getElementById("stat-target")) {
    document.getElementById("stat-target").addEventListener("click", openTargetModal);
}

const saveTargetBtn = document.getElementById("btn-save-target");
if (saveTargetBtn) {
    saveTargetBtn.addEventListener("click", saveTargetAmount);
}

document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("target-modal");
    if (modal && modal.style.display === "flex") {
        if (e.key === "Enter") {
            e.preventDefault();
            saveTargetAmount();
        } else if (e.key === "Escape") {
            closeTargetModal();
        }
    }
});

function getCollectionMode() {
    return localStorage.getItem("fund-dashboard-mode") || "month";
}

function setCollectionMode(mode) {
    if (mode === "week") return;
    localStorage.setItem("fund-dashboard-mode", mode);
    updateModeUI(mode);
    render();
}

function updateModeUI(mode) {
    const monthBtn = document.getElementById("mode-month-btn");
    const weekBtn = document.getElementById("mode-week-btn");

    if (monthBtn && weekBtn) {
        monthBtn.classList.toggle("active", mode === "month");
        weekBtn.classList.toggle("active", mode === "week");
    }
}

function initAdminApp() {
    localStorage.setItem("fund-dashboard-mode", "month");
    updateModeUI(getCollectionMode());
    loadFromStorage();
    setupBranchTitle();
}



function getMemberStatus(m) {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";

    if (mode === "month") {
        const currentMonth = typeof getActiveMonthIndex === "function" ? getActiveMonthIndex() : new Date().getMonth();
        const paidMonths = m.paidMonths || Array(12).fill(false);

        if (paidMonths[currentMonth]) {
            return {
                status: "paid",
                text: "จ่ายแล้ว",
                class: "paid",
                subText: "ชำระเรียบร้อย"
            };
        }

        return {
            status: "unpaid",
            text: "ค้างชำระ",
            class: "unpaid",
            subText: `ยอดชำระประจำเดือน ${safeFmtMoney(m.amount)} บาท`
        };
    } else {
        const activeWeek = typeof getActiveWeekIndex === "function" ? getActiveWeekIndex() : Number(localStorage.getItem("fund-dashboard-active-week")) || 0;
        const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
        const paidWeeks = m.paidWeeks || Array(totalWeeks).fill(false);

        if (paidWeeks[activeWeek]) {
            return {
                status: "paid",
                text: "จ่ายแล้ว",
                class: "paid",
                subText: "ชำระเรียบร้อย"
            };
        }

        return {
            status: "unpaid",
            text: "ค้างชำระ",
            class: "unpaid",
            subText: `ยอดชำระประจำสัปดาห์ ${safeFmtMoney(m.amount)} บาท`
        };
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminApp);
} else {
    initAdminApp();
}

function loadBranchTitle() {
    const titleEl = document.getElementById("branch-title");
    if (!titleEl) return;
    const savedTitle = localStorage.getItem("KEYS.TITLE");
    titleEl.textContent = savedTitle || currentBranch.toUpperCase();
}

    function setupBranchTitle() {
        const titleEl = document.getElementById("branch-title");
        if (!titleEl) return;

        loadBranchTitle();

        titleEl.addEventListener("blur", () => {
            const newTitle = titleEl.textContent.trim() || currentBranch.toUpperCase();
            titleEl.textContent = newTitle;
            localStorage.setItem("KEYS.TITLE", newTitle);
        });

        titleEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
            e.preventDefault();
            titleEl.blur();
        }
    });
}
