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

import bcrypt from "bcrypt";
import { User, sequelize } from "../models/userModel.js";
import { CartItem } from "../models/CartItem.js";
import { WishlistItem } from "../models/WishlistItem.js";
import { Product } from "../models/Product.js";

// ==================== INITIALIZATION ====================

const initializeAuth = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
    
    await sequelize.sync({ force: false });
    console.log('✅ Database synced successfully');
    
    // ==================== DEFAULT ADMIN CREATION ====================
    const adminExists = await User.findOne({ where: { role: 'admin' } });
    if (!adminExists) {
      // Create admin with raw password; model hook will hash it
      await User.create({
        name: 'System Administrator',
        email: 'admin@cultureframe.com',
        password: 'admin123',
        role: 'admin'
      });
      console.log('✅ Default admin account created');
      console.log('📧 Email: admin@cultureframe.com');
      console.log('🔑 Password: admin123');
      console.log('🎯 Role: Administrator');
    } else {
      console.log('ℹ️  Admin account already exists');
      // Reset admin password via instance update so model hook hashes it
      const adminUser = await User.findOne({ where: { email: 'admin@cultureframe.com' } });
      if (adminUser) {
        await adminUser.update({ password: 'admin123' });
        console.log('🔄 Admin password reset to: admin123');
      } else {
        console.log('❌ Admin user lookup failed during reset');
      }
    }
    // ==================== END DEFAULT ADMIN CREATION ====================
    
  } catch (error) {
    console.error('❌ Auth initialization error:', error.message);
  }
};

// Initialize auth system on startup
initializeAuth();

// ==================== VALIDATION HELPERS ====================

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password.length >= 8;
};

const clearSessionMessages = (req) => {
  req.session.error_msg = null;
  req.session.success_msg = null;
};

const setSession = async (req, user) => {
  req.session.userId = user.id;
  req.session.userRole = user.role;
  req.session.userName = user.name;
  req.session.userEmail = user.email;
  req.session.isAuthenticated = true;

  // Ensure session has unified `user` object for templates (backwards-compatible)
  if (!req.session.cart) req.session.cart = [];
  if (!req.session.wishlist) req.session.wishlist = [];

  // If user has persisted cart/wishlist in DB, load them into session
  try {
    if (user && user.id) {
      const uid = Number(user.id);
      // Merge persisted cart/wishlist with any guest session cart/wishlist
      const sessionCart = Array.isArray(req.session.cart) ? req.session.cart.slice() : [];
      const sessionWishlist = Array.isArray(req.session.wishlist) ? req.session.wishlist.slice() : [];

      // Load cart items from DB and resolve product details
      const cartRows = await CartItem.findAll({ where: { user_id: uid } });
      const dbCartMap = new Map();
      for (const row of cartRows) {
        const prod = await Product.findByPk(row.product_id);
        if (prod) {
          dbCartMap.set(prod.id, { product_id: prod.id, name: prod.name, price: prod.price, quantity: row.quantity });
        }
      }

      // Merge session cart into DB cart (sum quantities)
      for (const item of sessionCart) {
        const pid = Number(item.product_id);
        const existing = dbCartMap.get(pid);
        if (existing) {
          existing.quantity = Number(existing.quantity) + Number(item.quantity || 0);
        } else {
          dbCartMap.set(pid, { product_id: pid, name: item.name || '', price: item.price || 0, quantity: Number(item.quantity || 0) });
        }
      }

      const mergedCart = Array.from(dbCartMap.values());
      req.session.cart = mergedCart;

      // Persist merged cart back to DB (upsert)
      for (const item of mergedCart) {
        try {
          const existingDb = await CartItem.findOne({ where: { user_id: uid, product_id: item.product_id } });
          if (existingDb) {
            existingDb.quantity = Number(item.quantity || 0);
            await existingDb.save();
          } else {
            await CartItem.create({ user_id: uid, product_id: item.product_id, quantity: Number(item.quantity || 0) });
          }
        } catch (err) {
          console.warn('CartItem persist error during session merge', err);
        }
      }

      // Load wishlist items from DB
      const wishRows = await WishlistItem.findAll({ where: { user_id: uid } });
      const dbWishSet = new Set();
      for (const row of wishRows) {
        dbWishSet.add(Number(row.product_id));
      }

      // Merge session wishlist (union)
      for (const item of sessionWishlist) {
        dbWishSet.add(Number(item.product_id));
      }

      const mergedWishlist = [];
      for (const pid of dbWishSet) {
        try {
          const prod = await Product.findByPk(pid);
          if (prod) mergedWishlist.push({ product_id: prod.id, name: prod.name, price: prod.price });
        } catch (err) {
          console.warn('Wishlist merge product lookup error', err);
        }
      }

      req.session.wishlist = mergedWishlist;

      // Persist merged wishlist back to DB (ensure entries exist)
      for (const item of mergedWishlist) {
        try {
          const existingDb = await WishlistItem.findOne({ where: { user_id: uid, product_id: item.product_id } });
          if (!existingDb) {
            await WishlistItem.create({ user_id: uid, product_id: item.product_id });
          }
        } catch (err) {
          console.warn('WishlistItem persist error during session merge', err);
        }
      }
    }
  } catch (err) {
    console.warn('Error loading persisted cart/wishlist for session:', err);
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isAuthenticated: true,
    cart: req.session.cart,
    wishlist: req.session.wishlist
  };

  // Cache cart/wishlist counts in session for fast access
  try {
    if (user && user.id) {
      req.session.cartCount = await CartItem.count({ where: { user_id: user.id } });
      req.session.wishlistCount = await WishlistItem.count({ where: { user_id: user.id } });
    } else {
      req.session.cartCount = req.session.cart.length;
      req.session.wishlistCount = req.session.wishlist.length;
    }
  } catch (err) {
    req.session.cartCount = req.session.cart.length;
    req.session.wishlistCount = req.session.wishlist.length;
  }
};

// ==================== PAGE RENDERING ====================

export const loginPage = (req, res) => {
  console.log('🔑 Login page accessed');
  console.log('🔐 Is authenticated:', req.session.isAuthenticated);
  
  if (req.session.isAuthenticated) {
    console.log('✅ Already authenticated, redirecting to dashboard');
    return res.redirect('/dashboard');
  }
  
  console.log('📄 Rendering login page');
  res.render("login", { 
    title: "Login - CultureFrame",
    error_msg: req.session.error_msg,
    success_msg: req.session.success_msg,
    formData: req.session.formData || {}
  });
};

export const registerPage = (req, res) => {
  // Allow admins to access the register page to create new users while logged in.
  if (req.session.isAuthenticated && req.session.userRole !== 'admin') {
    return res.redirect('/dashboard');
  }
  
  res.render("register", { 
    title: "Register - CultureFrame",
    error_msg: req.session.error_msg,
    success_msg: req.session.success_msg,
    formData: req.session.formData || {}
  });
};

export const forgotPasswordPage = (req, res) => {
  res.render("forgotpassword", { 
    title: "Forgot Password - CultureFrame",
    error_msg: req.session.error_msg,
    success_msg: req.session.success_msg
  });
};

// ==================== DASHBOARD ROUTES ====================

export const dashboardPage = (req, res) => {
  console.log('🎯 Dashboard page accessed');
  console.log('🔐 Is authenticated:', req.session.isAuthenticated);
  console.log('👤 User role:', req.session.userRole);
  
  if (!req.session.isAuthenticated) {
    console.log('❌ Not authenticated, redirecting to login');
    return res.redirect("/login");
  }
  
  // Redirect based on user role
  if (req.session.userRole === 'admin') {
    console.log('📍 Redirecting admin to admin dashboard');
    return res.redirect("/admin/dashboard");
  } else {
    console.log('📍 Redirecting customer to customer dashboard');
    return res.redirect("/customer/dashboard");
  }
};

// Customer Dashboard
export const customerDashboard = async (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.redirect('/login');
  }
  
  try {
    // Always get cart/wishlist from DB for accurate count
    let cartCount = 0;
    let wishlistCount = 0;
    let orderCount = 0;
    let serverUserData = { cart: [], wishlist: [], orders: [] };
    const { CartItem } = await import('../models/CartItem.js');
    const { WishlistItem } = await import('../models/WishlistItem.js');
    if (req.session.user && req.session.user.id) {
      cartCount = await CartItem.count({ where: { user_id: req.session.user.id } });
      wishlistCount = await WishlistItem.count({ where: { user_id: req.session.user.id } });
      // Optionally, load cart/wishlist items for display
      serverUserData.cart = await CartItem.findAll({ where: { user_id: req.session.user.id } });
      serverUserData.wishlist = await WishlistItem.findAll({ where: { user_id: req.session.user.id } });
    }
    try {
      const { Order } = await import('../models/Order.js');
      if (req.session.userEmail) {
        orderCount = await Order.count({ where: { customer_email: req.session.userEmail } });
        try {
          const recentOrders = await Order.findAll({ where: { customer_email: req.session.userEmail }, order: [['createdAt','DESC']], limit: 5 });
          serverUserData.orders = recentOrders.map(o => ({ id: o.id, total_amount: o.total_amount, status: o.status, createdAt: o.createdAt }));
        } catch (err) {
          console.warn('Could not load recent orders for dashboard preview:', err.message);
          serverUserData.orders = [];
        }
      }
    } catch (err) {
      console.log('Could not compute order count for dashboard:', err.message);
      orderCount = 0;
    }
    // Fetch user to get profileImage
    const dbUser = await User.findOne({ where: { id: req.session.userId } });
    res.render("customer/dashboard", {
      title: "My Dashboard - CultureFrame",
      user: {
        id: req.session.userId,
        name: req.session.userName,
        email: req.session.userEmail,
        role: req.session.userRole,
        profileImage: dbUser && dbUser.profileImage ? dbUser.profileImage : null
      },
      serverUserDataJSON: JSON.stringify(serverUserData),
      serverUserData,
      cartCount,
      wishlistCount,
      orderCount
    });
  } catch (error) {
    console.error('💥 Customer dashboard error:', error);
    req.session.error_msg = "Error loading dashboard";
    res.redirect('/login');
  }
};

// Admin Dashboard
export const adminDashboard = async (req, res) => {
  if (!req.session.isAuthenticated || req.session.userRole !== 'admin') {
    return res.redirect('/login');
  }
  
  try {
    let heritageCount = 0, productCount = 0, orderCount = 0, eventCount = 0;
    
    try {
      const { Heritage } = await import('../models/Heritage.js');
      heritageCount = await Heritage.count();
    } catch (error) {
      console.log('ℹ️  Heritage model not available');
    }
    
    try {
      const { Product } = await import('../models/Product.js');
      productCount = await Product.count();
    } catch (error) {
      console.log('ℹ️  Product model not available');
    }
    
    try {
      const { Order } = await import('../models/Order.js');
      orderCount = await Order.count();
    } catch (error) {
      console.log('ℹ️  Order model not available');
    }
    
    try {
      const { Event } = await import('../models/Event.js');
      eventCount = await Event.count();
    } catch (error) {
      console.log('ℹ️  Event model not available');
    }
    
    res.render("admin/dashboard", {
      title: "Admin Dashboard - CultureFrame",
      user: req.session,
      heritageCount,
      productCount, 
      orderCount,
      eventCount
    });
  } catch (error) {
    console.error('💥 Admin dashboard error:', error);
    res.render("admin/dashboard", {
      title: "Admin Dashboard - CultureFrame",
      user: req.session,
      heritageCount: 0,
      productCount: 0,
      orderCount: 0,
      eventCount: 0
    });
  }
};

// ==================== AUTHENTICATION ====================

export const loginUser = async (req, res) => {
  try {
    const { email, password, remember } = req.body;
    
    console.log('🔄 Login attempt for:', email);
    console.log('🔐 Raw password input:', `"${password}"`);
    console.log('🔐 Password length:', password?.length);
    
    clearSessionMessages(req);
    
    // Store form data for persistence
    req.session.formData = { email };
    
    // Validation
    if (!email?.trim() || !password?.trim()) {
      console.log('❌ Missing email or password');
      req.session.error_msg = "Please fill in all fields";
      return res.redirect('/login');
    }
    
    if (!validateEmail(email)) {
      console.log('❌ Invalid email format');
      req.session.error_msg = "Please enter a valid email address";
      return res.redirect('/login');
    }
    
    // Find user - CASE INSENSITIVE and trim whitespace
    const normalizedEmail = email.trim().toLowerCase();
    console.log('🔍 Searching for user with normalized email:', normalizedEmail);
    
    const user = await User.findOne({ 
      where: { 
        email: normalizedEmail 
      } 
    });
    
    if (!user) {
      console.log('❌ User not found:', normalizedEmail);
      req.session.error_msg = "Invalid email or password";
      return res.redirect('/login');
    }
    
    console.log('✅ User found:', user.name, 'Role:', user.role);
    console.log('📧 Stored email in DB:', user.email);
    console.log('🔐 Stored password hash:', user.password?.substring(0, 20) + '...');
    console.log('🔐 Stored hash length:', user.password?.length);
    
    // ⭐⭐⭐ ENHANCED PASSWORD DEBUGGING ⭐⭐⭐
    console.log('🔐 Starting password comparison...');
    
    // Test 1: Direct comparison
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('🔐 Direct comparison result:', isPasswordValid);
    
    // Test 2: Check if password might have extra spaces
    const trimmedPassword = password.trim();
    const isTrimmedValid = await bcrypt.compare(trimmedPassword, user.password);
    console.log('🔐 Trimmed password comparison:', isTrimmedValid);
    
    // Test 3: Test with common passwords for debugging
    if (!isPasswordValid && !isTrimmedValid) {
      console.log('🔐 Testing common passwords for debugging...');
      const commonPasswords = ['password', '12345678', 'admin123', 'password123'];
      
      for (let commonPwd of commonPasswords) {
        const testResult = await bcrypt.compare(commonPwd, user.password);
        console.log(`🔐 Testing "${commonPwd}":`, testResult);
        if (testResult) {
          console.log(`✅ Found matching password: "${commonPwd}"`);
          break;
        }
      }
    }
    
    // Final validation check
    const finalValid = isPasswordValid || isTrimmedValid;
    
    if (!finalValid) {
      console.log('❌ All password comparisons failed');
      console.log('🔍 Input password:', `"${password}"`);
      console.log('🔍 Trimmed password:', `"${trimmedPassword}"`);
      console.log('🔍 Hash prefix:', user.password?.substring(0, 10));
      
      // Check if this is an AJAX request (from modal)
      const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                     req.headers['accept']?.includes('application/json') ||
                     req.get('Accept')?.includes('application/json');
      
      if (isAjax) {
        return res.json({
          success: false,
          message: "Invalid email or password"
        });
      } else {
        req.session.error_msg = "Invalid email or password";
        return res.redirect('/login');
      }
    }
    
    // Set session (loads persisted cart/wishlist)
    await setSession(req, user);
    console.log('✅ Session created for:', user.name);
    console.log('🔐 Session isAuthenticated:', req.session.isAuthenticated);
    console.log('👤 Session userRole:', req.session.userRole);
    console.log('📧 Session userEmail:', req.session.userEmail);
    console.log('🆔 Session userId:', req.session.userId);
    
    if (remember) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }
    
    // Update last login
    await User.update(
      { lastLogin: new Date() },
      { where: { id: user.id } }
    );
    
    console.log(`🎉 Login successful: ${user.name} (${user.role})`);
    
    // Clear form data after successful login
    req.session.formData = null;
    
    // Check if this is an AJAX request (from modal)
    const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                   req.headers['accept']?.includes('application/json') ||
                   req.get('Accept')?.includes('application/json');
    
    // Determine redirect URL based on role
    const redirectUrl = user.role === 'admin' ? '/admin/dashboard' : '/customer/dashboard';
    
    if (isAjax) {
      console.log('📡 AJAX login request, returning JSON response');
      return res.json({
        success: true,
        message: `Welcome back, ${user.name}!`,
        redirectUrl: redirectUrl,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } else {
      // Regular form submission - redirect normally
      console.log('🌐 Regular form login, redirecting to dashboard');
      console.log('👤 User role:', user.role);
      console.log('📍 Redirect URL:', redirectUrl);
      console.log('🔐 Session after login:', {
        isAuthenticated: req.session.isAuthenticated,
        userRole: req.session.userRole,
        userId: req.session.userId,
        userEmail: req.session.userEmail
      });
      
      // Force redirect to appropriate dashboard
      console.log('🚀 Redirecting to:', redirectUrl);
      return res.redirect(redirectUrl);
    }
    
  } catch (error) {
    console.error('💥 Login error:', error);
    
    // Check if this is an AJAX request (from modal)
    const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                   req.headers['accept']?.includes('application/json') ||
                   req.get('Accept')?.includes('application/json');
    
    if (isAjax) {
      return res.json({
        success: false,
        message: "Server error. Please try again."
      });
    } else {
      req.session.error_msg = "Server error. Please try again.";
      return res.redirect('/login');
    }
  }
};

// Helper function to handle registration responses (AJAX or redirect)
const handleRegistrationError = (req, res, message) => {
  const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                 req.headers['accept']?.includes('application/json') ||
                 req.get('Accept')?.includes('application/json');
  
  if (isAjax) {
    return res.json({
      success: false,
      message: message
    });
  } else {
    req.session.error_msg = message;
    return res.redirect('/register');
  }
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, terms } = req.body;
    
    console.log('🔄 Registration attempt:');
    console.log('📝 Name:', name);
    console.log('📧 Email:', email);
    console.log('🔐 Raw password:', `"${password}"`);
    console.log('🔐 Confirm password:', `"${confirmPassword}"`);
    console.log('🔐 Password length:', password?.length);
    console.log('✅ Terms accepted:', terms);
    
    clearSessionMessages(req);
    
    req.session.formData = { name, email };
    
    // Validation
    if (!name?.trim() || !email?.trim() || !password || !confirmPassword) {
      console.log('❌ Missing required fields');
      return handleRegistrationError(req, res, "Please fill in all fields");
    }
    
    if (!validateEmail(email)) {
      console.log('❌ Invalid email format');
      return handleRegistrationError(req, res, "Please enter a valid email address");
    }
    
    if (!validatePassword(password)) {
      console.log('❌ Password too short');
      return handleRegistrationError(req, res, "Password must be at least 8 characters");
    }
    
    if (password !== confirmPassword) {
      console.log('❌ Passwords do not match');
      return handleRegistrationError(req, res, "Passwords do not match");
    }
    
    if (!terms) {
      console.log('❌ Terms not accepted');
      return handleRegistrationError(req, res, "Please agree to terms and conditions");
    }
    
    // Check for existing user - CASE INSENSITIVE
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ 
      where: { 
        email: normalizedEmail 
      } 
    });
    
    if (existingUser) {
      console.log('❌ Email already exists:', normalizedEmail);
      return handleRegistrationError(req, res, "Email already registered");
    }
    
    // Create user (password hashing handled by model hook)
    console.log('💾 Creating user in database...');
    const user = await User.create({ 
      name: name.trim(),
      email: normalizedEmail,
      password: password,
      role: 'customer'
    });
    
    console.log(`✅ New customer registered: ${user.name} (ID: ${user.id})`);
    console.log(`📧 Email saved as: ${user.email}`);
    console.log(`🔐 Password hash saved: ${user.password?.substring(0, 20)}...`);

    // Clear form data
    req.session.formData = null;

    // If an admin is creating a user while logged in, redirect back to admin dashboard
    if (req.session.isAuthenticated && req.session.userRole === 'admin') {
      req.session.success_msg = "User created successfully.";
      console.log('📍 Admin created new user, redirecting to admin dashboard');
      return res.redirect('/admin/dashboard');
    }

    // Normal flow: return JSON response for modal switching
    console.log('✅ Registration completed for:', user.name);
    console.log('📍 Sending success response to switch to login modal');
    
    // Check if this is an AJAX request (from modal)
    const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                   req.headers['accept']?.includes('application/json') ||
                   req.get('Accept')?.includes('application/json');
    
    if (isAjax) {
      console.log('📡 AJAX request detected, returning JSON response');
      // Return JSON for modal handling
      return res.json({
        success: true,
        message: "🎉 Account created successfully! Please login with your new credentials.",
        switchToLogin: true
      });
    } else {
      console.log('🌐 Regular request, redirecting to login page');
      // Redirect to login page with success message
      req.session.success_msg = "🎉 Account created successfully! Please login with your new credentials.";
      return res.redirect("/login");
    }
    
  } catch (error) {
    console.error('💥 Registration error:', error);
    return handleRegistrationError(req, res, "Registration failed. Please try again.");
  }
};

// ==================== PASSWORD MANAGEMENT ====================

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    clearSessionMessages(req);
    
    if (!email?.trim()) {
      req.session.error_msg = "Please enter your email address";
      return res.redirect('/forgot-password');
    }
    
    if (!validateEmail(email)) {
      req.session.error_msg = "Please enter a valid email address";
      return res.redirect('/forgot-password');
    }
    
    req.session.success_msg = "If your email is registered, you will receive a password reset link.";
    return res.redirect('/forgot-password');
    
  } catch (error) {
    console.error('💥 Forgot password error:', error);
    req.session.error_msg = "Server error. Please try again.";
    return res.redirect('/forgot-password');
  }
};

// ==================== LOGOUT ====================

export const logoutUser = (req, res) => {
  console.log('👋 User logging out:', req.session && req.session.userName);
  // Preserve userId for client-side localStorage cleanup
  const uid = req.session && req.session.userId ? req.session.userId : 'current-user';

  req.session.destroy((err) => {
    if (err) {
      console.error('💥 Logout error:', err);
      // Even if destroy fails, redirect to home
      return res.redirect('/');
    }
    // Render a tiny page that clears localStorage for this user and then redirects home
    return res.render('logout', { userId: uid });
  });
};

// ==================== MIDDLEWARE ====================

export const requireAuth = (req, res, next) => {
  if (!req.session.isAuthenticated) {
    // If AJAX request, return 401 JSON instead of redirect
    if (req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('accept') || '').includes('application/json')) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  next();
};

export const requireAdmin = (req, res, next) => {
  if (!req.session.isAuthenticated) {
    return res.redirect('/login');
  }
  
  if (req.session.userRole !== 'admin') {
    req.session.error_msg = "Access denied. Admin privileges required.";
    return res.redirect('/customer/dashboard');
  }
  
  next();
};

// ==================== ADMIN PASSWORD RESET ====================
export const resetAdminPassword = async () => {
  try {
    const adminUser = await User.findOne({ where: { email: 'admin@cultureframe.com' } });
    if (!adminUser) {
      console.log('❌ Admin account not found');
      return false;
    }

    await adminUser.update({ password: 'admin123' });
    console.log('✅ Admin password reset successfully');
    console.log('📧 Email: admin@cultureframe.com');
    console.log('🔑 New Password: admin123');
    return true;
  } catch (error) {
    console.error('❌ Error resetting admin password:', error);
    return false;
  }
};

// Manual emergency password reset function
export const emergencyPasswordReset = async (email, newPassword) => {
  try {
    const user = await User.findOne({ where: { email: email } });
    if (!user) {
      console.log(`❌ User ${email} not found`);
      return false;
    }

    await user.update({ password: newPassword });
    console.log(`✅ Emergency password reset for ${email}`);
    console.log(`🔑 New Password: ${newPassword}`);
    return true;
  } catch (error) {
    console.error('❌ Emergency reset error:', error);
    return false;
  }
};

// ==================== CUSTOMER PROFILE EDIT ====================
export const renderCustomerProfileEdit = async (req, res) => {
  if (!req.session.isAuthenticated) return res.redirect('/login');
  try {
    const user = await User.findOne({ where: { id: req.session.userId } });
    if (!user) {
      req.session.error_msg = 'User not found.';
      return res.redirect('/customer/dashboard');
    }
    res.render('customer/profile-edit', {
      title: 'Edit Profile',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage
      }
    });
  } catch (err) {
    req.session.error_msg = 'Error loading profile.';
    res.redirect('/customer/dashboard');
  }
};

export const handleCustomerProfileEdit = async (req, res) => {
  if (!req.session.isAuthenticated) return res.redirect('/login');
  try {
    const { name, email, password } = req.body;
    const user = await User.findOne({ where: { id: req.session.userId } });
    if (!user) {
      req.session.error_msg = 'User not found.';
      return res.redirect('/customer/dashboard');
    }
    user.name = name;
    user.email = email;
    if (password && password.trim().length > 0) {
      user.password = password;
    }
    // Handle profile image upload
    if (req.file && req.file.filename) {
      user.profileImage = req.file.filename;
    }
    await user.save();
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.success_msg = 'Profile updated successfully!';
    res.redirect('/customer/dashboard');
  } catch (err) {
    req.session.error_msg = 'Error updating profile.';
    res.redirect('/customer/profile/edit');
  }
};