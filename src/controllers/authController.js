const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/jwtConfig');

const signup = async (req, res) => {
  const { full_name, username, password, role_id, cnic, phone, email } = req.body;

  if (!full_name || !username || !password || !role_id) {
    return res.status(400).json({ success: false, error: { code: 400, message: 'Missing required fields' } });
  }

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          ...(email ? [{ email }] : [])
        ]
      }
    });

    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(409).json({ success: false, error: { code: 409, message: 'Username already exists' } });
      }
      if (email && existingUser.email === email) {
        return res.status(409).json({ success: false, error: { code: 409, message: 'Email already exists' } });
      }
    }

    const role = await prisma.role.findUnique({ where: { id: role_id } });
    if (!role) {
      return res.status(404).json({ success: false, error: { code: 404, message: 'Invalid role ID' } });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        full_name,
        username,
        password_hash,
        role_id,
        cnic,
        phone,
        email,
        status: 'active',
      },
    });

    res.status(201).json({ success: true, data: { user: { id: user.id, username: user.username, role: role.name } } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { code: 500, message: 'Internal server error' } });
  }
};

const login = async (req, res) => {
  const { identifier, password, device_id } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ success: false, error: { code: 400, message: 'Missing identifier or password' } });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier },
          { cnic: identifier },
          { phone: identifier }
        ],
        status: 'active'
      },
      include: { role: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: { code: 401, message: 'Invalid credentials' } });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: { code: 403, message: 'Account is disabled' } });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: { code: 401, message: 'Invalid credentials' } });
    }

    if (device_id && user.device_id !== device_id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { device_id },
      });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role.name },
      jwtSecret,
      { expiresIn: '30d' }
    );

    res.json({ success: true, data: { token, user: { id: user.id, username: user.username, role: user.role.name } } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { code: 500, message: 'Internal server error' } });
  }
};

const logout = async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { device_id: null },
    });
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { code: 500, message: 'Internal server error' } });
  }
};

module.exports = { signup, login, logout };