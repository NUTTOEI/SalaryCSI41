// db.js — เชื่อมต่อ PostgreSQL (Supabase) ด้วย pg Pool
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false } // จำเป็นสำหรับ Supabase
});

async function testConnection() {
    const safeHost = process.env.DB_HOST;
    const safeUser = process.env.DB_USER;
    const safeDb = process.env.DB_NAME;

    try {
        const client = await pool.connect();
        client.release();
        console.log(`✅ เชื่อมต่อ PostgreSQL / Supabase สำเร็จ (host=${safeHost} db=${safeDb} user=${safeUser})`);
    } catch (err) {
        console.error(`❌ เชื่อมต่อ PostgreSQL ไม่สำเร็จ (host=${safeHost} db=${safeDb} user=${safeUser})`);
        console.error('   code:', err.code || '(ไม่มี)');
        console.error('   message:', err.message || '(ว่างเปล่า)');
        console.error('   ตรวจสอบ DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME ใน environment variables');
    }
}

module.exports = { pool, testConnection };
