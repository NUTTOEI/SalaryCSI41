function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    if (document.getElementById('qr-name')) {
        document.getElementById('qr-name').textContent = (typeof ROOM !== 'undefined' && ROOM.promptpayName)
            ? ROOM.promptpayName
            : "น.ส.สุพรรณณิกา คงคาศรี";
    }

    const COLLECTION_MODE = localStorage.getItem("fund-dashboard-mode") || "month";

    let selectedMonthIndex = new Date().getMonth();
    let selectedMonths = [];
    let selectedWeeks = [];

    const params = new URLSearchParams(location.search);
    const memberId = Number(params.get("id"));

    // โหลดข้อมูลสมาชิกจาก MySQL API
let MEMBERS = [];
try {
    const response = await fetch("/api/members", { cache: "no-store" });
    if (response.ok) {
        const data = await response.json();
        // เช็กโครงสร้าง JSON เพื่อดึง Array ออกมาให้ถูกต้อง
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

// หากดึงจาก API ไม่สำเร็จ ให้ดึงจาก LocalStorage หรือ getMembersData()
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

// ป้องกัน Error 100% โดยการรับประกันว่า MEMBERS เป็น Array เสมอ
if (!Array.isArray(MEMBERS)) {
    MEMBERS = [];
}

    const member = MEMBERS.find(m => 
        String(m.id) === String(memberId) ||
        String(m.student_id || m.studentId) === String(memberId)
    );

    if (!member) {
        alert("ไม่พบข้อมูลสมาชิก กรุณาเลือกใหม่อีกครั้ง");
        location.href = "admin.html";
        return;
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
        const promptpayAccount = (typeof ROOM !== 'undefined' && ROOM.promptpayId)
            ? ROOM.promptpayId
            : (typeof window.targetAcc !== 'undefined' ? window.targetAcc : "0942411478");

        const isMonthMode = COLLECTION_MODE === "month";
        const selectedCount = isMonthMode ? selectedMonths.length : selectedWeeks.length;
        const totalAmount = selectedCount * rate;

        if (typeof buildPromptPayPayload === "function" && totalAmount > 0) {
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

    async function markPending(method) {
        const isMonthMode = COLLECTION_MODE === "month";
        const hasSelection = isMonthMode ? selectedMonths.length > 0 : selectedWeeks.length > 0;

        if (!hasSelection) {
            alert(isMonthMode ? "กรุณาเลือกเดือนที่ต้องการชำระ" : "กรุณาเลือกสัปดาห์ที่ต้องการชำระ");
            return;
        }

        const payAmount = isMonthMode ? selectedMonths.length * rate : selectedWeeks.length * rate;
        let transferorName = null;

        if (method === "PromptPay") {
            const slipInput = document.getElementById("slip-file");
            if (slipInput && slipInput.files.length === 0) {
                alert("กรุณาแนบไฟล์รูปภาพสลิปการโอนเงิน");
                return;
            }

            const formData = new FormData();
            formData.append("slip_image", slipInput.files[0]);
            formData.append("expected_amount", payAmount);

            try {
                const verifyRes = await fetch("/verify-slip", {
                    method: "POST",
                    body: formData
                });

                const verifyData = await verifyRes.json();

                if (!verifyRes.ok || verifyData.status !== "success") {
                    alert("❌ ตรวจสอบสลิปไม่ผ่าน: " + (verifyData.message || "สลิปไม่ถูกต้อง"));
                    return;
                }

                transferorName = verifyData.transferorName || null;
            } catch (err) {
                console.error("❌ เกิดข้อผิดพลาดในการตรวจสลิป:", err);
                alert("ไม่สามารถเชื่อมต่อระบบตรวจสอบสลิปได้ กรุณาลองใหม่อีกครั้ง");
                return;
            }
        }

        let slipBase64 = null;
        if (method === "PromptPay") {
            const slipInput = document.getElementById("slip-file");
            if (slipInput && slipInput.files.length > 0) {
                try {
                    slipBase64 = await getBase64(slipInput.files[0]);
                } catch (e) {
                    console.error("❌ แปลงไฟล์สลิปไม่สำเร็จ:", e);
                }
            }
        }

        const nowDate = new Date().toLocaleDateString("th-TH");

        if (isMonthMode) {
            if (!member.paidMonths) member.paidMonths = Array(12).fill(false);
            selectedMonths.forEach(mIdx => member.paidMonths[mIdx] = true);
        } else {
            const weekCount = typeof WEEKS_LIST !== 'undefined' ? WEEKS_LIST.length : 52;
            if (!member.paidWeeks) member.paidWeeks = Array(weekCount).fill(false);
            selectedWeeks.forEach(wIdx => member.paidWeeks[wIdx] = true);
        }

        if (!member.history) member.history = [];
        member.history.push({
            date: nowDate,
            method: method,
            amount: payAmount,
            mode: COLLECTION_MODE,
            items: isMonthMode ? [...selectedMonths] : [...selectedWeeks],
            transferorName: transferorName,
            slipUrl: slipBase64
        });

        try {
            const res = await fetch(`/api/members/${member.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    paidMonths: member.paidMonths,
                    paidWeeks: member.paidWeeks,
                    history: member.history
                })
            });

            if (res.ok) {
                alert("แจ้งชำระเงินสำเร็จ!");
                document.getElementById('pay-form-wrap')?.classList.add('hidden');
                document.getElementById('pay-done')?.classList.remove('hidden');
                setTimeout(() => {
                    window.location.href = `member.html?id=${member.id}`;
                }, 2000);
            } else {
                alert("ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
            }
        } catch (err) {
            console.error("❌ บันทึกไม่สำเร็จ:", err);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
        }
    }

    document.getElementById("tab-qr")?.addEventListener("click", () => switchTab("qr"));
    document.getElementById("tab-cash")?.addEventListener("click", () => switchTab("cash"));
    document.getElementById("confirm-qr")?.addEventListener("click", () => markPending("PromptPay"));
    document.getElementById("confirm-cash")?.addEventListener("click", () => markPending("เงินสด"));
    document.getElementById("back-btn")?.addEventListener("click", () => history.back());
});