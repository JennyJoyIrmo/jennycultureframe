import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Payment = sequelize.define("payments", {
  order_id:         { type: DataTypes.INTEGER,       allowNull: false },
  customer_name:    { type: DataTypes.STRING,        allowNull: false },
  customer_email:   { type: DataTypes.STRING,        allowNull: false },
  amount:           { type: DataTypes.DECIMAL(10,2), allowNull: false },
  method:           { type: DataTypes.STRING,        allowNull: false },
  status:           { type: DataTypes.ENUM("pending","paid","failed","refunded"), defaultValue: "pending" },
  reference_number: { type: DataTypes.STRING,        allowNull: true },
  notes:            { type: DataTypes.TEXT,          allowNull: true },
  paid_at:          { type: DataTypes.DATE,          allowNull: true }
}, { tableName: "payments", timestamps: true });

export { sequelize };
