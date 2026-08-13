const CURRENT_YEAR = new Date().getFullYear();

const THAI_MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
    "พฤษภาคม", "มิถุนายน","กรกฎาคม", "สิงหาคม",
    "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const THAI_MONTHS_SHORT = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.",
    "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.",
    "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

function getWeeksOfCurrentYear() {
    const weeks = [];
    let startDate = new Date(CURRENT_YEAR, 0, 1);
    let weekIndex = 0;

    while (startDate.getFullYear() === CURRENT_YEAR) {
        let endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        const startStr = `${startDate.getDate()} ${THAI_MONTHS_SHORT[startDate.getMonth()]}`;
        const endStr = `${endDate.getDate()} ${THAI_MONTHS_SHORT[endDate.getMonth()]}`;

        weeks.push({
            index: weekIndex,
            label: `วีคที่ ${weekIndex + 1} (${startStr} - ${endStr})`,
            dateRange: `${startStr} - ${endStr}`,
            monthIndex: startDate.getMonth(),
            year: CURRENT_YEAR
        });
        startDate.setDate(startDate.getDate() + 7);
        weekIndex++;
    }
    return weeks;
}

const WEEKS_LIST = getWeeksOfCurrentYear();

const targetAcc = (typeof ROOM !== 'undefined' && ROOM.promptpayId) ? ROOM.promptpayId : "0863481103";
   
var DEFAULT_MEMBERS = [
    { id: 1, name: "นายพีรัช อิ่มผลา", amount: 100, paid: false, date: null },
    { id: 2, name: "นายพรเทพ สิทธิโชติ", amount: 100, paid: false, date: null },
    { id: 3, name: "นายณัฐวัฒน์ สุดพูล", amount: 100, paid: false, date: null },
    { id: 4, name: "นายพลวรรธน์ บางปา", amount: 100, paid: false, date: null },
    { id: 5, name: "นายสราวุธ พิมพรัตน์", amount: 100, paid: false, date: null },
    { id: 6, name: "นายวรพล สมปาน", amount: 100, paid: false, date: null },
    { id: 7, name: "นายไชยพัฒน์ คุ้มทรัพย์", amount: 100, paid: false, date: null },
    { id: 8, name: "นายมานพ ธงสันเทียะ", amount: 100, paid: false, date: null },
    { id: 9, name: "นายศรัณย์ ชินเจริญกิจ", amount: 100, paid: false, date: null },
    { id: 10, name: "นายศุภัชชุติมันต์ โพธิ์ทอง", amount: 100, paid: false, date: null },
    { id: 11, name: "นายกฤตศรุต ระวัง", amount: 100, paid: false, date: null },
    { id: 12, name: "นายอนพัช สมบัติเปี่ยม", amount: 100, paid: false, date: null },
    { id: 13, name: "นายสันติพงษ์ ธรรมาอินทร์", amount: 100, paid: false, date: null },
    { id: 14, name: "นายภูริภัทร อุตมา", amount: 100, paid: false, date: null },
    { id: 15, name: "นางสาวพิชชาภรณ์ อนุมาตร", amount: 100, paid: false, date: null },
    { id: 16, name: "นายโพธิ์สิทธิ์ หอมสมบัติ", amount: 100, paid: false, date: null },
    { id: 17, name: "นายณัฏฐชัย นิ่มแดง", amount: 100, paid: false, date: null },
    { id: 18, name: "นายปภาณ สายพิน", amount: 100, paid: false, date: null },
    { id: 19, name: "นายปุณณเมธ ม่วงวิเชียร", amount: 100, paid: false, date: null },
    { id: 20, name: "นายอนุศิษฏ์ ชื่นเกษร", amount: 100, paid: false, date: null },
    { id: 21, name: "นายกิตติธร บุพลับ", amount: 100, paid: false, date: null },
    { id: 22, name: "นายณัฐดนัย วงษ์ทอง", amount: 100, paid: false, date: null },
    { id: 23, name: "นายพิชญุตม์ มาลัยหอม", amount: 100, paid: false, date: null },
    { id: 24, name: "นายจักรินทร์ ม่วงรอด", amount: 100, paid: false, date: null },
    { id: 25, name: "นายวรฤทธิ์ อินทร์โห้", amount: 100, paid: false, date: null },
    { id: 26, name: "นายณัฐวุฒิ ทองสมบัติ", amount: 100, paid: false, date: null },
    { id: 27, name: "นางสาวเพชรน้ำหนึ่ง สร้อยน้ำ", amount: 100, paid: false, date: null },
    { id: 28, name: "นางสาวอาทิตยา ปัญญาทร", amount: 100, paid: false, date: null },
    { id: 29, name: "นายธนกร หล่อตจะกูล", amount: 100, paid: false, date: null },
    { id: 30, name: "นายธีระพล อ่อนสมัย", amount: 100, paid: false, date: null },
    { id: 31, name: "นายกิตติกร พึ่งรุ่ง", amount: 100, paid: false, date: null },
    { id: 32, name: "นายภาณุวัฒน์ ทิพเพชร", amount: 100, paid: false, date: null },
    { id: 33, name: "นายภูมิพัฒน์ นาคเฉลิม", amount: 100, paid: false, date: null },
    { id: 34, name: "นายรัชชานนท์ โคยะบุตร", amount: 100, paid: false, date: null },
    { id: 35, name: "นายไพโรจน์ ถิ่นวงค์ม่อม", amount: 100, paid: false, date: null },
    { id: 36, name: "นางสาวณัฐริณีย์ มันทรานนท์", amount: 100, paid: false, date: null },
    { id: 37, name: "นายประเสริฐ ก่อแก้ว", amount: 100, paid: false, date: null },
    { id: 38, name: "นายสุกัลย์ วิริยะนุพงษ์", amount: 100, paid: false, date: null },
    { id: 39, name: "นายมงคลชัย โพธิ์แสง", amount: 100, paid: false, date: null },
    { id: 40, name: "นางสาวรสิกา สายบัว", amount: 100, paid: false, date: null }
];

function getMembersData() {
    const saved = localStorage.getItem("fund-dashboard-members");
    if (saved) {
        try { return JSON.parse(saved); } catch (e) { }
    }
    return DEFAULT_MEMBERS;
}

function getTargetData() {
    const saved = localStorage.getItem("fund-dashboard-target");
    return saved ? Number(saved) : 4000;
}

var MEMBERS = getMembersData();
var TARGET_AMOUNT = getTargetData(); 

function persistAll() {
    try {
        localStorage.setItem("fund-dashboard-members", JSON.stringify(MEMBERS));
        localStorage.setItem("fund-dashboard-target", String(TARGET_AMOUNT));
    } catch (e) {
        console.log("บันทึก localStorage ไม่ได้:", e);
    }
    fetch("save.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(MEMBERS, null, 2)
    })
        .then(r => r.text())
        .then(t => console.log(t))
        .catch(e => console.log("บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ (ต้องรันผ่าน local server ที่มี PHP):", e));
}

const AVATAR_TINTS = [
    { bg: "#EFEAF9", fg: "#5B4A8F" },
    { bg: "#F1EDF9", fg: "#453370" },
    { bg: "#FBF1DC", fg: "#9C7A2C" },
    { bg: "#E7F1EC", fg: "#3D6552" }
];

function fmtMoney(num) {
    return Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
}

function tintFor(id) {
    return AVATAR_TINTS[id % AVATAR_TINTS.length];
}

function initialsOf(name) {
    return (name || "").split(" ")[0].slice(0, 2);
}

function computeCollectedTotal() {
    return MEMBERS.reduce((sum, m) => sum + (m.paid ? Number(m.amount) || 0 : 0), 0);
}

function computeProjectedTotal() {
    const monthlySum = MEMBERS.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
    const months = typeof COLLECTION_MONTHS !== "undefined" ? COLLECTION_MONTHS : 12;
    return monthlySum * months;
}