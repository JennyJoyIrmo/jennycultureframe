import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const PaymentIntegrationEvent = sequelize.define("payment_integration_events", {
  idempotency_key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  external_id: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  event_type: {
    type: DataTypes.ENUM("payment", "refund"),
    allowNull: false
  },
  reference: {
    type: DataTypes.STRING(190),
    allowNull: false
  },
  status: {
    type: DataTypes.STRING(40),
    allowNull: false
  },
  amount_cents: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  provider_reference: {
    type: DataTypes.STRING(190),
    allowNull: true
  },
  payload: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: "payment_integration_events",
  timestamps: true,
  indexes: [
    { fields: ["external_id", "event_type"] },
    { fields: ["reference"] }
  ]
});

export { sequelize };
