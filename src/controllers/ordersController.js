const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

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

  // Optional but recommended: validate city/area exist (client-side already filters)
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

module.exports = { createOrder };