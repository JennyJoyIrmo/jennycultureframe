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
    
import express from "express";
import path from "path";
import session from "express-session";
import flash from "connect-flash";
import router from "./routes/index.js";
import fs from 'fs';
import hbs from "hbs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

app.use(session({
  secret: process.env.SESSION_SECRET || "xianfire-secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  name: 'sessionId' // Custom session name
}));
app.use(flash());

app.engine("xian", async (filePath, options, callback) => {
  try {
    // Re-register partials fresh on every render to ensure user context is correct
    const partialsPath = path.join(__dirname, 'views/partials');
    try {
      const partialFiles = fs.readdirSync(partialsPath).filter(f => f.endsWith('.xian'));
      for (const file of partialFiles) {
        const name = file.replace('.xian', '');
        const content = fs.readFileSync(path.join(partialsPath, file), 'utf8');
        hbs.registerPartial(name, content);
      }
    } catch(e) {}

    // Merge res.locals into options so partials can access isLoggedIn etc.
    const locals = app.locals._currentLocals || {};
    const mergedOptions = Object.assign({}, locals, options);

    const result = await new Promise((resolve, reject) => {
      hbs.__express(filePath, mergedOptions, (err, html) => {
        if (err) return reject(err);
        resolve(html);
      });
    });

    callback(null, result);
  } catch (err) {
    callback(err);
  }
});
// Register small helpers used by templates
hbs.registerHelper('eq', (a, b) => a == b);
hbs.registerHelper('neq', (a, b) => a != b);
// Backwards-compatible helper used in templates
hbs.registerHelper('ifEquals', function(a, b, options) {
  if (a == b) return options.fn(this);
  return options.inverse(this);
});
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  next();
});

// Make session user and counts available to all templates
app.use((req, res, next) => {
  // Ensure session exists and cart/wishlist arrays exist on session
  if (!req.session) req.session = {};
  if (!Array.isArray(req.session.cart)) req.session.cart = [];
  if (!Array.isArray(req.session.wishlist)) req.session.wishlist = [];

  // Handle authentication status properly - ensure it's always a boolean
  const isAuthenticated = !!(req.session && req.session.isAuthenticated);
  
  const sessionUser = req.session.user || {};
  res.locals.user = Object.assign({
    isAuthenticated: isAuthenticated,
    name: req.session.userName || '',
    id: req.session.userId || null,
    email: req.session.userEmail || '',
    role: req.session.userRole || 'customer'
  }, sessionUser, {
    cart: req.session.cart,
    wishlist: req.session.wishlist,
    isAuthenticated: isAuthenticated  // always override with session value
  });

  // Top-level auth flag that cannot be overridden by controllers
  res.locals.isLoggedIn = isAuthenticated;
  res.locals.sessionUserName = req.session.userName || '';
  res.locals.sessionUserRole = req.session.userRole || 'customer';

  // Use cached counts from session (updated by cart/wishlist controllers)
  // This is MUCH faster than querying DB on every request
  res.locals.cartCount = req.session.cartCount || req.session.cart.length;
  res.locals.wishlistCount = req.session.wishlistCount || req.session.wishlist.length;

  // Use session flash-like fields if set (controllers sometimes set these on session)
  res.locals.error_msg = req.session.error_msg || req.flash('error_msg') || res.locals.error_msg;
  res.locals.success_msg = req.session.success_msg || req.flash('success_msg') || res.locals.success_msg;

  // Store locals reference so engine can access them
  if (!app.locals._req) app.locals._req = {};
  app.locals._currentLocals = res.locals;

  // Debug logging
  console.log('🔍 Middleware - Session exists:', !!req.session);
  console.log('🔍 Middleware - isAuthenticated:', isAuthenticated);
  console.log('🔍 Middleware - User object:', {
    isAuthenticated: res.locals.user.isAuthenticated,
    name: res.locals.user.name,
    role: res.locals.user.role
  });

  next();
});

// Clear session flash-like messages after they are exposed to templates
app.use((req, res, next) => {
  if (req.session) {
    req.session.error_msg = null;
    req.session.success_msg = null;
  }
  next();
});


app.set("views", path.join(__dirname, "views"));
app.set("view engine", "xian");
app.set("view cache", false);
const partialsDir = path.join(__dirname, "views/partials");

// Re-register partials on every request so changes are picked up
app.use((req, res, next) => {
  try {
    const files = fs.readdirSync(partialsDir);
    files
      .filter(file => file.endsWith('.xian'))
      .forEach(file => {
        const partialName = file.replace('.xian', '');
        const fullPath = path.join(partialsDir, file);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          hbs.registerPartial(partialName, content);
        } catch (err) {
          console.error(`❌ Failed to read partial: ${file}`, err);
        }
      });
  } catch (err) {
    console.error("❌ Could not read partials directory:", err);
  }
  next();
});

app.use("/", router);

export default app;

if (!process.env.ELECTRON) {
  const server = app.listen(PORT, () => console.log(`🔥 XianFire running at http://localhost:${PORT}`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${PORT} is in use. Trying port ${PORT + 1}...`);
      app.listen(PORT + 1, () => console.log(`🔥 XianFire running at http://localhost:${PORT + 1}`));
    } else {
      console.error('❌ Server error:', err);
    }
  });
}
