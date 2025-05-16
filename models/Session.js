const mongoose = require("mongoose")

const SessionSchema = new mongoose.Schema(
  {
    socketId: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model("Session", SessionSchema)
