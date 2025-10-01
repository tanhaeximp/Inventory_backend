// models/SupplierPayment.js
import mongoose from "mongoose";

const supplierPaymentSchema = new mongoose.Schema(
  {
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    amount:   { type: Number, required: true, min: 0 },
    method:   { type: String },
    note:     { type: String },
    date:     { type: Date, default: Date.now },
  },
  { timestamps: true }
);

supplierPaymentSchema.index({ supplier: 1, date: 1 });
export default mongoose.model("SupplierPayment", supplierPaymentSchema);
