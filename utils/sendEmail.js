const nodemailer = require("nodemailer");

const emailUser = process.env.EMAIL_USER
const emailPassword = process.env.EMAIL_PASSWORD;

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // use STARTTLS (upgrade connection to TLS after connecting)
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: emailUser,
      pass: emailPassword,
    },
  });

module.exports = async (email,sub,text="",html="") => {
  if (!emailUser || !emailPassword) {
    throw new Error(
      "Email credentials are missing. Set EMAIL_USER and EMAIL_PASSWORD in config.env"
    );
  }

  const mailPromise = transporter.sendMail({
    from: emailUser,
    to: email,
    subject: sub,
    text: text, 
    html: html, 
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Email service timeout")), 15000);
  });

  const info = await Promise.race([mailPromise, timeoutPromise]);
  console.log("Message sent:", info.messageId);
  return info
};

