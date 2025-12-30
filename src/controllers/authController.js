const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/jwtConfig');

const signup = async (req, res) => {
  const { full_name, username, password, role_id, cnic, phone, email } = req.body;

  if (!full_name || !username || !password || !role_id || !cnic || !phone) {
    return res.status(400).json({
      success: false,
      error: { code: 400, message: 'Invalid request. Required fields are missing.' },
    });
  }

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { cnic },
          { phone },
          ...(email ? [{ email }] : []),
        ],
      },
    });

    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(409).json({
          success: false,
          error: { code: 409, message: 'Username already exists. Please choose a different username.' },
        });
      }
      if (existingUser.cnic === cnic) {
        return res.status(409).json({
          success: false,
          error: { code: 409, message: 'This CNIC is already registered. Each CNIC can only be used once.' },
        });
      }
      if (existingUser.phone === phone) {
        return res.status(409).json({
          success: false,
          error: { code: 409, message: 'This phone number is already registered. Please use a different number.' },
        });
      }
      if (email && existingUser.email === email) {
        return res.status(409).json({
          success: false,
          error: { code: 409, message: 'This email address is already registered. Please use a different email.' },
        });
      }
    }

    const role = await prisma.role.findUnique({
      where: { id: parseInt(role_id) },
    });

    if (!role) {
      return res.status(404).json({
        success: false,
        error: { code: 404, message: 'Invalid role selected.' },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        full_name,
        username: username.toLowerCase().trim(),
        password_hash,
        role_id: parseInt(role_id),
        cnic: cnic.trim(),
        phone: phone.trim(),
        email: email ? email.toLowerCase().trim() : null,
        status: 'active',
      },
      include: {
        role: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: {
        user: {
          id: user.id,
          full_name: user.full_name,
          username: user.username,
          role: user.role.name,
          phone: user.phone,
          cnic: user.cnic,
        },
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { code: 500, message: 'Internal server error' } });
  }
};

const login = async (req, res) => {
  const { identifier, password, device_id } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ success: false, error: { code: 400, message: 'Invalid request. Required fields are missing.' } });
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
      },
      include: { role: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: { code: 401, message: 'The credentials you entered are incorrect. Please check and try again.' } });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: { code: 403, message: 'Access denied. Your account has been disabled. Please contact the administrator for more information.' } });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: { code: 401, message: 'The password you entered is incorrect. Please try again.' } });
    }

    if (device_id && user.device_id !== device_id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { device_id },
      });
    }

    const payload = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      username: user.username,
      cnic: user.cnic,
      phone: user.phone,
      role_id: user.role_id,
      role: user.role.name,
      device_id: user.device_id,
      bio: user.bio,
      image: user.image,
      coverImage: user.coverImage,
      permissions: JSON.parse(user.role.permissions_json),
    };

    const token = jwt.sign(payload, jwtSecret);

    res.json({
      success: true,
      message: 'Login successful. Redirecting to dashboard...',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        username: user.username,
        cnic: user.cnic,
        phone: user.phone,
        role_id: user.role_id,
        role: user.role.name,
        device_id: user.device_id,
        bio: user.bio,
        image: user.image,
        coverImage: user.coverImage,
        permissions: JSON.parse(user.role.permissions_json),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { code: 500, message: 'Internal server error' } });
  }
};

const toggleUserStatus = async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: { code: 400, message: "Status must be 'active' or 'inactive'" },
    });
  }

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: { role: true },
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: { code: 404, message: 'User not found' },
      });
    }

    if (targetUser.id === req.user.id && status === 'inactive') {
      return res.status(403).json({
        success: false,
        error: { code: 403, message: 'You cannot deactivate your own account.' },
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { status },
      include: { role: true },
    });

    return res.json({
      success: true,
      message: `User account ${status === 'active' ? 'activated' : 'deactivated'} successfully.`,
      data: {
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          full_name: updatedUser.full_name,
          role: updatedUser.role.name,
          status: updatedUser.status,
        },
      },
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
};

const editUser = async (req, res) => {
  const { userId } = req.params;
  const { full_name, username, role_id, cnic, phone, email, password, status } = req.body;

  if (!full_name && !username && !role_id && !cnic && !phone && !email && !password && !status) {
    return res.status(400).json({
      success: false,
      error: { code: 400, message: 'No fields provided to update.' },
    });
  }

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: { role: true },
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: { code: 404, message: 'User not found.' },
      });
    }

    if (targetUser.id === req.user.id) {
      return res.status(403).json({
        success: false,
        error: { code: 403, message: 'You cannot edit your own account using this endpoint.' },
      });
    }

    if (username || email || cnic || phone) {
      const conflictCheck = await prisma.user.findFirst({
        where: {
          OR: [
            username ? { username, NOT: { id: parseInt(userId) } } : {},
            email ? { email, NOT: { id: parseInt(userId) } } : {},
            cnic ? { cnic, NOT: { id: parseInt(userId) } } : {},
            phone ? { phone, NOT: { id: parseInt(userId) } } : {},
          ].filter(Boolean),
        },
      });

      if (conflictCheck) {
        if (conflictCheck.username === username) return res.status(409).json({ success: false, error: { code: 409, message: 'Username already in use.' } });
        if (conflictCheck.email === email) return res.status(409).json({ success: false, error: { code: 409, message: 'Email already registered.' } });
        if (conflictCheck.cnic === cnic) return res.status(409).json({ success: false, error: { code: 409, message: 'CNIC already in use.' } });
        if (conflictCheck.phone === phone) return res.status(409).json({ success: false, error: { code: 409, message: 'Phone number already registered.' } });
      }
    }

    let updatedRole;
    if (role_id) {
      updatedRole = await prisma.role.findUnique({ where: { id: parseInt(role_id) } });
      if (!updatedRole) {
        return res.status(404).json({ success: false, error: { code: 404, message: 'Invalid role selected.' } });
      }
    }

    let password_hash = targetUser.password_hash;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      password_hash = await bcrypt.hash(password, salt);
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        full_name: full_name?.trim(),
        username: username?.toLowerCase().trim(),
        password_hash,
        role_id: role_id ? parseInt(role_id) : undefined,
        cnic: cnic?.trim(),
        phone: phone?.trim(),
        email: email?.toLowerCase().trim(),
        status: status,
      },
      include: { role: true },
    });

    return res.json({
      success: true,
      message: 'User updated successfully.',
      data: {
        user: {
          id: updatedUser.id,
          full_name: updatedUser.full_name,
          username: updatedUser.username,
          email: updatedUser.email,
          phone: updatedUser.phone,
          cnic: updatedUser.cnic,
          role: updatedUser.role.name,
          status: updatedUser.status,
        },
      },
    });
  } catch (error) {
    console.error('Edit user error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        full_name: true,
        username: true,
        email: true,
        phone: true,
        cnic: true,
        role_id: true,
        device_id: true,
        bio: true,
        image: true,
        coverImage: true,
        status: true,
        created_at: true,
        updated_at: true,
        role: {
          select: {
            id: true,
            name: true,
            permissions_json: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 404, message: 'User not found' },
      });
    }

    if (user.role && user.role.permissions_json) {
      user.permissions = JSON.parse(user.role.permissions_json);
      delete user.role.permissions_json;
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
};

const updateProfile = async (req, res) => {
  const { full_name, email, phone, bio } = req.body;
  const files = req.files;

  let image = null;
  let coverImage = null;

  if (files && files.image && files.image[0]) {
    image = files.image[0].url;
  }
  if (files && files.coverImage && files.coverImage[0]) {
    coverImage = files.coverImage[0].url;
  }

  try {
    const updatedData = {};
    if (full_name) updatedData.full_name = full_name.trim();
    if (email) updatedData.email = email.toLowerCase().trim();
    if (phone) updatedData.phone = phone.trim();
    if (bio !== undefined) updatedData.bio = bio;
    if (image) updatedData.image = image;
    if (coverImage) updatedData.coverImage = coverImage;

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updatedData,
      include: { role: true },
    });

    const payload = {
      id: updatedUser.id,
      full_name: updatedUser.full_name,
      email: updatedUser.email,
      username: updatedUser.username,
      cnic: updatedUser.cnic,
      phone: updatedUser.phone,
      role_id: updatedUser.role_id,
      role: updatedUser.role.name,
      device_id: updatedUser.device_id,
      bio: updatedUser.bio,
      image: updatedUser.image,
      coverImage: updatedUser.coverImage,
      permissions: JSON.parse(updatedUser.role.permissions_json),
    };

    const newToken = jwt.sign(payload, jwtSecret);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      token: newToken,
      user: payload,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: { code: 500, message: 'Failed to update profile' } });
  }
};

module.exports = { signup, login, toggleUserStatus, editUser, getMe, updateProfile };