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
import { DataTypes, Op } from "sequelize";
import { sequelize } from "./db.js";
import bcrypt from "bcrypt";

export const User = sequelize.define("User", {
  name: { 
    type: DataTypes.STRING, 
    allowNull: false,
    validate: {
      notEmpty: {
        msg: "Name is required"
      },
      len: {
        args: [2, 100],
        msg: "Name must be between 2 and 100 characters"
      }
    }
  },
  email: { 
    type: DataTypes.STRING, 
    allowNull: false,
    unique: {
      name: 'unique_email',
      msg: 'Email already registered'
    },
    validate: {
      isEmail: {
        msg: "Please provide a valid email address"
      },
      notEmpty: {
        msg: "Email is required"
      }
    }
  },
  password: { 
    type: DataTypes.STRING, 
    allowNull: false,
    validate: {
      notEmpty: {
        msg: "Password is required"
      },
      len: {
        args: [8, 100],
        msg: "Password must be at least 8 characters long"
      }
    }
  },
  role: {
    type: DataTypes.ENUM('customer', 'admin'),
    defaultValue: 'customer',
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    allowNull: false
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  profileImage: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

// Instance method to check password
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to get public profile (without password)
User.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password;
  return values;
};

// Static method for login
User.login = async function(email, password) {
  try {
    const user = await this.findOne({
      where: {
        email: email.toLowerCase(),
        status: 'active'
      }
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await user.update({ lastLogin: new Date() });

    return user;
  } catch (error) {
    throw error;
  }
};

// Static method for registration
User.register = async function(userData) {
  try {
    const { name, email, password, phone, address } = userData;
    
    // Check if user already exists
    const existingUser = await this.findOne({
      where: {
        email: email.toLowerCase()
      }
    });

    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Create new user
    const user = await this.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      phone: phone || null,
      address: address || null
    });

    return user;
  } catch (error) {
    throw error;
  }
};

export { sequelize, Op };