// routes/balance.js
import express from "express";
import mongoose from "mongoose";
import { protect } from "../middleware/authMiddleware.js";

import Stock from "../models/Stock.js";
import SalesInvoice from "../models/SalesInvoice.js";
import PurchaseInvoice from "../models/PurchaseInvoice.js";
import CustomerPayment from "../models/CustomerPayment.js";
import SupplierPayment from "../models/SupplierPayment.js";

/**
 * Balance Sheet & P&L snapshot
 *
 * GET /api/reports/balance-sheet?asOf=YYYY-MM-DD&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * - asOf:     date used for balance sheet (defaults: today)
 * - from/to:  optional period for revenue/COGS/expenses (defaults: calendar month of asOf)
 *
 * Returns:
 * {
 *   asOf,
 *   assets: {
 *     cash, accountsReceivable, inventory, total
 *   },
 *   liabilities: {
 *     accountsPayable, total
 *   },
 *   equity: {
 *     total               // Assets - Liabilities
 *   },
 *   period: { from, to },
 *   pnl: {
 *     revenue, cogs, otherExpenses, netProfit, grossProfit
 *   }
 * }
 *
 * Notes/Assumptions:
 * - Cash := sum(CustomerPayments) - sum(SupplierPayments) up to asOf
 * - A/R := sum(SalesInvoice.grandTotal) - sum(CustomerPayments) up to asOf
 * - A/P := sum(PurchaseInvoice.grandTotal) - sum(SupplierPayments) up to asOf
 * - Inventory := sum(stock.quantity * stock.unitCost) for all open stock as of asOf
 * - Expenses/Other costings: if you add an Expense model later, we can subtract it in P&L.
 */
const router = express.Router();

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function toNumber(x)   { const n = Number(x); return Number.isFinite(n) ? n : 0; }

router.get("/balance-sheet", protect, async (req, res) => {
  try {
    const asOf = req.query.asOf ? new Date(req.query.asOf) : new Date();
    const A = endOfDay(asOf);

    // Default period = current calendar month of asOf
    const defaultFrom = new Date(A.getFullYear(), A.getMonth(), 1);
    const periodFrom = req.query.from ? startOfDay(new Date(req.query.from)) : defaultFrom;
    const periodTo   = req.query.to   ? endOfDay(new Date(req.query.to))     : A;

    // ----- CASH (up to asOf)
    const [custPayAgg, suppPayAgg] = await Promise.all([
      CustomerPayment.aggregate([
        { $match: { date: { $lte: A } } },
        { $group: { _id: null, amt: { $sum: { $ifNull: ["$amount", 0] } } } },
      ]),
      SupplierPayment.aggregate([
        { $match: { date: { $lte: A } } },
        { $group: { _id: null, amt: { $sum: { $ifNull: ["$amount", 0] } } } },
      ]),
    ]);

    const customerPaymentsAsOf = toNumber(custPayAgg[0]?.amt);
    const supplierPaymentsAsOf = toNumber(suppPayAgg[0]?.amt);
    const cash = customerPaymentsAsOf - supplierPaymentsAsOf;

    // ----- SALES & PURCHASE totals up to asOf (for AR/AP)
    const [salesAggAsOf, purchAggAsOf] = await Promise.all([
      SalesInvoice.aggregate([
        { $match: { date: { $lte: A } } },
        { $group: { _id: null, amt: { $sum: { $ifNull: ["$grandTotal", 0] } } } },
      ]),
      PurchaseInvoice.aggregate([
        { $match: { date: { $lte: A } } },
        { $group: { _id: null, amt: { $sum: { $ifNull: ["$grandTotal", 0] } } } },
      ]),
    ]);

    const salesTotalAsOf  = toNumber(salesAggAsOf[0]?.amt);
    const purchTotalAsOf  = toNumber(purchAggAsOf[0]?.amt);

    // ----- A/R & A/P
    const accountsReceivable = Math.max(0, salesTotalAsOf - customerPaymentsAsOf);
    const accountsPayable    = Math.max(0, purchTotalAsOf - supplierPaymentsAsOf);

    // ----- INVENTORY (open stock value as of asOf)
    // We assume Stock docs represent remaining qty; value = sum(qty * unitCost)
    // Optionally filter stocks by purchaseDate <= asOf if you maintain that field reliably.
    const invAgg = await Stock.aggregate([
      // If you want as-of filter by purchaseDate, uncomment this line:
      // { $match: { purchaseDate: { $lte: A } } },
      { $group: { _id: null, val: { $sum: { $multiply: [ { $ifNull: ["$quantity", 0] }, { $ifNull: ["$unitCost", 0] } ] } } } },
    ]);
    const inventory = toNumber(invAgg[0]?.val);

    // ----- ASSETS / LIABILITIES / EQUITY
    const assetsTotal = cash + accountsReceivable + inventory;
    const liabilitiesTotal = accountsPayable;
    const equityTotal = assetsTotal - liabilitiesTotal;

    // ===== P&L for period (from..to):
    const [salesPeriodAgg, cogsPeriodAgg] = await Promise.all([
      SalesInvoice.aggregate([
        { $match: { date: { $gte: periodFrom, $lte: periodTo } } },
        { $group: { _id: null, revenue: { $sum: { $ifNull: ["$grandTotal", 0] } } } },
      ]),
      SalesInvoice.aggregate([
        { $match: { date: { $gte: periodFrom, $lte: periodTo } } },
        { $group: { _id: null, cogs: { $sum: { $ifNull: ["$cogsTotal", 0] } } } },
      ]),
    ]);

    const revenue = toNumber(salesPeriodAgg[0]?.revenue);
    const cogs    = toNumber(cogsPeriodAgg[0]?.cogs);

    // If you later add an Expense model, you can sum it here by date range.
    const otherExpenses = 0;

    const grossProfit = revenue - cogs;
    const netProfit   = grossProfit - otherExpenses;

    res.json({
      asOf: A.toISOString(),
      assets: {
        cash,
        accountsReceivable,
        inventory,
        total: assetsTotal,
      },
      liabilities: {
        accountsPayable,
        total: liabilitiesTotal,
      },
      equity: {
        total: equityTotal,
      },
      period: {
        from: periodFrom.toISOString(),
        to: periodTo.toISOString(),
      },
      pnl: {
        revenue,
        cogs,
        otherExpenses,
        grossProfit,
        netProfit,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e?.message || "Failed to build balance sheet" });
  }
});

export default router;
