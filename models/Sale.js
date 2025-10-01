import mongoose from "mongoose";

const saleSchema = new mongoose.Schema(
  {
    customer:   { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    product:    { type: mongoose.Schema.Types.ObjectId, ref: "Product",  required: true },
    unit:       { type: String,  required: true },
    quantity:   { type: Number,  required: true, min: 1 },
    totalPrice: { type: Number,  required: true, min: 0 },
    paidAmount: { type: Number,  required: true, min: 0 },
    dueAmount:  { type: Number,  required: true, min: 0 },
    date:       { type: Date, default: Date.now },
  },
  { timestamps: true }
);

saleSchema.index({ date: 1 });

export default mongoose.model("Sale", saleSchema);
