import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const WishlistItem = sequelize.define('wishlist_items', {
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: false }
});

await sequelize.sync();

export { sequelize };