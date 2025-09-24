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
        const newConversation = new Conversations({members: [senderId, receiverId]});
        const savedConversation = await newConversation.save();
        const newMessage = new Messages({conversationId: savedConversation._id, senderId, message});
        await newMessage.save();
        return res.status(201).json({message: "message sent successfully", conversationId: savedConversation._id});
      } else if(conversationId) {
        const newMessage = new Messages({conversationId, senderId, message});
        const savedMessage = await newMessage.save();
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
          seen: message.seen,
          seenAt: message.seenAt,
          _id: message._id
        };
      }));
      res.status(200).json(messageUserData);
    } catch(err){
      next(err);
    }
  });

// Mark messages as seen
router.put('/seen/:conversationId', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    
    // Mark all messages in this conversation as seen for the receiver
    const result = await Messages.updateMany(
      { 
        conversationId: conversationId,
        senderId: { $ne: userId } // Don't mark sender's own messages as seen
      },
      { 
        seen: true, 
        seenAt: new Date() 
      }
    );
    
    res.status(200).json({ 
      message: "Messages marked as seen", 
      updatedCount: result.modifiedCount 
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;


