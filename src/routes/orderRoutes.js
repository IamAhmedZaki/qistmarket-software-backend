const express = require('express');
const router = express.Router();
const { createOrder, getOrders, assignOrder, assignBulk, autoAssign, getOrderById } = require('../controllers/ordersController');
const { authenticateJWT } = require('../middlewares/authMiddleware');

router.post('/orders/create', authenticateJWT, createOrder);
router.get('/orders', getOrders);
router.patch('/orders/:id/assign', authenticateJWT, assignOrder);
router.post('/orders/assign-bulk', authenticateJWT, assignBulk);
router.post('/orders/auto-assign', authenticateJWT, autoAssign);
router.get('/orders/:id', authenticateJWT, getOrderById);

module.exports = router;