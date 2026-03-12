// routes/auth.js
// This file handles user authentication routes (signup, login, logout, etc.)

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

/**
 * POST /api/auth/signup
 * Register a new user
 * 
 * Request body:
 * {
 *   "name": "John Doe",
 *   "email": "john@example.com",
 *   "password": "password123"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "token": "eyJhbGci...",
 *   "user": { ... }
 * }
 */
router.post('/signup',
  // Validation middleware
  [
    body('name')
      .trim()
      .isLength({ min: 2 })
      .withMessage('Name must be at least 2 characters'),
    
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email'),
    
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters')
      .matches(/\d/)
      .withMessage('Password must contain at least one number')
  ],
  async (req, res) => {
    try {
      // 1. Check for validation errors
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map(err => ({
            field: err.param,
            message: err.msg
          }))
        });
      }
      
      const { name, email, password } = req.body;
      
      // 2. Check if user already exists
      const existingUser = await User.findOne({ email });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Email already registered'
        });
      }
      
      // 3. Create new user
      const user = new User({
        name,
        email,
        password,  // Will be hashed by User model's pre-save middleware
        tier: 'free',
        messageCount: 0
      });
      
      await user.save();
      
      // 4. Generate authentication token
      const token = user.generateAuthToken();
      
      // 5. Return success response
      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          dailyLimit: user.dailyLimit,
          messageCount: user.messageCount
        }
      });
      
      console.log(`✅ New user registered: ${email}`);
      
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create account. Please try again.'
      });
    }
  }
);

/**
 * POST /api/auth/login
 * Login existing user
 * 
 * Request body:
 * {
 *   "email": "john@example.com",
 *   "password": "password123"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "token": "eyJhbGci...",
 *   "user": { ... }
 * }
 */
router.post('/login',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      // 1. Check validation errors
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map(err => ({
            field: err.param,
            message: err.msg
          }))
        });
      }
      
      const { email, password } = req.body;
      
      // 2. Find user and verify password
      const user = await User.findByCredentials(email, password);
      
      // 3. Generate new token
      const token = user.generateAuthToken();
      
      // 4. Check message usage for today
      const today = new Date().toDateString();
      const lastDate = user.lastMessageDate ? user.lastMessageDate.toDateString() : null;
      
      if (today !== lastDate) {
        // Reset counter for new day
        user.messageCount = 0;
        user.lastMessageDate = new Date();
        await user.save();
      }
      
      // 5. Return success response
      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          tier: user.tier,
          dailyLimit: user.dailyLimit,
          messageCount: user.messageCount,
          messagesRemaining: user.dailyLimit - user.messageCount
        }
      });
      
      console.log(`✅ User logged in: ${email}`);
      
    } catch (error) {
      console.error('Login error:', error);
      
      // Don't reveal whether email or password was wrong (security)
      res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
  }
);

/**
 * POST /api/auth/logout
 * Logout current user
 * (With JWT, logout is mainly handled client-side by removing token)
 * This endpoint is optional but can be used for logging or token invalidation
 * 
 * Requires: Authentication
 */
router.post('/logout', auth, async (req, res) => {
  try {
    // Optional: Implement token blacklist here if needed
    // For now, client will simply remove token from localStorage
    
    console.log(`✅ User logged out: ${req.user.email}`);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 * 
 * Requires: Authentication
 * 
 * Response:
 * {
 *   "success": true,
 *   "user": { ... }
 * }
 */
router.get('/me', auth, async (req, res) => {
  try {
    const user = req.user;
    
    // Check if it's a new day (reset counter)
    const today = new Date().toDateString();
    const lastDate = user.lastMessageDate ? user.lastMessageDate.toDateString() : null;
    
    if (today !== lastDate) {
      user.messageCount = 0;
      user.lastMessageDate = new Date();
      await user.save();
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        tier: user.tier,
        dailyLimit: user.dailyLimit,
        messageCount: user.messageCount,
        messagesRemaining: user.dailyLimit - user.messageCount,
        createdAt: user.createdAt
      }
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile'
    });
  }
});

/**
 * PUT /api/auth/me
 * Update current user profile
 * 
 * Requires: Authentication
 * 
 * Request body:
 * {
 *   "name": "New Name"
 * }
 */
router.put('/me', auth,
  [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage('Name must be at least 2 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const user = req.user;
      const { name } = req.body;
      
      // Update allowed fields
      if (name) user.name = name;
      
      await user.save();
      
      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          tier: user.tier
        }
      });
      
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }
  }
);

/**
 * POST /api/auth/change-password
 * Change user password
 * 
 * Requires: Authentication
 * 
 * Request body:
 * {
 *   "currentPassword": "oldpass123",
 *   "newPassword": "newpass123"
 * }
 */
router.post('/change-password', auth,
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters')
      .matches(/\d/)
      .withMessage('New password must contain at least one number')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const user = req.user;
      const { currentPassword, newPassword } = req.body;
      
      // Verify current password
      const isMatch = await user.comparePassword(currentPassword);
      
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }
      
      // Update password (will be hashed by pre-save middleware)
      user.password = newPassword;
      await user.save();
      
      // Generate new token
      const token = user.generateAuthToken();
      
      res.json({
        success: true,
        message: 'Password changed successfully',
        token  // New token since password changed
      });
      
      console.log(`✅ Password changed for user: ${user.email}`);
      
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to change password'
      });
    }
  }
);

/**
 * GET /api/auth/usage
 * Get current usage statistics
 * 
 * Requires: Authentication
 */
router.get('/usage', auth, async (req, res) => {
  try {
    const user = req.user;
    
    // Check if it's a new day
    const today = new Date().toDateString();
    const lastDate = user.lastMessageDate ? user.lastMessageDate.toDateString() : null;
    
    let messageCount = user.messageCount;
    
    if (today !== lastDate) {
      messageCount = 0;
    }
    
    res.json({
      success: true,
      usage: {
        tier: user.tier,
        dailyLimit: user.dailyLimit,
        messagesUsed: messageCount,
        messagesRemaining: user.dailyLimit - messageCount,
        resetTime: '00:00 UTC',  // Messages reset at midnight
        percentage: ((messageCount / user.dailyLimit) * 100).toFixed(1)
      }
    });
    
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get usage'
    });
  }
});

module.exports = router;
