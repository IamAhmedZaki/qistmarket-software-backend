const express = require('express');
const router = express.Router();
const { signup, login, toggleUserStatus, editUser, getMe, updateProfile } = require('../controllers/authController');
const { authenticateJWT, requireSuperAdmin } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const fixUploadPath = require('../middlewares/fixUploadPath');

router.post('/signup', authenticateJWT, requireSuperAdmin, signup);
router.post('/login', login);
router.patch('/users/:userId/status', authenticateJWT, requireSuperAdmin, toggleUserStatus);
router.patch('/users/:userId/edit', authenticateJWT, requireSuperAdmin, editUser);
router.get('/user/me', authenticateJWT, getMe);
router.post('/user/update', authenticateJWT, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]), fixUploadPath, updateProfile);

module.exports = router;