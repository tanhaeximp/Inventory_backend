// models/Product.js
import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    unit: { type: String, trim: true },
    price: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    // NEW: category reference
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
  },
  { timestamps: true }
);

// Optional: virtual to expose { categoryName } when populated
ProductSchema.virtual("categoryName").get(function () {
  // only available if populated as { category: { name } }
  return this.category && this.category.name ? this.category.name : "";
});

export default mongoose.model("Product", ProductSchema);
