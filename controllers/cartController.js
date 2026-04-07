import { Product } from "../models/Product.js";
import { CartItem } from "../models/CartItem.js";
import { WishlistItem } from "../models/WishlistItem.js";

const ensureSessionArrays = (req) => {
  if (!req.session.cart) req.session.cart = [];
  if (!req.session.wishlist) req.session.wishlist = [];
};

const findCartItem = (cart, productId) => cart.find(i => i.product_id === productId);

const cartController = {
  addToCart: async (req, res) => {
    try {
      ensureSessionArrays(req);
      const { product_id, quantity } = req.body;
      const qty = parseInt(quantity) || 1;

      // Debug log
      console.log('[AddToCart] session:', req.session);
      console.log('[AddToCart] user:', req.session.user);
      console.log('[AddToCart] product_id:', product_id, 'quantity:', qty);

      const product = await Product.findByPk(product_id);
      if (!product) {
        req.session.error_msg = 'Product not found';
        if (req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json')) {
          return res.status(404).json({ success: false, message: 'Product not found' });
        }
        return res.redirect('/shop');
      }
      if (product.stocks < 1) {
        req.session.error_msg = 'Product is out of stock';
        if (req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json')) {
          return res.status(400).json({ success: false, message: 'Product is out of stock' });
        }
        return res.redirect('/shop');
      }

      // Check current cart quantity for this product
      let currentQty = 0;
      if (req.session && req.session.user && req.session.user.id) {
        const existingDb = await CartItem.findOne({ where: { user_id: Number(req.session.user.id), product_id: product.id } });
        if (existingDb) currentQty = existingDb.quantity;
      } else {
        const existing = findCartItem(req.session.cart, product.id);
        if (existing) currentQty = existing.quantity;
      }

      // Check if adding this quantity would exceed stock
      const newTotal = currentQty + qty;
      if (newTotal > product.stocks) {
        const available = product.stocks - currentQty;
        req.session.error_msg = `Only ${available} more item(s) available. You already have ${currentQty} in cart.`;
        if (req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json')) {
          return res.status(400).json({ success: false, message: `Only ${available} more available. You have ${currentQty} in cart.` });
        }
        return res.redirect('/shop');
      }

      // Always persist to DB if logged in
      if (req.session && req.session.user && req.session.user.id) {
        try {
          const uid = Number(req.session.user.id);
          let existingDb = await CartItem.findOne({ where: { user_id: uid, product_id: product.id } });
          if (existingDb) {
            existingDb.quantity = existingDb.quantity + qty;
            await existingDb.save();
            console.log('[AddToCart] Updated existing cart item:', existingDb.toJSON());
          } else {
            const newItem = await CartItem.create({ user_id: uid, product_id: product.id, quantity: qty });
            console.log('[AddToCart] Created new cart item:', newItem.toJSON());
          }
        } catch (err) {
          console.error('[AddToCart] CartItem persist error', err);
          req.session.error_msg = 'Unable to save cart to database.';
          // If AJAX, return JSON error
          if (req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json')) {
            return res.status(500).json({ success: false, message: 'Unable to save cart to database.' });
          }
          return res.redirect('back');
        }
      } else {
        // Fallback: session cart for guests
        const existing = findCartItem(req.session.cart, product.id);
        if (existing) {
          existing.quantity += qty;
        } else {
          req.session.cart.push({
            product_id: product.id,
            name: product.name,
            price: product.price,
            quantity: qty
          });
        }
        console.log('[AddToCart] Added to session cart:', req.session.cart);
      }

      // Update cached cart count in session
      try {
        if (req.session && req.session.user && req.session.user.id) {
          req.session.cartCount = await CartItem.count({ where: { user_id: Number(req.session.user.id) } });
        } else {
          req.session.cartCount = Array.isArray(req.session.cart) ? req.session.cart.length : 0;
        }
      } catch (err) {
        req.session.cartCount = Array.isArray(req.session.cart) ? req.session.cart.length : 0;
      }
      
      // If AJAX request, return JSON with updated count (no session message)
      const isAjax = req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json');
      if (isAjax) {
        return res.json({ success: true, cartCount: req.session.cartCount });
      }
      
      // Only set session message for non-AJAX requests
      req.session.success_msg = 'Added to cart';

      // If the user clicked Buy Now, redirect to checkout immediately
      const action = req.body && (req.body.action || req.body.redirectToCheckout);
      if (action === 'checkout' || action === '1' || action === 1) {
        // Mark this as a Buy Now checkout - only this product should be in checkout
        req.session.buyNowProductId = product_id;
        return res.redirect('/checkout');
      }
      return res.redirect(req.get('referer') || '/shop');
    } catch (err) {
      console.error('[AddToCart] Cart add error:', err);
      req.session.error_msg = 'Unable to add to cart';
      if (req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json')) {
        return res.status(500).json({ success: false, message: 'Unable to add to cart' });
      }
      return res.redirect('back');
    }
  },

  removeFromCart: async (req, res) => {
    try {
      ensureSessionArrays(req);
      const { product_id } = req.body;
      const pid = Number(product_id);
      req.session.cart = (req.session.cart || []).filter(i => Number(i.product_id) !== pid);
      // Remove from DB if user logged in
      if (req.session && req.session.user && req.session.user.id) {
        await CartItem.destroy({ where: { user_id: Number(req.session.user.id), product_id: pid } });
        // Update cached count
        req.session.cartCount = await CartItem.count({ where: { user_id: Number(req.session.user.id) } });
      } else {
        req.session.cartCount = req.session.cart.length;
      }
      req.session.success_msg = 'Item removed from cart';
      return res.redirect(req.get('referer') || '/cart');
    } catch (err) {
      console.error('Cart remove error:', err);
      req.session.error_msg = 'Unable to remove item';
      return res.redirect('back');
    }
  },

  updateCart: async (req, res) => {
    try {
      ensureSessionArrays(req);
      const { product_id, quantity } = req.body;
      const pid = Number(product_id);
      const qty = Math.max(1, parseInt(quantity) || 1);

      // Check stock limit
      const product = await Product.findByPk(pid);
      if (!product) {
        req.session.error_msg = 'Product not found';
        return res.redirect(req.get('referer') || '/cart');
      }
      if (qty > product.stocks) {
        req.session.error_msg = `Only ${product.stocks} item(s) available in stock`;
        return res.redirect(req.get('referer') || '/cart');
      }

      const item = req.session.cart.find(i => Number(i.product_id) === pid);
      if (item) {
        item.quantity = qty;
        req.session.success_msg = 'Cart updated';
        // Persist to DB if logged in
        if (req.session && req.session.user && req.session.user.id) {
          const ci = await CartItem.findOne({ where: { user_id: Number(req.session.user.id), product_id: pid } });
          if (ci) {
            ci.quantity = qty;
            await ci.save();
          }
          // Update cached count (count doesn't change, but refresh it anyway)
          req.session.cartCount = await CartItem.count({ where: { user_id: Number(req.session.user.id) } });
        } else {
          req.session.cartCount = req.session.cart.length;
        }
      }
      return res.redirect(req.get('referer') || '/cart');
    } catch (err) {
      console.error('Cart update error:', err);
      req.session.error_msg = 'Unable to update cart';
      return res.redirect('back');
    }
  },

  addToWishlist: async (req, res) => {
    try {
      ensureSessionArrays(req);
      const { product_id } = req.body;
      const product = await Product.findByPk(product_id);
      if (!product) {
        req.session.error_msg = 'Product not found';
        if (req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json')) {
          return res.status(404).json({ success: false, message: 'Product not found' });
        }
        return res.redirect('back');
      }

      const exists = req.session.wishlist.find(i => i.product_id === product.id);
      let already = false;
      if (!exists) {
        req.session.wishlist.push({ product_id: product.id, name: product.name, price: product.price });
        req.session.success_msg = 'Added to wishlist';
        // Persist to DB if user is logged in
        if (req.session && req.session.user && req.session.user.id) {
          try {
            const uid = Number(req.session.user.id);
            const existingDb = await WishlistItem.findOne({ where: { user_id: uid, product_id: product.id } });
            if (!existingDb) await WishlistItem.create({ user_id: uid, product_id: product.id });
          } catch (err) {
            console.warn('WishlistItem persist error', err);
          }
        }
      } else {
        req.session.success_msg = 'Already in wishlist';
        already = true;
      }

      // Update cached wishlist count
      try {
        if (req.session && req.session.user && req.session.user.id) {
          req.session.wishlistCount = await WishlistItem.count({ where: { user_id: Number(req.session.user.id) } });
        } else {
          req.session.wishlistCount = Array.isArray(req.session.wishlist) ? req.session.wishlist.length : 0;
        }
      } catch (err) {
        req.session.wishlistCount = Array.isArray(req.session.wishlist) ? req.session.wishlist.length : 0;
      }

      // Respond with JSON when AJAX
      if (req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json')) {
        if (already) return res.json({ success: false, message: 'Already in wishlist', wishlistCount: req.session.wishlistCount });
        return res.json({ success: true, wishlistCount: req.session.wishlistCount });
      }

      return res.redirect(req.get('referer') || '/shop');
    } catch (err) {
      console.error('Wishlist add error:', err);
      req.session.error_msg = 'Unable to add to wishlist';
      if (req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json')) {
        return res.status(500).json({ success: false, message: 'Unable to add to wishlist' });
      }
      return res.redirect('back');
    }
  },

  removeFromWishlist: async (req, res) => {
    try {
      ensureSessionArrays(req);
      const { product_id } = req.body;
      const pid = Number(product_id);
      req.session.wishlist = (req.session.wishlist || []).filter(i => Number(i.product_id) !== pid);
      // Remove from DB if user logged in
      if (req.session && req.session.user && req.session.user.id) {
        await WishlistItem.destroy({ where: { user_id: Number(req.session.user.id), product_id: pid } });
        // Update cached count
        req.session.wishlistCount = await WishlistItem.count({ where: { user_id: Number(req.session.user.id) } });
      } else {
        req.session.wishlistCount = req.session.wishlist.length;
      }
      req.session.success_msg = 'Item removed from wishlist';
      return res.redirect(req.get('referer') || '/wishlist');
    } catch (err) {
      console.error('Wishlist remove error:', err);
      req.session.error_msg = 'Unable to remove wishlist item';
      return res.redirect('back');
    }
  },

  viewCart: async (req, res) => {
    try {
      ensureSessionArrays(req);
      const renderCart = (cartArr) => {
        const cart = cartArr.map(item => ({
          ...item,
          total: (Number(item.price) * Number(item.quantity))
        }));
        const cartTotal = cart.reduce((s, it) => s + Number(it.total), 0);
        res.render('shop/cart', { 
          cart, 
          cartTotal, 
          user: req.session,
          title: 'Shopping Cart - CultureFrame'
        });
      };

      // If logged in, always get cart from DB
      if (req.session && req.session.user && req.session.user.id) {
        try {
          const cartRows = await CartItem.findAll({ where: { user_id: req.session.user.id } });
          // Attach product info
          const cartArr = [];
          for (const row of cartRows) {
            const prod = await Product.findByPk(row.product_id);
            if (prod) {
              cartArr.push({
                product_id: prod.id,
                name: prod.name,
                price: prod.price,
                image_url: prod.image_url,
                quantity: row.quantity,
                total: prod.price * row.quantity
              });
            }
          }
          // Sync session cart for consistency
          req.session.cart = cartArr;
          renderCart(cartArr);
        } catch (err) {
          console.error('[viewCart] Error loading cart from DB:', err);
          renderCart(req.session.cart || []);
        }
      } else {
        // Guest: use session cart
        renderCart(req.session.cart || []);
      }
    } catch (err) {
      console.error('[viewCart] Error:', err);
      res.render('shop/cart', { 
        cart: [], 
        cartTotal: 0, 
        user: req.session,
        error: 'Error loading cart',
        title: 'Shopping Cart - CultureFrame'
      });
    }
  },

  viewWishlist: async (req, res) => {
    try {
      ensureSessionArrays(req);
      
      // If logged in, get wishlist from DB
      if (req.session && req.session.user && req.session.user.id) {
        try {
          const wishlistRows = await WishlistItem.findAll({ where: { user_id: req.session.user.id } });
          const wishlistArr = [];
          for (const row of wishlistRows) {
            const prod = await Product.findByPk(row.product_id);
            if (prod) {
              wishlistArr.push({
                product_id: prod.id,
                name: prod.name,
                price: prod.price,
                image_url: prod.image_url
              });
            }
          }
          req.session.wishlist = wishlistArr;
          res.render('shop/wishlist', { 
            wishlist: wishlistArr, 
            user: req.session,
            title: 'My Wishlist - CultureFrame'
          });
        } catch (err) {
          console.error('[viewWishlist] Error loading from DB:', err);
          res.render('shop/wishlist', { 
            wishlist: req.session.wishlist || [], 
            user: req.session,
            title: 'My Wishlist - CultureFrame'
          });
        }
      } else {
        res.render('shop/wishlist', { 
          wishlist: req.session.wishlist || [], 
          user: req.session,
          title: 'My Wishlist - CultureFrame'
        });
      }
    } catch (err) {
      console.error('[viewWishlist] Error:', err);
      res.render('shop/wishlist', { 
        wishlist: [], 
        user: req.session,
        error: 'Error loading wishlist',
        title: 'My Wishlist - CultureFrame'
      });
    }
  }
};

export { cartController };
