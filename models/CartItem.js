import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const CartItem = sequelize.define('cart_items', {
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
});

export { sequelize };