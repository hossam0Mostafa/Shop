const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function buildContext(shopId) {
  const products = db.prepare("SELECT name, price, qty FROM products WHERE shop_id = ?").all(shopId);
  const debts = db
    .prepare(
      `SELECT debts.amount, debts.note, customers.name AS customer_name
       FROM debts LEFT JOIN customers ON customers.id = debts.customer_id
       WHERE debts.shop_id = ? AND debts.paid = 0`
    )
    .all(shopId);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayTotal = db
    .prepare("SELECT COALESCE(SUM(total),0) AS total FROM sales WHERE shop_id = ? AND created_at >= ?")
    .get(shopId, startOfDay.toISOString()).total;

  const productLines = products.length
    ? products.map((p) => `${p.name}: السعر ${p.price} ج.م، الكمية المتاحة ${p.qty}`).join("\n")
    : "لا توجد منتجات مسجلة بعد";

  const debtLines = debts.length
    ? debts.map((d) => `${d.customer_name || "عميل"}: ${d.amount} ج.م (${d.note || "بدون ملاحظة"})`).join("\n")
    : "لا توجد ديون مستحقة حاليًا";

  return `المنتجات المتاحة في المحل:\n${productLines}\n\nالديون المستحقة:\n${debtLines}\n\nإجمالي مبيعات اليوم: ${Math.round(todayTotal)} ج.م`;
}

router.post("/", async (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "اكتب سؤال أولًا" });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "المساعد الذكي مش مفعّل — لازم تضيف ANTHROPIC_API_KEY في ملف .env على السيرفر",
    });
  }

  const systemPrompt = `أنت المساعد الذكي داخل تطبيق "Shop OS" الخاص بمحل مصري صغير اسمه "${req.shopName}". عندك البيانات الحالية للمحل:\n\n${buildContext(req.shopId)}\n\nجاوب صاحب المحل باللهجة المصرية، بإيجاز ووضوح، واعتمد فقط على البيانات المتاحة أعلاه. لو السؤال عن حاجة مش موجودة في البيانات قوله صراحة إنها مش متوفرة عندك دلوقتي.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: json.error?.message || "تعذر الوصول للمساعد الذكي" });
    }
    const text = (json.content || []).map((b) => b.text || "").join("\n");
    res.json({ reply: text || "معلش، مش قادر أرد دلوقتي." });
  } catch (e) {
    res.status(502).json({ error: "تعذر الاتصال بالمساعد الذكي" });
  }
});

module.exports = router;
