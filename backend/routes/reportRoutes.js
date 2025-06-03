// backend/routes/reportRoutes.js
// This file handles API requests for generating various POS reports.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth, authorize } = require('../middleware/auth'); // <-- ADD THIS LINE

// GET Daily Sales Report (requires owner or supervisor role)
// URL: /api/reports/daily-sales?date=YYYY-MM-DD
router.get('/daily-sales', auth, authorize('owner', 'supervisor'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ msg: 'Date parameter (YYYY-MM-DD) is required for daily sales report.' });
    }

    try {
        const query = `
            SELECT
                COUNT(order_id) AS total_orders,
                SUM(final_amount) AS total_sales,
                AVG(final_amount) AS average_order_value,
                SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) AS cash_sales,
                SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END) AS card_sales
            FROM orders o
            LEFT JOIN payments p ON o.order_id = p.order_id
            WHERE o.order_date::date = $1::date;
        `;
        const result = await pool.query(query, [date]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching daily sales report:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET Item Sales Report (Top Selling Items) (requires owner or supervisor role)
// URL: /api/reports/item-sales?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&limit=10
router.get('/item-sales', auth, authorize('owner', 'supervisor'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { start_date, end_date, limit } = req.query;
    let query = `
        SELECT
            oi.item_name,
            mi.image_url,
            SUM(oi.quantity) AS total_quantity_sold,
            SUM(oi.item_total) AS total_revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id
        LEFT JOIN menu_items mi ON oi.item_id = mi.item_id
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
        GROUP BY oi.item_name, mi.image_url
        ORDER BY total_quantity_sold DESC
    `;
    if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(limit);
    }

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching item sales report:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET Category Sales Report (requires owner or supervisor role)
// URL: /api/reports/category-sales?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
router.get('/category-sales', auth, authorize('owner', 'supervisor'), async (req, res) => { // <-- ADD MIDDLEWARE
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

// GET Shift Summary Report for a cashier (requires owner or supervisor role)
// URL: /api/reports/shift-summary/:shift_id
router.get('/shift-summary/:shift_id', auth, authorize('owner', 'supervisor'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { shift_id } = req.params;
    try {
        const shiftResult = await pool.query('SELECT cs.*, u.full_name as cashier_name FROM cashier_shifts cs JOIN users u ON cs.user_id = u.user_id WHERE cs.shift_id = $1', [shift_id]);
        if (shiftResult.rows.length === 0) {
            return res.status(404).json({ msg: 'Shift not found.' });
        }
        const shift = shiftResult.rows[0];

        const expected_cash_balance = (
            parseFloat(shift.opening_cash || 0) +
            parseFloat(shift.sales_amount_cash || 0) +
            parseFloat(shift.cash_in || 0) -
            parseFloat(shift.cash_out || 0)
        ).toFixed(2);

        shift.expected_cash_balance = expected_cash_balance;

        if (shift.closing_cash !== null && shift.closing_cash !== undefined) {
            const discrepancy = (parseFloat(shift.closing_cash) - parseFloat(expected_cash_balance)).toFixed(2);
            shift.cash_discrepancy = discrepancy;
        } else {
            shift.cash_discrepancy = null;
        }

        res.json(shift);
    } catch (err) {
        console.error('Error fetching shift summary report:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
