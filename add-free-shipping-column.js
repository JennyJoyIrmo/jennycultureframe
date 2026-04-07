// Migration script to add free_shipping column to products table
import { Product, sequelize } from "./models/Product.js";

async function addFreeShippingColumn() {
  try {
    console.log('🔧 Adding free_shipping column to products table...');
    
    // Check if column exists first
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'products' 
      AND COLUMN_NAME = 'free_shipping'
    `);
    
    if (results.length > 0) {
      console.log('⚠️  Column free_shipping already exists!');
    } else {
      // Add the column using raw SQL
      await sequelize.query(`
        ALTER TABLE products 
        ADD COLUMN free_shipping BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Successfully added free_shipping column!');
    }
    
    
    console.log('📊 Syncing model...');
    
    // Sync the model to ensure everything is up to date
    await Product.sync({ alter: true });
    
    console.log('✅ Model synced successfully!');
    console.log('🎉 Migration complete!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding column:', error);
    process.exit(1);
  }
}

addFreeShippingColumn();
