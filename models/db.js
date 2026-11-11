/*
    MIT License
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines
*/

import { Sequelize } from "sequelize";
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
try { _require('dotenv').config(); } catch(e) {}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  process.exit(1);
}

const requiresSsl = process.env.DATABASE_SSL === 'true' ||
  process.env.NODE_ENV === 'production' ||
  /[?&]sslmode=(?:require|verify-ca|verify-full)(?:&|$)/i.test(DATABASE_URL);

export const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: requiresSsl ? {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  } : {},
  pool: {
    max: 5,
    min: 0,
    acquire: 60000,
    idle: 10000
  }
});

if (process.env.SKIP_DATABASE_AUTHENTICATION !== 'true') {
  sequelize.authenticate()
    .then(() => console.log('✅ Database connected successfully'))
    .catch(err => console.error('⚠️ DB connection warning:', err.message));
}
