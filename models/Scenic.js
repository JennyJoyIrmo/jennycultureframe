import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Scenic = sequelize.define("scenics", {
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  location: { type: DataTypes.STRING, allowNull: false },
  image_url: { type: DataTypes.STRING, allowNull: true },
  latitude: { type: DataTypes.FLOAT, allowNull: true },
  longitude: { type: DataTypes.FLOAT, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: "active" }
});

export { sequelize };
