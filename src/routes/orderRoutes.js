const express = require('express');
const router = express.Router();
const { createOrder } = require('../controllers/ordersController');
const { authenticateJWT } = require('../middlewares/authMiddleware');

router.post('/orders/create', authenticateJWT, createOrder);

module.exports = router;