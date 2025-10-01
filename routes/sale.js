import express from "express";
import mongoose from "mongoose";
import Sale from "../models/Sale.js";
import Stock from "../models/Stock.js";
import Product from "../models/Product.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/", protect, async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from && to) filter.date = { $gte: new Date(from), $lte: new Date(to) };

    const sales = await Sale.find(filter)
      .populate("customer", "name")
      .populate("product", "name unit");
    res.json(sales);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch sales" });
  }
});

// POST /api/sales  body: { product, customer, unit, quantity, price, paidAmount }
router.post("/", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { product, customer, unit, quantity, price, paidAmount = 0 } = req.body;

    if (!product || !customer || !unit || quantity == null || price == null) {
      throw new Error("product, customer, unit, quantity, price are required");
    }
    const qty = Number(quantity);
    const unitPrice = Number(price);
    const paid = Number(paidAmount);
    if (qty <= 0 || unitPrice < 0 || paid < 0) throw new Error("Invalid numbers");

    // 1) Check Product.stock guard first (avoids touching batches if globally insufficient)
    const prod = await Product.findOne({ _id: product }).session(session).lean();
    if (!prod) throw new Error("Product not found");
    if ((prod.stock ?? 0) < qty) throw new Error("Insufficient product stock");

    // 2) FIFO decrement across Stock batches
    const batches = await Stock.find({ product }).sort({ createdAt: 1 }).session(session);
    let remaining = qty;
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantity, remaining);
      if (take > 0) {
        b.quantity -= take;
        remaining -= take;
        await b.save({ session });
      }
    }
    if (remaining > 0) throw new Error("Not enough stock to complete sale (batches)"); // should not happen if guard correct

    // 3) Decrement Product.stock
    const upd = await Product.updateOne(
      { _id: product, stock: { $gte: qty } },   // guard ensures no negative
      { $inc: { stock: -qty } },
      { session }
    );
    if (upd.matchedCount === 0) throw new Error("Insufficient product stock");

    // 4) Create Sale document
    const totalPrice = qty * unitPrice;
    const dueAmount = Math.max(totalPrice - paid, 0);

    const [sale] = await Sale.create([{
      customer, product, unit, quantity: qty,
      totalPrice, paidAmount: paid, dueAmount, date: new Date(),
    }], { session });

    await session.commitTransaction();
    session.endSession();
    res.status(201).json(sale);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err);
    res.status(400).json({ message: err.message || "Failed to add sale" });
  }
});

export default router;
