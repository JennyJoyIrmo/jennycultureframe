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
// controllers/ordercontroller.js
import { Order, sequelize } from "../models/Order.js";
import { OrderItem } from "../models/Orderitem.js";
import { CartItem } from "../models/CartItem.js";
import { Feedback } from "../models/Feedback.js";
import { Product } from "../models/Product.js";
await sequelize.sync();

const ordercontroller = {
  checkout: async (req, res) => {
    // Check if this is a Buy Now checkout (only one specific product)
    const buyNowProductId = req.session.buyNowProductId;
    
    // Get selected items from POST body (from cart page)
    let selectedIds = [];
    try {
      if (req.body.selected_items) {
        selectedIds = JSON.parse(req.body.selected_items);
      }
    } catch (err) {
      console.error('Error parsing selected_items:', err);
    }

    // Get full cart from session
    let fullCart = (req.session && Array.isArray(req.session.cart)) ? req.session.cart : [];
    
    // If logged in, get cart from DB
    if (req.session && req.session.user && req.session.user.id) {
      try {
        const cartRows = await CartItem.findAll({ where: { user_id: req.session.user.id } });
        fullCart = [];
        for (const row of cartRows) {
          const prod = await Product.findByPk(row.product_id);
          if (prod) {
            fullCart.push({
              product_id: prod.id,
              name: prod.name,
              price: prod.price,
              image_url: prod.image_url,
              quantity: row.quantity,
              total: prod.price * row.quantity
            });
          }
        }
        req.session.cart = fullCart;
      } catch (err) {
        console.error('Error loading cart from DB:', err);
      }
    }

    // Determine which items to show in checkout
    let cart = fullCart;
    
    // Priority 1: Buy Now - only show the specific product
    if (buyNowProductId) {
      console.log('[Checkout] Buy Now mode - showing only product:', buyNowProductId);
      cart = fullCart.filter(item => String(item.product_id) === String(buyNowProductId));
      // Clear the Buy Now flag after using it
      delete req.session.buyNowProductId;
    }
    // Priority 2: Selected items from cart page
    else if (selectedIds.length > 0) {
      console.log('[Checkout] Cart selection mode - showing selected items:', selectedIds);
      cart = fullCart.filter(item => selectedIds.includes(String(item.product_id)));
    }
    // Priority 3: Show all cart items (fallback)
    else {
      console.log('[Checkout] Default mode - showing all cart items');
    }

    if (!cart.length) {
      req.session.error_msg = 'Please select items to checkout';
      return res.redirect('/cart');
    }

    const cartTotal = cart.reduce((s, it) => s + (Number(it.price) * Number(it.quantity)), 0);
    
    // Prefill customer info from logged-in user if available
    const prefill = {
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      shipping_address: ''
    };

    try {
      if (req.session && req.session.user && req.session.user.id) {
        const { User } = await import('../models/userModel.js');
        const u = await User.findByPk(Number(req.session.user.id));
        if (u) {
          prefill.customer_name = u.name || '';
          prefill.customer_email = u.email || '';
          prefill.customer_phone = u.phone || '';
          prefill.shipping_address = u.address || '';
        }
      }
    } catch (err) {
      console.warn('Could not prefill checkout from user:', err.message);
    }

    res.render("shop/checkout", { 
      serverCartJSON: JSON.stringify(cart), 
      cart,
      cartTotal, 
      ...prefill 
    });
  },
  
  create: async (req, res) => {
    const { customer_name, customer_email, customer_phone, shipping_address, cart_items, total_amount, payment_method } = req.body;

    console.log('[Order Create] Request body:', { customer_name, cart_items: cart_items?.substring(0, 100), total_amount, payment_method });

    // If cart_items not provided in form, fall back to session cart
    let items = [];
    try {
      if (cart_items && cart_items !== '[]') {
        items = JSON.parse(cart_items);
        console.log('[Order Create] Parsed cart_items:', items);
      } else if (req.session && Array.isArray(req.session.cart) && req.session.cart.length > 0) {
        items = req.session.cart.map(i => ({ product_id: i.product_id, name: i.name, quantity: i.quantity, price: i.price }));
        console.log('[Order Create] Using session cart:', items);
      }
    } catch (err) {
      console.error('[Order Create] Error parsing cart_items:', err);
      items = [];
    }

    // Validate items exist
    if (!items || items.length === 0) {
      console.error('[Order Create] No items in cart!');
      req.session.error_msg = 'Your cart is empty. Please add items before checkout.';
      return res.redirect('/shop');
    }

    console.log('[Order Create] Processing order with', items.length, 'items');

    // Check stock for each product before creating order
    for (const item of items) {
      const product = await Product.findByPk(item.product_id);
      if (!product || product.stocks < item.quantity) {
        return res.render("shop/checkout", {
          serverCartJSON: JSON.stringify(items),
          cartTotal: items.reduce((s, it) => s + (Number(it.price) * Number(it.quantity)), 0),
          error_msg: `Sorry, not enough stock for ${item.name || item.product_name}`
        });
      }
    }

    const order = await Order.create({
      customer_name,
      customer_email,
      customer_phone,
      shipping_address,
      total_amount,
      payment_method
    });

    for (const item of items) {
      console.log('[Order Create] Creating order item:', { product_id: item.product_id, quantity: item.quantity, price: item.price });
      
      await OrderItem.create({
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.name || item.product_name || '',
        quantity: item.quantity,
        price: item.price
      });
      
      // Deduct stock - FIXED: only deduct the ordered quantity
      const product = await Product.findByPk(item.product_id);
      if (product) {
        const orderedQty = parseInt(item.quantity) || 0;
        const oldStock = product.stocks;
        product.stocks = Math.max(0, product.stocks - orderedQty);
        await product.save();
        console.log(`[Order Create] ✅ Stock deducted for product ${product.id} (${product.name}): ${oldStock} → ${product.stocks} (deducted ${orderedQty})`);
      } else {
        console.error(`[Order Create] ❌ Product ${item.product_id} not found! Cannot deduct stock.`);
      }
    }

    // After successful order creation, clear the session cart but KEEP wishlist
    if (req.session) {
      req.session.cart = [];
    }

    // Also clear persisted cart items for the user if logged in
    try {
      if (req.session && req.session.user && req.session.user.id) {
        await CartItem.destroy({ where: { user_id: Number(req.session.user.id) } });
      }
    } catch (err) {
      console.warn('Failed to clear persisted cart after order:', err);
    }

    // Save customer info to user profile when logged in (so checkout prefill works next time)
    try {
      if (req.session && req.session.user && req.session.user.id) {
        const { User } = await import('../models/userModel.js');
        const uid = Number(req.session.user.id);
        try {
          await User.update({
            name: customer_name,
            email: customer_email,
            phone: customer_phone,
            address: shipping_address
          }, { where: { id: uid } });

          // Update session copy
          req.session.userName = customer_name;
          req.session.userEmail = customer_email;
          req.session.user = Object.assign({}, req.session.user, { name: customer_name, email: customer_email });
        } catch (err) {
          console.warn('Could not save customer info to user profile:', err);
        }
      }
    } catch (err) {
      console.warn('Could not import User model to save profile info:', err);
    }

    res.render("shop/order-success", { order });
  },
  
  adminIndex: async (req, res) => {
    const orders = await Order.findAll({ order: [['createdAt', 'DESC']] });
    res.render("admin/order-list", { orders });
  },
  
  adminDetail: async (req, res) => {
    const { id } = req.params;
    const order = await Order.findByPk(id);
    const items = await OrderItem.findAll({ where: { order_id: id } });
    res.render("admin/order-details", { order, items });
  },
  
  // Render edit form for admin to change order status
  adminEdit: async (req, res) => {
    const { id } = req.params;
    const order = await Order.findByPk(id);
    if (!order) return res.status(404).send('Order not found');
    const items = await OrderItem.findAll({ where: { order_id: id } });
    res.render('admin/order-edit', { order, items });
  },
  
  updateStatus: async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    await Order.update({ status }, { where: { id } });
    res.redirect("/admin/orders");
  }
  ,
  // Customer-facing order list (orders belonging to logged-in user)
  customerIndex: async (req, res) => {
    const userEmail = req.session && req.session.user && req.session.user.email;
    if (!userEmail) return res.redirect('/login');
    const orders = await Order.findAll({ where: { customer_email: userEmail }, order: [['createdAt', 'DESC']] });
    res.render('customer/order-list', { orders });
  },

  customerDetail: async (req, res) => {
    const { id } = req.params;
    const userEmail = req.session && req.session.user && req.session.user.email;
    const order = await Order.findByPk(id);
    if (!order) return res.status(404).send('Order not found');
    if (userEmail && order.customer_email !== userEmail) return res.status(403).send('Forbidden');
    const items = await OrderItem.findAll({ where: { order_id: id } });
    // Load any existing feedback left by this customer for this order
    let feedback = null;
    try {
      feedback = await Feedback.findOne({ where: { order_id: id, user_email: userEmail } });
    } catch (err) {
      // ignore
    }

    res.render('customer/order-detail', { order, items, feedback });
  }
  ,

  // Customer submits feedback for an order
  submitFeedback: async (req, res) => {
    const { id } = req.params;
    const userEmail = req.session && req.session.user && req.session.user.email;
    if (!userEmail) return res.redirect('/login');
    const { rating, comment } = req.body;
    const order = await Order.findByPk(id);
    if (!order) return res.status(404).send('Order not found');
    if (order.customer_email !== userEmail) return res.status(403).send('Forbidden');

    try {
      // Upsert: if feedback exists update, else create
      const existing = await Feedback.findOne({ where: { order_id: id, user_email: userEmail } });
      if (existing) {
        await existing.update({ rating: Number(rating) || 5, comment });
      } else {
        await Feedback.create({ order_id: id, user_email: userEmail, rating: Number(rating) || 5, comment });
      }
    } catch (err) {
      console.error('Failed to save feedback:', err);
    }

    res.redirect(`/customer/orders/${id}#feedback`);
  },

  // Admin: View all feedbacks
  adminFeedbackList: async (req, res) => {
    try {
      const feedbacks = await Feedback.findAll({
        order: [['createdAt', 'DESC']],
        include: [{
          model: Order,
          as: 'order',
          required: false
        }]
      });

      // Get order details for each feedback
      const feedbacksWithDetails = await Promise.all(feedbacks.map(async (feedback) => {
        const order = await Order.findByPk(feedback.order_id);
        return {
          id: feedback.id,
          order_id: feedback.order_id,
          user_email: feedback.user_email,
          rating: feedback.rating,
          comment: feedback.comment,
          createdAt: feedback.createdAt,
          order: order ? {
            id: order.id,
            customer_name: order.customer_name,
            total_amount: order.total_amount,
            status: order.status
          } : null
        };
      }));

      res.render('admin/feedback-list', {
        title: 'Customer Feedbacks',
        feedbacks: feedbacksWithDetails
      });
    } catch (err) {
      console.error('Admin feedback list error:', err);
      res.status(500).send('Error loading feedbacks');
    }
  }
};

export { ordercontroller };
