function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    // อ่านค่า URL Parameters
    const params = new URLSearchParams(window.location.search);
    const memberId = params.get("id") || params.get("memberId");

    // ตัวแปรเก็บพร้อมเพย์ประจำสาขา
    let currentBranchPromptPay = {
        promptpayId: "0942411478",
        promptpayName: "เหรัญญิกประจำสาขา"
    };

    async function loadBranchPromptPay(branchCode) {
        if (!branchCode) return;
        try {
            const res = await fetch(`/api/settings/promptpay?branch=${branchCode}`);
            if (res.ok) {
                const data = await res.json();
                if (data.promptpayId) currentBranchPromptPay.promptpayId = data.promptpayId;
                if (data.promptpayName) currentBranchPromptPay.promptpayName = data.promptpayName;
            }
        } catch (e) {
            console.error("ไม่สามารถดึงข้อมูลพร้อมเพย์ประจำสาขาได้:", e);
        }
    }

    // ดึงข้อมูลสมาชิกจาก API / Fallback
    try {
        const response = await fetch("/api/members", { cache: "no-store" });
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                MEMBERS = data;
            } else if (data && Array.isArray(data.data)) {
                MEMBERS = data.data;
            } else if (data && Array.isArray(data.members)) {
                MEMBERS = data.members;
            }
        }
    } catch (e) {
        console.error("❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้:", e);
    }

    if (!Array.isArray(MEMBERS) || MEMBERS.length === 0) {
        try {
            const storedMembers = localStorage.getItem("fund-dashboard-members");
            const parsed = storedMembers ? JSON.parse(storedMembers) : null;
            if (Array.isArray(parsed)) {
                MEMBERS = parsed;
            } else if (typeof getMembersData === 'function') {
                const fallback = getMembersData();
                MEMBERS = Array.isArray(fallback) ? fallback : [];
            }
        } catch (e) {
            MEMBERS = [];
        }
    }

    if (!Array.isArray(MEMBERS)) {
        MEMBERS = [];
    }

    // ค้นหาข้อมูลสมาชิก
    const member = MEMBERS.find(m => {
        if (!m) return false;
        const targetId = String(memberId).trim();
        return (
            String(m.id || "").trim() === targetId ||
            String(m._id || "").trim() === targetId ||
            String(m.student_id || "").trim() === targetId ||
            String(m.studentId || "").trim() === targetId ||
            String(m.member_id || "").trim() === targetId
        );
    });

    if (!member) {
        console.error("❌ ไม่พบสมาชิก ID:", memberId, "จากรายการทั้งหมด:", MEMBERS);
        alert(`ไม่พบข้อมูลสมาชิก (ID: ${memberId}) กรุณาตรวจสอบอีกครั้ง`);
        
        if (window.history.length > 1) {
            history.back();
        } else {
            location.href = "index.html"; 
        }
        return;
    }

    // โหลดข้อมูลพร้อมเพย์หลังจากพบข้อมูลสาขาของสมาชิกเรียบร้อยแล้ว
    if (member.branch) {
        await loadBranchPromptPay(member.branch);
    }

    // แสดงชื่อบัญชีเหรัญญิกบนหน้าจอ
    if (document.getElementById('qr-name')) {
        document.getElementById('qr-name').textContent = currentBranchPromptPay.promptpayName;
    }

    const rate = Number(member.amount)
        || (typeof ROOM !== 'undefined' && Number(ROOM.amount || ROOM.rate))
        || Number(localStorage.getItem("fund-dashboard-rate"))
        || 100;

    if (document.getElementById("rate-display")) document.getElementById("rate-display").textContent = rate;
    if (document.getElementById("who-name")) document.getElementById("who-name").textContent = member.name;

    if (COLLECTION_MODE === "month") {
        renderMonthModeUI();
    } else {
        renderWeekModeUI();
    }

    // อ่านค่า index และ type จาก URL Parameter
    const indexParam = params.get("index");
    const typeParam = params.get("type") || COLLECTION_MODE;

    if (indexParam !== null) {
        const targetIdx = Number(indexParam);
        if (typeParam === "month") {
            selectedMonths = [targetIdx];
            const totalAmount = selectedMonths.length * rate;
            updatePayAmountUI(totalAmount, true);
            renderMonthModeUI();
        } else {
            selectedWeeks = [targetIdx];
            if (typeof WEEKS_LIST !== 'undefined' && WEEKS_LIST[targetIdx]) {
                selectedMonthIndex = WEEKS_LIST[targetIdx].monthIndex;
            }
            const totalAmount = selectedWeeks.length * rate;
            renderWeekModeUI();
            updatePayAmountUI(totalAmount, true);
        }
    }
    
    function renderMonthModeUI() {
        const group = document.getElementById("month-selection-group");
        if (!group) return;

        group.innerHTML = `
            <label><i class="ti ti-calendar"></i> เลือกเดือนที่ต้องการชำระ (เดือนละ ฿${rate})</label>
            <div class="month-select-grid" id="month-grid"></div>
        `;

        const grid = document.getElementById("month-grid");
        if (!grid) return;

        const paidMonths = member.paidMonths || Array(12).fill(false);
        const monthsList = typeof THAI_MONTHS !== 'undefined' ? THAI_MONTHS : [];

        grid.innerHTML = monthsList.map((monthName, idx) => {
            const isPaid = paidMonths[idx];
            const isSelected = selectedMonths.includes(idx);

            if (isPaid) {
                return `
                <div class="month-option-card paid-already">
                    <div class="m-title">${monthName}</div>
                    <div class="m-status"><i class="ti ti-check"></i> จ่ายแล้ว </div>
                </div>`;
            }

            return `
            <div class="month-option-card ${isSelected ? 'selected' : ''}" onclick="toggleMonthSelection(${idx})">
                <div class="m-title">${monthName}</div>
                <div class="m-status">${isSelected ? 'เลือกแล้ว' : '฿' + rate}</div>
            </div>`;
        }).join("");
    }

    window.toggleMonthSelection = function(index) {
        if (selectedMonths.includes(index)) {
            selectedMonths = selectedMonths.filter(m => m !== index);
        } else {
            selectedMonths.push(index);
        }

        const totalAmount = selectedMonths.length * rate;
        updatePayAmountUI(totalAmount, selectedMonths.length > 0);
        renderMonthModeUI();
    };

    function renderWeekModeUI() {
        injectMonthDropdown();
        renderWeekGrid();
    }

    function injectMonthDropdown() {
        const group = document.getElementById("month-selection-group");
        if (!group || document.getElementById("pay-month-select")) return;
        
        const monthsList = typeof THAI_MONTHS !== 'undefined' ? THAI_MONTHS : [];
        const currentYear = typeof CURRENT_YEAR !== 'undefined' ? CURRENT_YEAR : '';

        const optionsHTML = monthsList.map((m, idx) =>
            `<option value="${idx}" ${idx === selectedMonthIndex ? 'selected' : ''}>${m} (${currentYear})</option>`
        ).join("");

        group.innerHTML = `
            <div class="month-select-wrapper">
                <label for="pay-month-select"><i class="ti ti-calendar"></i> เลือกประจำเดือนที่จะจ่ายสัปดาห์:</label>
                <select id="pay-month-select" class="month-dropdown">
                    ${optionsHTML}
                </select>
            </div>
            <div class="week-select-grid" id="month-select-grid" style="margin-top: 12px;"></div>
        `;

        document.getElementById("pay-month-select")?.addEventListener("change", (e) => {
            selectedMonthIndex = Number(e.target.value);
            renderWeekGrid();
        });
    }

    function renderWeekGrid() {
        const grid = document.getElementById("month-select-grid");
        if (!grid || typeof WEEKS_LIST === 'undefined') return;

        const weeksInMonth = WEEKS_LIST.filter(w => w.monthIndex === selectedMonthIndex);

        grid.innerHTML = weeksInMonth.map((item, localIdx) => {
            const isFullyPaid = Boolean(member.paidWeeks ? member.paidWeeks[item.index] : false);
            const isSelected = selectedWeeks.includes(item.index);

            if (isFullyPaid) {
                return `
                <div class="week-option paid-already">
                    <i class="ti ti-circle-check-filled week-check-icon"></i>
                    <div class="week-text">
                        <span class="w-title">สัปดาห์ที่ ${localIdx + 1}</span>
                        <span class="sub-date">จ่ายแล้ว</span>
                    </div>
                </div>`;
            }

            return `
            <div class="week-option ${isSelected ? 'selected' : ''}" onclick="toggleWeekSelection(${item.index})">
                <i class="ti ${isSelected ? 'ti-circle-check-filled' : 'ti-circle'} week-check-icon"></i>
                <div class="week-text">
                    <span class="w-title">สัปดาห์ที่ ${localIdx + 1} (฿${rate})</span>
                    <span class="sub-date">${item.dateRange || ''}</span>
                </div>
            </div>`;
        }).join("");
    }

    window.toggleWeekSelection = function(index) {
        if (selectedWeeks.includes(index)) {
            selectedWeeks = selectedWeeks.filter(w => w !== index);
        } else {
            selectedWeeks.push(index);
        }

        const totalAmount = selectedWeeks.length * rate;
        updatePayAmountUI(totalAmount, selectedWeeks.length > 0);
        renderWeekGrid();
    };

    function updatePayAmountUI(totalAmount, hasSelection) {
        const whoAmount = document.getElementById("who-amount");
        if (whoAmount) whoAmount.textContent = "฿" + totalAmount.toLocaleString();

        const labelEl = document.getElementById("payment-week-label");
        if (labelEl) {
            if (COLLECTION_MODE === "month") {
                labelEl.textContent = selectedMonths.length > 0 
                    ? `เลือกชำระทั้งหมด ${selectedMonths.length} เดือน` 
                    : "กรุณาเลือกเดือนที่ต้องการชำระ";
            } else {
                const weeksInMonth = typeof WEEKS_LIST !== 'undefined' ? WEEKS_LIST.filter(w => w.monthIndex === selectedMonthIndex) : [];
                const weekNumbers = selectedWeeks
                    .map(globalIdx => weeksInMonth.findIndex(w => w.index === globalIdx) + 1)
                    .filter(num => num > 0)
                    .sort((a, b) => a - b);

                if (weekNumbers.length === 0) {
                    labelEl.textContent = "กรุณาเลือกสัปดาห์ที่ต้องการชำระ";
                } else {
                    labelEl.textContent = `ยอดที่ต้องชำระประจำสัปดาห์ที่ ${weekNumbers.join(", ")}`;
                }
            }
        }

        const methodWrap = document.getElementById("step-method-wrap");
        if (hasSelection) {
            methodWrap?.classList.remove("step-hidden");
            methodWrap?.classList.add("step-visible");
            if (!document.querySelector(".tab-btn.active")) {
                switchTab("qr");
            } else {
                updateQRCode();
            }
        } else {
            methodWrap?.classList.add("step-hidden");
            methodWrap?.classList.remove("step-visible");
            hideAllPanels();
        }
    }

    function updateQRCode() {
        const promptpayAccount = currentBranchPromptPay.promptpayId;

        const isMonthMode = COLLECTION_MODE === "month";
        const selectedCount = isMonthMode ? selectedMonths.length : selectedWeeks.length;
        const totalAmount = selectedCount * rate;

        const nameElem = document.getElementById('qr-name');
        if (nameElem && currentBranchPromptPay.promptpayName) {
            nameElem.textContent = currentBranchPromptPay.promptpayName;
        }

        if (typeof buildPromptPayPayload === "function" && totalAmount > 0 && promptpayAccount) {
            const payload = buildPromptPayPayload(promptpayAccount, totalAmount);
            const qrImg = document.getElementById('qr-img');
            if (qrImg) {
                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`;
            }
        }
    }

    function switchTab(which) {
        const tabQr = document.getElementById("tab-qr");
        const tabCash = document.getElementById("tab-cash");
        const panelQr = document.getElementById("panel-qr");
        const panelCash = document.getElementById("panel-cash");

        tabQr?.classList.toggle("active", which === "qr");
        tabCash?.classList.toggle("active", which === "cash");

        if (which === "qr") {
            panelCash?.classList.add("step-hidden");
            panelQr?.classList.remove("step-hidden");
            updateQRCode();
        } else {
            panelQr?.classList.add("step-hidden");
            panelCash?.classList.remove("step-hidden");
        }
    }

    function hideAllPanels() {
        document.getElementById("panel-qr")?.classList.add("step-hidden");
        document.getElementById("panel-cash")?.classList.add("step-hidden");
    }

    // แก้ไขใน Frontend
async function markPending(method) {
    const selectedCount = COLLECTION_MODE === "month" ? selectedMonths.length : selectedWeeks.length;
    const currentPayAmount = selectedCount * rate;

    if (method === "PromptPay") {
        const slipInput = document.getElementById("slip-file");
        if (!slipInput || !slipInput.files[0]) {
            alert("กรุณาอัปโหลดสลิปการโอนเงิน");
            return;
        }

        const formData = new FormData();
        formData.append("slip_image", slipInput.files[0]);
        formData.append("expected_amount", currentPayAmount);
        formData.append("branch", member ? member.branch : ""); 

        try {
            const res = await fetch("/verify-slip", {
                method: "POST",
                body: formData
            });
            const result = await res.json();
            if (res.ok) {
                alert("ชำระเงินสำเร็จ!");
                location.reload();
            } else {
                alert(`ตรวจสอบสลิปไม่ผ่าน: ${result.message}`);
            }
        } catch (err) {
            console.error("Verification error:", err);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
        }
    } else if (method === "เงินสด") {
        // บันทึกรายการเงินสด หรือส่งเข้า API แจ้งยอดเงินสด
        alert(`รับแจ้งชำระเงินสดจำนวน ฿${currentPayAmount} เรียบร้อยแล้ว`);
        // TODO: ยิง API แจ้งแอดมินหรือบันทึกสถานะรออนุมัติ
    }
}

    document.getElementById("tab-qr")?.addEventListener("click", () => switchTab("qr"));
    document.getElementById("tab-cash")?.addEventListener("click", () => switchTab("cash"));
    document.getElementById("confirm-qr")?.addEventListener("click", () => markPending("PromptPay"));
    document.getElementById("confirm-cash")?.addEventListener("click", () => markPending("เงินสด"));
    document.getElementById("back-btn")?.addEventListener("click", () => history.back());
});