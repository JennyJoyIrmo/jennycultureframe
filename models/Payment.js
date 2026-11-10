import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Payment = sequelize.define("payments", {
  order_id:         { type: DataTypes.INTEGER,       allowNull: false },
  integration_external_id: { type: DataTypes.STRING(100), allowNull: true, unique: true },
  customer_name:    { type: DataTypes.STRING,        allowNull: false },
  customer_email:   { type: DataTypes.STRING,        allowNull: false },
  amount:           { type: DataTypes.DECIMAL(10,2), allowNull: false },
  method:           { type: DataTypes.STRING,        allowNull: false },
  status:           { type: DataTypes.ENUM("pending","paid","failed","partially_refunded","refunded"), defaultValue: "pending" },
  refunded_amount:  { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
  reference_number: { type: DataTypes.STRING,        allowNull: true },
  notes:            { type: DataTypes.TEXT,          allowNull: true },
  paid_at:          { type: DataTypes.DATE,          allowNull: true }
}, { tableName: "payments", timestamps: true });

export { sequelize };
