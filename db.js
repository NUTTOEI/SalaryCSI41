// db.js — เชื่อมต่อ PostgreSQL (Supabase) ด้วย pg Pool
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
    // ssl: { rejectUnauthorized: false }
});

async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log('✅ เชื่อมต่อ PostgreSQL / Supabase สำเร็จ');
        console.log('    เวลาปัจจุบัน:', result.rows[0].now);
    } catch (err) {
        console.error('❌ เชื่อมต่อ PostgreSQL ไม่สำเร็จ');
        console.error('   Error:', err.message);
        console.error('   ตรวจสอบ DATABASE_URL ใน environment variables');
        console.error('   DATABASE_URL=postgresql://user:password@host:port/database');
    }
}

testConnection();

module.exports = { pool, testConnection };
