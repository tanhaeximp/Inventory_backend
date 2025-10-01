// models/Category.js
import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("Category", CategorySchema);
