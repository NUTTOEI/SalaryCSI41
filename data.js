// data.js - ค่าคงที่และฟังก์ชันดึงข้อมูล
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const CURRENT_YEAR = new Date().getFullYear() + 543;

// สร้าง WEEKS_LIST ในรูปแบบ Object เพื่อรองรับการค้นหาตามเดือนและช่วงเวลา
const WEEKS_LIST = Array.from({ length: 52 }, (_, i) => {
  const monthIdx = Math.min(Math.floor(i / 4.33), 11);
  return {
    index: i,
    monthIndex: monthIdx,
    dateRange: `สัปดาห์ที่ ${i + 1}`,
    startDate: new Date(),
    endDate: new Date()
  };
});

async function getMembersData() {
  try {
    const response = await fetch("/api/members");
    if (!response.ok) throw new Error("Network response error");
    return await response.json();
  } catch (err) {
    console.error("ดึงข้อมูลจาก Server ล้มเหลว:", err);
    return [];
  }
}

function getTargetData() {
  const val = localStorage.getItem("fund-dashboard-target");
  return val !== null ? Number(val) : 4000;
}