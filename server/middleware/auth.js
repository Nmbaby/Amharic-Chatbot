// middleware/auth.js
// This middleware protects routes by verifying JWT tokens

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/** 
 * Authentication Middleware
 * 
 * How it works:
 * 1. Extract JWT token from request header
 * 2. Verify token is valid and not expired
 * 3. Find user in database
 * 4. Attach user to request object
 * 5. Continue to next middleware/route
 * 
 * Usage:
 * router.get('/protected-route', auth, (req, res) => {
 *   // req.user contains authenticated user
 * });
 */
const auth = async (req, res, next) => {
  try {
    // 1. Get token from Authorization header
    // Header format: "Authorization: Bearer eyJhbGci..."
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      throw new Error('No authentication token provided');
    }
    
    // Remove "Bearer " prefix to get actual token
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      throw new Error('Invalid token format');
    }
    
    // 2. Verify token
    // This checks:
    // - Token is properly formatted
    // - Token was signed with our secret
    // - Token hasn't expired
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. Find user by ID from token
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // 4. Attach user and token to request
    // Now all route handlers can access req.user
    req.user = user;
    req.token = token;
    
    // 5. Continue to next middleware/route
    next();
    
  } catch (error) {
    console.error('Authentication error:', error.message);
    
    // Send appropriate error response
    let statusCode = 401;
    let errorMessage = 'Please authenticate';
    
    if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid token';
    } else if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token expired. Please log in again';
    }
    
    res.status(statusCode).json({
      error: errorMessage,
      requiresLogin: true
    });
  }
};

/**
 * Optional Authentication Middleware
 * 
 * Similar to auth, but doesn't fail if no token
 * Useful for routes that work for both authenticated and guest users
 * 
 * Usage:
 * router.get('/optional-route', optionalAuth, (req, res) => {
 *   if (req.user) {
 *     // User is logged in
 *   } else {
 *     // User is guest
 *   }
 * });
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      // No token provided - continue as guest
      return next();
    }
    
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (user) {
      req.user = user;
      req.token = token;
    }
    
    next();
    
  } catch (error) {
    // Token is invalid, but continue as guest
    console.log('Optional auth failed, continuing as guest:', error.message);
    next();
  }
};

/**
 * Check Message Limit Middleware
 * 
 * Verifies user hasn't exceeded daily message limit
 * Must be used AFTER auth middleware
 * 
 * How it works:
 * 1. Check user's tier
 * 2. Check if new day (reset counter)
 * 3. Verify against daily limit
 * 4. Increment counter
 * 
 * Usage:
 * router.post('/chat', auth, checkMessageLimit, (req, res) => {
 *   // User is authenticated and within limit
 * });
 */
const checkMessageLimit = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }
    
    // Check if user can send message
    const { allowed, reason, limit, used } = user.canSendMessage();
    
    if (!allowed) {
      return res.status(429).json({  // 429 = Too Many Requests
        error: reason,
        dailyLimit: limit,
        messagesUsed: used,
        tier: user.tier,
        upgrade: user.tier === 'free' ? {
          message: 'Upgrade to Premium for unlimited messages',
          benefits: [
            'Unlimited messages per day',
            'Priority support',
            'Advanced features'
          ]
        } : null
      });
    }
    
    // User is allowed - increment counter
    await user.incrementMessageCount();
    
    // Add usage info to response (for frontend display)
    req.messageUsage = {
      used: user.messageCount,
      limit: user.dailyLimit,
      remaining: user.dailyLimit - user.messageCount,
      tier: user.tier
    };
    
    next();
    
  } catch (error) {
    console.error('Message limit check error:', error);
    res.status(500).json({ 
      error: 'Failed to check message limit' 
    });
  }
};

/**
 * Admin Only Middleware
 * 
 * Restricts access to admin users only
 * Must be used AFTER auth middleware
 * 
 * Usage:
 * router.get('/admin/users', auth, adminOnly, (req, res) => {
 *   // Only admins can access this
 * });
 */
const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required' 
    });
  }
  
  if (req.user.tier !== 'admin') {
    return res.status(403).json({  // 403 = Forbidden
      error: 'Admin access required',
      yourTier: req.user.tier
    });
  }
  
  next();
};

/**
 * Premium Only Middleware
 * 
 * Restricts access to premium and admin users
 * Must be used AFTER auth middleware
 */
const premiumOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required' 
    });
  }
  
  if (req.user.tier === 'free') {
    return res.status(403).json({
      error: 'Premium subscription required',
      yourTier: req.user.tier,
      upgrade: {
        message: 'Upgrade to Premium to access this feature',
        benefits: [
          'Unlimited messages',
          'Priority support',
          'Advanced features'
        ]
      }
    });
  }
  
  next();
};

module.exports = {
  auth,
  optionalAuth,
  checkMessageLimit,
  adminOnly,
  premiumOnly
};
