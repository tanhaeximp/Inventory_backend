import express from "express";
import Customer from "../models/Customer.js";

const router = express.Router();

// Get all customers
router.get("/", async (req, res) => {
  try {
    const customers = await Customer.find();
    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add new customer
router.post("/", async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const customer = new Customer({ name, phone, address });
    await customer.save();
    res.status(201).json(customer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
