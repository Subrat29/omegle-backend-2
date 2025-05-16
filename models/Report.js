const mongoose = require("mongoose")

const ReportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: String,
      required: true,
    },
    reporterIp: {
      type: String,
      required: true,
    },
    reportedId: {
      type: String,
      required: true,
    },
    reportedIp: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      enum: ["inappropriate_content", "harassment", "spam", "underage_user", "other"],
    },
    details: {
      type: String,
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model("Report", ReportSchema)
