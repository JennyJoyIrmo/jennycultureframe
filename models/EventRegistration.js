import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const EventRegistration = sequelize.define('event_registrations', {
  event_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: true }
});

export { sequelize };
