import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: String,
    address: String,
    openingBalance: { type: Number, default: 0 }, // optional
  },
  { timestamps: true }
);

export default mongoose.model("Customer", customerSchema);
