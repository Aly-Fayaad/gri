const nodemailer = require("nodemailer");
const AppError = require("./appError");

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;

  if (!emailUser || !emailPassword) {
    throw new AppError(
      "Email credentials are missing. Set EMAIL_USER and EMAIL_PASSWORD in config.env",
      500
    );
  }

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Port 587 uses STARTTLS
    auth: {
      user: emailUser,
      pass: emailPassword,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  return transporter;
};

module.exports = async (email, sub, text = "", html = "") => {
  const currentTransporter = getTransporter();
  const currentEmailUser = process.env.EMAIL_USER;

  const mailPromise = currentTransporter.sendMail({
    from: currentEmailUser,
    to: email,
    subject: sub,
    text: text,
    html: html,
  });

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      console.error("❌ Email service timeout for:", email);
      reject(new AppError("Email service timeout", 504));
    }, 30000); // Increased to 30s
  });

  try {
    const info = await Promise.race([mailPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    console.log("✅ Message sent successfully:", info.messageId);
    return info;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("❌ Error sending email:", error.message);
    throw error;
  }
};

