import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Feedback = sequelize.define("feedbacks", {
  order_id: { type: DataTypes.INTEGER, allowNull: false },
  user_email: { type: DataTypes.STRING, allowNull: false },
  rating: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
  comment: { type: DataTypes.TEXT, allowNull: true }
});

export { sequelize };
