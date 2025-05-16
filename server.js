const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const mongoose = require("mongoose")
const cors = require("cors")
const dotenv = require("dotenv")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")

// Routes
const adminRoutes = require("./routes/admin")

// Models
const Session = require("./models/Session")
const Report = require("./models/Report")
const Admin = require("./models/Admin")

// Load environment variables
dotenv.config()

// Initialize Express app
const app = express()
const server = http.createServer(app)

// Middleware
app.use(cors())

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
})

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/omegle-clone", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err))

// API routes
app.use("/api/admin", adminRoutes)

// Socket.io logic
const waitingUsers = {
  text: [],
  video: [],
}

const activeConnections = new Map()

io.on("connection", (socket) => {
  console.log("User connected:", socket.id)

  // Create a new session record
  const session = new Session({
    socketId: socket.id,
    ipAddress: socket.handshake.headers["x-forwarded-for"] || socket.handshake.address,
    startTime: new Date(),
  })

  session
    .save()
    .then((savedSession) => {
      socket.sessionId = savedSession._id
    })
    .catch((err) => console.error("Error saving session:", err))

  // Find a partner
  socket.on("find-partner", ({ chatType = "video", interests }) => {
    console.log(`User ${socket.id} looking for a partner. Chat type: ${chatType}`)

    // First, make sure the user isn't already in a connection
    const existingPartnerId = activeConnections.get(socket.id)
    if (existingPartnerId) {
      console.log(`User ${socket.id} already has a partner ${existingPartnerId}, disconnecting first`)
      // Notify the current partner that the user disconnected
      io.to(existingPartnerId).emit("partner-disconnected")

      // Remove the connection
      activeConnections.delete(existingPartnerId)
      activeConnections.delete(socket.id)
    }

    // Remove from any waiting lists first (in case they're already waiting)
    for (const type in waitingUsers) {
      const index = waitingUsers[type].indexOf(socket.id)
      if (index !== -1) {
        waitingUsers[type].splice(index, 1)
      }
    }

    // Ensure the chatType exists in waitingUsers
    if (!waitingUsers[chatType]) {
      waitingUsers[chatType] = []
    }

    // Check if there's someone waiting
    if (waitingUsers[chatType] && waitingUsers[chatType].length > 0) {
      // Get the first waiting user
      const partnerId = waitingUsers[chatType].shift()
      const partnerSocket = io.sockets.sockets.get(partnerId)

      if (partnerSocket) {
        console.log(`Matching ${socket.id} with ${partnerId}`)

        // Create a connection between the two users
        activeConnections.set(socket.id, partnerId)
        activeConnections.set(partnerId, socket.id)

        // Generate random country for demo purposes
        const countries = ["USA", "Canada", "India", "UK", "Australia", "Germany", "France", "Japan"]
        const randomCountry = countries[Math.floor(Math.random() * countries.length)]

        // Notify both users that they've been paired
        socket.emit("partner-found", { partnerId, initiator: true, country: randomCountry })
        partnerSocket.emit("partner-found", { partnerId: socket.id, initiator: false, country: randomCountry })
      } else {
        console.log(`Partner socket ${partnerId} no longer available, adding ${socket.id} to waiting list`)
        // If partner socket is no longer available, remove it and add this user to waiting list
        waitingUsers[chatType] = waitingUsers[chatType].filter((id) => id !== partnerId)
        waitingUsers[chatType].push(socket.id)
      }
    } else {
      console.log(`No partners available, adding ${socket.id} to waiting list`)
      // Add user to waiting list
      waitingUsers[chatType].push(socket.id)
    }

    // Log current waiting users for debugging
    console.log(`Current waiting users for ${chatType}:`, waitingUsers[chatType])
    console.log(`Current active connections:`, Array.from(activeConnections.entries()))
  })

  // Handle WebRTC signaling
  socket.on("offer", (offer) => {
    const partnerId = activeConnections.get(socket.id)
    if (partnerId) {
      io.to(partnerId).emit("offer", offer)
    }
  })

  socket.on("answer", (answer) => {
    const partnerId = activeConnections.get(socket.id)
    if (partnerId) {
      io.to(partnerId).emit("answer", answer)
    }
  })

  socket.on("ice-candidate", (candidate) => {
    const partnerId = activeConnections.get(socket.id)
    if (partnerId) {
      io.to(partnerId).emit("ice-candidate", candidate)
    }
  })

  // Handle chat messages
  socket.on("chat-message", (message) => {
    const partnerId = activeConnections.get(socket.id)
    if (partnerId) {
      io.to(partnerId).emit("chat-message", message)
    }
  })

  // Handle "next partner" request
  socket.on("next-partner", () => {
    console.log(`User ${socket.id} requesting next partner`)

    const partnerId = activeConnections.get(socket.id)

    // Notify the current partner that the user disconnected
    if (partnerId) {
      console.log(`Notifying current partner ${partnerId} about disconnection`)
      io.to(partnerId).emit("partner-disconnected")

      // Remove the connection
      activeConnections.delete(partnerId)
      activeConnections.delete(socket.id)
    }

    // Immediately look for a new partner
    const chatType = "video" // Default to video since we're fixing video chat

    // Remove from any waiting lists first (in case they're already waiting)
    for (const type in waitingUsers) {
      const index = waitingUsers[type].indexOf(socket.id)
      if (index !== -1) {
        waitingUsers[type].splice(index, 1)
      }
    }

    // Check if there's someone waiting
    if (waitingUsers[chatType] && waitingUsers[chatType].length > 0) {
      const newPartnerId = waitingUsers[chatType].shift()
      const partnerSocket = io.sockets.sockets.get(newPartnerId)

      if (partnerSocket) {
        console.log(`Matching ${socket.id} with new partner ${newPartnerId}`)

        // Create a connection between the two users
        activeConnections.set(socket.id, newPartnerId)
        activeConnections.set(newPartnerId, socket.id)

        // Generate random country for demo purposes
        const countries = ["USA", "Canada", "India", "UK", "Australia", "Germany", "France", "Japan"]
        const randomCountry = countries[Math.floor(Math.random() * countries.length)]

        // Notify both users that they've been paired
        socket.emit("partner-found", { partnerId: newPartnerId, initiator: true, country: randomCountry })
        partnerSocket.emit("partner-found", { partnerId: socket.id, initiator: false, country: randomCountry })
      } else {
        console.log(`New partner socket ${newPartnerId} no longer available, adding ${socket.id} to waiting list`)
        // If partner socket is no longer available, remove it and add this user to waiting list
        waitingUsers[chatType] = waitingUsers[chatType].filter((id) => id !== newPartnerId)
        waitingUsers[chatType].push(socket.id)
      }
    } else {
      console.log(`No new partners available, adding ${socket.id} to waiting list`)
      // Add user to waiting list
      waitingUsers[chatType].push(socket.id)
    }

    // Log current waiting users for debugging
    console.log(`Current waiting users for ${chatType}:`, waitingUsers[chatType])
    console.log(`Current active connections:`, Array.from(activeConnections.entries()))
  })

  // Handle abuse reports
  socket.on("report-user", ({ reason }) => {
    const partnerId = activeConnections.get(socket.id)

    if (partnerId) {
      const partnerSocket = io.sockets.sockets.get(partnerId)

      if (partnerSocket) {
        const report = new Report({
          reporterId: socket.id,
          reporterIp: socket.handshake.headers["x-forwarded-for"] || socket.handshake.address,
          reportedId: partnerId,
          reportedIp: partnerSocket.handshake.headers["x-forwarded-for"] || partnerSocket.handshake.address,
          reason: reason,
        })

        report.save().catch((err) => console.error("Error saving report:", err))
      }
    }
  })

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)

    // Update session end time
    if (socket.sessionId) {
      Session.findByIdAndUpdate(socket.sessionId, {
        endTime: new Date(),
      }).catch((err) => console.error("Error updating session:", err))
    }

    // Remove from waiting list
    for (const type in waitingUsers) {
      const index = waitingUsers[type].indexOf(socket.id)
      if (index !== -1) {
        waitingUsers[type].splice(index, 1)
      }
    }

    // Notify partner if connected
    const partnerId = activeConnections.get(socket.id)
    if (partnerId) {
      console.log(`Notifying partner ${partnerId} about disconnection`)
      io.to(partnerId).emit("partner-disconnected")
      activeConnections.delete(partnerId)
    }

    // Remove from active connections
    activeConnections.delete(socket.id)
  })
})

// Create default admin user if none exists
const createDefaultAdmin = async () => {
  try {
    const adminCount = await Admin.countDocuments()

    if (adminCount === 0) {
      const hashedPassword = await bcrypt.hash("admin123", 10)

      const admin = new Admin({
        username: "admin",
        password: hashedPassword,
      })

      await admin.save()
      console.log("Default admin user created")
    }
  } catch (error) {
    console.error("Error creating default admin:", error)
  }
}

createDefaultAdmin()

// Start server
const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
