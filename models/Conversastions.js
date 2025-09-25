const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  members: {
    type: Array,
    required: true,
  },
  lastMessage: {
    type: String,
    default: null,
  },
  lastMessageTime: {
    type: Date,
    default: null,
  },
  lastMessageSenderId: {
    type: String,
    default: null,
  },
  notSeenBy: [{
    userId: {
      type: String,
      required: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);
