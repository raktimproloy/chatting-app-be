const express = require('express');
const authRoutes = require('./auth');
const conversationRoutes = require('./conversation');
const messageRoutes = require('./message');
const usersRoutes = require('./users');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/conversation', conversationRoutes);
router.use('/message', messageRoutes);
router.use('/users', usersRoutes);

// 404 handler for API routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

module.exports = router;
