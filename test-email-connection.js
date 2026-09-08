const nodemailer = require("nodemailer");
require('dotenv').config({ path: './config.env' });

const emailUser = process.env.EMAIL_USER;
const emailPassword = process.env.EMAIL_PASSWORD;

console.log("Testing with:", emailUser);

const testConnection = async (port, secure) => {
  console.log(`--- Testing Port: ${port}, Secure: ${secure} ---`);
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: port,
    secure: secure,
    auth: {
      user: emailUser,
      pass: emailPassword,
    },
    connectionTimeout: 5000,
  });

  try {
    await transporter.verify();
    console.log(`✅ Connection to ${port} successful!`);
    return true;
  } catch (error) {
    console.error(`❌ Connection to ${port} failed:`, error.message);
    return false;
  }
};

(async () => {
  await testConnection(587, false);
  await testConnection(465, true);
})();
