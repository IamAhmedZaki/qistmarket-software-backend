const express = require('express');
const router = express.Router();
const { createOrder, getOrders, assignOrder, assignBulk, autoAssign } = require('../controllers/ordersController');
const { authenticateJWT } = require('../middlewares/authMiddleware');

router.post('/orders/create', authenticateJWT, createOrder);
router.get('/orders', authenticateJWT, getOrders);
router.patch('/orders/:id/assign', authenticateJWT, assignOrder);
router.post('/orders/assign-bulk', authenticateJWT, assignBulk);
router.post('/orders/auto-assign', authenticateJWT, autoAssign);

module.exports = router;