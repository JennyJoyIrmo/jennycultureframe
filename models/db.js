/*
    MIT License
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines
*/

import { Sequelize } from "sequelize";

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://cultureframe_db_user:dQZOPeh4J8rSF2pCohr3Z4ALMgGnT8a7@dpg-d9q57jpt0dsc73c9he5g-a.oregon-postgres.render.com/cultureframe_db";

export const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 60000,
    idle: 10000
  }
});

sequelize.authenticate()
  .then(() => console.log('✅ Database connected successfully'))
  .catch(err => console.error('⚠️ DB connection warning:', err.message));
