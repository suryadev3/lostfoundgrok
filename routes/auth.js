const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { sendMail } = require("../config/mailer");
const { isValidEmail, isValidPassword } = require("../utils/validators");

const router = express.Router();
const APP_URL = process.env.APP_URL || "http://localhost:3000";

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function makeOtp() {
  // 6-digit numeric OTP, easy to type on phone
  return String(Math.floor(100000 + Math.random() * 900000));
}

function makeResetCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

// ---------- Register ----------
router.post("/register", async (req, res) => {
  try {
    const { register_no, email, password } = req.body;

    if (!register_no || !email || !password) {
      return res.status(400).json({ error: "Register number, email, and password are required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const cleanRegisterNo = String(register_no).trim();
    const student = db.prepare("SELECT * FROM students WHERE register_no = ?").get(cleanRegisterNo);
    if (!student) {
      return res.status(404).json({
        error: "That register number was not found in the CHE class roster. Please check and try again.",
      });
    }

    const existingByRegNo = db.prepare("SELECT id FROM users WHERE register_no = ?").get(cleanRegisterNo);
    if (existingByRegNo) {
      return res.status(409).json({ error: "An account already exists for this register number." });
    }
    const existingByEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim());
    if (existingByEmail) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const hash = bcrypt.hashSync(password, 10);
    const otp = makeOtp();
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    const result = db
      .prepare(
        `INSERT INTO users (name, register_no, roll_no, email, password, role, verified, verify_token, verify_token_expires)
         VALUES (?, ?, ?, ?, ?, 'student', 0, ?, ?)`
      )
      .run(student.name, student.register_no, student.roll_no, email.toLowerCase().trim(), hash, otp, expires);

    let emailSent = false;
    try {
      await sendMail({
        to: email,
        subject: "Your Lost & Found verification code",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:20px">
            <h2>Welcome, ${student.name}!</h2>
            <p>Your verification code is:</p>
            <p style="font-size:32px;font-weight:bold;letter-spacing:6px;background:#f0f4f8;padding:16px;text-align:center;border-radius:8px">${otp}</p>
            <p>Enter this code on the website to activate your account.</p>
            <p style="color:#888;font-size:12px">Code expires in 30 minutes. Roll No: ${student.roll_no}</p>
          </div>
        `,
      });
      emailSent = true;
    } catch (err) {
      console.error("Failed to send verification email:", err.message);
    }

    // Always log OTP for demo / Render logs
    console.log(`\n======== VERIFICATION OTP for ${email}: ${otp} ========\n`);

    res.status(201).json({
      message: emailSent
        ? `Account created for ${student.name}! Check your email for the 6-digit verification code.`
        : `Account created for ${student.name}! Email could not be sent. Use this code: ${otp}`,
      userId: result.lastInsertRowid,
      studentName: student.name,
      rollNo: student.roll_no,
      // Helpful for demo when email fails
      demoOtp: emailSent ? undefined : otp,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ---------- Verify OTP ----------
router.post("/verify", (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: "Email and verification code are required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.verified) return res.status(400).json({ error: "Account is already verified. You can log in." });

    if (user.verify_token !== String(code).trim()) {
      return res.status(400).json({ error: "Invalid verification code" });
    }
    if (new Date(user.verify_token_expires) < new Date()) {
      return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    }

    db.prepare(
      "UPDATE users SET verified = 1, verify_token = NULL, verify_token_expires = NULL WHERE id = ?"
    ).run(user.id);

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role, roll_no: user.roll_no },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      message: "Email verified successfully! You are now logged in.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        register_no: user.register_no,
        roll_no: user.roll_no,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Verification failed" });
  }
});

// Keep old link-based verify for compatibility
router.get("/verify/:token", (req, res) => {
  const user = db
    .prepare("SELECT * FROM users WHERE verify_token = ? AND verify_token_expires > datetime('now')")
    .get(req.params.token);

  if (!user) {
    return res.send("<h2>This verification link is invalid or has expired.</h2>");
  }

  db.prepare(
    "UPDATE users SET verified = 1, verify_token = NULL, verify_token_expires = NULL WHERE id = ?"
  ).run(user.id);

  res.send("<h2>Email verified!</h2><p>You can now go back to the app and log in.</p>");
});

// ---------- Resend verification OTP ----------
router.post("/resend-verification", async (req, res) => {
  const { email } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get((email || "").toLowerCase().trim());

  const genericMsg = { message: "If that account exists and isn't verified yet, a new code has been sent." };
  if (!user || user.verified) return res.json(genericMsg);

  const otp = makeOtp();
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare("UPDATE users SET verify_token = ?, verify_token_expires = ? WHERE id = ?").run(
    otp,
    expires,
    user.id
  );

  try {
    await sendMail({
      to: email,
      subject: "Your new Lost & Found verification code",
      html: `<p>Your new code is: <strong style="font-size:24px">${otp}</strong></p><p>Expires in 30 minutes.</p>`,
    });
  } catch (err) {
    console.error("Failed to resend verification email:", err.message);
  }

  console.log(`\n======== RESEND OTP for ${email}: ${otp} ========\n`);
  res.json({ ...genericMsg, demoOtp: otp });
});

// ---------- Login ----------
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get((email || "").toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (!user.verified) {
    return res.status(403).json({
      error: "Please verify your email with the 6-digit code before logging in.",
      unverified: true,
    });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role, roll_no: user.roll_no },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      register_no: user.register_no,
      roll_no: user.roll_no,
    },
  });
});

// ---------- Forgot password ----------
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get((email || "").toLowerCase().trim());

  const genericMsg = { message: "If that email is registered, a reset code has been sent." };
  if (!user) return res.json(genericMsg);

  const code = makeResetCode();
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?").run(
    code,
    expires,
    user.id
  );

  try {
    await sendMail({
      to: email,
      subject: "Password reset code - Lost & Found",
      html: `<p>Your password reset code is: <strong style="font-size:24px">${code}</strong></p><p>Expires in 30 minutes.</p>`,
    });
  } catch (err) {
    console.error("Failed to send reset email:", err.message);
  }

  console.log(`\n======== PASSWORD RESET CODE for ${email}: ${code} ========\n`);
  res.json({ ...genericMsg, demoResetCode: code });
});

// ---------- Reset password ----------
router.post("/reset-password", (req, res) => {
  const { token, password } = req.body; // token here is the short code
  if (!token || !password) {
    return res.status(400).json({ error: "Code and new password are required" });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const user = db
    .prepare("SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')")
    .get(String(token).trim().toUpperCase());

  if (!user) {
    return res.status(400).json({ error: "Invalid or expired reset code" });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?"
  ).run(hash, user.id);

  res.json({ message: "Password updated successfully. You can now log in." });
});

module.exports = router;
