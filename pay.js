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
            MEMBERS = await response.json();
        }
    } catch (e) {
        console.error("❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้:", e);
    }
    
    if (MEMBERS.length === 0) {
        const storedMembers = localStorage.getItem("fund-dashboard-members");
        MEMBERS = storedMembers ? JSON.parse(storedMembers) : (typeof getMembersData === 'function' ? getMembersData() : []);
    }

    const member = MEMBERS.find(m => m.id === memberId);

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

        grid.innerHTML = THAI_MONTHS.map((monthName, idx) => {
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

    // คลิกเลือกเดือน -> ไฮไลต์ปุ่ม + เปิดเมนูเลือกวิธีชำระเงิน (ยังไม่อัปเดต DB)
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

    function updatePayAmountUI(totalAmount, hasSelection) {
        const whoAmount = document.getElementById("who-amount");
        if (whoAmount) whoAmount.textContent = "฿" + totalAmount.toLocaleString();

        const labelEl = document.getElementById("payment-week-label");
        if (labelEl) {
            if (COLLECTION_MODE === "month") {
                labelEl.textContent = selectedMonths.length > 0 
                    ? `เลือกชำระทั้งหมด ${selectedMonths.length} เดือน` 
                    : "กรุณาเลือกเดือนที่ต้องการชำระ";
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

    async function generateCombinedQRCode(payload) {
        const headersImgUrl = 'promptpay-header.png';
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300&data=${encodeURLComponent(payload)}`;

        const loadImage = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });

        try {
            const [headerImg, qrImg] = await Promise.all([
                loadImage(headerImgUrl),
                loadImage(qrApiUrl)
            ]);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const canvasWidth = 350;
            const headerHeight = Math.round((canvasWidth / headerImg.width) * headerImg.height);
            const qrSize = 300;
            const padding = 20;

            canvas.width = canvasWidth;
            canvas.height = headerHeight + qrSize + (padding * 2);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(headerImg, 0, 0, canvasWidth, headerHeight);

            const qrX = (canvasWidth - qrSize) / 2;
            const qrY = headerHeight + padding;
            ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

            return canvas.toDataURL('image/png');
        } catch (error) {
            console.error("เกิดข้อผิดพลาดในการรวมรูป QR Code:", error);
            return qrApiUrl;
        }
    }

    async function updateQRCode() {
        const promptpayAccount = (typeof ROOM !== 'undefined' && ROOM.promptpayId)
            ? ROOM.promptpayId
            : (typeof window.targetAcc !== 'undefined' ? window.targetAcc : "0942411478");

        const totalAmount = selectedMonths.length * rate;

        if (typeof buildPromptPayPayload === "function" && totalAmount > 0) {
            const payload = buildPromptPayPayload(promptpayAccount, totalAmount);
            const qrImg = document.getElementById('qr-img');
            if (qrImg) {
                const combinedDataUrl = await generateCombinedQRCode(payload);
                qrImg.src = combinedDataUrl;
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

    // ทำรายการชำระเงินพร้อมแนบรูปสลิป
    async function markPending(method) {
        const hasSelection = selectedMonths.length > 0;
        if (!hasSelection) {
            alert("กรุณาเลือกเดือนที่ต้องการชำระ");
            return;
        }

        const payAmount = selectedMonths.length * rate;
        let transferorName = null;

        // เช็กและอ่านไฟล์สลิป (ถ้าเลือกสแกนจ่าย)
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
                console.log("✅ ตรวจสอบสลิปผ่านแล้ว:", verifyData.message);
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

        if (!member.paidMonths) member.paidMonths = Array(12).fill(false);
        selectedMonths.forEach(mIdx => member.paidMonths[mIdx] = true);

        if (!member.history) member.history = [];
        member.history.push({
            date: nowDate,
            method: method,
            amount: payAmount,
            mode: COLLECTION_MODE,
            items: [...selectedMonths],
            transferorName: transferorName,
            slipUrl: slipBase64
        });

        try {
            const res = await fetch(`/api/members/${member.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    paidMonths: member.paidMonths,
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
