const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

// Configure Gmail SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "masteravi2003@gmail.com", // your Gmail
    pass: functions.config().gmail.pass, // stored in Firebase config
  },
});

// Function to trigger on new mailQueue docs
exports.sendQueuedMail = functions.firestore
  .document("artifacts/{appId}/public/data/mailQueue/{mailId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data.to || !data.subject || !data.body) {
      console.error("Invalid mail data:", data);
      return null;
    }

    const mailOptions = {
      from: "AI Financial Co-pilot <masteravi2003@gmail.com>",
      to: data.to,
      subject: data.subject,
      text: data.body,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${data.to}`);

      // Optionally mark mail as sent
      await snap.ref.update({ sentAt: admin.firestore.FieldValue.serverTimestamp(), status: "sent" });
    } catch (err) {
      console.error("❌ Error sending email:", err);
      await snap.ref.update({ status: "error", error: err.message });
    }
  });
