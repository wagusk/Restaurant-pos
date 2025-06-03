// backend/routes/shiftRoutes.js
// This file manages API requests for cashier shift management (starting, ending, cash reconciliation).

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth, authorize } = require('../middleware/auth'); // <-- ADD THIS LINE

// POST to start a new shift (requires cashier, supervisor, or owner role)
// URL: /api/shifts/start
router.post('/start', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { user_id, opening_cash } = req.body;
    try {
        const activeShift = await pool.query('SELECT * FROM cashier_shifts WHERE user_id = $1 AND shift_end IS NULL', [user_id]);
        if (activeShift.rows.length > 0) {
            return res.status(400).json({ msg: 'User already has an active shift.' });
        }

        const result = await pool.query(
            'INSERT INTO cashier_shifts (user_id, opening_cash) VALUES ($1, $2) RETURNING *',
            [user_id, opening_cash]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error starting shift:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT to end an active shift (requires cashier, supervisor, or owner role)
// URL: /api/shifts/end/:id
router.put('/end/:id', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { id } = req.params;
    const { closing_cash, notes } = req.body;
    try {
        const result = await pool.query(
            'UPDATE cashier_shifts SET shift_end = CURRENT_TIMESTAMP, closing_cash = $1, notes = $2, updated_at = CURRENT_TIMESTAMP WHERE shift_id = $3 AND shift_end IS NULL RETURNING *',
            [closing_cash, notes, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Active shift not found or already ended.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error ending shift:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET all shifts (with optional filters) (requires supervisor or owner role)
// URL: /api/shifts or /api/shifts?user_id=1&start_date=2023-01-01
router.get('/', auth, authorize('supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { user_id, start_date, end_date } = req.query;
    let query = 'SELECT cs.*, u.full_name as cashier_name FROM cashier_shifts cs JOIN users u ON cs.user_id = u.user_id';
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    if (user_id) {
        conditions.push(`cs.user_id = $${paramIndex++}`);
        params.push(user_id);
    }
    if (start_date) {
        conditions.push(`cs.shift_start >= $${paramIndex++}`);
        params.push(start_date);
    }
    if (end_date) {
        conditions.push(`cs.shift_start <= $${paramIndex++}`);
        params.push(end_date);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY cs.shift_start DESC';

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching shifts:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET a single shift by ID (requires authentication, accessible by cashier, supervisor, owner)
// URL: /api/shifts/:id
router.get('/:id', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT cs.*, u.full_name as cashier_name FROM cashier_shifts cs JOIN users u ON cs.user_id = u.user_id WHERE cs.shift_id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Shift not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching shift by ID:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT to update a shift (e.g., reconcile, adjust cash) (requires supervisor or owner role)
// URL: /api/shifts/:id
router.put('/:id', auth, authorize('supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { id } = req.params;
    const { opening_cash, closing_cash, cash_in, cash_out, reconciled, notes } = req.body;
    try {
        const result = await pool.query(
            'UPDATE cashier_shifts SET opening_cash = COALESCE($1, opening_cash), closing_cash = COALESCE($2, closing_cash), cash_in = COALESCE($3, cash_in), cash_out = COALESCE($4, cash_out), reconciled = COALESCE($5, reconciled), notes = COALESCE($6, notes), updated_at = CURRENT_TIMESTAMP WHERE shift_id = $7 RETURNING *',
            [opening_cash, closing_cash, cash_in, cash_out, reconciled, notes, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Shift not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating shift:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
