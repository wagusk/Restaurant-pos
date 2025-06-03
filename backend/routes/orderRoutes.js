// backend/routes/orderRoutes.js
// This file handles all API requests related to customer orders.

const express = require('express'); // Import Express.js to create a router.
const router = express.Router();    // Create a new router object.
const pool = require('../db');      // Import our database connection pool.

// Helper function to calculate the total amount for an order.
// This function adds up the cost of all items in an order.
const calculateOrderTotals = (orderItems) => {
    let total_amount = 0;
    for (const item of orderItems) {
        total_amount += item.quantity * item.unit_price; // Quantity of item times its price.
    }
    return total_amount;
};

// POST a new order
// URL: /api/orders
router.post('/', async (req, res) => { // Handles requests to create a new order.
    // Get order details from the request body. 'items' will be an array of objects for each menu item.
    const { table_number, cashier_id, notes, items } = req.body;
    let client; // We'll use a 'client' from the pool for a database transaction.
    try {
        client = await pool.connect(); // Get a database connection from the pool.
        await client.query('BEGIN'); // Start a database transaction. This ensures all steps succeed or all steps fail together.

        // 1. Calculate the initial total amount for the order.
        let total_amount = calculateOrderTotals(items);
        // 2. Insert the new order into the 'orders' table.
        const orderResult = await client.query(
            'INSERT INTO orders (table_number, total_amount, final_amount, cashier_id, notes, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING order_id, order_date',
            [table_number, total_amount, total_amount, cashier_id, notes, 'pending'] // 'pending' is the initial status.
        );
        const newOrderId = orderResult.rows[0].order_id; // Get the ID of the newly created order.

        // 3. Add each item from the order into the 'order_items' table.
        for (const item of items) {
            // First, get the actual item_name from the menu_items table to store a snapshot.
            const menuItem = await client.query('SELECT item_name FROM menu_items WHERE item_id = $1', [item.item_id]);
            if (menuItem.rows.length === 0) {
                // If a menu item isn't found, stop the transaction and throw an error.
                throw new Error(`Menu item with ID ${item.item_id} not found.`);
            }
            await client.query(
                'INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, item_total, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [newOrderId, item.item_id, menuItem.rows[0].item_name, item.quantity, item.unit_price, item.quantity * item.unit_price, item.notes]
            );
        }

        await client.query('COMMIT'); // If all steps above were successful, save all changes to the database.
        res.status(201).json({ message: 'Order created successfully', order_id: newOrderId, order_date: orderResult.rows[0].order_date }); // Send success response.

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK'); // If any error occurred, undo all changes made in this transaction.
        }
        console.error('Error creating order:', err.message);
        res.status(500).send('Server Error');
    } finally {
        if (client) {
            client.release(); // Always release the database connection back to the pool.
        }
    }
});

// GET all orders (with optional status filter)
// URL: /api/orders or /api/orders?status=pending
router.get('/', async (req, res) => { // Handles requests to get a list of orders.
    const { status } = req.query; // Check if there's a 'status' filter in the URL (e.g., ?status=completed).
    try {
        let query = 'SELECT o.*, u.full_name as cashier_name FROM orders o LEFT JOIN users u ON o.cashier_id = u.user_id'; // Base query to get orders and the cashier's name.
        const params = []; // Array to hold parameters for the query.
        if (status) { // If a status filter is provided...
            query += ' WHERE o.status = $1'; // Add a WHERE clause to filter by status.
            params.push(status); // Add the status value to the parameters.
        }
        query += ' ORDER BY o.order_date DESC'; // Order the results by the newest orders first.
        const result = await pool.query(query, params); // Execute the query.
        res.json(result.rows); // Send the list of orders as JSON.
    } catch (err) {
        console.error('Error fetching orders:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET order details by ID (including order items and discounts)
// URL: /api/orders/:id
router.get('/:id', async (req, res) => { // Handles requests to get details for a specific order.
    const { id } = req.params; // Get the order ID from the URL.
    try {
        // Get the main order details.
        const orderResult = await pool.query('SELECT o.*, u.full_name as cashier_name FROM orders o LEFT JOIN users u ON o.cashier_id = u.user_id WHERE o.order_id = $1', [id]);
        if (orderResult.rows.length === 0) { // If order not found.
            return res.status(404).json({ msg: 'Order not found' });
        }
        // Get all items associated with this order.
        const orderItemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
        // Get any discounts applied to this order.
        const orderDiscountsResult = await pool.query('SELECT od.*, d.discount_name FROM order_discounts od JOIN discounts d ON od.discount_id = d.discount_id WHERE od.order_id = $1', [id]);

        const order = orderResult.rows[0]; // Take the first (and only) order found.
        order.items = orderItemsResult.rows; // Add the retrieved items to the order object.
        order.discounts_applied = orderDiscountsResult.rows; // Add the retrieved discounts to the order object.

        res.json(order); // Send the complete order details as JSON.
    } catch (err) {
        console.error('Error fetching order details:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT (Update) order status
// URL: /api/orders/:id/status
router.put('/:id/status', async (req, res) => { // Handles requests to change an order's status (e.g., to 'completed').
    const { id } = req.params; // Get the order ID.
    const { status } = req.body; // Get the new status from the request body.
    try {
        // Update the 'status' and 'updated_at' fields for the specific order.
        const result = await pool.query(
            'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2 RETURNING *',
            [status, id]
        );
        if (result.rows.length === 0) { // If order not found.
            return res.status(404).json({ msg: 'Order not found' });
        }
        res.json(result.rows[0]); // Send back the updated order details.
    } catch (err) {
        console.error('Error updating order status:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT (Update) order details (e.g., add/remove items, apply discount)
// URL: /api/orders/:id
router.put('/:id', async (req, res) => { // Handles requests to update an order, including its items and discounts.
    const { id } = req.params; // Get the order ID.
    // Get updated details from the request body.
    const { table_number, notes, items, discount_id, applied_by_user_id } = req.body;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN'); // Start transaction.

        let newTotalAmount = 0;
        if (items && items.length > 0) { // If new items are provided...
            await client.query('DELETE FROM order_items WHERE order_id = $1', [id]); // Delete existing items for this order.
            for (const item of items) { // Insert the new/updated items.
                const menuItem = await client.query('SELECT item_name FROM menu_items WHERE item_id = $1', [item.item_id]);
                if (menuItem.rows.length === 0) {
                    throw new Error(`Menu item with ID ${item.item_id} not found.`);
                }
                await client.query(
                    'INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price, item_total, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [id, item.item_id, menuItem.rows[0].item_name, item.quantity, item.unit_price, item.quantity * item.unit_price, item.notes]
                );
                newTotalAmount += item.quantity * item.unit_price; // Recalculate total.
            }
        } else { // If no items are provided, assume total amount should be recalculated from existing items.
            const currentItems = await client.query('SELECT quantity, unit_price FROM order_items WHERE order_id = $1', [id]);
            newTotalAmount = calculateOrderTotals(currentItems.rows);
        }

        let final_amount = newTotalAmount;
        let discount_amount = 0;

        await client.query('DELETE FROM order_discounts WHERE order_id = $1', [id]); // Clear existing discounts for a full update.

        if (discount_id) { // If a discount ID is provided...
            const discountResult = await client.query('SELECT * FROM discounts WHERE discount_id = $1 AND is_active = TRUE', [discount_id]);
            if (discountResult.rows.length > 0) {
                const discount = discountResult.rows[0];
                if (discount.discount_type === 'percentage') {
                    discount_amount = newTotalAmount * (discount.value / 100);
                } else if (discount.discount_type === 'fixed_amount') {
                    discount_amount = discount.value;
                }
                final_amount = newTotalAmount - discount_amount; // Apply the discount.

                await client.query( // Record the applied discount.
                    'INSERT INTO order_discounts (order_id, discount_id, applied_value, applied_by_user_id) VALUES ($1, $2, $3, $4)',
                    [id, discount_id, discount_amount, applied_by_user_id || null]
                );
            }
        }

        // Update the main order details (table number, notes, and calculated amounts).
        const orderUpdateResult = await client.query(
            'UPDATE orders SET table_number = COALESCE($1, table_number), notes = COALESCE($2, notes), total_amount = $3, discount_amount = $4, final_amount = $5, updated_at = CURRENT_TIMESTAMP WHERE order_id = $6 RETURNING *',
            [table_number, notes, newTotalAmount, discount_amount, final_amount, id]
        );

        if (orderUpdateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ msg: 'Order not found' });
        }

        await client.query('COMMIT'); // Commit all changes in the transaction.
        res.json(orderUpdateResult.rows[0]); // Send back the updated order.

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK'); // Rollback on error.
        }
        console.error('Error updating order:', err.message);
        res.status(500).send('Server Error');
    } finally {
        if (client) {
            client.release(); // Release the database connection.
        }
    }
});

// DELETE an order
// URL: /api/orders/:id
router.delete('/:id', async (req, res) => { // Handles requests to delete an order.
    try {
        const { id } = req.params; // Get the order ID.
        // Delete the order from the database. Deleting an order will also delete its associated order_items and payments (due to ON DELETE CASCADE).
        const result = await pool.query('DELETE FROM orders WHERE order_id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) { // If order not found.
            return res.status(404).json({ msg: 'Order not found' });
        }
        res.json({ msg: 'Order deleted successfully' }); // Confirm deletion.
    } catch (err) {
        console.error('Error deleting order:', err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router; // Export this router.
