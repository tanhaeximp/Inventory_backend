// routes/products.js
import express from "express";
import mongoose from "mongoose";
import { protect } from "../middleware/authMiddleware.js";

import Product from "../models/Product.js";
import Category from "../models/Category.js";

const router = express.Router();

/* ---------------- helpers ---------------- */
const isId = (v) => mongoose.isValidObjectId(v);
const n = (x, f = 0) => {
  const v = Number(x);
  return Number.isFinite(v) ? v : f;
};

/* ---------------- list (with filters) ----------------
  GET /api/products?q=rice&category=<id>
------------------------------------------------------ */
router.get("/", protect, async (req, res) => {
  try {
    const { q, category } = req.query;
    const filter = {};

    if (q && String(q).trim()) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.name = rx;
    }

    if (category && isId(category)) {
      filter.category = category;
    }

    const products = await Product.find(filter)
      .populate("category", "name")
      .sort({ name: 1 })
      .lean();

    res.json(products);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to load products" });
  }
});

/* ---------------- read one ----------------
  GET /api/products/:id
------------------------------------------- */
router.get("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ message: "Invalid product id" });

    const prod = await Product.findById(id).populate("category", "name").lean();
    if (!prod) return res.status(404).json({ message: "Product not found" });

    res.json(prod);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to load product" });
  }
});

/* ---------------- create ----------------
  POST /api/products
  body: { name, unit, price?, category? }
----------------------------------------- */
router.post("/", protect, async (req, res) => {
  try {
    const { name, unit, price, category } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    let categoryId = null;
    if (category) {
      if (!isId(category)) {
        return res.status(400).json({ message: "Invalid category id" });
      }
      const cat = await Category.findById(category).lean();
      if (!cat) return res.status(400).json({ message: "Category not found" });
      categoryId = category;
    }

    const doc = await Product.create({
      name: String(name).trim(),
      unit: unit || "",
      price: n(price, 0),
      category: categoryId,
    });

    const saved = await Product.findById(doc._id).populate("category", "name").lean();
    res.status(201).json(saved);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to create product" });
  }
});

/* ---------------- update ----------------
  PUT /api/products/:id
  body: { name?, unit?, price?, category? }
----------------------------------------- */
router.put("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ message: "Invalid product id" });

    const { name, unit, price, category } = req.body;

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (unit !== undefined) update.unit = unit;
    if (price !== undefined) update.price = n(price, 0);

    if (category !== undefined) {
      if (category === null || category === "") {
        update.category = null; // allow clearing
      } else {
        if (!isId(category)) return res.status(400).json({ message: "Invalid category id" });
        const cat = await Category.findById(category).lean();
        if (!cat) return res.status(400).json({ message: "Category not found" });
        update.category = category;
      }
    }

    const prod = await Product.findByIdAndUpdate(id, update, { new: true })
      .populate("category", "name")
      .lean();

    if (!prod) return res.status(404).json({ message: "Product not found" });
    res.json(prod);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to update product" });
  }
});

/* ---------------- delete ----------------
  DELETE /api/products/:id
----------------------------------------- */
router.delete("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ message: "Invalid product id" });

    const prod = await Product.findByIdAndDelete(id);
    if (!prod) return res.status(404).json({ message: "Product not found" });

    res.json({ message: "Product deleted" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to delete product" });
  }
});

export default router;
