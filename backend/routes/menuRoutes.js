// backend/routes/menuRoutes.js
// This file handles all API requests related to menu items and categories.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth, authorize } = require('../middleware/auth'); // <-- ADD THIS LINE: Import auth and authorize middleware

// --- Menu Item Routes ---

// GET all menu items (requires authentication, but any logged-in user can view)
// URL: /api/menu
router.get('/', auth, async (req, res) => { // <-- ADD 'auth' middleware here
    try {
        const result = await pool.query('SELECT mi.*, c.category_name FROM menu_items mi JOIN categories c ON mi.category_id = c.category_id ORDER BY c.category_name, mi.item_name');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching menu items:', err.message);
        res.status(500).send('Server Error');
    }
});

// GET a single menu item by ID (requires authentication)
// URL: /api/menu/:id
router.get('/:id', auth, async (req, res) => { // <-- ADD 'auth' middleware here
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM menu_items WHERE item_id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Menu item not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching menu item by ID:', err.message);
        res.status(500).send('Server Error');
    }
});

// POST a new menu item (requires owner or supervisor role)
// URL: /api/menu
router.post('/', auth, authorize('owner', 'supervisor'), async (req, res) => { // <-- ADD 'auth' and 'authorize' middleware here
    const { category_id, item_name, description, price, is_available, image_url } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO menu_items (category_id, item_name, description, price, is_available, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [category_id, item_name, description, price, is_available, image_url]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding menu item:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT (Update) an existing menu item (requires owner or supervisor role)
// URL: /api/menu/:id
router.put('/:id', auth, authorize('owner', 'supervisor'), async (req, res) => { // <-- ADD 'auth' and 'authorize' middleware here
    const { id } = req.params;
    const { category_id, item_name, description, price, is_available, image_url } = req.body;
    try {
        const result = await pool.query(
            'UPDATE menu_items SET category_id = $1, item_name = $2, description = $3, price = $4, is_available = $5, image_url = $6, updated_at = CURRENT_TIMESTAMP WHERE item_id = $7 RETURNING *',
            [category_id, item_name, description, price, is_available, image_url, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Menu item not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating menu item:', err.message);
        res.status(500).send('Server Error');
    }
});

// DELETE a menu item (requires owner or supervisor role)
// URL: /api/menu/:id
router.delete('/:id', auth, authorize('owner', 'supervisor'), async (req, res) => { // <-- ADD 'auth' and 'authorize' middleware here
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM menu_items WHERE item_id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Menu item not found' });
        }
        res.json({ msg: 'Menu item deleted successfully' });
    } catch (err) {
        console.error('Error deleting menu item:', err.message);
        res.status(500).send('Server Error');
    }
});

// --- Category Routes (related to menu management) ---

// GET all categories (requires authentication)
// URL: /api/menu/categories
router.get('/categories', auth, async (req, res) => { // <-- ADD 'auth' middleware here
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY category_name');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching categories:', err.message);
        res.status(500).send('Server Error');
    }
});

// POST a new category (requires owner or supervisor role)
// URL: /api/menu/categories
router.post('/categories', auth, authorize('owner', 'supervisor'), async (req, res) => { // <-- ADD 'auth' and 'authorize' middleware here
    const { category_name, description } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO categories (category_name, description) VALUES ($1, $2) RETURNING *',
            [category_name, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding category:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
