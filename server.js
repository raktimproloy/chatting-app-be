require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./config/database');
const routes = require('./routes');
const User = require('./models/User');

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
const usersByName = new Map(); // compatibility with sample app username-based signaling

io.on('connection', (socket) => {
  
  socket.on('joinUser', (userId) => {
    console.log(`joinUser event received: userId=${userId}, socketId=${socket.id}`);
    
    const existingUserIndex = users.findIndex(user => user.id === userId);
    if (existingUserIndex !== -1) {
      users[existingUserIndex].socketId = socket.id;
      console.log(`User ${userId} reconnected with new socket ID: ${socket.id}`);
    } else {
      users.push({id: userId, socketId: socket.id});
      console.log(`New user ${userId} joined with socket ID: ${socket.id}`);
    }
    
    console.log("Users online:", users);
    io.emit("getUsers", users);
  });

  // compatibility: username based join and broadcast joined list
  socket.on('join-user', (username) => {
    console.log(`${username} joined via join-user`);
    usersByName.set(username, socket.id);
    // broadcast list as object similar to sample
    const allusers = {};
    for (const [name, id] of usersByName.entries()) {
      allusers[name] = { username: name, id };
    }
    io.emit('joined', allusers);
  });

  socket.on("sendMessage", async({senderId, receiverId, message, conversationId}) => {
    const receiver = users.find((user) => user.id === receiverId);
    const sender = users.find((user) => user.id === senderId);
    const user = await User.findById(senderId);
    console.log("Send Message", {
      senderId, receiverId, message, conversationId, sender, receiver
    });

    const messageData = {
      senderId, 
      message, 
      conversationId, 
      receiverId,
      user: {phone: user.phone, fullname: user.fullname, _id: user._id}
    };

    if(receiver){
      console.log(`Emitting message to receiver: ${receiver.id} with socketId: ${receiver.socketId}`);
      io.to(receiver.socketId).emit("getMessage", messageData);
    } else {
      console.log(`Receiver ${receiverId} not found in online users`);
    }
  });

  socket.on("requestingVideoCall", (data) => {
    const {senderId, receiverId, conversationId, roomId} = data;
    console.log("Requesting Video Call", {senderId, receiverId, conversationId, roomId});
    
    const receiver = users.find((user) => user.id === receiverId);
    if (receiver) {
      console.log(`Emitting video call request to receiver: ${receiverId} with socketId: ${receiver.socketId}`);
      io.to(receiver.socketId).emit("requestingForAcceptingVideoCall", {senderId, receiverId, conversationId, roomId});
    } else {
      console.log(`Receiver ${receiverId} not found in online users`);
    }
  });

  socket.on("join-room", data => {
    const {roomId, phoneId} = data;
    console.log("Join Room", {roomId, phoneId, socketId: socket.id});
    
    phoneToSocketId.set(phoneId, socket.id);
    socketToPhone.set(socket.id, phoneId);
    socket.join(roomId);
    
    socket.emit("joined-room", {roomId});
    socket.broadcast.to(roomId).emit("user-joined", {userId: phoneId});
    
    console.log(`User ${phoneId} joined room ${roomId}`);
  });

  socket.on("call-user", (data) => {
    const {phoneId, offer} = data;
    const fromPhone = socketToPhone.get(socket.id);
    const socketId = phoneToSocketId.get(phoneId);
    
    console.log("Call User", {fromPhone, toPhone: phoneId, socketId});
    
    if (socketId) {
      io.to(socketId).emit("incomming-call", {from: fromPhone, offer});
    } else {
      console.log(`Socket ID not found for phone: ${phoneId}`);
    }
  });

  socket.on("call-accepted", (data) => {
    const {phoneId, answer} = data;
    const socketId = phoneToSocketId.get(phoneId);
    
    console.log("Call Accepted", {toPhone: phoneId, socketId, hasAnswer: !!answer});
    
    if (socketId) {
      io.to(socketId).emit("call-accepted", {answer});
    } else {
      console.log(`Socket ID not found for phone: ${phoneId}`);
    }
  });

  // compatibility: offer/answer style signaling
  socket.on('offer', ({ from, to, offer }) => {
    console.log('offer', { from, to });
    const toSocketId = phoneToSocketId.get(to) || usersByName.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit('offer', { from, to, offer });
    }
  });

  socket.on('answer', ({ from, to, answer }) => {
    console.log('answer', { from, to });
    const toSocketId = phoneToSocketId.get(from) || usersByName.get(from);
    if (toSocketId) {
      io.to(toSocketId).emit('answer', { from, to, answer });
    }
  });

  // Relay ICE candidates between peers
  socket.on("ice-candidate", (data) => {
    const { toPhoneId, candidate } = data;
    const toSocketId = phoneToSocketId.get(toPhoneId);
    const fromPhone = socketToPhone.get(socket.id);
    console.log("ICE Candidate", { fromPhone, toPhoneId, hasCandidate: !!candidate, toSocketId });
    if (toSocketId) {
      io.to(toSocketId).emit("ice-candidate", { from: fromPhone, candidate });
    } else {
      console.log(`Socket ID not found for phone: ${toPhoneId}`);
    }
  });

  // compatibility: icecandidate event name
  socket.on('icecandidate', ({ from, to, candidate }) => {
    console.log('icecandidate', { from, to });
    const toSocketId = phoneToSocketId.get(to) || usersByName.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit('icecandidate', { from, to, candidate });
    } else {
      // fallback: broadcast
      socket.broadcast.emit('icecandidate', { from, to, candidate });
    }
  });

  socket.on("call-ended", (data) => {
    const {phoneId} = data;
    const socketId = phoneToSocketId.get(phoneId);
    
    console.log("Call Ended", {phoneId, socketId});
    
    if (socketId) {
      io.to(socketId).emit("call-ended");
    }
  });

  // compatibility: end-call event name
  socket.on('end-call', ({ from, to }) => {
    const toSocketId = phoneToSocketId.get(to) || usersByName.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit('end-call', { from, to });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const userIndex = users.findIndex(user => user.socketId === socket.id);
    if (userIndex !== -1) {
      const disconnectedUser = users[userIndex];
      users.splice(userIndex, 1);
      console.log(`User ${disconnectedUser.id} disconnected`);
    }
    
    // Clean up maps
    const phoneId = socketToPhone.get(socket.id);
    if (phoneId) {
      phoneToSocketId.delete(phoneId);
      socketToPhone.delete(socket.id);
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