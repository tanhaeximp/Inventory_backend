// controllers/stockController.js
import Stock from "../models/Stock.js";

/** Save with optional Mongo session */
function saveWithSession(doc, session) {
  return session ? doc.save({ session }) : doc.save();
}

/** Find query with optional session */
function findWithSession(modelQuery, session) {
  return session ? modelQuery.session(session) : modelQuery;
}

/**
 * FIFO OUT (deduct only) — compatible with your original export
 * Supports an optional Mongo session
 */
export const deductStockFIFO = async (productId, quantity, session = null) => {
  let remainingQty = Number(quantity || 0);

  let q = Stock.find({
    product: productId,
    quantity: { $gt: 0 },
  }).sort({ purchaseDate: 1, createdAt: 1 });

  const stocks = await findWithSession(q, session);

  for (const stock of stocks) {
    if (remainingQty <= 0) break;

    if (stock.quantity >= remainingQty) {
      stock.quantity -= remainingQty;
      await saveWithSession(stock, session);
      remainingQty = 0;
      break;
    } else {
      remainingQty -= stock.quantity;
      stock.quantity = 0;
      await saveWithSession(stock, session);
    }
  }

  if (remainingQty > 0) {
    throw new Error("Not enough stock available for this product");
  }
};

/**
 * FIFO OUT (deduct + compute COGS)
 * Returns: { cogs: number }
 */
export const deductStockFIFOAndGetCOGS = async (productId, quantity, session = null) => {
  let remainingQty = Number(quantity || 0);
  let totalCost = 0;

  let q = Stock.find({
    product: productId,
    quantity: { $gt: 0 },
  }).sort({ purchaseDate: 1, createdAt: 1 });

  const batches = await findWithSession(q, session);

  for (const b of batches) {
    if (remainingQty <= 0) break;

    const take = Math.min(b.quantity, remainingQty);
    totalCost += take * Number(b.unitCost || 0);

    b.quantity -= take;
    await saveWithSession(b, session);

    remainingQty -= take;
  }

  if (remainingQty > 0) {
    throw new Error("Not enough stock available for this product");
  }

  return { cogs: totalCost };
};
