// routes/invoices.js
import express from "express";
import mongoose from "mongoose";
import { protect } from "../middleware/authMiddleware.js";

import Product from "../models/Product.js";
import Stock from "../models/Stock.js";
import SalesInvoice from "../models/SalesInvoice.js";
import PurchaseInvoice from "../models/PurchaseInvoice.js";
// import Customer from "../models/Customer.js";
// import Supplier from "../models/Supplier.js";

import { deductStockFIFOAndGetCOGS } from "../controllers/stockController.js";

const router = express.Router();

/* ---------------------------------------
   Helpers
--------------------------------------- */

// <PREFIX>-YYYYMMDD-HHMMSS-XXXX
function makeInvoiceNo(prefix = "INV") {
  const d = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const stamp = [d.getFullYear(), pad2(d.getMonth() + 1), pad2(d.getDate())].join("");
  const t = [pad2(d.getHours()), pad2(d.getMinutes()), pad2(d.getSeconds())].join("");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${t}-${rand}`;
}

// Recalculate Product.stock from Stock batches
async function refreshProductStock(productId, session) {
  const sums = await Stock.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: "$product", total: { $sum: "$quantity" } } },
  ]).session(session);
  const total = sums[0]?.total || 0;
  await Product.updateOne({ _id: productId }, { $set: { stock: total } }, { session });
}

const n = (val, fb = 0) => {
  const x = Number(val);
  return Number.isFinite(x) ? x : fb;
};

function buildDateRange(from, to) {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? range : null;
}

function pickSearchRegex(q) {
  if (!q) return null;
  try {
    return new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  } catch {
    return null;
  }
}

/* ============================
   PURCHASE INVOICE (POST)
============================ */
router.post("/purchases", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { supplier, date, items, discount = 0, paid = 0, note } = req.body;

    if (!supplier || !mongoose.isValidObjectId(supplier)) throw new Error("Valid supplier is required");
    if (!Array.isArray(items) || items.length === 0) throw new Error("At least one item is required");

    const normalized = [];
    for (const it of items) {
      const qty = n(it.quantity);
      const price = n(it.price);

      if (!it.product || !mongoose.isValidObjectId(it.product)) {
        throw new Error("Each row must include a valid product id");
      }
      if (qty <= 0) throw new Error("Quantity must be > 0");
      if (price < 0) throw new Error("Price must be ≥ 0");

      let catId = null;
      let catName = "";
      if (it.category && mongoose.isValidObjectId(it.category)) {
        catId = it.category;
        catName = typeof it.categoryName === "string" ? it.categoryName : "";
      }

      normalized.push({
        product: it.product,
        category: catId,
        categoryName: catName,
        unit: it.unit || "",
        quantity: qty,
        price,
        amount: qty * price,
      });
    }

    const subTotal = normalized.reduce((s, x) => s + x.amount, 0);
    const grandTotal = Math.max(0, subTotal - n(discount));
    const due = Math.max(0, grandTotal - n(paid));

    // FIFO IN (store unitCost)
    for (const li of normalized) {
      await Stock.create([{ product: li.product, quantity: li.quantity, unitCost: li.price }], { session });
      await refreshProductStock(li.product, session);
    }

    const [invoice] = await PurchaseInvoice.create(
      [
        {
          invoiceNo: makeInvoiceNo("PINV"),
          supplier,
          date: date ? new Date(date) : new Date(),
          items: normalized,
          subTotal,
          discount: n(discount),
          grandTotal,
          paid: n(paid),
          due,
          note,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    res.status(201).json(invoice);
  } catch (e) {
    await session.abortTransaction();
    res.status(400).json({ message: e.message || "Failed to create purchase invoice" });
  } finally {
    session.endSession();
  }
});

/* ============================
   SALES INVOICE (POST)
   - Deducts FIFO and records COGS
   - Adds invoice-level cogsTotal & profit
============================ */
router.post("/sales", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { customer, date, items, discount = 0, paid = 0, note } = req.body;

    if (!customer || !mongoose.isValidObjectId(customer)) throw new Error("Valid customer is required");
    if (!Array.isArray(items) || items.length === 0) throw new Error("At least one item is required");

    // Normalize items
    const normalized = [];
    for (const it of items) {
      const qty = n(it.quantity);
      const price = n(it.price);

      if (!it.product || !mongoose.isValidObjectId(it.product)) {
        throw new Error("Each row must include a valid product id");
      }
      if (qty <= 0) throw new Error("Quantity must be > 0");
      if (price < 0) throw new Error("Price must be ≥ 0");

      let catId = null;
      let catName = "";
      if (it.category && mongoose.isValidObjectId(it.category)) {
        catId = it.category;
        catName = typeof it.categoryName === "string" ? it.categoryName : "";
      }

      normalized.push({
        product: it.product,
        category: catId,
        categoryName: catName,
        unit: it.unit || "",
        quantity: qty,
        price,
        amount: qty * price,
      });
    }

    const subTotal = normalized.reduce((s, x) => s + x.amount, 0);
    const grandTotal = Math.max(0, subTotal - n(discount));
    const due = Math.max(0, grandTotal - n(paid));

    // FIFO OUT with COGS
    let cogsTotal = 0;
    for (const li of normalized) {
      // optional pre-check (availability)
      const availableAgg = await Stock.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(li.product) } },
        { $group: { _id: "$product", total: { $sum: "$quantity" } } },
      ]).session(session);
      const available = availableAgg[0]?.total || 0;
      if (available < li.quantity) throw new Error("Insufficient stock for one or more items");

      // Deduct & compute COGS
      const { cogs } = await deductStockFIFOAndGetCOGS(li.product, li.quantity, session);
      li.cogs = cogs;
      cogsTotal += cogs;

      await refreshProductStock(li.product, session);
    }

    const [invoice] = await SalesInvoice.create(
      [
        {
          invoiceNo: makeInvoiceNo("SINV"),
          customer,
          date: date ? new Date(date) : new Date(),
          items: normalized,
          subTotal,
          discount: n(discount),
          grandTotal,
          paid: n(paid),
          due,
          note,
          cogsTotal,
          profit: grandTotal - cogsTotal,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    res.status(201).json(invoice);
  } catch (e) {
    await session.abortTransaction();
    res.status(400).json({ message: e.message || "Failed to create sales invoice" });
  } finally {
    session.endSession();
  }
});

/* ==========================================
   LIST ENDPOINTS (GET with filters/search/paging)
========================================== */
router.get("/sales", protect, async (req, res) => {
  try {
    const { from, to, customer, category, q, page = 1, limit = 50 } = req.query;

    const filter = {};
    const dateRange = buildDateRange(from, to);
    if (dateRange) filter.date = dateRange;
    if (customer && mongoose.isValidObjectId(customer)) filter.customer = customer;
    if (category && mongoose.isValidObjectId(category)) filter["items.category"] = new mongoose.Types.ObjectId(category);

    const rx = pickSearchRegex(q);

    const skip = Math.max(0, (n(page, 1) - 1) * n(limit, 50));
    const lim = Math.min(200, Math.max(1, n(limit, 50)));

    let query = SalesInvoice.find(filter).sort({ date: -1, createdAt: -1 });

    if (rx) {
      const raw = await query.populate("customer", "name phone address").lean();
      const filtered = raw.filter((row) => rx.test(row.invoiceNo) || rx.test(row.customer?.name || ""));
      const total = filtered.length;
      const rows = filtered.slice(skip, skip + lim);

      const stats = rows.reduce(
        (acc, r) => {
          acc.count += 1;
          acc.subTotal += n(r.subTotal);
          acc.discount += n(r.discount);
          acc.grandTotal += n(r.grandTotal);
          acc.paid += n(r.paid);
          acc.due += n(r.due);
          return acc;
        },
        { count: 0, subTotal: 0, discount: 0, grandTotal: 0, paid: 0, due: 0 }
      );

      return res.json({ rows, total, page: n(page, 1), limit: lim, stats });
    }

    const [total, rows] = await Promise.all([
      SalesInvoice.countDocuments(filter),
      query.skip(skip).limit(lim).populate("customer", "name phone address").lean(),
    ]);

    const statsAgg = await SalesInvoice.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          subTotal: { $sum: "$subTotal" },
          discount: { $sum: "$discount" },
          grandTotal: { $sum: "$grandTotal" },
          paid: { $sum: "$paid" },
          due: { $sum: "$due" },
        },
      },
    ]);
    const stats = statsAgg[0] || { count: 0, subTotal: 0, discount: 0, grandTotal: 0, paid: 0, due: 0 };

    res.json({ rows, total, page: n(page, 1), limit: lim, stats });
  } catch (e) {
    res.status(500).json({ message: "Failed to load sales invoices" });
  }
});

router.get("/purchases", protect, async (req, res) => {
  try {
    const { from, to, supplier, category, q, page = 1, limit = 50 } = req.query;

    const filter = {};
    const dateRange = buildDateRange(from, to);
    if (dateRange) filter.date = dateRange;
    if (supplier && mongoose.isValidObjectId(supplier)) filter.supplier = supplier;
    if (category && mongoose.isValidObjectId(category)) filter["items.category"] = new mongoose.Types.ObjectId(category);

    const rx = pickSearchRegex(q);

    const skip = Math.max(0, (n(page, 1) - 1) * n(limit, 50));
    const lim = Math.min(200, Math.max(1, n(limit, 50)));

    const base = PurchaseInvoice.find(filter).sort({ date: -1, createdAt: -1 });

    if (rx) {
      const raw = await base.populate("supplier", "name phone address").lean();
      const filtered = raw.filter((row) => rx.test(row.invoiceNo) || rx.test(row.supplier?.name || ""));
      const total = filtered.length;
      const rows = filtered.slice(skip, skip + lim);

      const stats = rows.reduce(
        (acc, r) => {
          acc.count += 1;
          acc.subTotal += n(r.subTotal);
          acc.discount += n(r.discount);
          acc.grandTotal += n(r.grandTotal);
          acc.paid += n(r.paid);
          acc.due += n(r.due);
          return acc;
        },
        { count: 0, subTotal: 0, discount: 0, grandTotal: 0, paid: 0, due: 0 }
      );

      return res.json({ rows, total, page: n(page, 1), limit: lim, stats });
    }

    const [total, rows] = await Promise.all([
      PurchaseInvoice.countDocuments(filter),
      base.skip(skip).limit(lim).populate("supplier", "name phone address").lean(),
    ]);

    const statsAgg = await PurchaseInvoice.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          subTotal: { $sum: "$subTotal" },
          discount: { $sum: "$discount" },
          grandTotal: { $sum: "$grandTotal" },
          paid: { $sum: "$paid" },
          due: { $sum: "$due" },
        },
      },
    ]);
    const stats = statsAgg[0] || { count: 0, subTotal: 0, discount: 0, grandTotal: 0, paid: 0, due: 0 };

    res.json({ rows, total, page: n(page, 1), limit: lim, stats });
  } catch (e) {
    res.status(500).json({ message: "Failed to load purchase invoices" });
  }
});

/* ==========================================
   GET single invoice (populate product & category)
========================================== */
router.get("/sales/:id", protect, async (req, res) => {
  const inv = await SalesInvoice.findById(req.params.id)
    .populate("customer", "name phone address")
    .populate("items.product", "name unit")
    .populate("items.category", "name")
    .lean();
  if (!inv) return res.status(404).json({ message: "Not found" });
  res.json(inv);
});

router.get("/purchases/:id", protect, async (req, res) => {
  const inv = await PurchaseInvoice.findById(req.params.id)
    .populate("supplier", "name phone address")
    .populate("items.product", "name unit")
    .populate("items.category", "name")
    .lean();
  if (!inv) return res.status(404).json({ message: "Not found" });
  res.json(inv);
});

/* ==========================================
   Aggregates for Dashboard — by Category
========================================== */

// Sales by Category
router.get("/sales/by-category", protect, async (req, res) => {
  try {
    const { from, to } = req.query;
    const match = {};
    const range = buildDateRange(from, to);
    if (range) match.date = range;

    const rows = await SalesInvoice.aggregate([
      { $match: match },
      { $unwind: "$items" },
      {
        $group: {
          _id: { category: "$items.category", categoryName: "$items.categoryName" },
          amount: { $sum: "$items.amount" },
          qty: { $sum: "$items.quantity" },
          invoices: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          _id: 0,
          category: "$_id.category",
          categoryName: { $ifNull: ["$_id.categoryName", ""] },
          amount: 1,
          qty: 1,
          invoiceCount: { $size: "$invoices" },
        },
      },
      { $sort: { amount: -1 } },
    ]);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Failed to aggregate sales by category" });
  }
});

// Purchases by Category
router.get("/purchases/by-category", protect, async (req, res) => {
  try {
    const { from, to } = req.query;
    const match = {};
    const range = buildDateRange(from, to);
    if (range) match.date = range;

    const rows = await PurchaseInvoice.aggregate([
      { $match: match },
      { $unwind: "$items" },
      {
        $group: {
          _id: { category: "$items.category", categoryName: "$items.categoryName" },
          amount: { $sum: "$items.amount" },
          qty: { $sum: "$items.quantity" },
          invoices: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          _id: 0,
          category: "$_id.category",
          categoryName: { $ifNull: ["$_id.categoryName", ""] },
          amount: 1,
          qty: 1,
          invoiceCount: { $size: "$invoices" },
        },
      },
      { $sort: { amount: -1 } },
    ]);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Failed to aggregate purchases by category" });
  }
});

export default router;
