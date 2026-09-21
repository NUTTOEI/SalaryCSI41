// app.js — เซิร์ฟเวอร์หลัก (ปรับปรุงสำหรับ PostgreSQL / Supabase แล้ว)
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');
const jsQR = require('jsqr');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const { pool, testConnection } = require('./db');

const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());
app.use(express.static(__dirname));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'member_profiles' },
            (error, result) => {
                if (result) resolve(result);
                else reject(error);
            }
        );
        streamifier.createReadStream(fileBuffer).pipe(stream);
    });
};

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const uploadMemberAvatar = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น (JPG, PNG ฯลฯ)'));
        }
    }
});

const upload = multer({ storage: multer.memoryStorage() });

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_TARGET_IDS = [
    process.env.LINE_TARGET_ID,
    'Ufac721db10fe012f12410f3cf59c3eb7', 
    'Ub0a8c9b3819bac10a968319bce489c2a'  
];

const DEFAULT_MONTHS = () => Array(12).fill(false);
const DEFAULT_WEEKS = () => Array(52).fill(false);

function rowToMember(row) {
    const paidMonths = typeof row.paid_months === 'string' ? JSON.parse(row.paid_months) : (row.paid_months || DEFAULT_MONTHS());
    const paidWeeks = typeof row.paid_weeks === 'string' ? JSON.parse(row.paid_weeks) : (row.paid_weeks || DEFAULT_WEEKS());
    const history = typeof row.history === 'string' ? JSON.parse(row.history) : (row.history || []);

    return {
        id: row.id,
        studentId: row.student_id,
        branch: row.branch,
        name: row.name,
        amount: Number(row.amount),
        paidMonths,
        paidWeeks,
        history,
        paid: Array.isArray(paidMonths) && paidMonths.every(Boolean),
        profileImg: row.profile_img || null
    };
}

/* ------------------------------------------------------------------ */
/* API: สมาชิก                                                        */
/* ------------------------------------------------------------------ */
app.get('/api/members', async (req, res) => {
    try {
        const { branch, studentId } = req.query;

        if (studentId) {
            const { rows: userRows } = await pool.query("SELECT branch FROM members WHERE student_id = $1", [studentId]);
            if (userRows.length > 0) {
                const userBranch = userRows[0].branch;
                const { rows } = await pool.query("SELECT * FROM members WHERE branch = $1", [userBranch]);
                return res.json(rows.map(rowToMember));
            } else {
                return res.json([]);
            }
        }

        if (branch) {
            const { rows } = await pool.query("SELECT * FROM members WHERE branch = $1", [branch]);
            return res.json(rows.map(rowToMember));
        }

        const { rows } = await pool.query("SELECT * FROM members");
        res.json(rows.map(rowToMember));

    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/members/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, branch, paidMonths, paidWeeks, history } = req.body;
        
        await pool.query(
            `UPDATE members
            SET name = COALESCE($1, name),
                branch = COALESCE($2, branch),
                paid_months = COALESCE($3, paid_months),
                paid_weeks = COALESCE($4, paid_weeks),
                history = COALESCE($5, history)
            WHERE id = $6`,
            [
                name || null,
                branch || null,
                paidMonths ? JSON.stringify(paidMonths) : null,
                paidWeeks ? JSON.stringify(paidWeeks) : null,
                history ? JSON.stringify(history) : null,
                id
            ]
        );

        res.json({ status: "success", message: "Update successfully" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
});

app.post('/api/admin/members', async (req, res) => {
    try {
        const { studentId, name, amount, branch } = req.body;

        if (!studentId || !String(studentId).trim()) return res.status(400).json({ status: 'error', message: 'กรุณาระบุรหัสนักศึกษา' });
        if (!name || !String(name).trim()) return res.status(400).json({ status: 'error', message: 'กรุณาระบุชื่อ' });
        if (!branch) return res.status(400).json({ status: 'error', message: 'กรุณาระบุสาขา (branch)' });

        const rate = Number(amount) || 100;
        const memberBranch = branch || 'comsci41';

        const { rows } = await pool.query(
            `INSERT INTO members (student_id, branch, name, amount, paid_months, paid_weeks, history)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                String(studentId).trim(),
                memberBranch, 
                String(name).trim(), 
                rate, 
                JSON.stringify(DEFAULT_MONTHS()), 
                JSON.stringify(DEFAULT_WEEKS()), 
                JSON.stringify([])
            ]
        );
        res.json({ status: 'success', member: rowToMember(rows[0]) });
    } catch (err) {
        console.error('POST /api/admin/members error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.delete('/api/admin/members/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM members WHERE id = $1', [req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/admin/members/:id/amount', async (req, res) => {
    try {
        const rate = Number(req.body.amount);
        if (!isFinite(rate) || rate < 0) return res.status(400).json({ status: 'error', message: 'ยอดเงินไม่ถูกต้อง' });
        await pool.query('UPDATE members SET amount = $1 WHERE id = $2', [rate, req.params.id]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/admin/toggle-paid', async (req, res) => {
    const client = await pool.connect();
    try {
        const { memberId, mode, monthIndex, weekIndex } = req.body;
        const { rows } = await client.query('SELECT * FROM members WHERE id = $1 FOR UPDATE', [memberId]);
        if (rows.length === 0) {
            client.release();
            return res.status(404).json({ status: 'error', message: 'ไม่พบสมาชิก' });
        }
        const member = rows[0];
        const rate = Number(member.amount) || 100;
        const history = Array.isArray(member.history) ? member.history : (typeof member.history === 'string' ? JSON.parse(member.history) : []);
        const nowDate = new Date().toLocaleDateString('th-TH');

        if (mode === 'week') {
            const rawWeeks = member.paid_weeks;
            const paidWeeks = Array.isArray(rawWeeks) ? rawWeeks.slice() : (typeof rawWeeks === 'string' ? JSON.parse(rawWeeks) : DEFAULT_WEEKS());
            const newStatus = !Boolean(paidWeeks[weekIndex]);
            paidWeeks[weekIndex] = newStatus;
            history.push({ date: nowDate, method: newStatus ? 'Admin บันทึกชำระเงิน' : 'Admin ยกเลิกการชำระ', amount: newStatus ? rate : -rate, weeks: [weekIndex] });
            
            await client.query('UPDATE members SET paid_weeks = $1, history = $2 WHERE id = $3', [JSON.stringify(paidWeeks), JSON.stringify(history), memberId]);
        } else {
            const rawMonths = member.paid_months;
            const paidMonths = Array.isArray(rawMonths) ? rawMonths.slice() : (typeof rawMonths === 'string' ? JSON.parse(rawMonths) : DEFAULT_MONTHS());
            const newStatus = !Boolean(paidMonths[monthIndex]);
            paidMonths[monthIndex] = newStatus;
            history.push({ date: nowDate, method: newStatus ? 'Admin บันทึกชำระเงิน' : 'Admin ยกเลิกการชำระ', amount: newStatus ? rate : -rate, months: [monthIndex] });
            
            await client.query('UPDATE members SET paid_months = $1, history = $2 WHERE id = $3', [JSON.stringify(paidMonths), JSON.stringify(history), memberId]);
        }

        client.release();
        res.json({ status: 'success' });
    } catch (err) {
        client.release();
        console.error('POST /api/admin/toggle-paid error:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/admin/reset', async (req, res) => {
    try {
        await pool.query('UPDATE members SET paid_months = $1, paid_weeks = $2, history = $3', [JSON.stringify(DEFAULT_MONTHS()), JSON.stringify(DEFAULT_WEEKS()), JSON.stringify([])]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/* API: เป้าหมายเก็บเงิน                                                */
/* ------------------------------------------------------------------ */
app.get('/api/settings/target', async (req, res) => {
    try {
        const { branch } = req.query;
        const targetKey = branch ? `target_branch_${branch}` : 'target_amount';

        const { rows } = await pool.query('SELECT "value" FROM settings WHERE "key" = $1', [targetKey]);
        const targetVal = rows.length ? Number(rows[0].value) : 4000;
        res.json({ target: isNaN(targetVal) ? 4000 : targetVal });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/settings/target', async (req, res) => {
    try {
        const { target, branch } = req.body;
        const targetNum = Number(target);

        if (!isFinite(targetNum) || targetNum <= 0) {
            return res.status(400).json({ status: 'error', message: 'เป้าหมายไม่ถูกต้อง' });
        }

        const targetKey = branch ? `target_branch_${branch}` : 'target_amount';
        
        await pool.query(
            `INSERT INTO settings ("key", "value") VALUES ($1, $2) 
             ON CONFLICT ("key") DO UPDATE SET "value" = $3`,
            [targetKey, String(targetNum), String(targetNum)]
        );
        res.json({ status: 'success', target: targetNum });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/admin/members/amount-all', async (req, res) => {
    try {
        const rate = Number(req.body.amount);
        if (!isFinite(rate) || rate < 0) return res.status(400).json({ status: 'error', message: 'ยอดเงินไม่ถูกต้อง' });
        await pool.query('UPDATE members SET amount = $1', [rate]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/* ระบบตรวจสลิปโอนเงิน + แจ้งเตือน LINE                                */
/* ------------------------------------------------------------------ */
app.post('/verify-slip', upload.single('slip_image'), async (req, res) => {
    try {
        const expectedAmount = parseFloat(req.body.expected_amount);
        const studentId = req.body.student_id;

        if (!req.file || isNaN(expectedAmount)) {
            return res.status(400).json({ status: 'fail', message: 'กรุณาแนบไฟล์สลิปและระบุยอดเงิน' });
        }

        // 1. ดึงข้อมูลสาขาและบัญชีผู้รับของสมาชิกคนนี้จาก Database
        let targetAccountName = "";
        let targetPromptPay = "";
        
        if (studentId) {
            const { rows: branchRows } = await pool.query(
                `SELECT b.promptpay_no, b.account_name 
                 FROM members m 
                 JOIN branches b ON m.branch = b.branch_code 
                 WHERE m.student_id = $1`,
                [studentId]
            );
            if (branchRows.length > 0) {
                targetPromptPay = branchRows[0].promptpay_no || "";
                targetAccountName = branchRows[0].account_name || "";
            }
        }

        const apiKey = (process.env.SLIPOK_API_KEY || '').trim();
        const branchId = '73437'; // SlipOK Branch ID
        const formData = new FormData();
        formData.append('files', req.file.buffer, { filename: req.file.originalname || 'slip.jpg', contentType: req.file.mimetype });
        formData.append('log', 'true');

        const slipokResponse = await axios.post(`https://api.slipok.com/api/line/apikey/${branchId}`, formData, { 
            headers: { ...formData.getHeaders(), 'x-authorization' : apiKey } 
        });

        const result = slipokResponse.data;
        if (!result.success) return res.status(400).json({ status: 'fail', message: result.message || 'สลิปไม่ถูกต้อง' });

        const slipData = result.data;
        const transferorName = String(slipData.sender?.name || slipData.sender?.displayName || slipData.sender?.account?.name || '').trim();

        if (parseFloat(slipData.amount) !== expectedAmount) {
            return res.status(400).json({ status: 'fail', message: `ยอดเงินไม่ตรง! ยอดโอนจริงคือ ${slipData.amount} บาท` });
        }

        const receiverName = slipData.receiver?.name || '';
        // if (targetAccountName && targetAccountName.trim() !== '') {
        //     const cleanTarget = targetAccountName.replace(/(นาย|นางสาว|นาง)/g, '').trim();
        //     const firstName = cleanTarget.split(/\s+/)[0]?.toLowerCase() || '';

        //     const cleanReceiver = receiverName.toLowerCase();

        //     // เช็กว่ามีข้อความส่วนใดส่วนหนึ่งซ้อนทับกันหรือไม่
        //     const isNameMatch = firstName !== '' && cleanReceiver.includes(firstName);

        //     if (!isNameMatch) {
        //         return res.status(400).json({ 
        //             status: 'fail', 
        //             message: `บัญชีผู้รับไม่ถูกต้อง! สลิปนี้ต้องโอนเข้าบัญชี: ${targetAccountName}` 
        //         });
        //     }
        // }

        const transRef = slipData.transRef;
        const { rows: existing } = await pool.query('SELECT trans_ref FROM processed_slips WHERE trans_ref = $1', [transRef]);
        if (existing.length > 0) return res.status(400).json({ status: 'fail', message: 'สลิปนี้เคยถูกนำมาใช้งานแล้ว' });

        await pool.query('INSERT INTO processed_slips (trans_ref) VALUES ($1)', [transRef]);

        const messageText = `👥 ชื่อผู้โอน: ${transferorName || 'ไม่ระบุ'}\n🔔 แจ้งเตือนได้รับการชำระเงินสำเร็จ!\n👤 ผู้รับ: ${receiverName || 'ไม่ระบุ'}\n💰 ยอดเงิน: ${slipData.amount} บาท\n📄 เลขที่รายการ: ${transRef}\n⏰ เวลาโอน: ${slipData.transDate} ${slipData.transTime}`;

        if (LINE_ACCESS_TOKEN && LINE_TARGET_IDS.length > 0) {
            await axios.post('https://api.line.me/v2/bot/message/multicast', 
                { to: LINE_TARGET_IDS.filter(Boolean), messages: [{ type: 'text', text: messageText }] },
                { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` } }
            );
        }

        return res.json({ status: 'success', message: 'ตรวจสอบสลิปสำเร็จ', transferorName });

    } catch (err) {
        console.error('❌ /verify-slip Error:', err.response?.data || err.message);
        return res.status(err.response?.status || 500).json({ status: 'fail', message: err.response?.data?.message || err.message });
    }
});

/* ------------------------------------------------------------------ */
/* API: ข้อมูลและรูปโปรไฟล์สาขา                                           */
/* ------------------------------------------------------------------ */
app.get('/api/branches/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const { rows } = await pool.query(
            "SELECT branch_code, branch_name, promptpay_no, account_name FROM branches WHERE branch_code = $1",
            [code]
        );
        if (rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'ไม่พบสาขา' });
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

const branchStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `avatar-${uniqueSuffix}${ext}`);
    }
});

const uploadBranchAvatar = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น'));
        }
    }
});

app.get('/api/branch/profile', async (req, res) => {
    try {
        const { branch } = req.query;
        if (!branch) return res.status(400).json({ status: 'error', message: 'กรุณาระบุสาขา' });

        const { rows } = await pool.query('SELECT "value" FROM settings WHERE "key" = $1', [`avatar_branch_${branch}`]);
        const avatarUrl = rows.length > 0 ? rows[0].value : null;
        res.json({ success: true, avatarUrl });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/admin/branch/upload-profile', uploadBranchAvatar.single('avatar'), async (req, res) => {
    try {
        const branch = req.body.branch;
        if (!branch) return res.status(400).json({ success: false, message: 'กรุณาระบุสาขา' });
        if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์รูปภาพ' });

        const result = await uploadToCloudinary(req.file.buffer);
        const avatarUrl = result.secure_url;

        await pool.query(
            `INSERT INTO settings ("key", "value") VALUES ($1, $2) ON CONFLICT ("key") DO UPDATE SET "value" = $3`,
            [`avatar_branch_${branch}`, avatarUrl, avatarUrl]
        );

        res.json({ success: true, message: 'อัปเดตรูปโปรไฟล์สำเร็จ', avatarUrl });
    } catch (error) {
        console.error('Cloudinary Upload Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/admin/branch/name', async (req, res) => {
    try {
        const { branch } = req.query;
        if (!branch) return res.status(400).json({ success: false, message: 'กรุณาระบุสาขา' });

        const { rows } = await pool.query(
            "SELECT branch_name FROM branches WHERE branch_code = $1",
            [branch]
        );
        
        const branchName = rows.length > 0 ? rows[0].branch_name : branch;
        res.json({ success: true, branchName });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/admin/branch/name', async (req, res) => {
    try {
        const { branch, branchName } = req.body;
        if (!branch || !branchName) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุสาขาและชื่อสาขาใหม่' });
        }

        await pool.query(
            `UPDATE branches SET branch_name = $1 WHERE branch_code = $2`,
            [branchName.trim(), branch]
        );

        res.json({ success: true, message: 'อัปเดทชื่อสาขาสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/* API: สมัครสมาชิก และ เข้าสู่ระบบแอดมิน                                 */
/* ------------------------------------------------------------------ */
app.post('/api/admin/register', async (req, res) => {
    try {
        const { studentId, name, branch } = req.body;
        if (!studentId || !name || !branch) return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });

        const cleanBranch = branch.trim();
        const { rows: existingBranch } = await pool.query("SELECT * FROM branches WHERE branch_code = $1", [cleanBranch]);
        
        if (existingBranch.length === 0) {
            await pool.query("INSERT INTO branches (branch_code, branch_name, profile_img) VALUES ($1, $2, $3)", [cleanBranch, cleanBranch, `${cleanBranch}.png`]);
        }

        await pool.query("INSERT INTO admins (student_id, name, branch) VALUES ($1, $2, $3)", [studentId.trim(), name.trim(), branch.trim()]);
        res.json({ success: true, message: 'ลงทะเบียนแอดมินสำเร็จ' });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ success: false, message: 'รหัสนักศึกษานี้เคยลงทะเบียนไว้แล้ว' });
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { studentId } = req.body;
        if (!studentId) return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสนักศึกษา' });

        const { rows } = await pool.query("SELECT * FROM admins WHERE student_id = $1", [studentId.trim()]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบรหัสนักศึกษานี้ในระบบ' });

        const admin = rows[0];
        const { rows: branchRows } = await pool.query(
            "SELECT branch_name FROM branches WHERE branch_code = $1",
            [admin.branch]
        );

        const branchName = branchRows.length > 0 ? branchRows[0].branch_name : admin.branch;

        res.json({ 
            success: true, 
            studentId: admin.student_id, 
            name: admin.name, 
            branch: admin.branch,
            branchName: branchName 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/* API: สำหรับสมาชิกลงทะเบียน และ เข้าสู่ระบบ                             */
/* ------------------------------------------------------------------ */
app.post('/api/member/register', async (req, res) => {
    try {
        const { studentId, name, branch } = req.body;
        if (!studentId || !String(studentId).trim()) return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสนักศึกษา' });
        if (!name || !String(name).trim()) return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อ-นามสกุล' });
        if (!branch || !String(branch).trim()) return res.status(400).json({ success: false, message: 'กรุณากรอกสาขา' });

        const cleanStudentId = String(studentId).trim();
        const cleanName = String(name).trim();
        const cleanBranch = String(branch).trim().toUpperCase();

        const { rows: existingBranch } = await pool.query("SELECT * FROM branches WHERE branch_code = $1", [cleanBranch]);
        if (existingBranch.length === 0) {
            await pool.query("INSERT INTO branches (branch_code, branch_name, profile_img) VALUES ($1, $2, $3)", [cleanBranch, cleanBranch, `${cleanBranch}.png`]);
        }

        const { rows: existing } = await pool.query("SELECT id FROM members WHERE student_id = $1", [cleanStudentId]);
        if (existing.length > 0) return res.status(400).json({ success: false, message: 'รหัสนักศึกษานี้ถูกลงทะเบียนไว้แล้ว' });

        await pool.query(
            `INSERT INTO members (student_id, branch, name, amount, paid_months, paid_weeks, history) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [cleanStudentId, cleanBranch, cleanName, 100, JSON.stringify(DEFAULT_MONTHS()), JSON.stringify(DEFAULT_WEEKS()), JSON.stringify([])]
        );

        res.json({ success: true, message: 'ลงทะเบียนสำเร็จ', member: { studentId: cleanStudentId, name: cleanName, branch: cleanBranch } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/member/login', async (req, res) => {
    try {
        const { studentId } = req.body;
        if (!studentId || !studentId.trim()) return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสนักศึกษา' });

        const { rows } = await pool.query("SELECT id, student_id, branch, name FROM members WHERE student_id = $1", [studentId.trim()]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบรหัสนักศึกษานี้ในระบบ' });

        const member = rows[0];
        res.json({ success: true, id: member.id, studentId: member.student_id, branch: member.branch, name: member.name });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/member/upload-profile', (req, res) => {
    uploadMemberAvatar.single('avatar')(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        try {
            const { memberId } = req.body;
            if (!memberId) return res.status(400).json({ success: false, message: 'กรุณาระบุ ID สมาชิก' });
            if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์รูปภาพ' });

            const result = await uploadToCloudinary(req.file.buffer);
            await pool.query("UPDATE members SET profile_img = $1 WHERE id = $2", [result.secure_url, memberId]);

            return res.json({ success: true, message: 'อัปเดทรูปโปรไฟล์สำเร็จ', profileImg: result.secure_url });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });
});

app.post('/api/admin/branch/register-promptpay', async (req, res) => {
    try {
        const { branch, promptpayNo, accountName } = req.body;
        if (!branch || !promptpayNo || !accountName) {
            return res.status(400).json({ success: false, message: 'กรอกข้อมูลให้ครบถ้วน' });
        }

        const cleanPromptpay = promptpayNo.trim();
        const cleanName = accountName.trim();
        const apiKey = (process.env.SLIPOK_API_KEY || '').trim();
        const slipokBranchId = process.env.SLIPOK_BRANCH_ID || '73437';

        try {
            const slipokRes = await axios.post(
                `https://api.slipok.com/api/line/apikey/${slipokBranchId}/bankaccount`,
                {
                    bank_code: '029',
                    bank_account_no: cleanPromptpay,
                    name: cleanName
                },
                {
                    headers: {
                        'x-authorization': apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('SlipOK Register Success:', slipokRes.data);
        } catch (slipokErr) {
            const errData = slipokErr.response?.data;
            console.error('SlipOK Register Error Details:', errData || slipokErr.message);

            return res.status(400).json({
                success: false,
                message: `สร้างบัญชีไม่สำเร็จ: ${errData?.message || slipokErr.message}`
            });
        }

        await pool.query(
            `UPDATE branches
            SET promptpay_no = $1, account_name = $2
            WHERE branch_code = $3`,
            [cleanPromptpay, cleanName, branch]
        );
        
        res.json({ success: true, message: 'ลงทะเบียนพร้อมเพย์ทั้งในระบบและ SlipOK เรียบร้อย'})
    } catch (err) {
        console.error('Register Promptpay Server Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/* หน้าแรก + Webhook + start server                                    */
/* ------------------------------------------------------------------ */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'member.html')));
app.post('/webhook', (req, res) => res.sendStatus(200));

app.use((err, req, res, next) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await testConnection();
});

