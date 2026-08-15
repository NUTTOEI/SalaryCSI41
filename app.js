// app.js — เซิร์ฟเวอร์หลักตัวเดียว: serve หน้าเว็บ + API ที่ต่อ MySQL + ระบบตรวจสลิป (เดิมอยู่ใน scanQR.js)
// รันด้วย: npm start  (package.json ต้องชี้ "start": "node app.js")

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');
const jsQR = require('jsqr');
const axios = require('axios');
const { createWorker } = require('tesseract.js');
const path = require('path');

const { pool, testConnection } = require('./db');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve admin.html, member.html, pay.html, css, รูป ฯลฯ

const upload = multer({ storage: multer.memoryStorage() });
const processedSlips = new Set();

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_TARGET_ID = process.env.LINE_TARGET_ID;
const EXPECTED_RECEIVER_NAME = "ณัฐวัฒน์ สุดพูล";

const DEFAULT_MONTHS = () => Array(12).fill(false);
const DEFAULT_WEEKS = () => Array(52).fill(false);

/* ------------------------------------------------------------------ */
/*  Helper: แปลงแถวจาก MySQL ให้ตรงกับ shape ที่ front-end (MEMBERS) ใช้อยู่  */
/* ------------------------------------------------------------------ */
function rowToMember(row) {
    return {
        id: row.id,
        branch: row.branch,
        name: row.name,
        amount: Number(row.amount),
        paidMonths: row.paid_months,
        paidWeeks: row.paid_weeks,
        history: row.history,
        // ให้เข้ากันได้กับโค้ดเก่าบางจุดที่เช็ค m.paid ตรงๆ
        paid: Array.isArray(row.paid_months) && row.paid_months.every(Boolean),
    };
}

/* ------------------------------------------------------------------ */
/*  API: สมาชิก                                                        */
/* ------------------------------------------------------------------ */

app.get('/api/members', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM members');
        res.json(rows.map(rowToMember));
    } catch (err) {
        console.error('GET /api/members error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET /api/members — ที่ admin.js / member.js / pay.js เรียกทุกครั้งตอนโหลดหน้า
app.put('/api/members/:id', async (req, res) => {
    const { id } = req.params;
    const { paidMonths, paidWeeks, history } = req.body;
    try {
        await pool.query(
            'UPDATE members SET paid_months = ?, paid_weeks = ?, history = ? WHERE id = ?',
            [
                JSON.stringify(paidMonths || DEFAULT_MONTHS()),
                JSON.stringify(paidWeeks || DEFAULT_WEEKS()),
                JSON.stringify(history || []),
                id
            ]
        );
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        console.error('PUT /api/members/:id error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/admin/members — เพิ่มสมาชิกใหม่ { name, amount }
app.post('/api/admin/members', async (req, res) => {
    try {
        const { name, amount } = req.body;
        if (!name || !String(name).trim()) {
            return res.status(400).json({ status: 'error', message: 'กรุณาระบุชื่อ' });
        }
        const rate = Number(amount) || 100;
        const [result] = await pool.query(
            `INSERT INTO members (branch, name, amount, paid_months, paid_weeks, history)
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['comsci41', String(name).trim(), rate, JSON.stringify(DEFAULT_MONTHS()), JSON.stringify(DEFAULT_WEEKS()), JSON.stringify([])]
        );
        const [rows] = await pool.query('SELECT * FROM members WHERE id = ?', [result.insertId]);
        res.json({ status: 'success', member: rowToMember(rows[0]) });
    } catch (err) {
        console.error('POST /api/admin/members error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// DELETE /api/admin/members/:id
app.delete('/api/admin/members/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM members WHERE id = ?', [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        console.error('DELETE /api/admin/members/:id error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// PUT /api/admin/members/:id/amount — { amount }
app.put('/api/admin/members/:id/amount', async (req, res) => {
    try {
        const rate = Number(req.body.amount);
        if (!isFinite(rate) || rate < 0) {
            return res.status(400).json({ status: 'error', message: 'ยอดเงินไม่ถูกต้อง' });
        }
        await pool.query('UPDATE members SET amount = ? WHERE id = ?', [rate, req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        console.error('PUT /api/admin/members/:id/amount error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/admin/toggle-paid — { memberId, mode, monthIndex, weekIndex }
app.post('/api/admin/toggle-paid', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { memberId, mode, monthIndex, weekIndex } = req.body;
        const [rows] = await conn.query('SELECT * FROM members WHERE id = ? FOR UPDATE', [memberId]);
        if (rows.length === 0) {
            conn.release();
            return res.status(404).json({ status: 'error', message: 'ไม่พบสมาชิก' });
        }
        const member = rows[0];
        const rate = Number(member.amount) || 100;
        const history = Array.isArray(member.history) ? member.history : [];
        const nowDate = new Date().toLocaleDateString('th-TH');

        if (mode === 'week') {
            const paidWeeks = Array.isArray(member.paid_weeks) ? member.paid_weeks.slice() : DEFAULT_WEEKS();
            const newStatus = !Boolean(paidWeeks[weekIndex]);
            paidWeeks[weekIndex] = newStatus;
            history.push({
                date: nowDate,
                method: newStatus ? 'Admin บันทึกชำระเงิน' : 'Admin ยกเลิกการชำระ',
                amount: newStatus ? rate : -rate,
                weeks: [weekIndex],
            });
            await conn.query(
                'UPDATE members SET paid_weeks = ?, history = ? WHERE id = ?',
                [JSON.stringify(paidWeeks), JSON.stringify(history), memberId]
            );
        } else {
            const paidMonths = Array.isArray(member.paid_months) ? member.paid_months.slice() : DEFAULT_MONTHS();
            const newStatus = !Boolean(paidMonths[monthIndex]);
            paidMonths[monthIndex] = newStatus;
            history.push({
                date: nowDate,
                method: newStatus ? 'Admin บันทึกชำระเงิน' : 'Admin ยกเลิกการชำระ',
                amount: newStatus ? rate : -rate,
                months: [monthIndex],
            });
            await conn.query(
                'UPDATE members SET paid_months = ?, history = ? WHERE id = ?',
                [JSON.stringify(paidMonths), JSON.stringify(history), memberId]
            );
        }

        conn.release();
        res.json({ status: 'success' });
    } catch (err) {
        conn.release();
        console.error('POST /api/admin/toggle-paid error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// POST /api/admin/reset — ล้างสถานะจ่ายเงินของทุกคนกลับเป็นค่าเริ่มต้น
app.post('/api/admin/reset', async (req, res) => {
    try {
        await pool.query(
            'UPDATE members SET paid_months = ?, paid_weeks = ?, history = ?',
            [JSON.stringify(DEFAULT_MONTHS()), JSON.stringify(DEFAULT_WEEKS()), JSON.stringify([])]
        );
        res.json({ status: 'success' });
    } catch (err) {
        console.error('POST /api/admin/reset error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/*  API: เป้าหมายเก็บเงิน (ทางเลือก — แทนที่ localStorage เดิมถ้าต้องการ sync ข้ามเครื่อง)  */
/* ------------------------------------------------------------------ */
app.get('/api/settings/target', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT `value` FROM settings WHERE `key` = 'target_amount'");
        res.json({ target: rows.length ? Number(rows[0].value) : 4000 });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/settings/target', async (req, res) => {
    try {
        const target = Number(req.body.target);
        if (!isFinite(target) || target <= 0) {
            return res.status(400).json({ status: 'error', message: 'เป้าหมายไม่ถูกต้อง' });
        }
        await pool.query(
            "INSERT INTO settings (`key`, `value`) VALUES ('target_amount', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
            [String(target)]
        );
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/*  ระบบตรวจสลิปโอนเงิน + แจ้งเตือน LINE (ย้ายมาจาก scanQR.js เดิม)      */
/* ------------------------------------------------------------------ */
app.post('/verify-slip', upload.single('slip_image'), async (req, res) => {
    try {
        const expectedAmount = parseFloat(req.body.expected_amount);
        if (!req.file || isNaN(expectedAmount)) {
            return res.status(400).json({ status: 'fail', message: 'กรุณาแนบไฟล์สลิปและระบุยอดเงิน' });
        }

        const image = await sharp(req.file.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const qrCode = jsQR(new Uint8ClampedArray(image.data), image.info.width, image.info.height);
        if (!qrCode) {
            return res.status(400).json({ status: 'fail', message: 'ไม่พบ QR Code บนสลิป กรุณาใช้รูปภาพที่ชัดเจน' });
        }

        const qrHash = crypto.createHash('sha256').update(qrCode.data).digest('hex');
        if (processedSlips.has(qrHash)) {
            return res.status(400).json({ status: 'fail', message: 'สลิปนี้เคยถูกส่งมาแล้ว' });
        }

        const processedBuffer = await sharp(req.file.buffer).resize(1200).grayscale().normalize().toBuffer();
        const worker = await createWorker('tha+eng');
        const { data: { text } } = await worker.recognize(processedBuffer);
        await worker.terminate();

        const cleanedText = text.replace(/\s+/g, '');
        const cleanedExpectedName = EXPECTED_RECEIVER_NAME.replace(/\s+/g, '');
        if (!cleanedText.includes(cleanedExpectedName)) {
            return res.status(400).json({
                status: 'fail',
                message: `ชื่อบัญชีผู้รับไม่ถูกต้อง! สลิปนี้ไม่ได้โอนไปยังบัญชี ${EXPECTED_RECEIVER_NAME}`
            });
        }

        const validAmounts = [];
        const regexDecimal = /\b(\d{1,3}(?:,\d{3})*|\d{1,6})\.(\d{2})\b/g;
        let match;
        while ((match = regexDecimal.exec(text)) !== null) {
            const numVal = parseFloat(match[1].replace(/,/g, '') + '.' + match[2]);
            if (numVal > 0 && numVal < 1000000) validAmounts.push(numVal);
        }
        const cleanTextNoComma = text.replace(/,/g, '');
        if (cleanTextNoComma.includes(expectedAmount.toString())) validAmounts.push(expectedAmount);

        let actualAmount = null;
        if (validAmounts.length > 0) {
            actualAmount = validAmounts.includes(expectedAmount) ? expectedAmount : validAmounts[0];
        }
        if (!actualAmount) {
            return res.status(400).json({ status: 'fail', message: 'ไม่สามารถอ่านยอดเงินจากภาพสลิปได้ กรุณาใช้สลิปที่ชัดเจน' });
        }
        if (actualAmount !== expectedAmount) {
            return res.status(400).json({
                status: 'fail',
                message: `ยอดเงินไม่ตรงกัน! ยอดบนสลิปคือ ${actualAmount.toLocaleString()} บาท แต่ยอดที่ต้องชำระคือ ${expectedAmount.toLocaleString()} บาท`
            });
        }

        processedSlips.add(qrHash);

        const messageText =
            `🔔 แจ้งเตือนได้รับการชำระเงินสำเร็จ!\n` +
            `👤 บัญชีผู้รับ: ${EXPECTED_RECEIVER_NAME}\n` +
            `💰 ยอดชำระตรงกัน: ${actualAmount.toLocaleString()} บาท\n` +
            `⏰ เวลาทำรายการ: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`;

        await axios.post(
            'https://api.line.me/v2/bot/message/push',
            { to: LINE_TARGET_ID, messages: [{ type: 'text', text: messageText }] },
            { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` } }
        );

        return res.json({ status: 'success', message: 'ตรวจสอบสลิปและส่งแจ้งเตือน LINE เรียบร้อยแล้ว' });
    } catch (err) {
        console.error('❌ /verify-slip Error:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/*  หน้าแรก + start server                                             */
/* ------------------------------------------------------------------ */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'member.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await testConnection();
});