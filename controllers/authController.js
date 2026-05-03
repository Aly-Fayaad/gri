const User = require("../models/userModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { promisify } = require("util");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { customAlphabet } = require("nanoid");
const sendEmail = require("../utils/sendEmail");

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

exports.signup = catchAsync(async (req,res,next) => {
  // check email if exists
 
  let {email,password} = req.body
  if (!email || !password) {
    return next(new AppError("Please provide email and password", 400));
  }
  let findUser = await User.findOne({email})
  if(findUser) return next(new AppError("Email already exists",400))

  // generate and hash otp
  const otp = customAlphabet("0123456789", 6)();
  const confirmationExpires = Date.now() + 10 * 60 * 1000;
  const hashedOTP = await bcrypt.hash(otp, 12);
  await User.create({
    ...req.body,
    confirmOTP: hashedOTP,
    confirmationExpires,
  });

  // Send email in the background (don't await) to prevent production timeouts
  await sendEmail(
    email,
    "Confirm your email",
    "",
    `<p>Your confirmation OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`
  )
  
  res.status(201).json({
    status: "success",
    message: "User created successfully, check your email for confirmation",
  })
})



exports.confirmEmail = catchAsync(async (req,res,next) => {
  // check email if exists
  let {email,confirmOTP} = req.body
  let findUser = await User.findOne({email})
  if(!findUser) return next(new AppError("email not found please signup!",400))
  

  // check if account already active
  if(findUser.isConfirmed) return next(new AppError("email is already active!",400))
    console.log(confirmOTP)
  if(!confirmOTP) return next(new AppError("please send OTP",400))
    console.log(findUser.confirmOTP)
  if (
    !findUser.confirmOTP ||
    !findUser.confirmationExpires ||
    findUser.confirmationExpires < Date.now()
  ) {
    return next(new AppError("OTP is expired or invalid, please request a new one", 400));
  }


  const check = await bcrypt.compare(confirmOTP, findUser.confirmOTP)
  if(!check) return next(new AppError("OTP is invalid please try again!",400))

  const user = await User.findByIdAndUpdate(
    findUser._id,
    { isConfirmed: true, $unset: { confirmOTP: "", confirmationExpires: "" } },
    { new: true }
  )

  const token = signToken(findUser._id);

  res.status(201).json({
    status: "success",
    message: "Email confirmed successfully",
    token,
    user
  })
})




exports.login = catchAsync(async (req, res, next) => {
  console.log(req.body)
  const { email, password } = req.body;

  // 1) check if email and password exist
  if (!email || !password) {
    return next(new AppError("Please provide email and password", 400));
  }

  // 2) check if user exists && password is correct
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return next(new AppError("Incorrect email or password", 401));
  }

  // 3) block login until email is confirmed
  if (!user.isConfirmed) {
    return next(new AppError("Please confirm your email first", 401));
  }

  // 4) if everything ok, send token to client
  const token = signToken(user._id);
  res.status(200).json({
    status: "success",
    token,
  });
});


exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check if it exists
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new AppError("You are not logged in. Please log in first.", 401));
  }

  // 2) Validate token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError("The user belonging to this token no longer exists.", 401)
    );
  }

  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError("User recently changed password. Please log in again.", 401));
  }

  // GRANT ACCESS TO PROTECTED ROUTE
  req.user = currentUser;
  next();
});

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: "fail",
        message: "You do not have permission to perform this action",
      });
    }
    next();
  };
};



exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) {
    return next(new AppError("Please provide your email", 400));
  }

  // 1) Get user based on posted email
  const user = await User.findOne({ email });
  if (!user) {
    return next(new AppError("There is no user with that email address.", 404));
  }

  // 2) Generate and save reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send token to user's email
  const resetURL = `${req.protocol}://${req.get("host")}/api/auth/reset-password/${resetToken}`;
  const html = `<p>Forgot your password?</p><p>Submit a PATCH request to: <b>${resetURL}</b></p><p>This token expires in 10 minutes.</p>`;

  try {
    await sendEmail(email, "Reset your password", "", html);
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(
      new AppError("There was an error sending the email. Try again later.", 500)
    );
  }

  res.status(200).json({
    status: "success",
    message: "Reset token sent to email!",
  });
});




exports.resetPassword = catchAsync(async (req, res, next) => {
  const { password } = req.body;
  if (!password) {
    return next(new AppError("Please provide a new password", 400));
  }

  // 1) Hash token from URL and find user
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select("+password");

  // 2) If token not expired, set new password
  if (!user) {
    return next(new AppError("Token is invalid or has expired.", 400));
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = Date.now() - 1000;
  await user.save();

  // 3) Log the user in, send JWT
  const token = signToken(user._id);
  res.status(200).json({
    status: "success",
    token,
  });
});
