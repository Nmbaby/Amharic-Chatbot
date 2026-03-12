// config/database.js
// This file handles MongoDB connection

const mongoose = require('mongoose');

/**
 * Connect to MongoDB
 * 
 * Supports both local MongoDB and MongoDB Atlas (cloud)
 * 
 * Connection string should be in .env file:
 * MONGODB_URI=mongodb://localhost:27017/addis-chatbot
 * OR
 * MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/addis-chatbot
 */
const connectDB = async () => {
  try {
    // Get MongoDB URI from environment variable
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/addis-chatbot';
    
    console.log('Connecting to MongoDB...');
    console.log('Connection URI:', mongoURI.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in log
    
    // Connect to MongoDB
    const conn = await mongoose.connect(mongoURI, {
      // These options help with connection reliability
      // useNewUrlParser: true,        // Use new URL parser (deprecated in Mongoose 6+)
      // useUnifiedTopology: true,     // Use new Server Discover and Monitoring engine (deprecated in Mongoose 6+)
      // useCreateIndex: true,         // Use createIndex instead of ensureIndex (deprecated in Mongoose 6+)
      // useFindAndModify: false       // Use findOneAndUpdate instead of findAndModify (deprecated in Mongoose 6+)
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);
    
    // Log connection events
    mongoose.connection.on('connected', () => {
      console.log('📡 Mongoose connected to MongoDB');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ Mongoose connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('📴 Mongoose disconnected from MongoDB');
    });
    
    return conn;
    
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Troubleshooting:');
      console.error('   1. Make sure MongoDB is running: mongod');
      console.error('   2. Check your MONGODB_URI in .env file');
      console.error('   3. For local MongoDB, default is: mongodb://localhost:27017/addis-chatbot');
    } else if (error.message.includes('Authentication failed')) {
      console.error('\n💡 Troubleshooting:');
      console.error('   1. Check your MongoDB username and password');
      console.error('   2. For Atlas, verify credentials in connection string');
      console.error('   3. Make sure database user has proper permissions');
    } else if (error.message.includes('could not connect')) {
      console.error('\n💡 Troubleshooting:');
      console.error('   1. Check your internet connection (for MongoDB Atlas)');
      console.error('   2. Verify IP whitelist in MongoDB Atlas (allow 0.0.0.0/0 for testing)');
      console.error('   3. Check if MongoDB cluster is running');
    }
    
    console.error('\n🔗 MongoDB Setup Guide: https://docs.mongodb.com/manual/installation/');
    
    // Exit process with failure
    process.exit(1);
  }
};

/**
 * Disconnect from MongoDB
 * Used when shutting down server gracefully
 */
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
};

/**
 * Get database connection status
 */
const getConnectionStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  return states[mongoose.connection.readyState] || 'unknown';
};

/**
 * Database health check
 * Useful for monitoring and debugging
 */
const healthCheck = async () => {
  try {
    const status = getConnectionStatus();
    
    if (status !== 'connected') {
      return {
        healthy: false,
        status,
        message: 'Database not connected'
      };
    }
    
    // Ping database
    await mongoose.connection.db.admin().ping();
    
    // Get database stats
    const stats = await mongoose.connection.db.stats();
    
    return {
      healthy: true,
      status: 'connected',
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      collections: stats.collections,
      dataSize: `${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`,
      indexSize: `${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`
    };
    
  } catch (error) {
    return {
      healthy: false,
      status: 'error',
      message: error.message
    };
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});

module.exports = {
  connectDB,
  disconnectDB,
  getConnectionStatus,
  healthCheck
};
