// backend/routes/shiftRoutes.js
// This file manages API requests for cashier shift management (starting, ending, cash reconciliation).

const express = require('express'); // Import Express.js to create the router.
const router = express.Router();    // Create a new router object.
const pool = require('../db');      // Import the database connection pool.

// POST to start a new shift
// URL: /api/shifts/start
router.post('/start', async (req, res) => { // Handles requests to begin a new cashier shift.
    // Get the user ID (cashier) and the starting cash amount from the request body.
    const { user_id, opening_cash } = req.body;
    try {
        // First, check if the user already has an active shift.
        // A user shouldn't start a new shift if their previous one hasn't ended.
        const activeShift = await pool.query('SELECT * FROM cashier_shifts WHERE user_id = $1 AND shift_end IS NULL', [user_id]);
        if (activeShift.rows.length > 0) { // If an active shift is found...
            return res.status(400).json({ msg: 'User already has an active shift.' }); // Send an error.
        }

        // Insert a new record into the 'cashier_shifts' table to mark the start of the shift.
        const result = await pool.query(
            'INSERT INTO cashier_shifts (user_id, opening_cash) VALUES ($1, $2) RETURNING *',
            [user_id, opening_cash]
        );
        res.status(201).json(result.rows[0]); // Send a 201 Created status and the new shift details.
    } catch (err) {
        console.error('Error starting shift:', err.message); // Log any database errors.
        res.status(500).send('Server Error'); // Send a generic server error.
    }
});

// PUT to end an active shift
// URL: /api/shifts/end/:id
router.put('/end/:id', async (req, res) => { // Handles requests to end a specific cashier shift.
    const { id } = req.params; // Get the shift ID from the URL.
    // Get the closing cash amount and any notes from the request body.
    const { closing_cash, notes } = req.body;
    try {
        // Update the 'shift_end' time, 'closing_cash', and 'notes' for the specified shift.
        // Also mark 'updated_at' to current time.
        const result = await pool.query(
            'UPDATE cashier_shifts SET shift_end = CURRENT_TIMESTAMP, closing_cash = $1, notes = $2, updated_at = CURRENT_TIMESTAMP WHERE shift_id = $3 AND shift_end IS NULL RETURNING *',
            [closing_cash, notes, id]
        );
        if (result.rows.length === 0) { // If no active shift was found or updated...
            return res.status(404).json({ msg: 'Active shift not found or already ended.' }); // Send a 404 Not Found error.
        }
        res.json(result.rows[0]); // Send back the updated shift details.
    } catch (err) {
        console.error('Error ending shift:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET all shifts (with optional filters)
// URL: /api/shifts or /api/shifts?user_id=1&start_date=2023-01-01
router.get('/', async (req, res) => { // Handles requests to get a list of all shifts.
    // Get optional filter parameters from the URL query.
    const { user_id, start_date, end_date } = req.query;
    let query = 'SELECT cs.*, u.full_name as cashier_name FROM cashier_shifts cs JOIN users u ON cs.user_id = u.user_id'; // Base query.
    const params = []; // Array to store query parameters.
    const conditions = []; // Array to store WHERE clause conditions.
    let paramIndex = 1;

    if (user_id) { // If filtering by user ID...
        conditions.push(`cs.user_id = $${paramIndex++}`);
        params.push(user_id);
    }
    if (start_date) { // If filtering shifts starting after a date...
        conditions.push(`cs.shift_start >= $${paramIndex++}`);
        params.push(start_date);
    }
    if (end_date) { // If filtering shifts ending before a date...
        conditions.push(`cs.shift_start <= $${paramIndex++}`);
        params.push(end_date);
    }

    if (conditions.length > 0) { // If any conditions were added...
        query += ' WHERE ' + conditions.join(' AND '); // Add the WHERE clause.
    }
    query += ' ORDER BY cs.shift_start DESC'; // Always order by the newest shifts first.

    try {
        const result = await pool.query(query, params); // Execute the query.
        res.json(result.rows); // Send the list of shifts as JSON.
    } catch (err) {
        console.error('Error fetching shifts:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET a single shift by ID
// URL: /api/shifts/:id
router.get('/:id', async (req, res) => { // Handles requests for a specific shift by its ID.
    try {
        const { id } = req.params; // Get the shift ID from the URL.
        const result = await pool.query('SELECT cs.*, u.full_name as cashier_name FROM cashier_shifts cs JOIN users u ON cs.user_id = u.user_id WHERE cs.shift_id = $1', [id]);
        if (result.rows.length === 0) { // If no shift is found...
            return res.status(404).json({ msg: 'Shift not found' }); // Send a 404 Not Found error.
        }
        res.json(result.rows[0]); // Send the found shift details.
    } catch (err) {
        console.error('Error fetching shift by ID:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT to update a shift (e.g., reconcile, adjust cash)
// URL: /api/shifts/:id
router.put('/:id', async (req, res) => { // Handles requests to update existing shift details.
    const { id } = req.params; // Get the shift ID.
    // Get updated shift details from the request body.
    const { opening_cash, closing_cash, cash_in, cash_out, reconciled, notes } = req.body;
    try {
        // Update the shift record. COALESCE ensures that if a value is not provided in the request, the existing value in the database is kept.
        const result = await pool.query(
            'UPDATE cashier_shifts SET opening_cash = COALESCE($1, opening_cash), closing_cash = COALESCE($2, closing_cash), cash_in = COALESCE($3, cash_in), cash_out = COALESCE($4, cash_out), reconciled = COALESCE($5, reconciled), notes = COALESCE($6, notes), updated_at = CURRENT_TIMESTAMP WHERE shift_id = $7 RETURNING *',
            [opening_cash, closing_cash, cash_in, cash_out, reconciled, notes, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Shift not found' });
        }
        res.json(result.rows[0]); // Send back the updated shift details.
    } catch (err) {
        console.error('Error updating shift:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router; // Export this router.
