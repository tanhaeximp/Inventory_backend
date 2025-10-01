// models/CustomerPayment.js
import mongoose from "mongoose";

const customerPaymentSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    amount:   { type: Number, required: true, min: 0 },
    method:   { type: String }, // cash, bank, etc.
    note:     { type: String },
    date:     { type: Date, default: Date.now },
  },
  { timestamps: true }
);

customerPaymentSchema.index({ customer: 1, date: 1 });
export default mongoose.model("CustomerPayment", customerPaymentSchema);
