// backend/routes/discountRoutes.js
// This file handles all API requests for managing discounts.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth, authorize } = require('../middleware/auth'); // <-- ADD THIS LINE

// GET all discounts (requires authentication, accessible by cashier, supervisor, owner)
// URL: /api/discounts
router.get('/', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    try {
        const result = await pool.query('SELECT * FROM discounts ORDER BY discount_name');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching discounts:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET a single discount by ID (requires authentication, accessible by cashier, supervisor, owner)
// URL: /api/discounts/:id
router.get('/:id', auth, authorize('cashier', 'supervisor', 'owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM discounts WHERE discount_id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Discount not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching discount by ID:', err.message);
        res.status(500).send('Server Error');
    }
});

// POST a new discount (requires owner or supervisor role)
// URL: /api/discounts
router.post('/', auth, authorize('owner', 'supervisor'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { discount_name, discount_type, value, is_active, applies_to, min_amount_threshold, valid_from, valid_until } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO discounts (discount_name, discount_type, value, is_active, applies_to, min_amount_threshold, valid_from, valid_until) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [discount_name, discount_type, value, is_active, applies_to, min_amount_threshold, valid_from, valid_until]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding discount:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT (Update) an existing discount (requires owner or supervisor role)
// URL: /api/discounts/:id
router.put('/:id', auth, authorize('owner', 'supervisor'), async (req, res) => { // <-- ADD MIDDLEWARE
    const { id } = req.params;
    const { discount_name, discount_type, value, is_active, applies_to, min_amount_threshold, valid_from, valid_until } = req.body;
    try {
        const result = await pool.query(
            'UPDATE discounts SET discount_name = $1, discount_type = $2, value = $3, is_active = $4, applies_to = $5, min_amount_threshold = $6, valid_from = $7, valid_until = $8, updated_at = CURRENT_TIMESTAMP WHERE discount_id = $9 RETURNING *',
            [discount_name, discount_type, value, is_active, applies_to, min_amount_threshold, valid_from, valid_until, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Discount not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating discount:', err.message);
        res.status(500).send('Server Error');
    }
});

// DELETE a discount (requires owner role)
// URL: /api/discounts/:id
router.delete('/:id', auth, authorize('owner'), async (req, res) => { // <-- ADD MIDDLEWARE
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM discounts WHERE discount_id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Discount not found' });
        }
        res.json({ msg: 'Discount deleted successfully' });
    } catch (err) {
        console.error('Error deleting discount:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
