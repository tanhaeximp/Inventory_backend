// routes/categories.js
import express from "express";
import Category from "../models/Category.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// List
router.get("/", protect, async (req, res) => {
  const rows = await Category.find().sort({ name: 1 }).lean();
  res.json(rows);
});

// Create
router.post("/", protect, async (req, res) => {
  const { name, note } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Name is required" });
  const exists = await Category.findOne({ name: name.trim() });
  if (exists) return res.status(400).json({ message: "Category already exists" });
  const row = await Category.create({ name: name.trim(), note });
  res.status(201).json(row);
});

// Delete
router.delete("/:id", protect, async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
