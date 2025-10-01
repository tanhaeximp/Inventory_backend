// routes/stock.js
import express from "express";
import mongoose from "mongoose";
import { protect } from "../middleware/authMiddleware.js";
import Product from "../models/Product.js";
import Stock from "../models/Stock.js";
import PurchaseInvoice from "../models/PurchaseInvoice.js";

const router = express.Router();

async function getLatestPurchasePrice(productId) {
  const row = await PurchaseInvoice.aggregate([
    { $unwind: "$items" },
    { $match: { "items.product": new mongoose.Types.ObjectId(productId) } },
    { $sort: { date: -1, createdAt: -1 } },
    { $limit: 1 },
    { $project: { _id: 0, price: "$items.price" } }
  ]);
  return row[0]?.price ?? null;
}

async function summaryHandler(req, res) {
  try {
    const products = await Product.find({}).select("_id name unit price stock").lean();
    const rows = [];

    for (const p of products) {
      const batches = await Stock.find({ product: p._id, quantity: { $gt: 0 } })
        .sort({ createdAt: 1 })
        .lean();

      let qtyTotal = 0;
      let valueTotal = 0;

      if (batches.length) {
        let fallback = null;
        if (batches.some(b => !b.unitCost || b.unitCost <= 0)) {
          fallback = await getLatestPurchasePrice(p._id);
          if (fallback == null || fallback <= 0) fallback = Number(p.price || 0);
        }
        for (const b of batches) {
          const q = Number(b.quantity || 0);
          if (!q) continue;
          const cost = (b.unitCost && b.unitCost > 0) ? b.unitCost : (fallback || 0);
          qtyTotal += q;
          valueTotal += q * cost;
        }
      }

      rows.push({
        productId: p._id,
        name: p.name,
        unit: p.unit,
        stock: qtyTotal,
        avgCost: qtyTotal > 0 ? valueTotal / qtyTotal : 0,
        totalValue: valueTotal,
      });
    }

    const grand = rows.reduce(
      (acc, r) => {
        acc.totalSkus += 1;
        acc.totalQty += r.stock;
        acc.totalValue += r.totalValue;
        return acc;
      },
      { totalSkus: rows.length, totalQty: 0, totalValue: 0 }
    );

    res.json({ rows, grand });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to load stock summary" });
  }
}

// New alias so old path keeps working
router.get("/summary", protect, summaryHandler);
router.get("/fifo", protect, summaryHandler);   // 👈 alias to avoid 404

export default router;
