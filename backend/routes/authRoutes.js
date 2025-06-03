// backend/routes/authRoutes.js
// This file handles user authentication: registration (with PIN), login (with PIN), and user management.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcryptjs'); // Still good for hashing PINs securely.
const jwt = require('jsonwebtoken');

// You'll need a secret key for JWT. In a real app, this should be a long, random string
// stored securely in your .env file and never hardcoded.
// IMPORTANT: Create a .env file in your 'backend' folder with JWT_SECRET=<your_long_random_string_here>
const jwtSecret = process.env.JWT_SECRET || 'supersecretjwtkey_please_change_this_in_production'; // Default for development

// --- User Registration (Accessible by owner/admin to create new accounts) ---
// This route now accepts a 'pin' instead of a full 'password'.
// URL: /api/auth/register
router.post('/register', async (req, res) => {
    // Get user details from the request body.
    const { username, pin, full_name, role } = req.body; // Changed 'password' to 'pin'

    // Basic validation
    if (!username || !pin || !full_name || !role) {
        return res.status(400).json({ msg: 'Please enter all fields: username, PIN, full_name, role' });
    }

    // Define allowed roles.
    const allowedRoles = ['owner', 'supervisor', 'cashier', 'waiter'];
    if (!allowedRoles.includes(role.toLowerCase())) {
        return res.status(400).json({ msg: `Invalid role specified. Allowed roles are: ${allowedRoles.join(', ')}` });
    }

    // Basic PIN validation: ensure it's numeric and has a reasonable length
    if (!/^\d{4,8}$/.test(pin)) { // Example: 4 to 8 digit numeric PIN
        return res.status(400).json({ msg: 'PIN must be 4-8 digits numeric.' });
    }

    try {
        // 1. Check if username already exists.
        const userCheck = await pool.query('SELECT user_id FROM users WHERE username = $1', [username]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ msg: 'Username already exists' });
        }

        // 2. Hash the PIN for security. Treat it like a password for hashing.
        const salt = await bcrypt.genSalt(10); // Generate a "salt" (random string) for hashing.
        const pin_hash = await bcrypt.hash(pin, salt); // Hash the PIN using the salt.

        // 3. Insert the new user into the database.
        const result = await pool.query(
            'INSERT INTO users (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING user_id, username, full_name, role',
            [username, pin_hash, full_name, role.toLowerCase()] // Storing hashed PIN in 'password_hash' column
        );

        res.status(201).json({
            msg: 'User registered successfully',
            user: result.rows[0]
        });

    } catch (err) {
        console.error('Error registering user:', err.message);
        res.status(500).send('Server Error');
    }
});

// --- User Login (with PIN) ---
// URL: /api/auth/login
router.post('/login', async (req, res) => {
    const { username, pin } = req.body; // Changed 'password' to 'pin'

    if (!username || !pin) { // Basic validation.
        return res.status(400).json({ msg: 'Please enter both username and PIN' });
    }

    try {
        // 1. Find the user by username.
        const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }
        const user = userResult.rows[0];

        // 2. Compare the provided PIN with the stored hashed PIN.
        const isMatch = await bcrypt.compare(pin, user.password_hash); // Compare PIN with stored hash
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        // 3. Create and sign a JSON Web Token (JWT).
        const payload = {
            user: {
                id: user.user_id,
                username: user.username,
                role: user.role
            }
        };

        jwt.sign(
            payload,
            jwtSecret,
            { expiresIn: '1h' }, // Token valid for 1 hour. Adjust as needed.
            (err, token) => {
                if (err) throw err;
                res.json({ token, user: { id: user.user_id, username: user.username, full_name: user.full_name, role: user.role } });
            }
        );

    } catch (err) {
        console.error('Error logging in user:', err.message);
        res.status(500).send('Server Error');
    }
});

// --- User Profile (Example of a protected route - will need middleware later) ---
// URL: /api/auth/me
router.get('/me', async (req, res) => {
    // This route will eventually use an 'auth' middleware to verify the token
    // and then fetch the user's details. For now, it's a placeholder.
    res.json({ msg: 'This route will show logged in user profile', user: req.user });
});


module.exports = router;
