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

function exportMembersToExcel() {
    if (typeof XLSX === "undefined") {
        alert("ไม่สามารถโหลดระบบส่งออก Excel ได้ กรุณาลองใหม่อีกครั้ง");
        return;
    }

    const rows = MEMBERS.map((member, index) => {
        let paidMonths = [];
        if (Array.isArray(member.paidMonths)) {
            paidMonths = member.paidMonths;
        } else if (typeof member.paidMonths === "string") {
            try { paidMonths = JSON.parse(member.paidMonths); } catch (e) { paidMonths = []; }
        }
        return {
            "ลำดับ": index + 1,
            "ชื่อสมาชิก": member.name || "",
            "อัตราต่อเดือน": Number(member.amount) || 0,
            "ชำระแล้ว (เดือน)": paidMonths.filter(Boolean).length,
            "สถานะเดือนปัจจุบัน": isMemberPaidCurrent(member) ? "จ่ายแล้ว" : "ค้างชำระ"
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
        { wch: 8 },
        { wch: 30 },
        { wch: 16 },
        { wch: 18 },
        { wch: 24 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "สมาชิก");
    XLSX.writeFile(workbook, `รายชื่อสมาชิก-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

let state = { query: "", filter: "all", sort: "index", ratePreview: 100 };

function parseArrayField(field, defaultLen = 12) {
    if (Array.isArray(field)) return field;
    if (typeof field === "string") {
        try { return JSON.parse(field); } catch (e) { }
    }
    return Array(defaultLen).fill(false);
}

function isMemberPaidCurrent(m) {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";
    if (mode === "month") {
        const currentMonth = getActiveMonthIndex();
        const paidMonths = parseArrayField(m.paidMonths, 12);
        return Boolean(paidMonths[currentMonth]);
    } else {
        const activeWeek = Number(localStorage.getItem("fund-dashboard-active-week")) || 0;
        const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
        const paidWeeks = parseArrayField(m.paidWeeks, totalWeeks);
        return Boolean(paidWeeks[activeWeek]);
    }
}

function computeStats() {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";
    const paid = MEMBERS.filter(m => isMemberPaidCurrent(m)).length;
    const unpaid = MEMBERS.length - paid;
    const target = TARGET_AMOUNT;

    const collected = MEMBERS.reduce((sum, m) => {
        const rate = Number(m.amount) || 100;
        if (mode === "month") {
            const paidMonthsCount = parseArrayField(m.paidMonths, 12).filter(Boolean).length;
            return sum + (paidMonthsCount * rate); 
        } else {
            const totalWeeks = typeof WEEKS_LIST !== "undefined" ? WEEKS_LIST.length : 52;
            const paidWeeksCount = parseArrayField(m.paidWeeks, totalWeeks).filter(Boolean).length;
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

async function togglePaid(id) {
    const mode = localStorage.getItem("fund-dashboard-mode") || "month";
    const currentMonth = getActiveMonthIndex();
    const activeWeek = Number(localStorage.getItem("fund-dashboard-active-week")) || 0;

    try {
        await fetch("/api/admin/toggle-paid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memberId: id, mode, monthIndex: currentMonth, weekIndex: activeWeek })
        });
        await loadFromStorage();
    } catch (err) {
        console.error("Error toggling paid state:", err);
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

async function resetAllPayments() {
    try {
        await fetch("/api/admin/reset", { method: "POST" });
        await loadFromStorage();
    } catch (err) {
        console.error("Error resetting payments:", err);
    } finally {
        closeResetModal();
    }
}

function setFilter(f) { state.filter = f; render(); }
function setQuery(v) { state.query = v; render(); }
function setSort(s) { state.sort = s; render(); }
function setRatePreview(v) {
    const n = Number(v);
    state.ratePreview = isFinite(n) && n >= 0 ? n : state.ratePreview;
}

async function applyRateToAll() {
    try {
        await fetch('/api/admin/members/amount-all', {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: state.ratePreview })
        });
        await loadFromStorage();
    } catch (error) {
        console.error("Error update all rates:", error);
    }
}

async function addMember(name) {
    const trimmed = name.trim();
    if (!trimmed) return;

    const branchSelect = document.getElementById("new-branch-select");
    const selectBranch = branchSelect ? branchSelect.value : "comsci41";

    try {
        await fetch("/api/admin/members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                name: trimmed, 
                amount: state.ratePreview,
                branch: selectBranch
            })
        });
        await loadFromStorage();
    } catch (err) {
        console.error("Error adding member:", err);
    }
}

async function deleteMember(id) {
    if (confirm("ลบรายชื่อนี้?")) {
        try {
            await fetch(`/api/admin/members/${id}`, { method: "DELETE" });
            await loadFromStorage();
        } catch (err) {
            console.error("Error deleting member:", err);
        }
    }
}

function render() {
    loadBranchTitle();
    const s = computeStats();
    safeSetText("stat-collected", safeFmtMoney(s.collected));
    safeSetText("stat-target", safeFmtMoney(s.target));
    safeSetText("stat-progress", s.pct + "%");

    const progressBar = document.getElementById("progress-bar");
    if (progressBar) progressBar.style.width = s.pct + "%";

    safeSetText("stat-paid", s.paid);
    safeSetText("stat-unpaid", s.unpaid);

    renderMembersList();
}

function renderMembersList() {
    const container = document.getElementById("members-list");
    if (!container) return;

    const items = sortedFilteredMembers();
    if (items.length === 0) {
        container.innerHTML = '<div class="no-data">ไม่มีข้อมูล</div>';
        return;
    }

    container.innerHTML = items.map(m => {
        const isPaid = isMemberPaidCurrent(m);
        const paidBadge = isPaid ? '<span class="badge badge-success">จ่ายแล้ว</span>' : '<span class="badge badge-danger">ค้างชำระ</span>';
        return `
            <div class="member-row ${isPaid ? 'paid' : 'unpaid'}">
                <div class="member-info">
                    <div class="member-avatar">
                        ${m.profileImg ? `<img src="${m.profileImg}" alt="${m.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23ccc%22/></svg>'">` : `<div class="avatar-placeholder">👤</div>`}
                    </div>
                    <div class="member-details">
                        <div class="member-name">${m.name}</div>
                        <div class="member-meta">ID: ${m.studentId} | ${safeFmtMoney(m.amount)}/เดือน</div>
                    </div>
                </div>
                <div class="member-status">${paidBadge}</div>
                <div class="member-actions">
                    <button onclick="togglePaid(${m.id})" class="btn-toggle">
                        ${isPaid ? '❌ ยกเลิก' : '✅ ชำระ'}
                    </button>
                    <button onclick="deleteMember(${m.id})" class="btn-delete">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadBranchTitle() {
    const studentId = sessionStorage.getItem("admin_student_id");
    if (!studentId) return;

    try {
        const res = await fetch(`/api/admin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId })
        });
        const data = await res.json();
        if (data.success) {
            const branchName = data.branchName || data.branch;
            safeSetText("branch-title", branchName);
            sessionStorage.setItem("admin_branch_name", branchName);
        }
    } catch (err) {
        console.error("Error loading branch title:", err);
    }
}

async function loadFromStorage() {
    const studentId = sessionStorage.getItem("admin_student_id");
    if (!studentId) {
        window.location.href = "/admin.html";
        return;
    }

    try {
        const res = await fetch(`/api/members?studentId=${studentId}`);
        MEMBERS = await res.json();
        
        const branchRes = await fetch(`/api/admin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId })
        });
        const branchData = await branchRes.json();
        if (branchData.success) {
            sessionStorage.setItem("admin_branch", branchData.branch);
            sessionStorage.setItem("admin_branch_name", branchData.branchName || branchData.branch);
            sessionStorage.setItem("admin_name", branchData.name);
        }
        
        render();
    } catch (err) {
        console.error("Error loading data:", err);
    }
}

document.addEventListener("DOMContentLoaded", function() {
    loadFromStorage();

    // Search and Filter
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            setQuery(e.target.value);
        });
    }

    const filterBtns = document.querySelectorAll(".filter-btn");
    filterBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            filterBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            setFilter(btn.dataset.filter);
        });
    });

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
        sortSelect.addEventListener("change", (e) => {
            setSort(e.target.value);
        });
    }

    // Add Member
    const addMemberForm = document.getElementById("add-member-form");
    if (addMemberForm) {
        addMemberForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const input = document.getElementById("member-name-input");
            if (input) {
                await addMember(input.value);
                input.value = "";
            }
        });
    }

    const rateInput = document.getElementById("rate-input");
    if (rateInput) {
        rateInput.addEventListener("input", (e) => {
            setRatePreview(e.target.value);
            document.getElementById("rate-preview").textContent = state.ratePreview;
        });
    }

    const applyRateBtn = document.getElementById("apply-rate-btn");
    if (applyRateBtn) {
        applyRateBtn.addEventListener("click", applyRateToAll);
    }

    // Logout
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            sessionStorage.clear();
            window.location.href = "/admin.html";
        });
    }

    // Dropdown
    const dropdown = document.getElementById("dropdown-menu");
    const dropdownBtn = document.getElementById("dropdown-btn");
    const closeDropdownBtn = document.getElementById("close-dropdown-btn");

    dropdownBtn?.addEventListener("click", () => {
        dropdown?.classList.toggle("active");
    });

    closeDropdownBtn?.addEventListener("click", () => {
        dropdown?.classList.remove("active");
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".dropdown") && !e.target.closest("#dropdown-btn")) {
            dropdown?.classList.remove("active");
        }
    });

    // Settings Profile Image Upload Modal
    const openSettingBtn = document.getElementById('open-setting-btn');
    const closeSettingsBtn = document.getElementById('close-setting-btn');
    const settingsModal = document.getElementById('settings-modal');
    const avatarInput = document.getElementById('avatar-file-input');
    const settingPreview = document.getElementById('settings-avatar-preview');
    const mainAvatar = document.getElementById('branch-avatar-img');
    const saveAvatarBtn = document.getElementById('save-avatar-btn');
    const branchNameInput = document.getElementById('settings-branch-name-input');

    let selectedFile = null;

    openSettingBtn?.addEventListener('click', () => {
        dropdown?.classList.remove("active");
        if (settingPreview && mainAvatar) {
            settingPreview.src = mainAvatar.src;
        }
        if (branchNameInput) {
            branchNameInput.value = sessionStorage.getItem("admin_branch_name") || document.getElementById("branch-title")?.textContent || "";
        }
        if (settingsModal) settingsModal.style.display = 'flex';
    });

    closeSettingsBtn?.addEventListener('click', () => {
        if (settingsModal) settingsModal.style.display = 'none';
        selectedFile = null;
    });

    avatarInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                alert('ขนาดไฟล์ต้องไม่เกิน 10MB');
                avatarInput.value = '';
                return;
            }
            selectedFile = file;
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (settingPreview) settingPreview.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    saveAvatarBtn?.addEventListener('click', async () => {
        const currentBranch = sessionStorage.getItem("admin_branch") || "comsci41";
        const newBranchName = branchNameInput ? branchNameInput.value.trim() : "";

        if (settingsModal) settingsModal.style.display = 'none';
        showLoading("กำลังบันทึกข้อมูล...");

        try {
            // 1. บันทึกชื่อสาขา (ถ้ามีการกรอก)
            if (newBranchName) {
                const nameRes = await fetch('/api/admin/branch/name', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ branch: currentBranch, branchName: newBranchName })
                });
                const nameResult = await nameRes.json();
                if (nameResult.success) {
                    sessionStorage.setItem("admin_branch_name", newBranchName);
                }
            }

            // 2. อัปโหลดรูปภาพโปรไฟล์ (ถ้ามีการเลือกรูปใหม่)
            if (selectedFile) {
                const formData = new FormData();
                formData.append('branch', currentBranch);
                formData.append('avatar', selectedFile);

                const response = await fetch('/api/admin/branch/upload-profile', {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.success) {
                    const updatedUrl = `${result.avatarUrl}?t=${Date.now()}`;
                    if (mainAvatar) mainAvatar.src = updatedUrl;
                }
            }

            selectedFile = null;
            await loadBranchTitle();
            showSuccess("บันทึกการตั้งค่าสำเร็จ!");
        } catch (error) {
            console.error('Update Error:', error);
            hideLoading();
            alert('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
        }
    });

    /* ====================================================================
       ✅ PromptPay Modal - แก้ไขให้ครบถ้วน
       ==================================================================== */
    const promptpayModal = document.getElementById('promptpay-modal');
    const openPromptpayBtn = document.getElementById('open-promptpay-btn');
    const closePromptpayBtn = document.getElementById('close-promptpay-btn');
    const savePromptpayBtn = document.getElementById('save-promptpay-btn');

    // ✅ เปิด PromptPay Modal พร้อมตรวจสอบข้อมูล
    openPromptpayBtn?.addEventListener('click', async () => {
        dropdown?.classList.remove("active");
        const currentBranch = (sessionStorage.getItem("admin_branch") || "").trim();
        
        console.log('📋 เปิด PromptPay Modal สำหรับสาขา:', currentBranch);

        if (!currentBranch) {
            alert("⚠️ เกิดข้อผิดพลาด: ไม่พบข้อมูลสาขา\nกรุณาเข้าสู่ระบบใหม่");
            return;
        }

        try {
            const res = await fetch(`/api/branches/${currentBranch}`);
            if (res.ok) {
                const data = await res.json();
                const noInput = document.getElementById('promptpay-no-input');
                const nameInput = document.getElementById('promptpay-name-input');
                if (noInput) noInput.value = data.promptpay_no || '';
                if (nameInput) nameInput.value = data.account_name || '';
                console.log('✅ โหลดข้อมูล PromptPay ที่มีอยู่:', data);
            }
        } catch (e) {
            console.error("❌ Error loading branch info:", e);
        }

        if (promptpayModal) promptpayModal.style.display = 'flex';
    });

    // ✅ ปิด PromptPay Modal
    closePromptpayBtn?.addEventListener('click', () => {
        if (promptpayModal) promptpayModal.style.display = 'none';
    });

    // ✅ บันทึก PromptPay พร้อมการตรวจสอบโดยละเอียด
    savePromptpayBtn?.addEventListener('click', async () => {
        // ดึงและ trim ข้อมูลทั้งหมด
        const currentBranch = (sessionStorage.getItem("admin_branch") || "").trim();
        const promptpayNo = (document.getElementById('promptpay-no-input')?.value || "").trim();
        const accountName = (document.getElementById('promptpay-name-input')?.value || "").trim();

        // 🔍 บันทึก debug log
        console.log('📤 PromptPay Save Attempt:', {
            currentBranch: currentBranch || '[EMPTY]',
            promptpayNo: promptpayNo || '[EMPTY]',
            accountName: accountName || '[EMPTY]',
            timestamp: new Date().toISOString()
        });

        // ✅ ตรวจสอบแต่ละฟิลด์อย่างละเอียด
        if (!currentBranch) {
            alert("❌ เกิดข้อผิดพลาด: ไม่พบข้อมูลสาขา\nกรุณาเข้าสู่ระบบใหม่");
            console.error('❌ Branch is empty:', { currentBranch });
            return;
        }

        if (!promptpayNo) {
            alert("❌ กรุณากรอกเลขที่พร้อมเพย์ให้ครบถ้วน");
            console.error('❌ PromptPay number is empty');
            return;
        }

        if (!accountName) {
            alert("❌ กรุณากรอกชื่อบัญชีให้ครบถ้วน");
            console.error('❌ Account name is empty');
            return;
        }

        // ✅ ตรวจสอบรูปแบบเลขพร้อมเพย์
        if (!/^\d+$/.test(promptpayNo) && !/^\+66\d+$/.test(promptpayNo)) {
            alert("❌ เลขพร้อมเพย์ต้องเป็นตัวเลข (เช่น 0812345678)");
            console.error('❌ Invalid PromptPay format:', promptpayNo);
            return;
        }

        if (promptpayModal) promptpayModal.style.display = 'none';
        showLoading("⏳ กำลังลงทะเบียนพร้อมเพย์...");

        try {
            const payload = {
                branch: currentBranch,
                promptpayNo,
                accountName
            };

            console.log('📨 กำลังส่ง payload:', payload);

            const response = await fetch('/api/admin/branch/register-promptpay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            
            console.log('📥 ได้รับ Response:', { status: response.status, body: result });

            if (response.ok && result.success) {
                showSuccess("✅ ลงทะเบียนพร้อมเพย์สำเร็จ");
            } else {
                hideLoading();
                const errorMsg = result.message || result.error || "ไม่สามารถบันทึกได้";
                alert("❌ เกิดข้อผิดพลาด:\n" + errorMsg);
                console.error('❌ Save failed:', result);
            }
        } catch (error) {
            hideLoading();
            console.error("❌ Network/Request Error:", error);
            alert("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้\n" + error.message);
        }
    });
});

// ✅ แสดงวงกลมหมุนรอโหลด
function showLoading(message = "⏳ กำลังโหลดข้อมูล...") {
    const modal = document.getElementById("loading-modal");
    const spinnerBox = document.getElementById("loading-spinner-box");
    const successBox = document.getElementById("loading-success-box");
    const loadingText = document.getElementById("loading-text");

    if (!modal) return;
    if (loadingText) loadingText.textContent = message;
    
    if (spinnerBox) spinnerBox.style.display = "block";
    if (successBox) successBox.style.display = "none";
    modal.style.display = "flex";
}

// ✅ เปลี่ยนเป็นเครื่องหมายติ๊กถูกสำเร็จ
function showSuccess(message = "✅ สำเร็จ!", duration = 1400, callback = null) {
    const modal = document.getElementById("loading-modal");
    const spinnerBox = document.getElementById("loading-spinner-box");
    const successBox = document.getElementById("loading-success-box");
    const successText = document.getElementById("success-text");

    if (!modal) return;

    if (successText) successText.textContent = message;
    if (spinnerBox) spinnerBox.style.display = "none";
    
    if (successBox) {
        successBox.style.display = "block";
        const svg = successBox.querySelector('.checkmark-svg');
        if (svg) {
            const newSvg = svg.cloneNode(true);
            svg.parentNode.replaceChild(newSvg, svg);
        }
    }

    setTimeout(() => {
        modal.style.display = "none";
        if (typeof callback === "function") callback();
    }, duration);
}

// ✅ ปิด Modal โหลดกรณีเกิด Error
function hideLoading() {
    const modal = document.getElementById("loading-modal");
    if (modal) modal.style.display = "none";
}