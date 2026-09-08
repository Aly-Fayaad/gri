const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

module.exports = (email,sub,text="",html="") => {
  const info =  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: sub,
    text: text, 
    html: html, 
  });
  console.log("Message sent:", info.messageId);
  return info
};