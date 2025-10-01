// scripts/reconcileProductStock.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../models/Product.js";
import Stock from "../models/Stock.js";

dotenv.config();

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // Sum current batch quantities by product
  const sums = await Stock.aggregate([
    { $group: { _id: "$product", total: { $sum: "$quantity" } } },
  ]);

  // Update each product's running stock to match summed batches
  for (const { _id: productId, total } of sums) {
    await Product.updateOne({ _id: productId }, { $set: { stock: total } });
  }

  // Any product with no batches → stock = 0
  const withBatches = new Set(sums.map(s => String(s._id)));
  const products = await Product.find({}, "_id");
  for (const p of products) {
    if (!withBatches.has(String(p._id))) {
      await Product.updateOne({ _id: p._id }, { $set: { stock: 0 } });
    }
  }

  console.log("✅ Reconcile complete");
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error("Reconcile failed:", e);
  process.exit(1);
});
