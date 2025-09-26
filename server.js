require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./config/database');
const routes = require('./routes');
const User = require('./models/User');
// const Message = require('./models/Messages');
// const Conversation = require('./models/Conversation');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(bodyParser.json());


// Socket.io connection handling
const users = [];

const phoneToSocketId = new Map();
const socketToPhone = new Map();


io.on('connection', (socket) => {
  
  socket.on('joinUser', (userId) => {
    console.log(`joinUser event received: userId=${userId}, socketId=${socket.id}`);
    
    // Check if user already exists and update their socket ID, or add new user
    const existingUserIndex = users.findIndex(user => user.id === userId);
    if (existingUserIndex !== -1) {
      // Update existing user's socket ID (user reconnected)
      users[existingUserIndex].socketId = socket.id;
      console.log(`User ${userId} reconnected with new socket ID: ${socket.id}`);
    } else {
      // Add new user
      users.push({id: userId, socketId: socket.id});
      console.log(`New user ${userId} joined with socket ID: ${socket.id}`);
    }
    
    console.log("Users online:", users);
    io.emit("getUsers", users);
  });

  socket.on("sendMessage", async({senderId, receiverId, message, conversationId}) => {
    const receiver = users.find((user) => user.id === receiverId)
    const sender = users.find((user) => user.id === senderId)
    const user = await User.findById(senderId)
    console.log("Send Message", {
      senderId, receiverId, message, conversationId, sender, receiver
    })

    const messageData = {
      senderId, 
      message, 
      conversationId, 
      receiverId,
      user: {phone: user.phone, fullname: user.fullname, _id: user._id}
    }

    // Only emit to receiver (sender already sees their message immediately in UI)
    if(receiver){
      console.log(`Emitting message to receiver: ${receiver.id} with socketId: ${receiver.socketId}`);
      io.to(receiver.socketId).emit("getMessage", messageData);
    } else {
      console.log(`Receiver ${receiverId} not found in online users`);
    }
  })

  socket.on("requestingVideoCall", (data) => {
    const {senderId, receiverId, conversationId, roomId} = data;
    console.log("Requesting Video Call", {senderId, receiverId, conversationId, roomId})
    
    // Find the receiver's socket ID from the users array
    const receiver = users.find((user) => user.id === receiverId);
    if (receiver) {
      console.log(`Emitting video call request to receiver: ${receiverId} with socketId: ${receiver.socketId}`);
      io.to(receiver.socketId).emit("requestingForAcceptingVideoCall", {senderId, receiverId, conversationId, roomId});
    } else {
      console.log(`Receiver ${receiverId} not found in online users`);
    }
  })

  socket.on("join-room", data => {
    const {roomId, phoneId} = data;
    console.log("Join Room", {roomId, phoneId})
    phoneToSocketId.set(phoneId, socket.id);
    socketToPhone.set(socket.id, phoneId);
    socket.join(roomId);
    socket.emit("joined-room", {roomId})
    socket.broadcast.to(roomId).emit("user-joined", {userId: phoneId})
  })

  socket.on("call-user", (data) => {
    const {phoneId, offer} = data;
    const fromPhone = socketToPhone.get(socket.id);
    const socketId = phoneToSocketId.get(phoneId);
    socket.to(socketId).emit("incomming-call", {from: fromPhone, offer})
  })

  socket.on("call-accepted", (data) => {
    const {phoneId, answer} = data;
    const socketId = phoneToSocketId.get(phoneId);
    console.log("Answer SocketId", socketId)
    socket.to(socketId).emit("call-accepted", {answer})
  })

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from the list
    const userIndex = users.findIndex(user => user.socketId === socket.id);
    if (userIndex !== -1) {
      const disconnectedUser = users[userIndex];
      users.splice(userIndex, 1);
      console.log(`User ${disconnectedUser.id} disconnected`);
    }
    
    console.log("Users remaining:", users);
    io.emit("getUsers", users);
  });

});







// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api', routes);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
