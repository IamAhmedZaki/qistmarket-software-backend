// src/routes/auth.js
const express = require('express');
const router = express.Router();
const { signup, login, logout } = require('../controllers/authController');
const { authenticateJWT, requireSuperAdmin } = require('../middlewares/authMiddleware');

router.post('/signup', authenticateJWT, requireSuperAdmin, signup);
router.post('/login', login);
router.post('/logout', authenticateJWT, logout);

module.exports = router;