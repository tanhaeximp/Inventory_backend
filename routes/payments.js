// routes/payments.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import CustomerPayment from "../models/CustomerPayment.js";
import SupplierPayment from "../models/SupplierPayment.js";

const router = express.Router();

router.post("/customers", protect, async (req, res) => {
  try {
    const { customer, amount, method, note, date } = req.body;
    const doc = await CustomerPayment.create({ customer, amount, method, note, date });
    res.status(201).json(doc);
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message || "Failed to add customer payment" });
  }
});

router.post("/suppliers", protect, async (req, res) => {
  try {
    const { supplier, amount, method, note, date } = req.body;
    const doc = await SupplierPayment.create({ supplier, amount, method, note, date });
    res.status(201).json(doc);
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message || "Failed to add supplier payment" });
  }
});

export default router;
