// backend/routes/reportRoutes.js
// This file handles API requests for generating various POS reports.

const express = require('express'); // Import Express.js to create the router.
const router = express.Router();    // Create a new router object.
const pool = require('../db');      // Import the database connection pool.

// GET Daily Sales Report
// URL: /api/reports/daily-sales?date=YYYY-MM-DD
router.get('/daily-sales', async (req, res) => { // Handles requests for sales report on a specific day.
    const { date } = req.query; // Get the date from the URL query parameter (e.g., ?date=2024-05-20).
    // Ensure a date is provided.
    if (!date) {
        return res.status(400).json({ msg: 'Date parameter (YYYY-MM-DD) is required for daily sales report.' });
    }

    try {
        // Query to get total sales, total orders, and average order value for the given day.
        const query = `
            SELECT
                COUNT(order_id) AS total_orders,
                SUM(final_amount) AS total_sales,
                AVG(final_amount) AS average_order_value,
                SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) AS cash_sales,
                SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END) AS card_sales
            FROM orders o
            LEFT JOIN payments p ON o.order_id = p.order_id -- Join with payments to differentiate cash/card sales
            WHERE o.order_date::date = $1::date; -- Filter by the provided date. '::date' casts timestamp to just date.
        `;
        const result = await pool.query(query, [date]); // Execute the query with the date.
        res.json(result.rows[0]); // Send the report data.
    } catch (err) {
        console.error('Error fetching daily sales report:', err.message); // Log any errors.
        res.status(500).send('Server Error'); // Send a generic server error.
    }
});

// GET Item Sales Report (Top Selling Items)
// URL: /api/reports/item-sales?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&limit=10
router.get('/item-sales', async (req, res) => { // Handles requests for a report on popular menu items.
    // Get optional start_date, end_date, and limit (for top N items) from query parameters.
    const { start_date, end_date, limit } = req.query;
    let query = `
        SELECT
            oi.item_name,
            mi.image_url, -- Include image URL from menu_items
            SUM(oi.quantity) AS total_quantity_sold,
            SUM(oi.item_total) AS total_revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        LEFT JOIN menu_items mi ON oi.item_id = mi.item_id -- Join to get menu item image URL
    `;
    const params = []; // Parameters for the query.
    const conditions = []; // Conditions for the WHERE clause.
    let paramIndex = 1;

    // Add date range filters if provided.
    if (start_date) {
        conditions.push(`o.order_date >= $${paramIndex++}`);
        params.push(start_date);
    }
    if (end_date) {
        conditions.push(`o.order_date <= $${paramIndex++}`);
        params.push(end_date);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND '); // Apply date filters.
    }

    query += `
        GROUP BY oi.item_name, mi.image_url -- Group results by item name and image URL.
        ORDER BY total_quantity_sold DESC -- Order by most sold items.
    `;
    if (limit) {
        query += ` LIMIT $${paramIndex++}`; // Limit the number of results (e.g., top 10).
        params.push(limit);
    }

    try {
        const result = await pool.query(query, params); // Execute the query.
        res.json(result.rows); // Send the report data.
    } catch (err) {
        console.error('Error fetching item sales report:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET Category Sales Report
// URL: /api/reports/category-sales?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
router.get('/category-sales', async (req, res) => { // Handles requests for sales breakdown by category.
    const { start_date, end_date } = req.query;
    let query = `
        SELECT
            c.category_name,
            SUM(oi.item_total) AS total_revenue,
            SUM(oi.quantity) AS total_items_sold
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        JOIN menu_items mi ON oi.item_id = mi.item_id
        JOIN categories c ON mi.category_id = c.category_id
    `;
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    if (start_date) {
        conditions.push(`o.order_date >= $${paramIndex++}`);
        params.push(start_date);
    }
    if (end_date) {
        conditions.push(`o.order_date <= $${paramIndex++}`);
        params.push(end_date);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += `
        GROUP BY c.category_name
        ORDER BY total_revenue DESC;
    `;

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching category sales report:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET Shift Summary Report for a cashier
// URL: /api/reports/shift-summary/:shift_id
router.get('/shift-summary/:shift_id', async (req, res) => { // Provides a detailed summary for a single cashier shift.
    const { shift_id } = req.params;
    try {
        // Fetch the shift details.
        const shiftResult = await pool.query('SELECT cs.*, u.full_name as cashier_name FROM cashier_shifts cs JOIN users u ON cs.user_id = u.user_id WHERE cs.shift_id = $1', [shift_id]);
        if (shiftResult.rows.length === 0) {
            return res.status(404).json({ msg: 'Shift not found.' });
        }
        const shift = shiftResult.rows[0];

        // Calculate actual cash expected based on sales, cash in, cash out.
        const expected_cash_balance = (
            parseFloat(shift.opening_cash || 0) +
            parseFloat(shift.sales_amount_cash || 0) +
            parseFloat(shift.cash_in || 0) -
            parseFloat(shift.cash_out || 0)
        ).toFixed(2); // Format to 2 decimal places.

        // Add calculated expected balance to the shift object.
        shift.expected_cash_balance = expected_cash_balance;

        // Calculate cash discrepancy (difference between expected and actual closing cash).
        if (shift.closing_cash !== null && shift.closing_cash !== undefined) {
            const discrepancy = (parseFloat(shift.closing_cash) - parseFloat(expected_cash_balance)).toFixed(2);
            shift.cash_discrepancy = discrepancy;
        } else {
            shift.cash_discrepancy = null; // No discrepancy if shift isn't closed.
        }

        res.json(shift); // Send the detailed shift report.
    } catch (err) {
        console.error('Error fetching shift summary report:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router; // Export this router.
