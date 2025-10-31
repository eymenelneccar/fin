import dotenv from "dotenv";
// Load environment variables first
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;
let db: any = null;

async function createSessionTable() {
  if (!pool) return;
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.session (
        sid VARCHAR(255) PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS session_expire_idx ON public.session(expire);
    `);
    console.log("✅ Session table ready");
  } catch (error) {
    console.error("⚠️  Error creating session table:", error);
  }
}

async function createAllTables() {
  if (!pool) return;
  
  try {
    // Create extensions
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR UNIQUE,
        first_name VARCHAR,
        last_name VARCHAR,
        profile_image_url VARCHAR,
        username VARCHAR UNIQUE,
        password VARCHAR,
        role VARCHAR DEFAULT 'viewer',
        is_manual_user BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    
    // Create customers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        menu_url TEXT,
        join_date DATE NOT NULL,
        subscription_type VARCHAR NOT NULL,
        expiry_date DATE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    
    // Create income_entries table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS income_entries (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id VARCHAR REFERENCES customers(id),
        type VARCHAR NOT NULL,
        print_type TEXT,
        amount DECIMAL(10,2) NOT NULL,
        is_down_payment BOOLEAN DEFAULT false,
        total_amount DECIMAL(10,2),
        receipt_url TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT now()
      );
    `);
    
    // Create expense_entries table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expense_entries (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        amount DECIMAL(10,2) NOT NULL,
        reason TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    
    // Create employees table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        position TEXT,
        salary DECIMAL(10,2) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    
    // Create activities table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR NOT NULL,
        description TEXT NOT NULL,
        related_id VARCHAR,
        created_at TIMESTAMP DEFAULT now()
      );
    `);
    
    // Create receivables table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS receivables (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        income_entry_id VARCHAR REFERENCES income_entries(id),
        customer_id VARCHAR REFERENCES customers(id),
        customer_name TEXT NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        paid_amount DECIMAL(10,2) NOT NULL,
        remaining_amount DECIMAL(10,2) NOT NULL,
        is_paid BOOLEAN DEFAULT false,
        description TEXT,
        created_at TIMESTAMP DEFAULT now(),
        paid_at TIMESTAMP
      );
    `);
    
    console.log("✅ All database tables created successfully");
  } catch (error) {
    console.error("⚠️  Error creating tables:", error);
  }
}

// تنظيف رابط قاعدة البيانات من أي أحرف زائدة
let cleanDatabaseUrl = process.env.DATABASE_URL;
if (cleanDatabaseUrl) {
  // إزالة "psql" وعلامات الاقتباس والفراغات
  cleanDatabaseUrl = cleanDatabaseUrl
    .replace(/^.*?postgresql:/, 'postgresql:') // إزالة كل شيء قبل postgresql:
    .replace(/['"].*?$/, '') // إزالة علامات الاقتباس والباقي
    .trim();
  console.log("🔗 Database URL cleaned:", cleanDatabaseUrl.substring(0, 50) + "...");
}

async function createAdminUser() {
  if (!db) return;
  
  try {
    const { hashPassword } = await import("./auth");
    
    // تحقق من وجود مستخدم admin
    const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.username, 'admin')).limit(1);
    
    if (existingAdmin.length > 0) {
      console.log('✅ Admin user already exists');
      return;
    }

    // إنشاء مستخدم admin جديد
    const hashedPassword = await hashPassword('admin123');
    
    await db.insert(schema.users).values({
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
      isManualUser: true
    });
    
    console.log('✅ Default admin user created');
    console.log('👤 Username: admin');
    console.log('🔑 Password: admin123');
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  }
}

async function initializeDatabase() {
  if (!cleanDatabaseUrl) {
    console.log("⚠️  DATABASE_URL not set. Please provision a database in Replit.");
    console.log("   The application will start but database features will be unavailable.");
    return;
  }
  
  pool = new Pool({ connectionString: cleanDatabaseUrl });
  db = drizzle({ client: pool, schema });
  console.log("✅ Database connected successfully");
  
  // إنشاء جميع الجداول
  await createAllTables();
  await createSessionTable();
  
  // إنشاء المستخدم الإداري الافتراضي
  await createAdminUser();
}

// تشغيل إعداد قاعدة البيانات
initializeDatabase().catch(console.error);

export { pool, db };