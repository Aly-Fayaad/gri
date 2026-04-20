const router = require('express').Router();
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');



router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);
router.get('/me', authController.protect, userController.getMe);
// router.patch('/updateMyPassword', authController.protect, authController.updatePassword);
// router.patch('/updateMe', authController.protect, userController.updateMe);
// router.delete('/deleteMe', authController.protect, userController.deleteMe);

// router.get('/', authController.protect, userController.getAllUsers);

// router.route('/')
// .get(authController.protect, userController.getAllUsers)
// .post(authController.protect, authController.restrictTo('admin'), userController.createUser);

// router.route('/:id')
// .get(authController.protect, userController.getUser)
// .patch(authController.protect, authController.restrictTo('admin'), userController.updateUser)
// .delete(authController.protect, authController.restrictTo('admin'), userController.deleteUser);

module.exports = router;