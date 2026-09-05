const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const sales = db
    .prepare(
      `SELECT sales.*, products.name AS product_name, customers.name AS customer_name
       FROM sales
       LEFT JOIN products ON products.id = sales.product_id
       LEFT JOIN customers ON customers.id = sales.customer_id
       WHERE sales.shop_id = ?
       ORDER BY sales.created_at DESC
       LIMIT 100`
    )
    .all(req.shopId);
  res.json(sales);
});

router.post("/", (req, res) => {
  const { productId, qty, customerId, source } = req.body || {};
  const qtyNum = Number(qty);
  if (!productId || isNaN(qtyNum) || qtyNum < 1) {
    return res.status(400).json({ error: "اختر منتج وكمية صحيحة" });
  }

  const runSale = db.transaction(() => {
    const product = db
      .prepare("SELECT * FROM products WHERE id = ? AND shop_id = ?")
      .get(productId, req.shopId);
    if (!product) throw { status: 404, message: "المنتج غير موجود" };
    if (product.qty < qtyNum) throw { status: 400, message: `الكمية المتاحة فقط ${product.qty}` };

    let customer = null;
    if (customerId) {
      customer = db
        .prepare("SELECT * FROM customers WHERE id = ? AND shop_id = ?")
        .get(customerId, req.shopId);
    }

    const total = product.price * qtyNum;
    const now = new Date().toISOString();

    db.prepare("UPDATE products SET qty = qty - ? WHERE id = ?").run(qtyNum, product.id);

    const result = db
      .prepare(
        "INSERT INTO sales (shop_id, product_id, customer_id, qty, total, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(req.shopId, product.id, customer ? customer.id : null, qtyNum, total, source || "محل", now);

    const notifText = `تم إرسال فاتورة واتساب${customer ? " لـ " + customer.name : ""}: ${product.name} × ${qtyNum} = ${Math.round(total)} ج.م`;
    db.prepare("INSERT INTO notifications (shop_id, text, created_at) VALUES (?, ?, ?)").run(
      req.shopId,
      notifText,
      now
    );

    return db
      .prepare(
        `SELECT sales.*, products.name AS product_name, customers.name AS customer_name
         FROM sales LEFT JOIN products ON products.id = sales.product_id
         LEFT JOIN customers ON customers.id = sales.customer_id
         WHERE sales.id = ?`
      )
      .get(result.lastInsertRowid);
  });

  try {
    const sale = runSale();
    res.status(201).json(sale);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: e.message || "حصل خطأ في تسجيل البيع" });
  }
});

module.exports = router;
