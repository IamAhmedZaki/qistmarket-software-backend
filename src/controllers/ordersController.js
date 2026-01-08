const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const createOrder = async (req, res) => {
  const {
    customer_name,
    whatsapp_number,
    address,
    city,
    area,
    product_name,
    total_amount,
    advance_amount,
    monthly_amount,
    months,
    channel
  } = req.body;

  if (!customer_name || !whatsapp_number || !address || !product_name ||
      !total_amount || !advance_amount || !monthly_amount || !months || !channel) {
    return res.status(400).json({
      success: false,
      error: { code: 400, message: 'Required fields are missing.' }
    });
  }

  if (city && area) {
    // You could add server-side check against the same API if desired
  }

  try {
    // Duplicate check (same whatsapp + product + day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existing = await prisma.order.findFirst({
      where: {
        whatsapp_number: whatsapp_number.trim(),
        product_name: product_name.trim(),
        created_at: { gte: today, lt: tomorrow },
        status: { notIn: ['cancelled', 'delivered'] }
      }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 409, message: 'Duplicate active order detected today.' }
      });
    }

    // Generate order_ref
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const order_ref = `QIST-${dateStr}-${randomNum}`;

    // Generate token_number (8 char uppercase hex)
    const token_number = crypto.randomBytes(4).toString('hex').toUpperCase();

    const order = await prisma.order.create({
      data: {
        order_ref,
        token_number,
        customer_name: customer_name.trim(),
        whatsapp_number: whatsapp_number.trim(),
        address: address.trim(),
        city: city ? city.trim() : null,
        area: area ? area.trim() : null,
        product_name: product_name.trim(),
        total_amount: parseFloat(total_amount),
        advance_amount: parseFloat(advance_amount),
        monthly_amount: parseFloat(monthly_amount),
        months: parseInt(months),
        channel: channel.trim(),
        status: 'new',
        created_by_user_id: req.user.id
      },
      include: { created_by: { select: { username: true } } }
    });

    return res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      data: {
        order: {
          id: order.id,
          order_ref: order.order_ref,
          token_number: order.token_number,
          customer_name: order.customer_name,
          whatsapp_number: order.whatsapp_number,
          address: order.address,
          city: order.city,
          area: order.area,
          product_name: order.product_name,
          total_amount: order.total_amount,
          advance_amount: order.advance_amount,
          monthly_amount: order.monthly_amount,
          months: order.months,
          channel: order.channel,
          created_at: order.created_at,
          created_by: order.created_by?.username || null
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Internal server error' }
    });
  }
};

const getOrders = async (req, res) => {
  const { page = 1, limit = 10, search = '', sortBy = 'created_at', sortDir = 'desc', ...filters } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  try {
    const where = {};

    if (search.trim()) {
      where.OR = [
        { customer_name: { contains: search } },
        { whatsapp_number: { contains: search } },
        { order_ref: { contains: search } },
        { token_number: { contains: search } },
        { product_name: { contains: search } },
        { city: { contains: search } },
        { area: { contains: search } },
      ];
    }

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        if (key === 'assigned_to') {
          where.assigned_to = { username: { contains: value } };
        } else if (key === 'created_by') {
          where.created_by = { username: { contains: value } };
        } else {
          where[key] = { contains: value };
        }
      }
    });

    const orders = await prisma.order.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy]: sortDir },
      include: {
        created_by: { select: { username: true } },
        assigned_to: { select: { username: true } },
      },
    });

    const total = await prisma.order.count({ where });

    return res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          page: Number(page),
          limit: take,
          total,
          totalPages: Math.ceil(total / take),
          hasNext: skip + take < total,
          hasPrev: Number(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
};

const getOrderById = async (req, res) => {
  const { id } = req.params;

  try {
    const order = await prisma.order.findUnique({
      where: { id: Number(id) },
      include: {
        created_by: { select: { username: true } },
        assigned_to: { select: { username: true } },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 404, message: 'Order not found' },
      });
    }

    return res.status(200).json({
      success: true,
      data: { order },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
};

const assignOrder = async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ success: false, error: { code: 400, message: 'User ID required' } });
  }

  try {
    const order = await prisma.order.findUnique({ where: { id: Number(id) } });
    if (!order) return res.status(404).json({ success: false, error: { code: 404, message: 'Order not found' } });
    if (order.assigned_to_user_id) return res.status(409).json({ success: false, error: { code: 409, message: 'Already assigned' } });

    const user = await prisma.user.findUnique({
      where: { id: Number(user_id) },
      include: { role: true },
    });

    if (!user || user.role.name !== 'Verification Officer') {
      return res.status(400).json({ success: false, error: { code: 400, message: 'Invalid Verification Officer' } });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: { assigned_to_user_id: Number(user_id) },
      include: {
        assigned_to: { select: { username: true, fcm_token: true } },
        created_by: { select: { username: true } },
      },
    });

    if (updatedOrder.assigned_to?.fcm_token) {
      try {
        await admin.messaging().send({
          token: updatedOrder.assigned_to.fcm_token,
          notification: {
            title: 'New Order Assigned',
            body: `Order ${updatedOrder.order_ref} has been assigned to you for verification.`,
          },
          data: {
            order_id: updatedOrder.id.toString(),
            order_ref: updatedOrder.order_ref,
          },
        });
      } catch (fcmError) {
        console.error('FCM send failed:', fcmError);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Order assigned successfully',
      data: { order: updatedOrder },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: { code: 500, message: 'Internal server error' } });
  }
};

const assignBulk = async (req, res) => {
  const { order_ids, user_id } = req.body;

  if (!Array.isArray(order_ids) || order_ids.length === 0 || !user_id) {
    return res.status(400).json({
      success: false,
      error: { code: 400, message: 'Invalid input: order_ids array and user_id required.' },
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(user_id) },
      include: { role: true },
    });

    if (!user || user.role.name !== 'Verification Officer') {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Invalid verification officer.' },
      });
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: order_ids.map(Number) } },
    });

    const alreadyAssigned = orders.filter((o) => o.assigned_to_user_id !== null);
    if (alreadyAssigned.length > 0) {
      return res.status(409).json({
        success: false,
        error: { code: 409, message: 'Some orders are already assigned.' },
      });
    }

    await prisma.order.updateMany({
      where: { id: { in: order_ids.map(Number) } },
      data: { assigned_to_user_id: Number(user_id) },
    });

    return res.status(200).json({
      success: true,
      message: 'Orders assigned successfully.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
};

const autoAssign = async (req, res) => {
  try {
    const unassignedOrders = await prisma.order.findMany({
      where: {
        assigned_to_user_id: null,
        status: 'new',
      },
    });

    for (const order of unassignedOrders) {
      const candidates = await prisma.user.findMany({
        where: {
          role: { name: 'Verification Officer' },
          status: 'active',
        },
      });

      if (candidates.length === 0) continue;

      let selectedUser = null;
      let minCount = Infinity;

      for (const candidate of candidates) {
        const count = await prisma.order.count({
          where: {
            assigned_to_user_id: candidate.id,
            status: { notIn: ['cancelled', 'delivered'] },
          },
        });

        if (count < minCount) {
          minCount = count;
          selectedUser = candidate;
        }
      }

      if (selectedUser) {
        await prisma.order.update({
          where: { id: order.id },
          data: { assigned_to_user_id: selectedUser.id },
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Automatic assignment completed.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
};

module.exports = { createOrder, getOrders, assignOrder, assignBulk, autoAssign, getOrderById };