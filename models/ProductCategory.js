import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const ProductCategory = sequelize.define("product_categories", {
  name: {
    type: DataTypes.STRING(120),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: "product_categories",
  timestamps: true
});

export { sequelize };
