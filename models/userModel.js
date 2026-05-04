const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const validator = require('validator');

const userSchema = new mongoose.Schema({
    // Basic Identity
  name: {
    type: String,       
    required: [true, 'Name is required'],
    trim: true
  },

  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true, // Ensures no two users share an email
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6, // Basic security enforcement
    select: false // Exclude password from query results by default
  }
   ,  // Application Logic
  isConfirmed:{
    type: Boolean,
    default: true,
  },
  role:{
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  confirmOTP: String,
  confirmationExpires: Date,  
  passwordResetToken: String,
  passwordResetExpires: Date,
  passwordChangedAt: Date,
  
}, { 
  timestamps: true // Automatically adds 'createdAt' and 'updatedAt'
})


// Pre-save middleware to hash passwords
userSchema.pre('save', async function() {
  // 1. Only hash if password is new or modified
  if (!this.isModified('password')) return

  // 2. Hash the password
  this.password = await bcrypt.hash(this.password, 12);
  
});

userSchema.methods.changedPasswordAfter = function(JWTTimestamp){
    if(this.passwordChangedAt){
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        return JWTTimestamp < changedTimestamp;
    }
    return false;
};


userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};


const User = mongoose.model('User', userSchema);

module.exports = User;



