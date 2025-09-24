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
        
        // Get the last message for this conversation
        const lastMessage = await Messages.findOne({conversationId: conversation._id})
          .sort({createdAt: -1})
          .limit(1);
        
        // Get first 15 characters of the last message
        const lastMessageText = lastMessage ? 
          (lastMessage.message.length > 15 ? 
            lastMessage.message.substring(0, 15) + '...' : 
            lastMessage.message) : 
          'No messages yet';
        
        // Determine if the last message was sent by the current user
        const isLastMessageFromCurrentUser = lastMessage ? lastMessage.senderId === req.params.userId : false;
        
        return{
          user:{phone: user.phone, fullname: user.fullname, _id: user._id}, 
          conversationId: conversation._id,
          lastMessage: lastMessageText,
          lastMessageTime: lastMessage ? lastMessage.createdAt : null,
          lastMessageSenderId: lastMessage ? lastMessage.senderId : null,
          isLastMessageFromCurrentUser: isLastMessageFromCurrentUser
        }; 
      }));
      res.status(200).json(conversationUserData);
    } catch(err){
      next(err);
    } 
  });

module.exports = router;


