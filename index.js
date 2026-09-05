require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/sales", require("./routes/sales"));
app.use("/api/debts", require("./routes/debts"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/assistant", require("./routes/assistant"));

app.use(express.static(path.join(__dirname, "..", "public")));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Shop OS server running on http://localhost:${PORT}`);
});
