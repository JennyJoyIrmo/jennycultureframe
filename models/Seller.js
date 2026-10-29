import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Seller = sequelize.define("sellers", {
  business_name:   { type: DataTypes.STRING,       allowNull: false },
  contact_name:    { type: DataTypes.STRING,       allowNull: false },
  email:           { type: DataTypes.STRING,       allowNull: false, unique: true },
  phone:           { type: DataTypes.STRING,       allowNull: true },
  address:         { type: DataTypes.TEXT,         allowNull: true },
  category:        { type: DataTypes.STRING,       allowNull: true },
  status:          { type: DataTypes.ENUM("active","inactive","pending"), defaultValue: "pending" },
  commission_rate: { type: DataTypes.DECIMAL(5,2), defaultValue: 10.00 },
  notes:           { type: DataTypes.TEXT,         allowNull: true }
}, { tableName: "sellers", timestamps: true });

export { sequelize };
