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
          const prod = await Product.findOne({ where: { id: row.product_id, status: 'active' } });
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
    const { customer_name, customer_email, customer_phone, shipping_address, cart_items, payment_method } = req.body;

    console.log('[Order Create] Request body:', { customer_name, cart_items: cart_items?.substring(0, 100), payment_method });

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

    if (!Array.isArray(items) || items.length === 0) {
      console.error('[Order Create] No items in cart!');
      req.session.error_msg = 'Your cart is empty. Please add items before checkout.';
      return res.redirect('/shop');
    }

    const normalizedName = String(customer_name || '').trim();
    const normalizedEmail = String(customer_email || '').trim().toLowerCase();
    const normalizedPhone = String(customer_phone || '').trim();
    const normalizedAddress = String(shipping_address || '').trim();
    const allowedPaymentMethods = ['cash_on_delivery', 'gcash', 'bank_transfer', 'credit_card'];
    if (normalizedName.length < 2 || normalizedName.length > 100 || normalizedEmail.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !normalizedPhone || normalizedPhone.length > 30 || normalizedAddress.length < 5 || normalizedAddress.length > 250) {
      req.session.error_msg = 'Enter complete and valid customer and shipping information.';
      return res.redirect('/checkout');
    }
    if (!allowedPaymentMethods.includes(payment_method)) {
      req.session.error_msg = 'Select a supported payment method.';
      return res.redirect('/checkout');
    }

    const requestedItems = new Map();
    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
        req.session.error_msg = 'The cart contains an invalid product or quantity.';
        return res.redirect('/cart');
      }
      const combinedQuantity = (requestedItems.get(productId) || 0) + quantity;
      if (combinedQuantity > 1000) {
        req.session.error_msg = 'A product quantity cannot exceed 1,000.';
        return res.redirect('/cart');
      }
      requestedItems.set(productId, combinedQuantity);
    }

    let order;
    try {
      order = await sequelize.transaction(async transaction => {
        const trustedItems = [];
        let totalCents = 0;

        for (const [productId, quantity] of requestedItems) {
          const product = await Product.findOne({
            where: { id: productId, status: 'active' },
            transaction,
            lock: transaction.LOCK.UPDATE
          });
          if (!product) throw new Error('A selected product is no longer available.');
          if (Number(product.stocks) < quantity) throw new Error(`Not enough stock for ${product.name}.`);

          const unitCents = Math.round(Number(product.price) * 100);
          if (!Number.isInteger(unitCents) || unitCents < 1) throw new Error(`Invalid price for ${product.name}.`);
          totalCents += unitCents * quantity;
          trustedItems.push({ product, quantity, unitCents });
        }

        if (!Number.isSafeInteger(totalCents) || totalCents < 1 || totalCents > 100000000) {
          throw new Error('The order total is outside the supported range.');
        }

        const createdOrder = await Order.create({
          user_id: req.session?.userId ? Number(req.session.userId) : null,
          customer_name: normalizedName,
          customer_email: normalizedEmail,
          customer_phone: normalizedPhone,
          shipping_address: normalizedAddress,
          total_amount: (totalCents / 100).toFixed(2),
          payment_status: 'unpaid',
          payment_method
        }, { transaction });

        for (const { product, quantity, unitCents } of trustedItems) {
          await OrderItem.create({
            order_id: createdOrder.id,
            product_id: product.id,
            product_name: product.name,
            quantity,
            price: (unitCents / 100).toFixed(2)
          }, { transaction });
          product.stocks = Number(product.stocks) - quantity;
          await product.save({ transaction });
        }

        return createdOrder;
      });
    } catch (error) {
      console.error('[Order Create] Transaction failed:', error);
      req.session.error_msg = error.message || 'Could not create the order.';
      return res.redirect('/cart');
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
            name: normalizedName,
            email: normalizedEmail,
            phone: normalizedPhone,
            address: normalizedAddress
          }, { where: { id: uid } });

          // Update session copy
          req.session.userName = normalizedName;
          req.session.userEmail = normalizedEmail;
          req.session.user = Object.assign({}, req.session.user, { name: normalizedName, email: normalizedEmail });
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
    req.flash('success_msg', `Order status updated to ${status}.`);
    res.redirect(`/admin/orders/edit/${id}`);
  }
  ,
  // Customer-facing order list — always filter by user_id when logged in
  customerIndex: async (req, res) => {
    const userId  = req.session && req.session.userId;
    const userEmail = req.session && req.session.user && req.session.user.email;
    if (!userId) return res.redirect('/login');

    // Primary: filter by user_id (secure — can't be spoofed by email)
    // Also include legacy orders placed with same email but no user_id (guest orders)
    const { Op } = await import('sequelize');
    const orders = await Order.findAll({
      where: {
        [Op.or]: [
          { user_id: Number(userId) },
          // Include guest orders from same email that have no user_id assigned
          ...(userEmail ? [{ user_id: null, customer_email: userEmail }] : [])
        ]
      },
      order: [['createdAt', 'DESC']]
    });
    res.render('customer/order-list', { orders });
  },

  customerDetail: async (req, res) => {
    const { id } = req.params;
    const userId    = req.session && req.session.userId;
    const userEmail = req.session && req.session.user && req.session.user.email;
    if (!userId) return res.redirect('/login');

    const order = await Order.findByPk(id);
    if (!order) return res.status(404).send('Order not found');

    // Security check: order must belong to this user_id OR same email (legacy guest)
    const ownsOrder = (order.user_id && order.user_id === Number(userId)) ||
                      (!order.user_id && userEmail && order.customer_email === userEmail);
    if (!ownsOrder) return res.status(403).send('Forbidden');

    const items = await OrderItem.findAll({ where: { order_id: id } });
    let feedback = null;
    try {
      feedback = await Feedback.findOne({ where: { order_id: id, user_email: userEmail } });
    } catch (err) { /* ignore */ }

    res.render('customer/order-detail', { order, items, feedback });
  },

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
