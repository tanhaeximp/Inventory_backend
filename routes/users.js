import express from "express";
import User from "../models/User.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get all users
router.get("/", protect, admin, async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
});

// Delete user
router.delete("/:id", protect, admin, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User deleted" });
});

export default router;
