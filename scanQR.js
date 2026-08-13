const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');
const jsQR = require('jsqr');
const axios = require('axios');
const { createWorker } = require('tesseract.js');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const processedSlips = new Set();

// 🟢 1. กำหนดค่า LINE OA (Messaging API)
const LINE_ACCESS_TOKEN = "1Pml8XKl5ko6nkGgnK9zhEbK1zWKhcfsUTXgRNk+UUqUu3mKYl1FEBwgZVNbRHQTJQhPaGk8iiObDe7ntZTow+8l0yI26f9DdmNJl/Bco1f3ON+5pnEqwLHzFoZgKu4oe6v7lwkgSJC7isvPLDqeuQdB04t89/1O/w1cDnyilFU=";
const LINE_TARGET_ID = "Ufac721db10fe012f12410f3cf59c3eb7";

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

        // 3. อ่านข้อความบนสลิปด้วย OCR
        console.log("🔍 กำลังตรวจสอบข้อมูลบนสลิป...");
        const worker = await createWorker('tha+eng');
        const { data: { text } } = await worker.recognize(req.file.buffer);
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

        // 🟢 5. ตรวจสอบยอดเงิน (ดึงตัวเลขทศนิยมทั้งหมดและตัดค่าธรรมเนียม 0.00 ออก)
        let actualAmount = null;
        const allAmounts = text.match(/\b[\d,]+\.\d{2}\b/g);

        if (allAmounts && allAmounts.length > 0) {
            const validAmounts = allAmounts
                .map(amt => parseFloat(amt.replace(/,/g, '')))
                .filter(amt => amt > 0); // ตัด 0.00 ออก

            if (validAmounts.length > 0) {
                // หากมีตัวเลขตรงกับยอดที่ต้องการให้เลือกตัวนั้น หรือเลือกตัวเลขแรกที่พบ
                actualAmount = validAmounts.includes(expectedAmount) ? expectedAmount : validAmounts[0];
            }
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
            `⏰ เวลาทำรายการ: ${new Date().toLocaleString('th-TH')}`;

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

app.listen(3000, () => console.log(`🚀 Server running on http://localhost:3000`));