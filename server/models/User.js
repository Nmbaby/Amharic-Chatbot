// models/User.js
// This file defines the structure of user data in MongoDB

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Define the User Schema (blueprint for user data)
const userSchema = new mongoose.Schema({
  // Email field
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,           // No two users can have same email
    lowercase: true,        // Convert to lowercase automatically
    trim: true,            // Remove whitespace
    match: [              // Validate email format
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email'
    ]
  },
  
  // Password field (will be hashed before saving)
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  
  // User's full name
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  
  // Subscription tier (free, premium, admin)
  tier: {
    type: String,
    enum: ['free', 'premium', 'admin'],  // Only these values allowed
    default: 'free'
  },
  
  // Number of messages sent today
  messageCount: {
    type: Number,
    default: 0
  },
  
  // Date of last message (for daily limit reset)
  lastMessageDate: {
    type: Date,
    default: null
  },
  
  // Daily message limit based on tier
  dailyLimit: {
    type: Number,
    default: function() {
      // Set limit based on tier
      switch(this.tier) {
        case 'free': return 10;
        case 'premium': return 1000;  // Essentially unlimited
        case 'admin': return 10000;
        default: return 10;
      }
    }
  },
  
  // Refresh tokens for enhanced security (optional)
  refreshTokens: [{
    token: {
      type: String,
      required: true
    }
  }]
  
}, {
  timestamps: true  // Automatically add createdAt and updatedAt fields
});

// ==========================================
// MIDDLEWARE: Runs before saving user
// ==========================================

// Hash password before saving to database
userSchema.pre('save', async function(next) {
  const user = this;
  
  // Only hash if password is new or modified
  if (!user.isModified('password')) {
    return next();
  }
  
  try {
    // Generate salt (random data added to password)
    const salt = await bcrypt.genSalt(10);
    
    // Hash password with salt
    user.password = await bcrypt.hash(user.password, salt);
    
    next();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// INSTANCE METHODS: Functions called on user objects
// ==========================================

// Compare password for login
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    // bcrypt compares plain password with hashed password
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    return isMatch;
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Generate JWT authentication token
userSchema.methods.generateAuthToken = function() {
  const user = this;
  
  // Create token with user info
  const token = jwt.sign(
    { 
      userId: user._id.toString(),
      email: user.email,
      tier: user.tier
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRE || '7d'  // Default 7 days
    }
  );
  
  return token;
};

// Get public user profile (without sensitive data)
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  
  // Remove sensitive fields
  delete user.password;
  delete user.refreshTokens;
  delete user.__v;
  
  return user;
};

// Check if user can send a message (for rate limiting)
userSchema.methods.canSendMessage = function() {
  const user = this;
  
  // Admin users have unlimited messages
  if (user.tier === 'admin') {
    return { allowed: true };
  }
  
  // Check if it's a new day
  const today = new Date().toDateString();
  const lastDate = user.lastMessageDate ? user.lastMessageDate.toDateString() : null;
  
  // Reset counter if new day
  if (today !== lastDate) {
    user.messageCount = 0;
    user.lastMessageDate = new Date();
  }
  
  // Check against limit
  if (user.messageCount >= user.dailyLimit) {
    return { 
      allowed: false, 
      reason: 'Daily limit reached',
      limit: user.dailyLimit,
      used: user.messageCount
    };
  }
  
  return { allowed: true };
};

// Increment message counter
userSchema.methods.incrementMessageCount = async function() {
  const user = this;
  
  // Check if it's a new day first
  const today = new Date().toDateString();
  const lastDate = user.lastMessageDate ? user.lastMessageDate.toDateString() : null;
  
  if (today !== lastDate) {
    user.messageCount = 0;
    user.lastMessageDate = new Date();
  }
  
  user.messageCount += 1;
  await user.save();
  
  return user;
};

// ==========================================
// STATIC METHODS: Functions called on User model
// ==========================================

// Find user by credentials (for login)
userSchema.statics.findByCredentials = async function(email, password) {
  const User = this;
  
  // Find user by email
  const user = await User.findOne({ email });
  
  if (!user) {
    throw new Error('Invalid login credentials');
  }
  
  // Check password
  const isPasswordMatch = await user.comparePassword(password);
  
  if (!isPasswordMatch) {
    throw new Error('Invalid login credentials');
  }
  
  return user;
};

// Create and export the model
const User = mongoose.model('User', userSchema);

module.exports = User;
