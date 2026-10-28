# Lost & Found Portal — Website

A complete, real working website: Node.js/Express/SQLite backend with an AI-powered matching engine, serving a browser-based frontend. No mobile app involved — everything runs from one folder, on one machine.

## What's in this folder
```
lost-found-website/
  server.js              <- starts everything
  db.js                   <- creates the database + tables automatically
  package.json
  .env.example              <- copy this to .env
  test-matching.js            <- automated tests for the AI matching engine
  config/
    mailer.js                 <- sends verification/reset emails
  middleware/
    auth.js                    <- JWT token protection
    rateLimiter.js               <- blocks brute-force login attempts
  routes/
    auth.js                      <- register/login/verify/forgot/reset
    reports.js                     <- report CRUD + AI matching
  utils/
    validators.js                  <- email/password format checks
    matching.js                     <- the AI matching engine itself
  uploads/                          <- photos people attach to reports land here
  public/                           <- the actual website
    index.html
    style.css
    app.js
```

## Step 1 — Install Node.js (skip if already installed)
Go to **nodejs.org**, download the "LTS" version, install it.
Check it worked — open a terminal and run:
```
node -v
```
You should see a version number.

## Step 2 — Install the project's dependencies
Open a terminal **inside this folder** and run:
```
npm install
```
This downloads everything the backend needs (Express, the database library, etc.). Takes a minute.

## Step 3 — Create your settings file
```
cp .env.example .env
```
Open the new `.env` file and change this line to any random text of your own:
```
JWT_SECRET=change_this_to_a_long_random_string
```
Leave the `EMAIL_USER` / `EMAIL_PASS` lines blank for now — the site will still work fully; it auto-creates a free test inbox and prints a clickable verification link to your terminal instead of sending a real email. You can switch to real email later (instructions below).

## Step 4 — Confirm the AI matching engine works
```
node test-matching.js
```
You should see 5 lines saying `PASS`. This is the actual matching logic being verified before you even start the server — a good thing to mention if anyone asks how you tested the AI feature.

## Step 5 — Start the website
```
npm start
```
You should see:
```
Server running at http://localhost:3000
Open that address in your browser to use the site.
Seeded default admin -> email: admin@college.edu | password: admin123
```
**Leave this terminal open** — closing it shuts down the site.

## Step 6 — Open it
Go to **http://localhost:3000** in any browser (Chrome, Firefox, Edge). The site loads immediately — login screen first.

---

## First Test Checklist
Run through this once to confirm everything works end-to-end:

1. Register using one of your classmates' register numbers (e.g. `2401150731`) and a real email you can check (or watch the terminal for a preview-email link if you left EMAIL_USER blank). You do not type a name — it's filled in automatically from the class roster.
2. Click the verification link, then log in. Check the **Profile** tab — the name and roll number shown should match that register number on the roster.
3. Post a **Found** report — category "Bag", title "Black backpack", description "black backpack found near library", location "Library"
4. Log out, register a second account with a *different* register number, log in
5. Post a **Lost** report — title "Lost my backpack", description "lost a black bag near the library", location "Library"
6. Open that report — you should see the found backpack listed under **AI-Suggested Matches**

If step 6 shows the match and step 2 showed the correct name/roll number, your entire site — backend, database, class roster lookup, website, and AI matching — is confirmed working together.

## About the class roster
Registration now requires a register number that exists in your class's roster (43 students, seeded automatically into the database the first time the server starts — see `db.js`). A student's name and roll number are never typed in; they're looked up from this roster and attached to their account automatically. If your class roster changes (a transfer, a correction), edit the `ROSTER` array near the top of `db.js` and delete `lostfound.db` so it reseeds on the next `npm start` — note this also wipes any reports/accounts already created, so only do this before real use begins.

---

## Switching to real email (recommended before a live demo)
1. Turn on 2-Step Verification on a Gmail account: myaccount.google.com/security
2. Create an App Password: myaccount.google.com/apppasswords
3. In `.env`, set `EMAIL_USER` to that Gmail address and `EMAIL_PASS` to the 16-character app password
4. Restart the server (`Ctrl+C`, then `npm start` again)

---

## Publishing it live (so it works from anywhere, not just your laptop)

**Push to GitHub:**
```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/lost-found-website.git
git push -u origin main
```
(Create that empty repository on github.com first.)

**Deploy on Render (free):**
1. Go to render.com, sign in with GitHub
2. New + → Web Service → select your repo
3. Build command: `npm install` — Start command: `npm start`
4. Add environment variables: `JWT_SECRET`, `APP_URL` (your Render URL once you have one), `EMAIL_USER`, `EMAIL_PASS`
5. Create Web Service, wait for deploy, then visit your new `https://your-app.onrender.com` link

*Note: Render's free tier resets the database on redeploy — fine for demos, worth mentioning honestly if asked in your viva.*

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails | Check Node.js is actually installed (`node -v`); re-run `npm install` |
| Page loads but "Could not reach the server" on login | The terminal running `npm start` isn't running anymore — restart it |
| Photo upload fails | Check the `uploads` folder exists in this project (it should already) |
| "Something went wrong" on every action | Check the terminal running the server — the real error prints there |
| Port 3000 already in use | Another program is using that port; change `PORT=3000` in `.env` to `PORT=3001`, restart, then visit `http://localhost:3001` |
