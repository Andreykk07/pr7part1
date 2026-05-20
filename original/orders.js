var db = require('./db');
var mailer = require('./mailer');
var stripe = require('stripe')(process.env.STRIPE_KEY);

async function placeOrder(uid, items, addr, promo) {
  var user = await db.query('SELECT * FROM users WHERE id = ' + uid);
  var total = 0;
  var products = [];
  
  for (var i = 0; i < items.length; i++) {
    var p = await db.query('SELECT * FROM products WHERE id = ' + items[i].id);
    products.push(p.rows[0]);
    total += p.rows[0].price * items[i].qty;
  }
  
  if (promo) {
    var disc = await db.query('SELECT * FROM promos WHERE code = \'' + promo + '\'');
    if (disc.rows[0]) total = total - total * disc.rows[0].discount;
  }
  
  try {
    await stripe.charges.create({ amount: total * 100, currency: 'usd', customer: user.rows[0].stripe_id });
  } catch(e) {
    console.log(e);
    return false;
  }
  
  var oid = await db.query('INSERT INTO orders(user_id, total, status) VALUES(' + uid + ', ' + total + ', \'pending\') RETURNING id');
  
  for (var j = 0; j < items.length; j++) {
    await db.query('UPDATE products SET stock = stock - ' + items[j].qty + ' WHERE id = ' + items[j].id);
  }
  
  await mailer.send(user.rows[0].email, 'Your order #' + oid.rows[0].id + ' placed!', 'Total: $' + total);
  
  return oid.rows[0].id;
}

module.exports = { placeOrder };
