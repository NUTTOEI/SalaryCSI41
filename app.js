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

/* ------------------------------------------------------------------ */
/* API: ชำระเงิน (Toggle paid status)                                 */
/* ------------------------------------------------------------------ */
app.post('/api/admin/toggle-paid', async (req, res) => {
    try {
        const { memberId, mode, monthIndex, weekIndex } = req.body;

        const { rows } = await pool.query("SELECT paid_months, paid_weeks FROM members WHERE id = $1", [memberId]);
        if (rows.length === 0) return res.status(404).json({ status: 'error', message: 'ไม่พบสมาชิก' });

        const paidMonths = typeof rows[0].paid_months === 'string' ? JSON.parse(rows[0].paid_months) : rows[0].paid_months || DEFAULT_MONTHS();
        const paidWeeks = typeof rows[0].paid_weeks === 'string' ? JSON.parse(rows[0].paid_weeks) : rows[0].paid_weeks || DEFAULT_WEEKS();

        if (mode === 'month') {
            paidMonths[monthIndex] = !paidMonths[monthIndex];
        } else if (mode === 'week') {
            paidWeeks[weekIndex] = !paidWeeks[weekIndex];
        }

        await pool.query(
            `UPDATE members SET paid_months = $1, paid_weeks = $2 WHERE id = $3`,
            [JSON.stringify(paidMonths), JSON.stringify(paidWeeks), memberId]
        );

        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/admin/reset', async (req, res) => {
    try {
        await pool.query(`UPDATE members SET paid_months = $1, paid_weeks = $2`, 
            [JSON.stringify(DEFAULT_MONTHS()), JSON.stringify(DEFAULT_WEEKS())]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/admin/members/amount-all', async (req, res) => {
    try {
        const { amount } = req.body;
        if (isNaN(amount) || amount < 0) return res.status(400).json({ status: 'error', message: 'จำนวนเงินไม่ถูกต้อง' });

        await pool.query(`UPDATE members SET amount = $1`, [amount]);
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/* ------------------------------------------------------------------ */
/* API: สาขา                                                          */
/* ------------------------------------------------------------------ */
app.get('/api/branches', async (req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM branches ORDER BY branch_code ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/branches/:branch', async (req, res) => {
    try {
        const { branch } = req.params;
        const { rows } = await pool.query("SELECT * FROM branches WHERE branch_code = $1", [branch]);
        
        if (rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'ไม่พบสาขา' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.put('/api/admin/branch/name', async (req, res) => {
    try {
        const { branch, branchName } = req.body;
        if (!branch || !branchName) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });

        await pool.query("UPDATE branches SET branch_name = $1 WHERE branch_code = $2", [branchName, branch]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/branch/upload-profile', (req, res) => {
    uploadMemberAvatar.single('avatar')(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        try {
            const { branch } = req.body;
            if (!branch) return res.status(400).json({ success: false, message: 'กรุณาระบุสาขา' });
            if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์รูปภาพ' });

            const result = await uploadToCloudinary(req.file.buffer);
            await pool.query("UPDATE branches SET profile_img = $1 WHERE branch_code = $2", [result.secure_url, branch]);

            return res.json({ success: true, message: 'อัปเดทรูปโปรไฟล์สำเร็จ', avatarUrl: result.secure_url });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });
});

/* ------------------------------------------------------------------ */
/* API: แอดมิน - สมัครสมาชิกและเข้าสู่ระบบ                             */
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

/* ======================================================================
   ✅ API ลงทะเบียนพร้อมเพย์ - แก้ไขให้ครบถ้วน
   ====================================================================== */
app.post('/api/admin/branch/register-promptpay', async (req, res) => {
    try {
        // 1. ดึงข้อมูลจาก request
        const { branch, promptpayNo, accountName, accountNameEn } = req.body;

        // ✅ บันทึก log เพื่อดีบัก
        console.log('📨 PromptPay Registration Request Received:', {
            branch: branch || '[EMPTY]',
            promptpayNo: promptpayNo || '[EMPTY]',
            accountName: accountName || '[EMPTY]',
            timestamp: new Date().toISOString(),
            ip: req.ip
        });

        // ✅ ตรวจสอบฟิลด์เฉพาะเจาะจง
        const missingFields = [];
        
        if (!branch || !String(branch).trim()) missingFields.push('branch');
        if (!promptpayNo || !String(promptpayNo).trim()) missingFields.push('promptpayNo');
        if (!accountName || !String(accountName).trim()) missingFields.push('accountName');

        if (missingFields.length > 0) {
            console.error('❌ Missing fields:', missingFields);
            return res.status(400).json({ 
                success: false, 
                message: `❌ ฟิลด์ที่ขาด: ${missingFields.join(', ')}`,
                missingFields: missingFields,
                code: 'MISSING_FIELDS'
            });
        }

        // 2. ล้างข้อมูล
        const cleanBranch = String(branch).trim();
        const cleanPromptpay = String(promptpayNo).trim();
        const cleanName = String(accountName).trim();
        const cleanNameEn = (accountNameEn || accountName).trim();

        console.log('✅ ข้อมูลผ่านการตรวจสอบ กำลังส่งไป SlipOK...');

        // 3. ตรวจสอบรูปแบบเลขพร้อมเพย์ (บอก warning แต่ไม่บล็อก)
        const ppRegex = /^[0-9]{10,13}$/;
        if (!ppRegex.test(cleanPromptpay.replace(/[-\s]/g, ''))) {
            console.warn('⚠️ Warning: รูปแบบเลขพร้อมเพย์อาจไม่ถูกต้อง:', cleanPromptpay);
        }

        // 4. ดึงข้อมูล API credentials
        const apiKey = (process.env.SLIPOK_API_KEY || '').trim();
        const slipokBranchId = (process.env.SLIPOK_BRANCH_ID || '73437').trim();

        if (!apiKey) {
            console.error('❌ ไม่ได้ตั้งค่า SLIPOK_API_KEY');
            return res.status(500).json({
                success: false,
                message: '❌ ข้อผิดพลาดการตั้งค่าเซิร์ฟเวอร์: ไม่ได้ตั้งค่า SlipOK API key',
                code: 'CONFIG_ERROR'
            });
        }

        console.log('📝 กำลังสมัครกับ SlipOK:', {
            slipokBranchId,
            bank_code: '029 (PromptPay)',
            bank_account_no: cleanPromptpay,
            name: cleanName,
            name_en: cleanNameEn
        });

        // 5. เรียก SlipOK API
        try {
            const slipokRes = await axios.post(
                `https://api.slipok.com/api/line/apikey/${slipokBranchId}/bankaccount`,
                {
                    bank_code: '029', // 029 = PromptPay
                    bank_account_no: cleanPromptpay,
                    name: cleanName,
                    name_en: cleanNameEn
                },
                {
                    headers: {
                        'x-authorization': apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000 // timeout 10 วินาที
                }
            );

            console.log('✅ SlipOK ลงทะเบียนสำเร็จ:', {
                statusCode: slipokRes.status,
                data: slipokRes.data
            });

        } catch (slipokErr) {
            const errData = slipokErr.response?.data;
            const errMsg = errData?.message || slipokErr.message;
            const errCode = slipokErr.response?.status;

            console.error('❌ SlipOK API Error:', {
                statusCode: errCode,
                message: errMsg,
                fullError: errData,
                promptpayNo: cleanPromptpay
            });

            return res.status(400).json({
                success: false,
                message: `❌ SlipOK ลงทะเบียนไม่สำเร็จ: ${errMsg}`,
                code: 'SLIPOK_ERROR',
                slipokStatus: errCode,
                details: errData
            });
        }

        // 6. อัปเดต database หลังจาก SlipOK สำเร็จ
        console.log('💾 กำลังอัปเดต database สำหรับสาขา:', cleanBranch);

        const updateResult = await pool.query(
            `UPDATE branches
            SET promptpay_no = $1, account_name = $2, updated_at = NOW()
            WHERE branch_code = $3
            RETURNING *`,
            [cleanPromptpay, cleanName, cleanBranch]
        );

        if (updateResult.rows.length === 0) {
            console.warn('⚠️ Warning: ไม่พบสาขาใน database สร้างรายการใหม่');
            
            // สร้างสาขาใหม่ถ้าไม่มี
            await pool.query(
                `INSERT INTO branches (branch_code, branch_name, promptpay_no, account_name, profile_img)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (branch_code) DO UPDATE 
                SET promptpay_no = $3, account_name = $4`,
                [cleanBranch, cleanBranch, cleanPromptpay, cleanName, `${cleanBranch}.png`]
            );
        }

        console.log('✅ อัปเดต database สำเร็จ');

        res.json({ 
            success: true, 
            message: '✅ ลงทะเบียนพร้อมเพย์ในระบบและ SlipOK เรียบร้อย',
            code: 'SUCCESS',
            data: {
                branch: cleanBranch,
                promptpayNo: cleanPromptpay,
                accountName: cleanName
            }
        });

    } catch (err) {
        console.error('❌ Server Error in register-promptpay:', {
            message: err.message,
            stack: err.stack,
            code: err.code
        });

        res.status(500).json({ 
            success: false, 
            message: '❌ ข้อผิดพลาดเซิร์ฟเวอร์: ' + err.message,
            code: 'SERVER_ERROR'
        });
    }
});

/* ✅ Bonus: Debug endpoint เพื่อตรวจสอบข้อมูลพร้อมเพย์ปัจจุบัน */
app.get('/api/admin/branch/info/:branch', async (req, res) => {
    try {
        const { branch } = req.params;
        const { rows } = await pool.query(
            'SELECT branch_code, branch_name, promptpay_no, account_name FROM branches WHERE branch_code = $1',
            [branch]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบสาขา' });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (err) {
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