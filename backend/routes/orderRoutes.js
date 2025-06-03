// backend/routes/orderRoutes.js
// This file handles all API requests related to customer orders.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth, authorize } = require('../middleware/auth'); // <-- ADD THIS LINE: Import auth and authorize middleware

// Helper function to calculate the total amount for an order.
const calculateOrderTotals = (orderItems) => {
    let total_amount = 0;
    for (const item of orderItems) {
        total_amount += item.quantity * item.unit_price;
    }
    return total_amount;
};

// POST a new order (requires cashier, supervisor, or owner role)
// URL: /api/orders
router.post('/', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { table_number, cashier_id, notes, items } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        let total_amount = calculateOrderTotals(items);
        const orderResult = await client.query(
            'INSERT INTO orders (table_number, total_amount, final_amount, cashier_id, notes, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING order_id, order_date',
            [table_number, total_amount, total_amount, cashier_id, notes, 'pending']
        );
        const newOrderId = orderResult.rows[0].order_id;

        for (const item of items) {
            const menuItem = await client.query('SELECT item_name FROM menu_items WHERE item_id = $1', [item.item_id]);
            if (menuItem.rows.length === 0) {
                throw new Error(`Menu item with ID ${item.item_id} not found.`);
            }
            await client.query(
                'INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, item_total, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [newOrderId, item.item_id, menuItem.rows[0].item_name, item.quantity, item.unit_price, item.quantity * item.unit_price, item.notes]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Order created successfully', order_id: newOrderId, order_date: orderResult.rows[0].order_date });

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('Error creating order:', err.message);
        res.status(500).send('Server Error');
    } finally {
        if (client) {
            client.release();
        }
    }
});

// GET all orders (requires cashier, supervisor, or owner role)
// URL: /api/orders or /api/orders?status=pending
router.get('/', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { status } = req.query;
    try {
        let query = 'SELECT o.*, u.full_name as cashier_name FROM orders o LEFT JOIN users u ON o.cashier_id = u.user_id';
        const params = [];
        if (status) {
            query += ' WHERE o.status = $1';
            params.push(status);
        }
        query += ' ORDER BY o.order_date DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching orders:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET order details by ID (including order items and discounts) (requires cashier, supervisor, or owner role)
// URL: /api/orders/:id
router.get('/:id', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { id } = req.params;
    try {
        const orderResult = await pool.query('SELECT o.*, u.full_name as cashier_name FROM orders o LEFT JOIN users u ON o.cashier_id = u.user_id WHERE o.order_id = $1', [id]);
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        const orderItemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
        const orderDiscountsResult = await pool.query('SELECT od.*, d.discount_name FROM order_discounts od JOIN discounts d ON od.discount_id = d.discount_id WHERE od.order_id = $1', [id]);

        const order = orderResult.rows[0];
        order.items = orderItemsResult.rows;
        order.discounts_applied = orderDiscountsResult.rows;

        res.json(order);
    } catch (err) {
        console.error('Error fetching order details:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT (Update) order status (requires cashier, supervisor, or owner role)
// URL: /api/orders/:id/status
router.put('/:id/status', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { id } = req.params;
    const { status } = req.body;
    try {
        const result = await pool.query(
            'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2 RETURNING *',
            [status, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating order status:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT (Update) order details (requires supervisor or owner role)
// URL: /api/orders/:id
router.put('/:id', auth, authorize('supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { id } = req.params;
    const { table_number, notes, items, discount_id, applied_by_user_id } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        let newTotalAmount = 0;
        if (items && items.length > 0) {
            await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);
            for (const item of items) {
                const menuItem = await client.query('SELECT item_name FROM menu_items WHERE item_id = $1', [item.item_id]);
                if (menuItem.rows.length === 0) {
                    throw new Error(`Menu item with ID ${item.item_id} not found.`);
                }
                await client.query(
                    'INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, item_total, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [id, item.item_id, menuItem.rows[0].item_name, item.quantity, item.unit_price, item.quantity * item.unit_price, item.notes]
                );
                newTotalAmount += item.quantity * item.unit_price;
            }
        } else {
            const currentItems = await client.query('SELECT quantity, unit_price FROM order_items WHERE order_id = $1', [id]);
            newTotalAmount = calculateOrderTotals(currentItems.rows);
        }

        let final_amount = newTotalAmount;
        let discount_amount = 0;

        await client.query('DELETE FROM order_discounts WHERE order_id = $1', [id]);

        if (discount_id) {
            const discountResult = await client.query('SELECT * FROM discounts WHERE discount_id = $1 AND is_active = TRUE', [discount_id]);
            if (discountResult.rows.length > 0) {
                const discount = discountResult.rows[0];
                if (discount.discount_type === 'percentage') {
                    discount_amount = newTotalAmount * (discount.value / 100);
                } else if (discount.discount_type === 'fixed_amount') {
                    discount_amount = discount.value;
                }
                final_amount = newTotalAmount - discount_amount;

                await client.query(
                    'INSERT INTO order_discounts (order_id, discount_id, applied_value, applied_by_user_id) VALUES ($1, $2, $3, $4)',
                    [id, discount_id, discount_amount, applied_by_user_id || null]
                );
            }
        }

        const orderUpdateResult = await client.query(
            'UPDATE orders SET table_number = COALESCE($1, table_number), notes = COALESCE($2, notes), total_amount = $3, discount_amount = $4, final_amount = $5, updated_at = CURRENT_TIMESTAMP WHERE order_id = $6 RETURNING *',
            [table_number, notes, newTotalAmount, discount_amount, final_amount, id]
        );

        if (orderUpdateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ msg: 'Order not found' });
        }

        await client.query('COMMIT');
        res.json(orderUpdateResult.rows[0]);

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('Error updating order:', err.message);
        res.status(500).send('Server Error');
    } finally {
        if (client) {
            client.release();
        }
    }
});

// DELETE an order (requires owner role)
// URL: /api/orders/:id
router.delete('/:id', auth, authorize('owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM orders WHERE order_id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        res.json({ msg: 'Order deleted successfully' });
    } catch (err) {
        console.error('Error deleting order:', err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;
