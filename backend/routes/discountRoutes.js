// backend/routes/discountRoutes.js
// This file handles all API requests for managing discounts.

const express = require('express'); // Import Express.js to create the router.
const router = express.Router();    // Create a new router object.
const pool = require('../db');      // Import the database connection pool.

// GET all discounts
// URL: /api/discounts
router.get('/', async (req, res) => { // Handles requests to fetch all discount records.
    try {
        const result = await pool.query('SELECT * FROM discounts ORDER BY discount_name'); // Selects all columns from the 'discounts' table, ordered by name.
        res.json(result.rows); // Sends the retrieved discounts as a JSON array.
    } catch (err) {
        console.error('Error fetching discounts:', err.message); // Log any database errors.
        res.status(500).send('Server Error'); // Send a generic server error response.
    }
});

// GET a single discount by ID
// URL: /api/discounts/:id
router.get('/:id', async (req, res) => { // Handles requests for a specific discount by its ID.
    try {
        const { id } = req.params; // Extracts the discount ID from the URL.
        const result = await pool.query('SELECT * FROM discounts WHERE discount_id = $1', [id]); // Queries the database for the matching discount.
        if (result.rows.length === 0) { // If no discount is found with that ID...
            return res.status(404).json({ msg: 'Discount not found' }); // Send a 404 Not Found response.
        }
        res.json(result.rows[0]); // Sends the found discount as a JSON object.
    } catch (err) {
        console.error('Error fetching discount by ID:', err.message);
        res.status(500).send('Server Error');
    }
});

// POST a new discount
// URL: /api/discounts
router.post('/', async (req, res) => { // Handles requests to add a new discount.
    // Extracts the new discount's details from the request body.
    const { discount_name, discount_type, value, is_active, applies_to, min_amount_threshold, valid_from, valid_until } = req.body;
    try {
        // Inserts the new discount into the database and returns the newly created row.
        const result = await pool.query(
            'INSERT INTO discounts (discount_name, discount_type, value, is_active, applies_to, min_amount_threshold, valid_from, valid_until) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [discount_name, discount_type, value, is_active, applies_to, min_amount_threshold, valid_from, valid_until] // Placeholders to safely insert values.
        );
        res.status(201).json(result.rows[0]); // Sends a 201 Created status and the new discount's data.
    } catch (err) {
        console.error('Error adding discount:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT (Update) an existing discount
// URL: /api/discounts/:id
router.put('/:id', async (req, res) => { // Handles requests to update an existing discount.
    const { id } = req.params; // Extracts the discount ID from the URL.
    // Extracts the updated discount's details from the request body.
    const { discount_name, discount_type, value, is_active, applies_to, min_amount_threshold, valid_from, valid_until } = req.body;
    try {
        // Updates the discount record in the database, setting 'updated_at' to the current time.
        const result = await pool.query(
            'UPDATE discounts SET discount_name = $1, discount_type = $2, value = $3, is_active = $4, applies_to = $5, min_amount_threshold = $6, valid_from = $7, valid_until = $8, updated_at = CURRENT_TIMESTAMP WHERE discount_id = $9 RETURNING *',
            [discount_name, discount_type, value, is_active, applies_to, min_amount_threshold, valid_from, valid_until, id]
        );
        if (result.rows.length === 0) { // If no discount is found to update...
            return res.status(404).json({ msg: 'Discount not found' });
        }
        res.json(result.rows[0]); // Sends back the updated discount's data.
    } catch (err) {
        console.error('Error updating discount:', err.message);
        res.status(500).send('Server Error');
    }
});

// DELETE a discount
// URL: /api/discounts/:id
router.delete('/:id', async (req, res) => { // Handles requests to delete a discount.
    try {
        const { id } = req.params; // Extracts the discount ID from the URL.
        const result = await pool.query('DELETE FROM discounts WHERE discount_id = $1 RETURNING *', [id]); // Deletes the discount.
        if (result.rows.length === 0) { // If no discount was found to delete...
            return res.status(404).json({ msg: 'Discount not found' });
        }
        res.json({ msg: 'Discount deleted successfully' }); // Confirms successful deletion.
    } catch (err) {
        console.error('Error deleting discount:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router; // Exports this router so it can be used by the main 'index.js' file.
