// routes/pnl.js
import express from "express";
import SalesInvoice from "../models/SalesInvoice.js";
import { protect } from "../middleware/authMiddleware.js";

/**
 * GET /api/reports/pnl?granularity=day|month|year&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns: { granularity, rows: [{ period, revenue, cogs, grossProfit, margin }] }
 */
const router = express.Router();

router.get("/pnl", protect, async (req, res) => {
  try {
    const gran = String(req.query.granularity || "month").toLowerCase();
    const from = req.query.from ? new Date(req.query.from) : new Date("1970-01-01");
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const fmt = gran === "day" ? "%Y-%m-%d" : gran === "year" ? "%Y" : "%Y-%m";

    const rows = await SalesInvoice.aggregate([
      { $match: { date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: fmt, date: "$date" } },
          revenue: { $sum: { $ifNull: ["$grandTotal", 0] } },
          cogs: { $sum: { $ifNull: ["$cogsTotal", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          period: "$_id",
          revenue: 1,
          cogs: 1,
          grossProfit: { $subtract: ["$revenue", "$cogs"] },
          margin: {
            $cond: [
              { $gt: ["$revenue", 0] },
              { $multiply: [{ $divide: [{ $subtract: ["$revenue", "$cogs"] }, "$revenue"] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { period: 1 } },
    ]);

    res.json({ granularity: gran, rows });
  } catch (e) {
    res.status(500).json({ message: e?.message || "Failed to build P&L" });
  }
});

export default router;
