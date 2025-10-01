import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: String,
    address: String,
    openingBalance: { type: Number, default: 0 }, // optional
  },
  { timestamps: true }
);

export default mongoose.model("Supplier", supplierSchema);
