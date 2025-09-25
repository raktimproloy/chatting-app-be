const express = require('express');
const Messages = require('../models/Messages');
const Conversations = require('../models/Conversastions');
const User = require('../models/User');

const router = express.Router();


router.post('/', async (req, res, next) => {
    try{
      const {conversationId, senderId, message, receiverId = ''} = req.body;
      if(!senderId || !message){
        return res.status(400).json({message: "Please provide senderId and message"});
      }
      if(!conversationId && receiverId){
        const newConversation = new Conversations({
          members: [senderId, receiverId],
          lastMessage: message,
          lastMessageTime: new Date(),
          lastMessageSenderId: senderId,
          notSeenBy: [{ userId: receiverId, lastSeenAt: new Date(0) }] // Receiver hasn't seen it yet
        });
        const savedConversation = await newConversation.save();
        const newMessage = new Messages({conversationId: savedConversation._id, senderId, message});
        await newMessage.save();
        return res.status(201).json({message: "message sent successfully", conversationId: savedConversation._id});
      } else if(conversationId) {
        const newMessage = new Messages({conversationId, senderId, message});
        const savedMessage = await newMessage.save();
        
        // Update conversation with new message info
        const conversation = await Conversations.findById(conversationId);
        if (conversation) {
          // Add receiver to notSeenBy if they haven't seen the latest message
          const receiverId = conversation.members.find(id => id !== senderId);
          const existingNotSeenEntry = conversation.notSeenBy.find(entry => entry.userId === receiverId);
          
          if (existingNotSeenEntry) {
            // Update existing entry
            existingNotSeenEntry.lastSeenAt = new Date(0); // Mark as not seen
          } else {
            // Add new entry
            conversation.notSeenBy.push({ userId: receiverId, lastSeenAt: new Date(0) });
          }
          
          conversation.lastMessage = message;
          conversation.lastMessageTime = new Date();
          conversation.lastMessageSenderId = senderId;
          await conversation.save();
        }
        
        res.status(201).json(savedMessage);
      } else {
        return res.status(400).json({message: "Please provide conversationId or receiverId"});
      }
    }
    catch(err){
      next(err);
    }
  });
  
  router.get("/:conversationId", async (req, res, next) => {
    try{
      const messages = await Messages.find({conversationId: req.params.conversationId});
      if(req.params.conversationId == 'new'){
        return res.status(200).json([]);
      }
      const messageUserData = await Promise.all(messages.map(async (message) => {
        const user = await User.findById(message.senderId);
        return {
          user: {phone: user.phone, fullname: user.fullname, _id: user._id}, 
          message: message.message, 
          createdAt: message.createdAt,
          _id: message._id
        };
      }));
      res.status(200).json(messageUserData);
    } catch(err){
      next(err);
    }
  });

// Mark conversation as seen
router.put('/seen/:conversationId', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    
    // Update conversation to mark as seen by user
    const conversation = await Conversations.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    
    // Remove user from notSeenBy array or update their lastSeenAt
    const userIndex = conversation.notSeenBy.findIndex(entry => entry.userId === userId);
    if (userIndex !== -1) {
      conversation.notSeenBy[userIndex].lastSeenAt = new Date();
    } else {
      // Add user to notSeenBy with current time (they've seen it)
      conversation.notSeenBy.push({ userId, lastSeenAt: new Date() });
    }
    
    await conversation.save();
    
    res.status(200).json({ 
      message: "Conversation marked as seen", 
      conversationId: conversationId 
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;


