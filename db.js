// db.js - ควรเป็น
require('dotenv').config();
const { Pool } = require('pg');

// ✅ Fix: ลองใช้ทั้งสอง (compatible กับ Supabase, Railway, Vercel)
const connectionString = 
    process.env.POSTGRES_URL ||      // Supabase
    process.env.DATABASE_URL ||      // Railway, Vercel Postgres
    process.env.DB_CONNECTION_STRING; // Custom

console.log('🔍 Connection String Status:', {
    hasPostgresUrl: !!process.env.POSTGRES_URL,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasDbConnectionString: !!process.env.DB_CONNECTION_STRING,
    using: connectionString ? '✅ Found' : '❌ Not Found'
});

if (!connectionString) {
    console.error('❌ ไม่พบ POSTGRES_URL หรือ DATABASE_URL ใน .env');
    console.error('   ต้องมีตัวแปร environment อย่างใดอย่างหนึ่ง:');
    console.error('   - POSTGRES_URL=postgresql://...');
    console.error('   - DATABASE_URL=postgresql://...');
    console.error('   - DB_CONNECTION_STRING=postgresql://...');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    max: 20  // max connections
});

// ✅ Fix: Handle pool errors
pool.on('error', (err) => {
    console.error('❌ Pool Error:', {
        message: err.message,
        code: err.code
    });
});

pool.on('connect', () => {
    console.log('✅ New connection established to PostgreSQL');
});

async function testConnection() {
    try {
        console.log('🔄 Testing database connection...');
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        
        console.log('✅ เชื่อมต่อ PostgreSQL / Supabase สำเร็จ');
        console.log('   เวลาปัจจุบัน:', result.rows[0].now);
        return true;
        
    } catch (err) {
        console.error('❌ เชื่อมต่อ PostgreSQL ไม่สำเร็จ');
        console.error('   Error Code:', err.code);
        console.error('   Error Message:', err.message);
        console.error('   ตรวจสอบ:');
        console.error('   1. POSTGRES_URL หรือ DATABASE_URL ถูกไหม?');
        console.error('   2. PostgreSQL Server running ไหม?');
        console.error('   3. Username/Password ถูกไหม?');
        console.error('   4. Database มีไหม?');
        return false;
    }
}

// ✅ Fix: เรียก testConnection ใน async way
(async () => {
    const connected = await testConnection();
    if (!connected) {
        console.warn('⚠️ การเชื่อมต่อ database ล้มเหลว');
        console.warn('   Server จะยังคง run แต่ API จะ fail');
    }
})();

module.exports = { pool, testConnection };