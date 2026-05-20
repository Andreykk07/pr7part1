const db = require('./db');
const mailer = require('./mailer');
const stripe = require('stripe')(process.env.STRIPE_KEY);

async function placeOrder(uid, items, addr, promo) {
  if (!items || items.length === 0) {
    throw new Error('Order must contain at least one item');
  }

  try {
    await db.query('BEGIN');

    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [uid]);
    if (!userRes.rows.length) {
      throw new Error('User not found');
    }
    const user = userRes.rows[0];

    let total = 0;
    const itemIds = items.map(i => i.id);
    
    const productsRes = await db.query('SELECT * FROM products WHERE id = ANY($1)', [itemIds]);
    const productsMap = productsRes.rows.reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {});

    for (const item of items) {
      const product = productsMap[item.id];
      if (!product) throw new Error(`Product ${item.id} not found`);
      
      if (product.stock < item.qty) {
        throw new Error(`Insufficient stock for product ${item.id}`);
      }
      total += product.price * item.qty;
    }

    if (promo) {
      const discRes = await db.query('SELECT * FROM promos WHERE code = $1', [promo]);
      if (discRes.rows.length && discRes.rows[0]) {
        total = total - (total * discRes.rows[0].discount);
      }
    }

    try {
      await stripe.charges.create({
        amount: Math.round(total * 100),
        currency: 'usd',
        customer: user.stripe_id
      });
    } catch (e) {
      await db.query('ROLLBACK');
      return false;
    }

    const oidRes = await db.query(
      'INSERT INTO orders(user_id, total, status) VALUES($1, $2, $3) RETURNING id',
      [uid, total, 'pending']
    );
    const orderId = oidRes.rows[0].id;

    for (const item of items) {
      await db.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.qty, item.id]);
    }

    await db.query('COMMIT');

    await mailer.send(
      user.email,
      `Your order #${orderId} placed!`,
      `Total: $${total}`
    );

    return orderId;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

module.exports = { placeOrder };
