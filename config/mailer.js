const nodemailer = require("nodemailer");

let transporterPromise = null;

function getTransporter() {
  if (transporterPromise) return transporterPromise;

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      })
    );
  } else {
    console.log(
      "No EMAIL_USER/EMAIL_PASS set in .env - using a temporary test inbox. " +
      "Emails won't reach real addresses; a preview link will be printed here instead."
    );
    transporterPromise = nodemailer.createTestAccount().then((testAccount) =>
      nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      })
    );
  }
  return transporterPromise;
}

async function sendMail({ to, subject, html }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || '"Lost & Found Portal" <no-reply@lostfound.app>',
    to,
    subject,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`\nPreview email (test mode) - open this to see it: ${previewUrl}\n`);
  }
  return info;
}

module.exports = { sendMail };
