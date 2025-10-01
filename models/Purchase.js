import mongoose from "mongoose";

const purchaseSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number, // computed automatically
    },
    paid: {
      type: Number,
      default: 0,
      min: 0,
    },
    due: {
      type: Number, // computed automatically
    },
  },
  { timestamps: true }
);

// Auto-calculate total & due before saving
purchaseSchema.pre("save", function (next) {
  this.total = this.quantity * this.price;
  this.due = this.total - (this.paid || 0);
  if (this.due < 0) this.due = 0;
  next();
});

export default mongoose.model("Purchase", purchaseSchema);
