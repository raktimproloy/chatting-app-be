const express = require('express');
const Conversations = require('../models/Conversastions');
const User = require('../models/User');
const Messages = require('../models/Messages');

const router = express.Router();


router.post("/", async (req, res, next) => {
    try{
      const {senderId, receiverId} = req.body;
      const newConversation = new Conversations({members: [senderId, receiverId]});
      const savedConversation = await newConversation.save();
      res.status(201).json(savedConversation);
    } catch(err){
      next(err);
    }
  });
  
  router.get("/:userId", async (req, res, next) => {
    try{
      const conversations = await Conversations.find({members: {$in: [req.params.userId]}});
      const conversationUserData = await Promise.all(conversations.map(async (conversation) => {
        const userId = conversation.members.find((id) => id !== req.params.userId);
        const user = await User.findById(userId); 
        
        // Get first 15 characters of the last message
        const lastMessageText = conversation.lastMessage ? 
          (conversation.lastMessage.length > 15 ? 
            conversation.lastMessage.substring(0, 15) + '...' : 
            conversation.lastMessage) : 
          'No messages yet';
        
        // Determine if the last message was sent by the current user
        const isLastMessageFromCurrentUser = conversation.lastMessageSenderId === req.params.userId;
        
        // Check if current user has seen this conversation
        const userNotSeenEntry = conversation.notSeenBy.find(entry => entry.userId === req.params.userId);
        const hasSeen = !userNotSeenEntry || 
          (conversation.lastMessageTime && userNotSeenEntry.lastSeenAt < conversation.lastMessageTime);
        
        return{
          user:{phone: user.phone, fullname: user.fullname, _id: user._id}, 
          conversationId: conversation._id,
          lastMessage: lastMessageText,
          lastMessageTime: conversation.lastMessageTime,
          lastMessageSenderId: conversation.lastMessageSenderId,
          isLastMessageFromCurrentUser: isLastMessageFromCurrentUser,
          hasSeen: hasSeen,
          notSeenBy: conversation.notSeenBy
        }; 
      }));
      res.status(200).json(conversationUserData);
    } catch(err){
      next(err);
    } 
  });

module.exports = router;


