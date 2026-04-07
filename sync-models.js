/*
  Sync all models without dropping existing data
  Run this to create missing tables
*/

import { sequelize } from "./models/db.js";
import { User } from "./models/userModel.js";
import { Heritage } from "./models/Heritage.js";
import { Product } from "./models/Product.js";
import { Order } from "./models/Order.js";
import { OrderItem } from "./models/Orderitem.js";
import { Event } from "./models/Event.js";
import { Admin } from "./models/Admin.js";
import { Moment } from "./models/Moment.js";
import { CartItem } from "./models/CartItem.js";
import { WishlistItem } from "./models/WishlistItem.js";
import { EventRegistration } from "./models/EventRegistration.js";
import { Feedback } from "./models/Feedback.js";
import { Scenic } from "./models/Scenic.js";
import { Craft } from "./models/Craft.js";

console.log('🔄 Syncing all models...');

try {
  await sequelize.authenticate();
  console.log('✅ Connected to database!');
  
  // Sync without dropping tables (alter: true will update existing tables)
  await sequelize.sync({ alter: true });
  
  console.log('✅ All models synced successfully!');
  console.log('📋 Tables created/updated:');
  console.log('  - users');
  console.log('  - admins');
  console.log('  - heritages');
  console.log('  - products');
  console.log('  - orders');
  console.log('  - orderitems');
  console.log('  - events');
  console.log('  - moments (for photos/posts)');
  console.log('  - cartitems');
  console.log('  - wishlistitems');
  console.log('  - eventregistrations');
  console.log('  - feedbacks');
  console.log('  - scenics');
  console.log('  - crafts');
  
} catch (err) {
  console.error('❌ Sync failed:', err);
} finally {
  process.exit();
}
