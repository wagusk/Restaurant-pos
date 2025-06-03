// backend/routes/paymentRoutes.js
// This file manages all API requests for processing payments.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth, authorize } = require('../middleware/auth'); // <-- ADD THIS LINE

// POST a new payment for an order (requires cashier, supervisor, or owner role)
// URL: /api/payments
router.post('/', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { order_id, payment_method, amount, transaction_id, cashier_id, notes } = req.body;
    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const paymentResult = await client.query(
            'INSERT INTO payments (order_id, payment_method, amount, transaction_id, cashier_id, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [order_id, payment_method, amount, transaction_id, cashier_id, notes]
        );

        if (cashier_id) {
            let salesUpdateQuery;
            let queryParams;

            if (payment_method.toLowerCase() === 'cash') {
                salesUpdateQuery = 'UPDATE cashier_shifts SET sales_amount_cash = sales_amount_cash + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND shift_end IS NULL RETURNING *';
                queryParams = [amount, cashier_id];
            } else {
                salesUpdateQuery = 'UPDATE cashier_shifts SET sales_amount_card = sales_amount_card + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND shift_end IS NULL RETURNING *';
                queryParams = [amount, cashier_id];
            }
            await client.query(salesUpdateQuery, queryParams);
        }

        const orderResult = await pool.query('SELECT final_amount FROM orders WHERE order_id = $1', [order_id]);
        if (orderResult.rows.length === 0) {
            throw new Error('Order not found for payment.');
        }
        const orderFinalAmount = parseFloat(orderResult.rows[0].final_amount);
        
        const totalPaymentsResult = await pool.query('SELECT SUM(amount) as total_paid FROM payments WHERE order_id = $1', [order_id]);
        const totalPaid = parseFloat(totalPaymentsResult.rows[0].total_paid || 0);

        if (totalPaid >= orderFinalAmount) {
            await client.query(
                'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2',
                ['completed', order_id]
            );
        }

        await client.query('COMMIT');
        res.status(201).json(paymentResult.rows[0]);

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('Error processing payment:', err.message);
        res.status(500).send('Server Error');
    } finally {
        if (client) {
            client.release();
        }
    }
});

// GET all payments (requires supervisor or owner role)
// URL: /api/payments
router.get('/', auth, authorize('supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    try {
        const result = await pool.query('SELECT p.*, u.full_name as cashier_name FROM payments p LEFT JOIN users u ON p.cashier_id = u.user_id ORDER BY p.payment_date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching payments:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET payments for a specific order (requires cashier, supervisor, or owner role)
// URL: /api/payments/order/:orderId
router.get('/order/:orderId', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { orderId } = req.params;
    try {
        const result = await pool.query('SELECT p.*, u.full_name as cashier_name FROM payments p LEFT JOIN users u ON p.cashier_id = u.user_id WHERE p.order_id = $1 ORDER BY p.payment_date DESC', [orderId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching payments for order:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
