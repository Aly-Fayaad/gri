const router = require('express').Router()
const fieldController = require('../controllers/fieldController')
const authController = require('../controllers/authController')
// router.route('/').post()

router.get('/get-insights',fieldController.getInsights)
router.route('/')
 .post(authController.protect, fieldController.createField)
 .get(authController.protect, fieldController.getUserFields)
 
 router.route('/:id')
  .delete(authController.protect, fieldController.deleteField)
//.get('/get-insights/:id',authController.protect,fieldController.getInsights)

module.exports = router