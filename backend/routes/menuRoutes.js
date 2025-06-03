// backend/routes/menuRoutes.js
// This file handles all API requests related to menu items and categories.

const express = require('express'); // Import Express.js to create a router.
const router = express.Router();    // Create a new router object, which acts like a mini-application to handle routes.
const pool = require('../db');      // Import our database connection pool, allowing us to interact with PostgreSQL.

// --- Menu Item Routes ---

// GET all menu items
// URL: /api/menu (when combined with app.use('/api/menu', menuRoutes) in index.js)
router.get('/', async (req, res) => { // Handles GET requests to the base path of this router.
    try {
        // Selects all menu items and joins with categories to get the category name.
        const result = await pool.query('SELECT mi.*, c.category_name FROM menu_items mi JOIN categories c ON mi.category_id = c.category_id ORDER BY c.category_name, mi.item_name');
        res.json(result.rows); // Sends the retrieved menu items as a JSON response.
    } catch (err) {
        console.error('Error fetching menu items:', err.message); // Log any database errors.
        res.status(500).send('Server Error'); // Send a generic server error message.
    }
});

// GET a single menu item by ID
// URL: /api/menu/:id
router.get('/:id', async (req, res) => { // Handles GET requests for a specific menu item using its ID.
    try {
        const { id } = req.params; // Get the item ID from the URL (e.g., '/api/menu/5' means id = 5).
        const result = await pool.query('SELECT * FROM menu_items WHERE item_id = $1', [id]); // Query for the item with the matching ID.
        if (result.rows.length === 0) { // If no item is found...
            return res.status(404).json({ msg: 'Menu item not found' }); // Send a 404 Not Found response.
        }
        res.json(result.rows[0]); // Send the found menu item as a JSON response.
    } catch (err) {
        console.error('Error fetching menu item by ID:', err.message);
        res.status(500).send('Server Error');
    }
});

// POST a new menu item
// URL: /api/menu
router.post('/', async (req, res) => { // Handles POST requests to add a new menu item.
    // Get the data for the new menu item from the request body (sent by the frontend).
    const { category_id, item_name, description, price, is_available, image_url } = req.body;
    try {
        // Insert the new menu item into the database and return the newly created row.
        const result = await pool.query(
            'INSERT INTO menu_items (category_id, item_name, description, price, is_available, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [category_id, item_name, description, price, is_available, image_url] // The $1, $2... are placeholders to prevent SQL injection.
        );
        res.status(201).json(result.rows[0]); // Send a 201 Created status and the new item's data.
    } catch (err) {
        console.error('Error adding menu item:', err.message);
        res.status(500).send('Server Error');
    }
});

// PUT (Update) an existing menu item
// URL: /api/menu/:id
router.put('/:id', async (req, res) => { // Handles PUT requests to update an existing menu item.
    const { id } = req.params; // Get the item ID from the URL.
    // Get the updated data from the request body.
    const { category_id, item_name, description, price, is_available, image_url } = req.body;
    try {
        // Update the menu item in the database with the new values.
        const result = await pool.query(
            'UPDATE menu_items SET category_id = $1, item_name = $2, description = $3, price = $4, is_available = $5, image_url = $6, updated_at = CURRENT_TIMESTAMP WHERE item_id = $7 RETURNING *',
            [category_id, item_name, description, price, is_available, image_url, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Menu item not found' });
        }
        res.json(result.rows[0]); // Send back the updated item's data.
    } catch (err) {
        console.error('Error updating menu item:', err.message);
        res.status(500).send('Server Error');
    }
});

// DELETE a menu item
// URL: /api/menu/:id
router.delete('/:id', async (req, res) => { // Handles DELETE requests to remove a menu item.
    try {
        const { id } = req.params; // Get the item ID from the URL.
        // Delete the item from the database.
        const result = await pool.query('DELETE FROM menu_items WHERE item_id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Menu item not found' });
        }
        res.json({ msg: 'Menu item deleted successfully' }); // Confirm deletion.
    } catch (err) {
        console.error('Error deleting menu item:', err.message);
        res.status(500).send('Server Error');
    }
});

// --- Category Routes (related to menu management) ---

// GET all categories
// URL: /api/menu/categories
router.get('/categories', async (req, res) => { // Handles GET requests to get all menu categories.
    try {
        const result = await pool.query('SELECT * FROM categories ORDER BY category_name');
        res.json(result.rows); // Sends the categories as a JSON response.
    } catch (err) {
        console.error('Error fetching categories:', err.message);
        res.status(500).send('Server Error');
    }
});

// POST a new category
// URL: /api/menu/categories
router.post('/categories', async (req, res) => { // Handles POST requests to add a new category.
    const { category_name, description } = req.body; // Get category data from the request body.
    try {
        // Insert the new category into the database.
        const result = await pool.query(
            'INSERT INTO categories (category_name, description) VALUES ($1, $2) RETURNING *',
            [category_name, description]
        );
        res.status(201).json(result.rows[0]); // Send 201 Created status and the new category data.
    } catch (err) {
        console.error('Error adding category:', err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router; // Export this router so index.js can use it.
