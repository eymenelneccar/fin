-- Migration script to add missing columns to income_entries table
-- Run this on your Render PostgreSQL database

-- Add is_down_payment column if it doesn't exist
ALTER TABLE income_entries 
ADD COLUMN IF NOT EXISTS is_down_payment BOOLEAN DEFAULT false;

-- Add total_amount column if it doesn't exist
ALTER TABLE income_entries 
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10, 2);

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'income_entries'
ORDER BY ordinal_position;
