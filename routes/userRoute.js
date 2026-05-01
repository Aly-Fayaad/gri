const router = require('express').Router();
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');




router.get('/me', authController.protect, userController.getMe);


router.get('/', authController.protect, userController.getAllUsers);

// router.route('/')
// .get(authController.protect, userController.getAllUsers)
// .post(authController.protect, authController.restrictTo('admin'), userController.createUser);

// router.route('/:id')
// .get(authController.protect, userController.getUser)
// .patch(authController.protect, authController.restrictTo('admin'), userController.updateUser)
// .delete(authController.protect, authController.restrictTo('admin'), userController.deleteUser);

module.exports = router;