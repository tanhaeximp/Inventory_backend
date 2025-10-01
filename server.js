import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import purchaseRoutes from "./routes/purchase.js";
import saleRoutes from "./routes/sale.js";
import reportRoutes from "./routes/report.js";
import stockRoutes from "./routes/stock.js";
import customerRoutes from "./routes/customer.js";
import supplierRoutes from "./routes/supplier.js";
import productRoutes from "./routes/product.js";
import userRoutes from "./routes/users.js";
import ledgerRoutes from "./routes/ledger.js";
import paymentRoutes from "./routes/payments.js";
import invoiceRoutes from "./routes/invoices.js";
import categoryRoutes from "./routes/categories.js";
import pnlRoutes from "./routes/pnl.js";
import balanceRoutes from "./routes/balance.js";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/reports", pnlRoutes);
app.use("/api/reports", balanceRoutes);



// Test route
app.get("/", (req, res) => {
  res.send("Inventory backend is running");
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
