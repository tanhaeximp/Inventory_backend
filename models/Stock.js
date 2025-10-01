// models/Stock.js
import mongoose from "mongoose";

const stockSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    // Current remaining quantity in this FIFO batch (can go down to 0)
    quantity: { type: Number, required: true, min: 0 },

    // Very important for valuation: the purchase cost per unit of THIS batch
    unitCost: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true } // createdAt used for FIFO ordering
);

// Helpful compound index for fast FIFO scans
stockSchema.index({ product: 1, createdAt: 1 });

export default mongoose.model("Stock", stockSchema);
