require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const { authLimiter } = require("./middleware/rateLimiter");
const authRoutes = require("./routes/auth");
const reportRoutes = require("./routes/reports");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json());

// Serve the website (public folder) - same server, same API, no extra setup needed
app.use(express.static(path.join(__dirname, "public")));

// Serve uploaded photos so the website can display them
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Open that address in your browser to use the site.`);
});
