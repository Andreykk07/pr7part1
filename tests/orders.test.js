const { placeOrder } = require('../refactored/orders');
const db = require('../refactored/db');
const mailer = require('../refactored/mailer');
const stripe = require('stripe');

jest.mock('../refactored/db');
jest.mock('../refactored/mailer');
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    charges: { create: jest.fn() }
  }));
});

describe('placeOrder Characterization Tests', () => {
  let mockStripeInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStripeInstance = stripe();
    
    db.query.mockImplementation(async (query, params) => {
      if (query.includes('BEGIN') || query.includes('COMMIT') || query.includes('ROLLBACK')) return {};
      if (query.includes('FROM users')) return { rows: [{ id: 1, email: 'test@test.com', stripe_id: 'cus_123' }] };
      if (query.includes('FROM products') && query.includes('ANY')) {
        return { rows: [
          { id: 10, price: 50, stock: 100 },
          { id: 20, price: 100, stock: 50 }
        ] };
      }
      if (query.includes('FROM products')) {
        const id = params ? params[0] : parseInt(query.split('=')[1].trim());
        if (id === 10) return { rows: [{ id: 10, price: 50, stock: 100 }] };
        if (id === 20) return { rows: [{ id: 20, price: 100, stock: 50 }] };
      }
      if (query.includes('FROM promos')) return { rows: [{ code: 'SALE10', discount: 0.1 }] };
      if (query.includes('INSERT INTO orders')) return { rows: [{ id: 999 }] };
      if (query.includes('UPDATE products')) return {};
      return { rows: [] };
    });

    mockStripeInstance.charges.create.mockResolvedValue({ id: 'ch_123' });
    mailer.send.mockResolvedValue(true);
  });

  test('places order successfully without promo', async () => {
    const orderId = await placeOrder(1, [{ id: 10, qty: 2 }], 'Addr');
    expect(orderId).toBe(999);
    expect(mockStripeInstance.charges.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10000 })
    );
  });

  test('places order successfully with 10% promo code', async () => {
    const orderId = await placeOrder(1, [{ id: 10, qty: 2 }], 'Addr', 'SALE10');
    expect(orderId).toBe(999);
    expect(mockStripeInstance.charges.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 9000 })
    );
  });

  test('returns false if Stripe charge fails', async () => {
    mockStripeInstance.charges.create.mockRejectedValue(new Error('Card declined'));
    const result = await placeOrder(1, [{ id: 10, qty: 1 }], 'Addr');
    expect(result).toBe(false);
  });

  test('throws error if user does not exist', async () => {
    db.query.mockImplementationOnce((q) => {
      if (q.includes('BEGIN')) return {};
      return { rows: [] };
    });
    await expect(placeOrder(99, [{ id: 10, qty: 1 }], 'Addr')).rejects.toThrow('User not found');
  });

  test('calculates correct total for multiple items', async () => {
    await placeOrder(1, [{ id: 10, qty: 2 }, { id: 20, qty: 1 }], 'Addr');
    expect(mockStripeInstance.charges.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 20000 })
    );
  });

  test('does not apply discount if promo is invalid', async () => {
    db.query.mockImplementation(async (query, params) => {
      if (query.includes('BEGIN') || query.includes('COMMIT')) return {};
      if (query.includes('FROM users')) return { rows: [{ id: 1, email: 'test@test.com', stripe_id: 'cus_123' }] };
      if (query.includes('FROM products')) return { rows: [{ id: 10, price: 50, stock: 100 }] };
      if (query.includes('FROM promos')) return { rows: [] };
      if (query.includes('INSERT INTO orders')) return { rows: [{ id: 999 }] };
      return { rows: [] };
    });

    await placeOrder(1, [{ id: 10, qty: 1 }], 'Addr', 'INVALID');
    expect(mockStripeInstance.charges.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000 })
    );
  });

  test('throws error if insufficient stock', async () => {
    await expect(placeOrder(1, [{ id: 10, qty: 200 }], 'Addr')).rejects.toThrow('Insufficient stock for product 10');
  });

  test('sends email to user with correct details', async () => {
    await placeOrder(1, [{ id: 10, qty: 1 }], 'Addr');
    expect(mailer.send).toHaveBeenCalledWith(
      'test@test.com',
      'Your order #999 placed!',
      'Total: $50'
    );
  });
});
