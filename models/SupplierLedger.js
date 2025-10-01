// models/SupplierLedger.js
import mongoose from "mongoose";

const supplierLedgerSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase" },
    debit: { type: Number, default: 0 }, // Amount supplier should receive
    credit: { type: Number, default: 0 }, // Amount we paid
    balance: { type: Number, required: true }, // running balance (due)
  },
  { timestamps: true }
);

export default mongoose.model("SupplierLedger", supplierLedgerSchema);
