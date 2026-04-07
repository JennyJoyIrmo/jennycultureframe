/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/
import { Product, sequelize } from "../models/Product.js";
import { Order } from "../models/Order.js";
import { OrderItem } from "../models/Orderitem.js";
await sequelize.sync();

const productcontroller = {
  shop: async (req, res) => {
    // --- FILTERS & SORTING ---
    const { price_min, price_max, sort, free_shipping, in_stock, category, search } = req.query;
    
    console.log('[Shop] Query params:', req.query);
    console.log('[Shop] Filters:', { price_min, price_max, sort, free_shipping, in_stock, category, search });
    
    const Op = sequelize.Sequelize.Op;
    const where = {};
    
    // Price range filter - properly handle both min and max
    if (price_min && price_max) {
      where.price = { [Op.between]: [Number(price_min), Number(price_max)] };
      console.log('[Shop] Price filter: between', price_min, 'and', price_max);
    } else if (price_min) {
      where.price = { [Op.gte]: Number(price_min) };
      console.log('[Shop] Price filter: >= ', price_min);
    } else if (price_max) {
      where.price = { [Op.lte]: Number(price_max) };
      console.log('[Shop] Price filter: <= ', price_max);
    }
    
    if (category) {
      where.category = category;
      console.log('[Shop] Category filter:', category);
    }
    if (free_shipping) {
      where.free_shipping = true;
      console.log('[Shop] Free shipping filter: ON');
    }
    if (in_stock) {
      where.stocks = { [Op.gt]: 0 };
      console.log('[Shop] In stock filter: ON');
    }
    if (search) {
      // Match search against name, category, or description (case-insensitive where supported)
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { category: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
      console.log('[Shop] Search filter:', search);
    }
    
    console.log('[Shop] Final where clause:', JSON.stringify(where, null, 2));

    // Sorting
    let order = [];
    if (sort === 'price_asc') order = [['price', 'ASC']];
    else if (sort === 'price_desc') order = [['price', 'DESC']];
    else if (sort === 'new') order = [['createdAt', 'DESC']];
    // else default: no sort or by popularity

    const productsRaw = await Product.findAll({ where, order });

    // Attach ordered status per product for the logged-in user (match by email)
    let products = productsRaw.map(p => p.get({ plain: true }));
    const userEmail = req.session && req.session.user && req.session.user.email;
    if (userEmail) {
      const orders = await Order.findAll({ where: { customer_email: userEmail }, order: [['createdAt', 'DESC']] });
      const orderIds = orders.map(o => o.id);
      if (orderIds.length > 0) {
        const items = await OrderItem.findAll({ where: { order_id: orderIds } });
        // Map product_id -> most recent order status
        const statusMap = {};
        // Create map of order id -> order (for status and createdAt)
        const orderById = {};
        for (const o of orders) orderById[o.id] = o;

        for (const it of items) {
          const pid = it.product_id;
          const ord = orderById[it.order_id];
          if (!ord) continue;
          // prefer the most recent order (orders already sorted desc)
          if (!statusMap[pid]) statusMap[pid] = ord.status || 'pending';
        }

        products = products.map(p => ({ ...p, ordered_status: statusMap[p.id] || null }));
      } else {
        products = products.map(p => ({ ...p, ordered_status: null }));
      }
    } else {
      products = products.map(p => ({ ...p, ordered_status: null }));
    }

    // Cart/Wishlist count for header
    let cartCount = 0, wishlistCount = 0;
    if (req.session && req.session.user && req.session.user.id) {
      const { CartItem } = await import('../models/CartItem.js');
      const { WishlistItem } = await import('../models/WishlistItem.js');
      cartCount = await CartItem.count({ where: { user_id: req.session.user.id } });
      wishlistCount = await WishlistItem.count({ where: { user_id: req.session.user.id } });
    } else {
      cartCount = Array.isArray(req.session.cart) ? req.session.cart.length : 0;
      wishlistCount = Array.isArray(req.session.wishlist) ? req.session.wishlist.length : 0;
    }

    res.render("shop/index", { products, user: req.session, cartCount, wishlistCount, query: req.query });
  },
  
  detail: async (req, res) => {
    const { id } = req.params;
    const product = await Product.findByPk(id);
    // Cart/Wishlist count for header
    let cartCount = 0, wishlistCount = 0;
    if (req.session && req.session.user && req.session.user.id) {
      const { CartItem } = await import('../models/CartItem.js');
      const { WishlistItem } = await import('../models/WishlistItem.js');
      cartCount = await CartItem.count({ where: { user_id: req.session.user.id } });
      wishlistCount = await WishlistItem.count({ where: { user_id: req.session.user.id } });
    } else {
      cartCount = Array.isArray(req.session.cart) ? req.session.cart.length : 0;
      wishlistCount = Array.isArray(req.session.wishlist) ? req.session.wishlist.length : 0;
    }
    res.render("shop/detail", { product, user: req.session, cartCount, wishlistCount });
  },
  
  adminIndex: async (req, res) => {
    const products = await Product.findAll();
    res.render("admin/product-list", { products });
  },
  
  addNew: (req, res) => {
    res.render("admin/product-add");
  },
  
  add: async (req, res) => {
    try {
      console.log('=== PRODUCT ADD DEBUG ===');
      console.log('Full request body:', req.body);
      console.log('File:', req.file);

      const { name, description, price, category, stocks, image_url, is_featured, heritage_id, free_shipping } = req.body;

      // Debug each field
      console.log('Individual fields:', {
        name: name,
        description: description,
        price: price,
        category: category,
        stocks: stocks,
        image_url: image_url
      });

      // Check if fields are actually received
      if (!name || !description || !price || !category || !stocks) {
        console.log('\u274c MISSING FIELDS DETECTED');
        return res.status(400).send(`
          Missing required fields:<br>
          Name: ${name}<br>
          Description: ${description}<br> 
          Price: ${price}<br>
          Category: ${category}<br>
          Stocks: ${stocks}
        `);
      }

      // Determine image path: uploaded file or URL
      let finalImageUrl = '';
      if (req.file) {
        // Save relative path for use in src
        finalImageUrl = '/uploads/' + req.file.filename;
      } else if (image_url && image_url.trim() !== '') {
        finalImageUrl = image_url.trim();
      } else {
        finalImageUrl = '/images/default-product.jpg';
      }

      // Create product with proper data types
      const newProduct = await Product.create({
        name: String(name),
        description: String(description),
        price: parseFloat(price),
        category: String(category),
        stocks: parseInt(stocks),
        image_url: finalImageUrl,
        is_featured: is_featured === "on",
        heritage_id: heritage_id || null,
        free_shipping: free_shipping === "1" || free_shipping === "on"
      });

      console.log('\u2705 PRODUCT CREATED SUCCESSFULLY:', newProduct.id);
      res.redirect("/admin/products");

    } catch (error) {
      console.error('\u274c ERROR IN PRODUCT ADD:', error);
      res.status(500).send(`
        <h2>Error creating product:</h2>
        <pre>${error.message}</pre>
        <a href="/admin/products/add">Go back</a>
      `);
    }
  },
  
  edit: async (req, res) => {
    const { id } = req.params;
    const product = await Product.findByPk(id);
    res.render("admin/product-edit", { product });
  },
  
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, price, category, stocks, image_url, is_featured, free_shipping } = req.body;
      
      console.log('[Product Update] ID:', id);
      console.log('[Product Update] Data:', { name, description, price, category, stocks, free_shipping });
      
      // Handle image update
      let finalImageUrl = image_url;
      if (req.file) {
        finalImageUrl = '/uploads/' + req.file.filename;
        console.log('[Product Update] New image uploaded:', finalImageUrl);
      }
      
      const updateData = { 
        name, 
        description, 
        price: parseFloat(price), 
        category, 
        stocks: parseInt(stocks), 
        image_url: finalImageUrl, 
        is_featured: is_featured === "on",
        free_shipping: free_shipping === "1" || free_shipping === "on"
      };
      
      console.log('[Product Update] Update data:', updateData);
      
      const result = await Product.update(updateData, { where: { id } });
      
      console.log('[Product Update] ✅ Success! Rows affected:', result[0]);
      
      res.redirect("/admin/products");
    } catch (error) {
      console.error('[Product Update] ❌ Error:', error);
      res.status(500).send(`
        <h2>Error updating product:</h2>
        <pre>${error.message}</pre>
        <a href="/admin/products">Go back to products</a>
      `);
    }
  },
  
  delete: async (req, res) => {
    const { id } = req.body;
    await Product.destroy({ where: { id } });
    res.redirect("/admin/products");
  }
};

export { productcontroller };