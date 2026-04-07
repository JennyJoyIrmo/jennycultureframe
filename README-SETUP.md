# 🌿 CultureFrame Mansalay - Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Database

#### Option A: Sync Models (Safe - Keeps existing data)
```bash
npm run sync
```

#### Option B: Fresh Migration (⚠️ Deletes all data)
```bash
npm run migrate
```

### 3. Start Server
```bash
npm run xian
```

Server will run at: http://localhost:3000

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run xian` | Start server with auto-reload (development) |
| `npm run xian-start` | Start server (production) |
| `npm run sync` | Create/update database tables (safe) |
| `npm run migrate` | Reset database (⚠️ deletes data) |
| `npm create:model` | Create new model |
| `npm create:controller` | Create new controller |

## Default Accounts

### Admin Account
- Email: `admin@cultureframe.com`
- Password: `admin123`

### Test Customer Account
Create via registration at: http://localhost:3000/register

## Project Structure

```
darling/
├── controllers/        # Business logic
├── models/            # Database models
├── routes/            # API routes
├── views/             # Frontend templates (.xian files)
│   ├── admin/         # Admin pages
│   ├── customer/      # Customer pages
│   ├── events/        # Events pages
│   ├── heritage/      # Heritage pages
│   ├── shop/          # Shop pages
│   └── partials/      # Reusable components
├── public/            # Static files
│   └── uploads/       # User uploaded images
├── index.js           # Main server file
├── migrate.js         # Database migration
└── sync-models.js     # Safe table sync
```

## Features

### Public Features
- 🏛️ Heritage Sites Explorer
- 📅 Events & Festivals
- 🖼️ Scenic Spots Gallery
- 🎨 Arts & Crafts Showcase
- 🛍️ Local Products Shop

### Customer Features
- 👤 User Profile Management
- 📸 Photo/Moment Posting
- 🛒 Shopping Cart
- ❤️ Wishlist
- 📦 Order Tracking
- 🎫 Event Registration

### Admin Features
- 📊 Dashboard with Statistics
- 🏛️ Heritage Management
- 📅 Event Management
- 🛍️ Product Management
- 📦 Order Management
- 🖼️ Scenic Spots Management
- 🎨 Crafts Management

## Tech Stack

- **Backend:** Node.js + Express.js
- **Database:** MySQL + Sequelize ORM
- **Frontend:** Handlebars (.xian templates)
- **Styling:** Tailwind CSS
- **File Upload:** Multer
- **Session:** Express-session

## Troubleshooting

### "Failed to create moment" Error
Run: `npm run sync` to create missing tables

### Database Connection Error
1. Check MySQL is running
2. Verify credentials in `models/db.js`
3. Ensure database 'darling' exists

### Port Already in Use
Change port in `index.js`:
```javascript
const PORT = process.env.PORT || 3000;
```

### Upload Folder Missing
Create manually:
```bash
mkdir public/uploads
```

## Development Tips

### Watch for Changes
```bash
npm run xian
```
Server auto-restarts on file changes

### Check Logs
Look for these in console:
- ✅ Success messages
- ❌ Error messages
- 🔥 Server running message

### Database Changes
After modifying models, run:
```bash
npm run sync
```

## Support

For issues or questions:
1. Check console logs
2. Review error messages
3. Check database connection
4. Verify all tables exist

---

**Framework:** XianFire
**Developer:** Christian I. Cabrera
**Institution:** Mindoro State University - Philippines
**License:** MIT
