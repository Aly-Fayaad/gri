const router = require('express').Router();
const authController = require('../controllers/authController')


router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.route("/confirm-email").post(authController.confirmEmail)
router.route("/forgot-password").post(authController.forgotPassword);
router.route("/reset-password/:token").patch(authController.resetPassword);


module.exports = router