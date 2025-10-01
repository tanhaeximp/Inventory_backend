// routes/report.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import mongoose from "mongoose";

import Sale from "../models/Sale.js"; // legacy single-line sales
import Purchase from "../models/Purchase.js"; // legacy single-line purchases

import SalesInvoice from "../models/SalesInvoice.js";       // new multi-line invoices
import PurchaseInvoice from "../models/PurchaseInvoice.js"; // new multi-line invoices

const router = express.Router();

/** Utility: month start/end */
function monthRange(year, monthIndex) {
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

/** GET /api/reports/daily-sales */
router.get("/daily-sales", protect, async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    // Prefer SalesInvoice; fallback to Sale
    const invAgg = await SalesInvoice.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
    ]);
    let total = invAgg[0]?.total || 0;
    let count = invAgg[0]?.count || 0;

    if (count === 0 && total === 0) {
      const saleAgg = await Sale.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: "$totalPrice" }, count: { $sum: 1 } } },
      ]);
      total = saleAgg[0]?.total || 0;
      count = saleAgg[0]?.count || 0;
    }

    res.json({ date: start, totalSales: total, invoices: count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to get daily sales" });
  }
});

/** GET /api/reports/monthly-profit
 * Returns last 12 months arrays: labels, sales, purchases, profit
 */
router.get("/monthly-profit", protect, async (req, res) => {
  try {
    const now = new Date();
    const months = []; // newest last
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
    }

    const labels = [];
    const salesArr = [];
    const purchArr = [];
    const profitArr = [];

    for (const { y, m } of months) {
      const { start, end } = monthRange(y, m);
      const label = start.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
      labels.push(label);

      // SALES: prefer SalesInvoice.grandTotal; fallback to Sale.totalPrice
      const invSales = await SalesInvoice.aggregate([
        { $match: { date: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]);
      let sales = invSales[0]?.total || 0;

      if (sales === 0) {
        const saleAgg = await Sale.aggregate([
          { $match: { date: { $gte: start, $lt: end } } },
          { $group: { _id: null, total: { $sum: "$totalPrice" } } },
        ]);
        sales = saleAgg[0]?.total || 0;
      }

      // PURCHASES: prefer PurchaseInvoice.grandTotal; fallback to Purchase.total
      const invPurch = await PurchaseInvoice.aggregate([
        { $match: { date: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]);
      let purchases = invPurch[0]?.total || 0;

      if (purchases === 0) {
        const purAgg = await Purchase.aggregate([
          { $match: { createdAt: { $gte: start, $lt: end } } },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]);
        purchases = purAgg[0]?.total || 0;
      }

      const profit = sales - purchases;

      salesArr.push(sales);
      purchArr.push(purchases);
      profitArr.push(profit);
    }

    res.json({ labels, sales: salesArr, purchases: purchArr, profit: profitArr });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to get monthly profit" });
  }
});

export default router;
