/*
	Moment model - stores user photo/posts (moments)
*/
import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Moment = sequelize.define('Moment', {
	user_id: {
		type: DataTypes.INTEGER,
		allowNull: false
	},
	filename: {
		type: DataTypes.STRING,
		allowNull: true
	},
	caption: {
		type: DataTypes.TEXT,
		allowNull: true
	}
}, {
	tableName: 'moments',
	timestamps: true
});

export default Moment;
