// backend/routes/authRoutes.js
// This file handles user authentication: registration, login, and potentially user management.

const express = require('express'); // Import Express.js.
const router = express.Router();    // Create a new router.
const pool = require('../db');      // Import the database connection.
const bcrypt = require('bcryptjs'); // For hashing and comparing passwords securely. (Important: we'll need to add this to package.json)
const jwt = require('jsonwebtoken'); // For creating and verifying JSON Web Tokens for user sessions. (Important: we'll need to add this to package.json)

// You'll need a secret key for JWT. In a real app, this should be a long, random string
// stored securely in your .env file and never hardcoded.
const jwtSecret = process.env.JWT_SECRET || 'supersecretjwtkey'; // Default for development

// --- User Registration (Accessible by owner/admin to create new accounts) ---
// URL: /api/auth/register
router.post('/register', async (req, res) => { // Handles requests to create a new user account.
    // Get user details from the request body.
    const { username, password, full_name, role } = req.body;

    // Basic validation
    if (!username || !password || !full_name || !role) {
        return res.status(400).json({ msg: 'Please enter all fields: username, password, full_name, role' });
    }

    // Define allowed roles.
    const allowedRoles = ['owner', 'supervisor', 'cashier', 'waiter'];
    if (!allowedRoles.includes(role.toLowerCase())) {
        return res.status(400).json({ msg: `Invalid role specified. Allowed roles are: ${allowedRoles.join(', ')}` });
    }

    try {
        // 1. Check if username already exists.
        const userCheck = await pool.query('SELECT user_id FROM users WHERE username = $1', [username]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ msg: 'Username already exists' });
        }

        // 2. Hash the password for security.
        const salt = await bcrypt.genSalt(10); // Generate a "salt" (random string) for hashing.
        const password_hash = await bcrypt.hash(password, salt); // Hash the password using the salt.

        // 3. Insert the new user into the database.
        const result = await pool.query(
            'INSERT INTO users (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING user_id, username, full_name, role',
            [username, password_hash, full_name, role.toLowerCase()]
        );

        res.status(201).json({
            msg: 'User registered successfully',
            user: result.rows[0] // Send back the new user's non-sensitive info.
        });

    } catch (err) {
        console.error('Error registering user:', err.message);
        res.status(500).send('Server Error');
    }
});

// --- User Login ---
// URL: /api/auth/login
router.post('/login', async (req, res) => { // Handles user login attempts.
    const { username, password } = req.body;

    if (!username || !password) { // Basic validation.
        return res.status(400).json({ msg: 'Please enter all fields: username and password' });
    }

    try {
        // 1. Find the user by username.
        const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) { // If user not found.
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }
        const user = userResult.rows[0];

        // 2. Compare the provided password with the stored hashed password.
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) { // If passwords don't match.
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        // 3. Create and sign a JSON Web Token (JWT).
        // This token will contain user information (like ID, username, role) and will be sent to the frontend.
        // The frontend will include this token in future requests to prove the user is logged in.
        const payload = {
            user: {
                id: user.user_id,
                username: user.username,
                role: user.role
            }
        };

        jwt.sign(
            payload,
            jwtSecret, // The secret key for signing the token.
            { expiresIn: '1h' }, // The token will expire in 1 hour.
            (err, token) => { // Callback function once the token is signed.
                if (err) throw err; // If there's an error signing the token.
                res.json({ token, user: { id: user.user_id, username: user.username, full_name: user.full_name, role: user.role } }); // Send the token and user info back.
            }
        );

    } catch (err) {
        console.error('Error logging in user:', err.message);
        res.status(500).send('Server Error');
    }
});

// --- User Profile (Example of a protected route) ---
// We will later add middleware to protect this route.
// URL: /api/auth/me
router.get('/me', async (req, res) => {
    // This route will eventually use an 'auth' middleware to verify the token
    // and then fetch the user's details. For now, it's a placeholder.
    res.json({ msg: 'This route will show logged in user profile', user: req.user });
});


module.exports = router; // Export this router.
