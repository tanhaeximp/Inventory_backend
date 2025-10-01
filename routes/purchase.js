import express from "express";
import mongoose from "mongoose";
import Stock from "../models/Stock.js";
import Product from "../models/Product.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * POST /api/purchases
 * body: { product, quantity }
 * - Creates a new Stock batch (FIFO)
 * - Increments Product.stock
 */
router.post("/", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { product, quantity } = req.body;
    const qty = Number(quantity);
    if (!product || !qty || qty <= 0) throw new Error("product and positive quantity are required");

    await Stock.create([{ product, quantity: qty }], { session });

    await Product.updateOne(
      { _id: product },
      { $inc: { stock: qty } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();
    res.status(201).json({ message: "Purchase recorded" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err);
    res.status(400).json({ message: err.message || "Failed to add purchase" });
  }
});

export default router;
