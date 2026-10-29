-- Migration: Add user_id to orders table
-- Run this ONCE in Railway Query tab or pgAdmin

ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
