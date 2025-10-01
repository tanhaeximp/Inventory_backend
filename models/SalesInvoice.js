// models/SalesInvoice.js
import mongoose from "mongoose";

const LineItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    unit: String,
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    amount: { type: Number, required: true },

    // snapshot the product category at time of sale
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    categoryName: { type: String, default: "" },

    // NEW: per-line cost of goods (computed from FIFO stock batches)
    cogs: { type: Number, default: 0 },
  },
  { _id: false }
);

const SalesInvoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    date: { type: Date, default: Date.now },
    items: { type: [LineItemSchema], default: [] },

    subTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    due: { type: Number, default: 0 },
    note: String,

    // NEW: invoice-level totals for COGS & Profit
    cogsTotal: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("SalesInvoice", SalesInvoiceSchema);
