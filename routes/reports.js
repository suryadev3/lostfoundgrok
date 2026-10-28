const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { findMatches } = require("../utils/matching");

const router = express.Router();

// ---------- Photo upload config ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "..", "uploads")),
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(8).toString("hex");
    cb(null, `${Date.now()}-${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB – faster on free Render
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

// POST /api/reports  (create a lost or found report, photo optional)
router.post("/", requireAuth, (req, res) => {
  upload.single("photo")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const { type, category, title, description, location } = req.body;
    if (!type || !category || !title || !description || !location) {
      return res.status(400).json({ error: "Type, category, title, description, and location are all required" });
    }
    if (type !== "lost" && type !== "found") {
      return res.status(400).json({ error: "Type must be 'lost' or 'found'" });
    }

    const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

    const result = db
      .prepare(
        `INSERT INTO reports (user_id, type, category, title, description, location, photo_path, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Open')`
      )
      .run(req.user.id, type, category, title, description, location, photoPath);

    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(report);
  });
});

// GET /api/reports?type=lost|found  (browse all open reports, optionally filtered)
router.get("/", requireAuth, (req, res) => {
  const { type, category } = req.query;
  let query = `SELECT reports.*, users.name AS reporter_name FROM reports
               JOIN users ON reports.user_id = users.id WHERE reports.status != 'Returned'`;
  const params = [];

  if (type === "lost" || type === "found") {
    query += " AND reports.type = ?";
    params.push(type);
  }
  if (category) {
    query += " AND reports.category = ?";
    params.push(category);
  }
  query += " ORDER BY reports.created_at DESC";

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// GET /api/reports/mine  (the logged-in user's own reports)
router.get("/mine", requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user.id);
  res.json(rows);
});

// GET /api/reports/:id  (single report detail)
router.get("/:id", requireAuth, (req, res) => {
  const report = db
    .prepare(
      `SELECT reports.*, users.name AS reporter_name FROM reports
       JOIN users ON reports.user_id = users.id WHERE reports.id = ?`
    )
    .get(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  res.json(report);
});

// GET /api/reports/:id/matches  (AI-suggested matches from the opposite list)
router.get("/:id/matches", requireAuth, (req, res) => {
  const target = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "Report not found" });

  const oppositeType = target.type === "lost" ? "found" : "lost";
  const candidates = db
    .prepare("SELECT * FROM reports WHERE type = ? AND status != 'Returned' AND id != ?")
    .all(oppositeType, target.id);

  const matches = findMatches(target, candidates, 30);
  res.json(
    matches.map((m) => ({ ...m.report, matchScore: m.score }))
  );
});

// PATCH /api/reports/:id/status  (owner or admin updates status)
router.patch("/:id/status", requireAuth, (req, res) => {
  const { status } = req.body;
  const allowed = ["Open", "Matched", "Returned"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Status must be one of: " + allowed.join(", ") });
  }

  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });

  const isOwner = report.user_id === req.user.id;
  const isAdmin = req.user.role === "admin";
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: "You can only update your own reports" });
  }

  const resolvedAt = status === "Returned" ? new Date().toISOString() : null;
  db.prepare("UPDATE reports SET status = ?, resolved_at = ? WHERE id = ?").run(
    status,
    resolvedAt,
    req.params.id
  );

  const updated = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  res.json(updated);
});

// GET /api/reports/admin/all  (admin: see every report regardless of status)
router.get("/admin/all", requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT reports.*, users.name AS reporter_name FROM reports
       JOIN users ON reports.user_id = users.id ORDER BY reports.created_at DESC`
    )
    .all();
  res.json(rows);
});

// DELETE /api/reports/:id  (owner or admin can delete)
router.delete("/:id", requireAuth, (req, res) => {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });

  const isOwner = report.user_id === req.user.id;
  const isAdmin = req.user.role === "admin";
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: "You can only delete your own reports" });
  }

  db.prepare("DELETE FROM reports WHERE id = ?").run(req.params.id);
  res.json({ message: "Report deleted successfully" });
});

module.exports = router;
