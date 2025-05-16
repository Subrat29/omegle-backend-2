const express = require("express")
const router = express.Router()
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

// Models
const adminModel = require("../models/Admin")
const Session = require("../models/Session")
const Report = require("../models/Report")


// Middleware
const auth = require("../middleware/auth")

// Login route
router.post("/login", async (req, res) => {
  try {

    const {username,password} = req.body;
    console.log("username aa raha",req.body);

    // Find admin by username
    const admin = await adminModel.findOne({username})
    console.log("admin nhi mila",admin);

    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Check password
    const isMatch = await bcrypt.compare(password, admin.password)
    console.log(isMatch);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Generate JWT token
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET || "secret", { expiresIn: "1d" })

    res.json({ token })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get dashboard stats
router.get("/stats", auth, async (req, res) => {
  try {
    // Total sessions
    const totalSessions = await Session.countDocuments()

    // Active sessions (no end time)
    const activeSessions = await Session.countDocuments({ endTime: null })

    // Total reports
    const totalReports = await Report.countDocuments()

    // Average session duration
    const completedSessions = await Session.find({ endTime: { $ne: null } })
    let totalDuration = 0

    completedSessions.forEach((session) => {
      const duration = session.endTime - session.startTime
      totalDuration += duration
    })

    const averageSessionDuration =
      completedSessions.length > 0 ? Math.round(totalDuration / completedSessions.length / 1000) : 0

    res.json({
      totalSessions,
      activeSessions,
      totalReports,
      averageSessionDuration,
    })
  } catch (error) {
    console.error("Stats error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get reports
router.get("/reports", auth, async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).limit(100)

    res.json(reports)
  } catch (error) {
    console.error("Reports error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
