const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const dotenv = require("dotenv");
const { check, validationResult } = require("express-validator");
const fs = require("fs");
const https = require("https");
const path = require("path");

dotenv.config();

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Connected to database successfully');
  }
});

app.get("/test", (req, res) => {
  return res.status(200).json({message: "Server is running properly"});
});

app.get("/ping", (req, res) => {
  return res.status(200).json("Server is running");
});

app.post("/signup", (req, res) => {
  console.log("Received signup request with data:", req.body);
  
  if (!req.body.name || !req.body.email || !req.body.password) {
    return res.status(400).json("Missing required fields");
  }
  
  const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
  const values = [req.body.name, req.body.email, req.body.password];
  
  console.log("Executing SQL query:", sql);
  console.log("With values:", values);
  
  db.query(sql, values, (err, data) => {
    if (err) {
      console.error("Database error during signup:", err);
      return res.status(500).json("Database error: " + err.message);
    }
    console.log("Signup successful, database response:", data);
    return res.status(200).json("Signup successful");
  });
});

app.post(
  "/login",
  [
    check("email", "Email format or length is invalid").isEmail().isLength({ min: 10, max: 30 }),
    check("password", "Password must be 8–10 characters").isLength({ min: 8, max: 10 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    console.log("Processing login request for:", req.body.email);
    const sql = "SELECT id, name, email FROM users WHERE email = ? AND password = ?";
    
    db.query(sql, [req.body.email, req.body.password], (err, data) => {
      if (err) {
        console.error("Database error during login:", err);
        return res.status(500).json("Error: " + err.message);
      }

      console.log("Login query results:", data);
      if (data.length > 0) {
        return res.status(200).json({ 
          success: true, 
          user: {
            id: data[0].id,
            name: data[0].name,
            email: data[0].email
          }
        });
      } else {
        return res.status(401).json({ success: false });
      }
    });
  }
);

// SSL/TLS certificates
const sslOptions = {
  key: fs.readFileSync(path.resolve(__dirname, '../ssl/key.pem')),
  cert: fs.readFileSync(path.resolve(__dirname, '../ssl/cert.pem'))
};

// Create HTTPS server
const server = https.createServer(sslOptions, app);

// Set up Socket.IO with WSS
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: { 
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  }
});

// Keep track of connected users with Map instead of Set
const connectedUsers = new Map(); 

// Socket.IO event handlers
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  
  // Handle user authentication with socket
  socket.on('authenticate', (userData) => {
    console.log(`User authenticated: ${userData.name} (ID: ${userData.id})`);
    
    // Store user info mapped to this socket
    connectedUsers.set(socket.id, {
      socketId: socket.id,
      userId: userData.id,
      name: userData.name,
      email: userData.email
    });
    
    // Send updated user list to all clients
    const usersList = Array.from(connectedUsers.values());
    io.emit('users_list', usersList);
    
    // Notify others about the new user
    socket.broadcast.emit('user_connected', connectedUsers.get(socket.id));
  });
  
  // Handle fallback for non-authenticated users
  socket.on('user_connected', ({ userId }) => {
    console.log(`Legacy user connected: ${userId}`);
    
    // Only add if not already authenticated
    if (!connectedUsers.has(socket.id)) {
      connectedUsers.set(socket.id, {
        socketId: socket.id,
        userId: socket.id, // Use socket ID as fallback
        name: `User-${socket.id.substring(0, 6)}`,
        email: null
      });
      
      // Send updated user list to all clients
      const usersList = Array.from(connectedUsers.values());
      io.emit('users_list', usersList);
    }
  });

  // MODIFIED: Handle chat messages to prevent duplicates
  socket.on("chat message", (msg) => {
    // Enrich message with sender info if needed
    const senderInfo = connectedUsers.get(socket.id);
    if (senderInfo) {
      msg.senderName = senderInfo.name;
    }
    
    console.log("Received chat message:", msg);
    
    // Add timestamp if not present
    if (!msg.timestamp) {
      msg.timestamp = new Date();
    }
    
    // Send to everyone EXCEPT the sender
    socket.broadcast.emit("chat message", msg);
    
    // Send back to the sender (separate emission) to ensure proper handling
    socket.emit("chat message", msg);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    
    // Get user info before removing
    const user = connectedUsers.get(socket.id);
    
    // Remove from connected users
    connectedUsers.delete(socket.id);
    
    // Notify all clients about disconnection
    if (user) {
      io.emit('user_disconnected', user);
    }
    
    // Send updated user list
    io.emit('users_list', Array.from(connectedUsers.values()));
  });
  
  // Additional functionality - typing indicators
  socket.on("typing", (data) => {
    // Add sender info
    const senderInfo = connectedUsers.get(socket.id);
    if (senderInfo) {
      data.user = senderInfo;
    }
    
    socket.broadcast.emit("typing", data);
  });
  
  // Additional functionality - read receipts
  socket.on("message_read", (data) => {
    io.emit("message_read", data);
  });
});

// Use port from .env file
const PORT = process.env.PORT || 8081; 
server.listen(PORT, () => {
  console.log(`HTTPS server with Socket.IO listening on port ${PORT}`);
});