// routes/ledger.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import mongoose from "mongoose";

import Customer from "../models/Customer.js";
import Supplier from "../models/Supplier.js";

// ✅ use invoices instead of old Sale/Purchase
import SalesInvoice from "../models/SalesInvoice.js";
import PurchaseInvoice from "../models/PurchaseInvoice.js";

import CustomerPayment from "../models/CustomerPayment.js";
import SupplierPayment from "../models/SupplierPayment.js";

const router = express.Router();

function parseRange(q) {
  let from = q.from ? new Date(q.from) : null;
  let to   = q.to   ? new Date(q.to)   : null;
  if (to) to.setHours(23, 59, 59, 999);
  return { from, to };
}

/** CUSTOMER LEDGER
 * Opening = outstandingBalance + (SalesInvoice before 'from') - (CustomerPayments before 'from')
 * Period = SalesInvoice (DR by grandTotal) + CustomerPayments (CR by amount)
 */
router.get("/customers/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid customer id" });

    const customer = await Customer.findById(id).lean();
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const { from, to } = parseRange(req.query);

    // Opening balance from model + invoices/payments prior to 'from'
    let openingBalance = customer.outstandingBalance || 0;

    if (from) {
      const preInv = await SalesInvoice.aggregate([
        { $match: { customer: new mongoose.Types.ObjectId(id), date: { $lt: from } } },
        { $group: { _id: null, dr: { $sum: "$grandTotal" } } },
      ]);

      const prePays = await CustomerPayment.aggregate([
        { $match: { customer: new mongoose.Types.ObjectId(id), date: { $lt: from } } },
        { $group: { _id: null, cr: { $sum: "$amount" } } },
      ]);

      openingBalance = openingBalance + (preInv[0]?.dr || 0) - (prePays[0]?.cr || 0);
    }

    // Period transactions
    const dateRange = {};
    if (from) dateRange.$gte = from;
    if (to)   dateRange.$lte = to;

    const invFilter = { customer: id };
    if (from || to) invFilter.date = dateRange;

    const invoices = await SalesInvoice.find(invFilter)
      .select("_id date grandTotal note")
      .lean();

    const invTx = invoices.map(i => ({
      _id: i._id,
      date: i.date,
      type: "SALE",
      description: i.note || "Invoice",
      debit: i.grandTotal,
      credit: 0,
    }));

    const payFilter = { customer: id };
    if (from || to) payFilter.date = dateRange;

    const pays = await CustomerPayment.find(payFilter)
      .select("_id date amount method note")
      .lean();

    const payTx = pays.map(p => ({
      _id: p._id,
      date: p.date,
      type: "RECEIPT",
      description: p.note || p.method || "Payment received",
      debit: 0,
      credit: p.amount,
    }));

    const txs = [...invTx, ...payTx].sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = openingBalance;
    const transactions = txs.map(t => {
      running = running + (t.debit || 0) - (t.credit || 0);
      return { ...t, balance: running };
    });

    res.json({
      party: { _id: customer._id, name: customer.name },
      openingBalance,
      transactions,
      closingBalance: running,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to build customer ledger" });
  }
});

/** SUPPLIER LEDGER
 * Opening = openingBalance + (PurchaseInvoice before 'from') - (SupplierPayments before 'from')
 * Period = PurchaseInvoice (DR by grandTotal) + SupplierPayments (CR by amount)
 */
router.get("/suppliers/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid supplier id" });

    const supplier = await Supplier.findById(id).lean();
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    const { from, to } = parseRange(req.query);

    // ✅ use supplier.openingBalance (your schema changed)
    let openingBalance = supplier.openingBalance || 0;

    if (from) {
      const preInv = await PurchaseInvoice.aggregate([
        { $match: { supplier: new mongoose.Types.ObjectId(id), date: { $lt: from } } },
        { $group: { _id: null, dr: { $sum: "$grandTotal" } } },
      ]);

      const prePays = await SupplierPayment.aggregate([
        { $match: { supplier: new mongoose.Types.ObjectId(id), date: { $lt: from } } },
        { $group: { _id: null, cr: { $sum: "$amount" } } },
      ]);

      openingBalance = openingBalance + (preInv[0]?.dr || 0) - (prePays[0]?.cr || 0);
    }

    // Period
    const dateRange = {};
    if (from) dateRange.$gte = from;
    if (to)   dateRange.$lte = to;

    const invFilter = { supplier: id };
    if (from || to) invFilter.date = dateRange;

    const invoices = await PurchaseInvoice.find(invFilter)
      .select("_id date grandTotal note")
      .lean();

    const invTx = invoices.map(i => ({
      _id: i._id,
      date: i.date,
      type: "PURCHASE",
      description: i.note || "Bill",
      debit: i.grandTotal,
      credit: 0,
    }));

    const payFilter = { supplier: id };
    if (from || to) payFilter.date = dateRange;

    const pays = await SupplierPayment.find(payFilter)
      .select("_id date amount method note")
      .lean();

    const payTx = pays.map(p => ({
      _id: p._id,
      date: p.date,
      type: "PAYMENT",
      description: p.note || p.method || "Payment to supplier",
      debit: 0,
      credit: p.amount,
    }));

    const txs = [...invTx, ...payTx].sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = openingBalance;
    const transactions = txs.map(t => {
      running = running + (t.debit || 0) - (t.credit || 0);
      return { ...t, balance: running };
    });

    res.json({
      party: { _id: supplier._id, name: supplier.name },
      openingBalance,
      transactions,
      closingBalance: running,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to build supplier ledger" });
  }
});

export default router;
