const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');
const jsQR = require('jsqr');
const axios = require('axios');
const { createWorker } = require('tesseract.js');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'member.html'));
})

const upload = multer({ storage: multer.memoryStorage() });
const processedSlips = new Set();

// 🟢 1. ดึงค่า LINE OA จาก Environment Variables บน Render
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_TARGET_ID = process.env.LINE_TARGET_ID;

// 🟢 2. กำหนดชื่อบัญชีผู้รับเงินที่ต้องตรงกัน
const EXPECTED_RECEIVER_NAME = "ณัฐวัฒน์ สุดพูล";

app.post('/verify-slip', upload.single('slip_image'), async (req, res) => {
    try {
        const expectedAmount = parseFloat(req.body.expected_amount);

        if (!req.file || isNaN(expectedAmount)) {
            return res.status(400).json({ status: 'fail', message: 'กรุณาแนบไฟล์สลิปและระบุยอดเงิน' });
        }

        // 1. ถอดรหัส QR บนสลิป
        const image = await sharp(req.file.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const qrCode = jsQR(new Uint8ClampedArray(image.data), image.info.width, image.info.height);

        if (!qrCode) {
            return res.status(400).json({ status: 'fail', message: 'ไม่พบ QR Code บนสลิป กรุณาใช้รูปภาพที่ชัดเจน' });
        }

        // 2. ป้องกันการส่งสลิปซ้ำ
        const qrHash = crypto.createHash('sha256').update(qrCode.data).digest('hex');
        if (processedSlips.has(qrHash)) {
            return res.status(400).json({ status: 'fail', message: 'สลิปนี้เคยถูกส่งมาแล้ว' });
        }

        // 3. ปรับแต่งรูปภาพ (grayscale + normalize) เพื่อตัดสีพื้นหลังและอ่านข้อความผ่าน OCR
        console.log("🔍 กำลังประมวลผลรูปภาพและอ่านข้อความด้วย OCR...");
        const processedBuffer = await sharp(req.file.buffer)
            .resize(1200)
            .grayscale()
            .normalize()
            .toBuffer();

        const worker = await createWorker('tha+eng');
        const { data: { text } } = await worker.recognize(processedBuffer);
        await worker.terminate();

        // 🟢 4. ตรวจสอบชื่อบัญชีปลายทาง
        const cleanedText = text.replace(/\s+/g, ''); 
        const cleanedExpectedName = EXPECTED_RECEIVER_NAME.replace(/\s+/g, '');

        if (!cleanedText.includes(cleanedExpectedName)) {
            return res.status(400).json({
                status: 'fail',
                message: `ชื่อบัญชีผู้รับไม่ถูกต้อง! สลิปนี้ไม่ได้โอนไปยังบัญชี ${EXPECTED_RECEIVER_NAME}`
            });
        }

        // 🟢 5. ตรวจสอบยอดเงิน (ยืดหยุ่นรองรับ MyMo และธนาคารอื่น)
        const validAmounts = [];
        const regexDecimal = /\b(\d{1,3}(?:,\d{3})*|\d{1,6})\.(\d{2})\b/g;
        let match;

        while ((match = regexDecimal.exec(text)) !== null) {
            const numVal = parseFloat(match[1].replace(/,/g, '') + '.' + match[2]);
            if (numVal > 0 && numVal < 1000000) {
                validAmounts.push(numVal);
            }
        }

        const cleanTextNoComma = text.replace(/,/g, '');
        if (cleanTextNoComma.includes(expectedAmount.toString())) {
            validAmounts.push(expectedAmount);
        }

        let actualAmount = null;
        if (validAmounts.length > 0) {
            actualAmount = validAmounts.includes(expectedAmount) ? expectedAmount : validAmounts[0];
        }

        if (!actualAmount) {
            return res.status(400).json({ 
                status: 'fail', 
                message: 'ไม่สามารถอ่านยอดเงินจากภาพสลิปได้ กรุณาใช้สลิปที่ชัดเจน' 
            });
        }

        console.log(`💵 ยอดเงินบนสลิป: ${actualAmount} บาท | ยอดที่ต้องชำระ: ${expectedAmount} บาท`);

        if (actualAmount !== expectedAmount) {
            return res.status(400).json({
                status: 'fail',
                message: `ยอดเงินไม่ตรงกัน! ยอดบนสลิปคือ ${actualAmount.toLocaleString()} บาท แต่ยอดที่ต้องชำระคือ ${expectedAmount.toLocaleString()} บาท`
            });
        }

        processedSlips.add(qrHash);

        // 6. ส่งข้อความแจ้งเตือนไปยัง LINE OA
        const messageText = 
            `🔔 แจ้งเตือนได้รับการชำระเงินสำเร็จ!\n` +
            `👤 บัญชีผู้รับ: ${EXPECTED_RECEIVER_NAME}\n` +
            `💰 ยอดชำระตรงกัน: ${actualAmount.toLocaleString()} บาท\n` +
            `⏰ เวลาทำรายการ: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`

        await axios.post(
            'https://api.line.me/v2/bot/message/push',
            {
                to: LINE_TARGET_ID,
                messages: [{ type: 'text', text: messageText }]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
                }
            }
        );

        return res.json({ status: 'success', message: 'ตรวจสอบสลิปและส่งแจ้งเตือน LINE เรียบร้อยแล้ว' });

    } catch (err) {
        console.error("❌ Error:", err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

// 🟢 7. ให้ระบบเลือก Port อัตโนมัติจาก Render (หรือ 3000 กรณีรัน Local)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));