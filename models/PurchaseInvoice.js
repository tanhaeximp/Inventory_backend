// models/PurchaseInvoice.js
import mongoose from "mongoose";

const LineItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    unit: String,
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    amount: { type: Number, required: true },

    // NEW: snapshot the product category at time of purchase
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    categoryName: { type: String, default: "" }, // optional convenience for easy UI
  },
  { _id: false }
);

const PurchaseInvoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, index: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    date: { type: Date, default: Date.now },
    items: { type: [LineItemSchema], default: [] },
    subTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    due: { type: Number, default: 0 },
    note: String,
  },
  { timestamps: true }
);

export default mongoose.model("PurchaseInvoice", PurchaseInvoiceSchema);
