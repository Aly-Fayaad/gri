const User = require("../models/userModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { promisify } = require("util");

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

exports.signup = async (req, res) => {
  try {
    const newUser = await User.create({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      passwordConfirm: req.body.passwordConfirm,
      role: req.body.role,
    });
    const token = signToken(newUser._id);
    res.status(201).json({
      status: "success",
      token,
      data: { user: newUser },
    });
  } catch (error) {
    return res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    // 1) check if email and password exist
    if (!email || !password) {
      // return json respone with status code 400 and message 'Please provide email and password'
      return res.status(400).json({
        status: "fail",
        message: "Please provide email and password",
      });
    }
    // 2) check if user exists && password is correct

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        status: "fail",
        message: "Incorrect email or password",
      });
    }

    // 3) if everything ok, send token to client
    const token = signToken(user._id);
    res.status(200).json({
      status: "success",
      token,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "An error occurred during login. Please try again later.",
    });
  }
};

exports.protect = async (req, res, next) => {
  try {
    // 1) Getting token and check if it exists
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    console.log(token);

    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "You are not logged in. Please log in first.",
      });
    }
    console.log("test1");

    // 2) Validate token
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        status: "fail",
        message: "The user belonging to this token no longer exists.",
      });
    }
    console.log("test2");

    // 4) Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        status: "fail",
        message: "User recently changed password. Please log in again.",
      });
    }
    console.log("test3");

    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    next();
  } catch (error) {
    res.status(401).json({
      status: "fail",
      message: "Invalid token or token has expired.",
    });
  }
};

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

// exports.logout = async (req, res) => {
//   res.status(200).json({
//     status: "success",
//     message: "You have been logged out successfully.",
//   });
// };

exports.forgotPassword = async (req, res) => {
  try {
    // 1) Get user based on POSTed email
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "There is no user with that email address.",
      });
    }

    // 2) Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // 3) Send token back to client
    const resetURL = `${req.protocol}://${req.get("host")}/api/v1/users/resetPassword/${resetToken}`;

    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
      resetURL,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message:
        "There was an error sending the password reset token. Please try again later.",
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const hashedToken = require("crypto")
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        status: "fail",
        message: "Token is invalid or has expired.",
      });
    }

    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = Date.now() - 1000;
    await user.save();

    const token = signToken(user._id);

    res.status(200).json({
      status: "success",
      token,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Unable to reset password. Please try again later.",
    });
  }
};
