// pay.js — หน้าเลือกสมาชิกและวิธีชำระเงิน

let MEMBERS = [];
let TARGET_AMOUNT = 4000;
let selectedMemberId = null;
let selectedPayments = [];

const PROMPTPAY_ID = "0920000123456"; // เปลี่ยนเป็นเลขพรอมเพย์จริง (เบอร์มือถือหรือบัตรประชาชน)

async function loadLatestMembers() {
    try {
        const response = await fetch("/api/members", { cache: "no-store" });
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ MySQL ได้:", e);
    }
    return [];
}

function renderHomeScreen() {
    const mainEl = document.getElementById("pay-form-wrap");
    const doneEl = document.getElementById("pay-done");
    if (doneEl) doneEl.classList.add("hidden");
    if (mainEl) mainEl.classList.remove("hidden");

    renderMembersList();
}

function renderMembersList() {
    const grid = document.getElementById("month-select-grid");
    if (!grid) return;

    grid.innerHTML = MEMBERS.map(m => {
        const rate = Number(m.amount) || 100;
        const isPaid = (m.paidMonths && m.paidMonths[new Date().getMonth()]) ? true : false;
        const className = isPaid ? "paid" : "unpaid";
        return `
            <div class="month-card ${className}" onclick="selectMember(${m.id})">
                <div class="month-name">${m.name}</div>
                <div class="month-amount">฿${rate}</div>
                <div class="status-badge">${isPaid ? '✓ จ่ายแล้ว' : 'ค้างชำระ'}</div>
            </div>
        `;
    }).join("");
}

function selectMember(memberId) {
    selectedMemberId = memberId;
    selectedPayments = [];
    const member = MEMBERS.find(m => m.id === memberId);
    if (!member) return;

    const whoName = document.getElementById("who-name");
    const whoAmount = document.getElementById("who-amount");
    const rateDisplay = document.getElementById("rate-display");
    const qrImg = document.getElementById("qr-img");
    const qrName = document.getElementById("qr-name");
    
    if (whoName) whoName.textContent = member.name;
    if (whoAmount) whoAmount.textContent = `฿${Number(member.amount || 0).toLocaleString()}`;
    if (rateDisplay) rateDisplay.textContent = Number(member.amount || 0).toLocaleString();
    if (qrName) qrName.textContent = member.name;
    
    // สร้าง QR Code
    if (qrImg && typeof promptPayQrImageUrl === 'function') {
        qrImg.src = promptPayQrImageUrl(PROMPTPAY_ID, member.amount || 100, 200);
    }

    showPaymentMethodScreen();
}

function showPaymentMethodScreen() {
    const formWrap = document.getElementById("pay-form-wrap");
    const methodWrap = document.getElementById("step-method-wrap");
    if (formWrap) formWrap.classList.add("hidden");
    if (methodWrap) methodWrap.classList.remove("step-hidden");
}

function showHomeScreen() {
    const formWrap = document.getElementById("pay-form-wrap");
    const methodWrap = document.getElementById("step-method-wrap");
    if (formWrap) formWrap.classList.remove("hidden");
    if (methodWrap) methodWrap.classList.add("step-hidden");
}

function confirmCashPayment() {
    if (!selectedMemberId) return;
    
    const member = MEMBERS.find(m => m.id === selectedMemberId);
    if (!member) return;

    // ในโปรเจกต์จริง จะบันทึกการชำระด้วยวิธีการต่างๆ
    // ตอนนี้แค่แสดงข้อความยืนยัน
    showDoneScreen();
}

function showDoneScreen() {
    const mainEl = document.getElementById("pay-form-wrap");
    const doneEl = document.getElementById("pay-done");
    if (mainEl) mainEl.classList.add("hidden");
    if (doneEl) doneEl.classList.remove("hidden");
}

async function initApp() {
    // Load รายชื่อจาก API
    MEMBERS = await loadLatestMembers();
    
    // Render หน้าแรก
    renderHomeScreen();

    // Setup event listeners
    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            if (selectedMemberId) {
                showHomeScreen();
                selectedMemberId = null;
            } else {
                window.location.href = "member.html";
            }
        });
    }

    const confirmQRBtn = document.getElementById("confirm-qr");
    if (confirmQRBtn) {
        confirmQRBtn.addEventListener("click", showDoneScreen);
    }

    const confirmCashBtn = document.getElementById("confirm-cash");
    if (confirmCashBtn) {
        confirmCashBtn.addEventListener("click", confirmCashPayment);
    }

    const doneBackLink = document.getElementById("done-back-link");
    if (doneBackLink) {
        doneBackLink.addEventListener("click", () => {
            window.location.href = "member.html";
        });
    }

    // Reload เวลากลับมาหน้านี้
    window.addEventListener("pageshow", async () => {
        MEMBERS = await loadLatestMembers();
        renderMembersList();
    });
}

// เรียก initApp เวลา script load เสร็จ
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}