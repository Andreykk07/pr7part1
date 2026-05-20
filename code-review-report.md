## [CRITICAL] Issue 1: SQL Injection in User Query
**Location**: `orders.js`, line 6
**Description**: Ідентифікатор користувача `uid` конкатенується безпосередньо у SQL-запит, що робить систему вразливою до SQL-ін'єкцій.
**AI Comment**: "The user ID is directly concatenated into the SQL string. A malicious user could pass a payload like `1 OR 1=1` to bypass checks or drop tables."
**My Assessment**: Погоджуюсь повністю. Це класична вразливість, яка вимагає негайного виправлення через параметризовані запити.
**Fix Applied**: Так
**Code Before:**
`var user = await db.query('SELECT * FROM users WHERE id = ' + uid);`
**Code After:**
`const userRes = await db.query('SELECT * FROM users WHERE id = $1', [uid]);`

## [CRITICAL] Issue 2: SQL Injection in Promo Code
**Location**: `orders.js`, line 17
**Description**: Строковий параметр `promo` вставляється у запит через конкатенацію, що є небезпечним, оскільки промокоди вводяться текстом.
**AI Comment**: "String concatenation for the promo code introduces a severe SQL injection vulnerability. Consider using an ORM like Sequelize or Prisma to abstract database interactions securely."
**My Assessment**: Частково не погоджуюсь. Використання ORM вимагає глобального рефакторингу. Достатньо використати параметризовані запити.
**Fix Applied**: Частково (виправлено ін'єкцію, але без ORM)
**Code Before:**
`var disc = await db.query('SELECT * FROM promos WHERE code = \'' + promo + '\'');`
**Code After:**
`const discRes = await db.query('SELECT * FROM promos WHERE code = $1', [promo]);`

## [CRITICAL] Issue 3: Missing Database Transaction
**Location**: `orders.js`, lines 22-33
**Description**: Якщо оновлення залишків товарів або вставка замовлення впаде після зняття коштів через Stripe, виникне невідповідність даних.
**AI Comment**: "Financial operations and subsequent database updates must be wrapped in a database transaction to ensure atomicity."
**My Assessment**: Погоджуюсь. Необхідно додати `BEGIN`, `COMMIT` та `ROLLBACK`.
**Fix Applied**: Так
**Code Before:**
`await stripe.charges.create(...);`
`var oid = await db.query('INSERT INTO orders...');`
**Code After:**
`await db.query('BEGIN');`
`...`
`await db.query('COMMIT');`

## [MAJOR] Issue 4: N+1 Query Problem (Product Fetch)
**Location**: `orders.js`, lines 10-15
**Description**: Цикл робить окремий SQL-запит для кожного товару у кошику.
**AI Comment**: "Executing SQL queries inside a loop creates the N+1 query problem, severely impacting performance. Fetch all products at once using an IN clause."
**My Assessment**: Погоджуюсь. Потрібно зібрати всі ID і зробити один запит `id = ANY($1)`.
**Fix Applied**: Так
**Code Before:**
`for (var i = 0; i < items.length; i++) { var p = await db.query('SELECT * FROM products WHERE id = ' + items[i].id); }`
**Code After:**
`const itemIds = items.map(i => i.id); const productsRes = await db.query('SELECT * FROM products WHERE id = ANY($1)', [itemIds]);`

## [MAJOR] Issue 5: Missing Stock Validation Before Charge
**Location**: `orders.js`, lines 11-23
**Description**: Код розраховує суму і стягує гроші без перевірки, чи достатньо товару на складі.
**AI Comment**: "The stock is deducted blindly. You should verify `stock >= requested_qty` before charging the customer."
**My Assessment**: Погоджуюсь. Це критична бізнес-помилка.
**Fix Applied**: Так
**Code Before:**
`total += p.rows[0].price * items[i].qty;`
**Code After:**
`if (product.stock < item.qty) throw new Error(\`Insufficient stock\`); total += product.price * item.qty;`

## [MAJOR] Issue 6: Float Precision in Stripe Amount
**Location**: `orders.js`, line 22
**Description**: Розрахунок `total * 100` може призвести до плаваючих помилок, що викличе помилку API Stripe.
**AI Comment**: "Floating-point arithmetic before sending to Stripe can cause crashes. Use Math.round() when converting to cents."
**My Assessment**: Погоджуюсь. Часта помилка інтеграції платежів.
**Fix Applied**: Так
**Code Before:**
`amount: total * 100`
**Code After:**
`amount: Math.round(total * 100)`

## [MINOR] Issue 7: Swallowed Errors
**Location**: `orders.js`, lines 24-27
**Description**: Помилка Stripe виводиться у консоль, функція повертає `false`.
**AI Comment**: "Console.logging the error and returning false hides the failure reason. Use a proper error handling mechanism."
**My Assessment**: Погоджуюсь. Потрібно переривати транзакцію і кидати помилку.
**Fix Applied**: Так
**Code Before:**
`} catch(e) { console.log(e); return false; }`
**Code After:**
`} catch(e) { await db.query('ROLLBACK'); return false; }`

## [MINOR] Issue 8: Outdated Syntax
**Location**: `orders.js`, throughout
**Description**: Використання `var` створює ризики випадкового перевизначення змінних.
**AI Comment**: "Use ES6 `const` and `let` instead of `var` for better block scoping."
**My Assessment**: Погоджуюсь. Легкий і необхідний рефакторинг.
**Fix Applied**: Так
**Code Before:**
`var total = 0;`
**Code After:**
`let total = 0;`
