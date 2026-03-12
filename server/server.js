// server.js
// Main server file with authentication and MongoDB integration
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('🔍 Loading .env from:', path.join(__dirname, '.env'));
console.log('🔍 Environment Check:');
console.log('JWT_SECRET exists?', !!process.env.JWT_SECRET);
console.log('JWT_SECRET length:', process.env.JWT_SECRET?.length || 0);
console.log('First 10 chars:', process.env.JWT_SECRET?.substring(0, 10) || 'NOT FOUND');
console.log('API_KEY exists?', !!process.env.ADDIS_API_KEY);
console.log('---');


// ... rest of your code


// ... rest

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fileUpload = require('express-fileupload');

// Import database configuration
const { connectDB, healthCheck } = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');

// Import middleware
const { auth, checkMessageLimit, adminOnly } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Your Addis AI API key
const ADDIS_API_KEY = process.env.ADDIS_API_KEY;

// ==========================================
// MIDDLEWARE
// ==========================================

// Enable CORS for all routes
app.use(cors({
  origin: '*',  // In production, specify exact origins
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Handle file uploads
app.use(fileUpload());

// Request logging middleware (optional but useful)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==========================================
// DATABASE CONNECTION
// ==========================================

connectDB()
  .then(() => {
    console.log('🗄️  Database ready');
  })
  .catch((error) => {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  });

// ==========================================
// ROUTES
// ==========================================

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await healthCheck();
  
  res.json({
    status: 'ok',
    message: 'Addis AI Proxy Server is running',
    timestamp: new Date().toISOString(),
    database: dbHealth.healthy ? 'connected' : 'disconnected',
    authentication: 'enabled'
  });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Chat routes (protected)
app.use('/api/chat', chatRoutes);

// Text-to-Speech route (protected)
app.post('/api/tts', auth, async (req, res) => {
  try {
    const { text, language = 'am' } = req.body;

    if (!text) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required field: text' 
      });
    }

    const response = await fetch('https://api.addisassistant.com/api/v1/audio', {
      method: 'POST',
      headers: {
        'X-API-Key': ADDIS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, language })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data.message || 'TTS request failed',
        details: data
      });
    }

    res.json(data);

  } catch (error) {
    console.error('TTS proxy error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// ==========================================
// ADMIN ROUTES (Optional)
// ==========================================

// const { adminOnly } = require('./middleware/auth');

/**
 * GET /api/admin/users
 * Get all users (admin only)
 */
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const User = require('./models/User');
    
    const users = await User.find()
      .select('-password -refreshTokens')  // Don't send passwords
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: users.length,
      users
    });
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users'
    });
  }
});

/**
 * PUT /api/admin/users/:userId/tier
 * Update user tier (admin only)
 */
app.put('/api/admin/users/:userId/tier', auth, adminOnly, async (req, res) => {
  try {
    const User = require('./models/User');
    const { userId } = req.params;
    const { tier } = req.body;
    
    if (!['free', 'premium', 'admin'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier. Must be: free, premium, or admin'
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    user.tier = tier;
    
    // Update daily limit based on tier
    switch(tier) {
      case 'free': user.dailyLimit = 10; break;
      case 'premium': user.dailyLimit = 1000; break;
      case 'admin': user.dailyLimit = 10000; break;
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: `User tier updated to ${tier}`,
      user: {
        id: user._id,
        email: user.email,
        tier: user.tier,
        dailyLimit: user.dailyLimit
      }
    });
    
    console.log(`✅ User ${user.email} tier updated to ${tier} by admin ${req.user.email}`);
    
  } catch (error) {
    console.error('Update tier error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update tier'
    });
  }
});

// ==========================================
// ERROR HANDLING
// ==========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 Addis AI Proxy Server with Authentication');
  console.log('='.repeat(50));
  console.log(`📡 Server:     http://localhost:${PORT}`);
  console.log(`🏥 Health:     http://localhost:${PORT}/health`);
  console.log(`🔐 Auth:       http://localhost:${PORT}/api/auth/...`);
  console.log(`💬 Chat:       http://localhost:${PORT}/api/chat`);
  console.log(`📊 Usage:      http://localhost:${PORT}/api/chat/usage`);
  console.log(`🔊 TTS:        http://localhost:${PORT}/api/tts`);
  console.log(`👑 Admin:      http://localhost:${PORT}/api/admin/...`);
  console.log('='.repeat(50));
  
  if (!ADDIS_API_KEY || ADDIS_API_KEY === 'YOUR_API_KEY_HERE') {
    console.log('\n⚠️  WARNING: ADDIS_API_KEY not set!');
    console.log('   Set it in your .env file\n');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  const { disconnectDB } = require('./config/database');
  await disconnectDB();
  process.exit(0);
});
