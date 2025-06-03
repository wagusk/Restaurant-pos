// backend/routes/paymentRoutes.js
// This file manages all API requests for processing payments.

const express = require('express'); // Import Express.js to create the router.
const router = express.Router();    // Create a new router.
const pool = require('../db');      // Import the database connection pool.

// POST a new payment for an order
// URL: /api/payments
router.post('/', async (req, res) => { // Handles requests to record a new payment.
    // Get payment details from the request body.
    const { order_id, payment_method, amount, transaction_id, cashier_id, notes } = req.body;
    let client; // Declare a client variable for transaction management.

    try {
        client = await pool.connect(); // Get a database connection.
        await client.query('BEGIN'); // Start a database transaction.

        // 1. Insert the new payment record into the 'payments' table.
        const paymentResult = await client.query(
            'INSERT INTO payments (order_id, payment_method, amount, transaction_id, cashier_id, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [order_id, payment_method, amount, transaction_id, cashier_id, notes]
        );

        // 2. Update the total sales amount for the current cashier's active shift (if they have one).
        // This helps in daily cash reconciliation.
        if (cashier_id) {
            let salesUpdateQuery;
            let queryParams;

            // Check if the payment method is cash or card.
            if (payment_method.toLowerCase() === 'cash') {
                // If cash, update 'sales_amount_cash'.
                salesUpdateQuery = 'UPDATE cashier_shifts SET sales_amount_cash = sales_amount_cash + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND shift_end IS NULL RETURNING *';
                queryParams = [amount, cashier_id];
            } else {
                // For other methods (like 'card'), update 'sales_amount_card'.
                salesUpdateQuery = 'UPDATE cashier_shifts SET sales_amount_card = sales_amount_card + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND shift_end IS NULL RETURNING *';
                queryParams = [amount, cashier_id];
            }
            await client.query(salesUpdateQuery, queryParams);
        }

        // 3. Update the order status to 'completed' if the payment fully covers the order's final amount.
        // First, get the order's current details.
        const orderResult = await client.query('SELECT final_amount FROM orders WHERE order_id = $1', [order_id]);
        if (orderResult.rows.length === 0) {
            throw new Error('Order not found for payment.');
        }
        const orderFinalAmount = parseFloat(orderResult.rows[0].final_amount);
        
        // Get the sum of all payments for this order so far.
        const totalPaymentsResult = await client.query('SELECT SUM(amount) as total_paid FROM payments WHERE order_id = $1', [order_id]);
        const totalPaid = parseFloat(totalPaymentsResult.rows[0].total_paid || 0);

        // If the total paid amount is greater than or equal to the order's final amount, mark the order as 'completed'.
        if (totalPaid >= orderFinalAmount) {
            await client.query(
                'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2',
                ['completed', order_id]
            );
        }

        await client.query('COMMIT'); // If all operations succeed, save the changes to the database.
        res.status(201).json(paymentResult.rows[0]); // Send back the details of the new payment.

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK'); // If any error occurs, undo all changes made in this transaction.
        }
        console.error('Error processing payment:', err.message);
        res.status(500).send('Server Error');
    } finally {
        if (client) {
            client.release(); // Always release the database connection back to the pool.
        }
    }
});

// GET all payments
// URL: /api/payments
router.get('/', async (req, res) => { // Handles requests to get a list of all payments.
    try {
        const result = await pool.query('SELECT p.*, u.full_name as cashier_name FROM payments p LEFT JOIN users u ON p.cashier_id = u.user_id ORDER BY p.payment_date DESC');
        res.json(result.rows); // Send the list of payments as a JSON response.
    } catch (err) {
        console.error('Error fetching payments:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET payments for a specific order
// URL: /api/payments/order/:orderId
router.get('/order/:orderId', async (req, res) => { // Handles requests to get payments for a specific order.
    const { orderId } = req.params; // Get the order ID from the URL.
    try {
        const result = await pool.query('SELECT p.*, u.full_name as cashier_name FROM payments p LEFT JOIN users u ON p.cashier_id = u.user_id WHERE p.order_id = $1 ORDER BY p.payment_date DESC', [orderId]);
        res.json(result.rows); // Send the list of payments for that order.
    } catch (err) {
        console.error('Error fetching payments for order:', err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router; // Export this router so index.js can use it.
