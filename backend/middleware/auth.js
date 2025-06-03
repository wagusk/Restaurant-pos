// backend/middleware/auth.js
// This file contains middleware functions for authentication (verifying JWT)
// and authorization (checking user roles).

const jwt = require('jsonwebtoken'); // Import jsonwebtoken for token verification.

// This is your JWT secret key. It should match the one in your .env file.
const jwtSecret = process.env.JWT_SECRET; // Get the secret from environment variables.

// --- Authentication Middleware ---
// This middleware checks if a user is logged in by verifying their JWT.
function auth(req, res, next) { // 'next' is a function that passes control to the next middleware/route handler.
    // Get token from header. Frontend will send the token in the 'x-auth-token' header.
    const token = req.header('x-auth-token');

    // Check if no token is found.
    if (!token) {
        // If no token, the user is not authorized.
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        // Verify the token.
        // jwt.verify() decodes the token using the secret and returns the payload (user info we put in it).
        const decoded = jwt.verify(token, jwtSecret);

        // Attach the decoded user object (from the token) to the request object.
        // This makes user data (like user_id, username, role) available in subsequent route handlers.
        req.user = decoded.user;
        next(); // Pass control to the next middleware or route handler.
    } catch (e) {
        // If token verification fails (e.g., token is expired or invalid).
        res.status(401).json({ msg: 'Token is not valid' });
    }
}

// --- Authorization Middleware (Role-Based Access Control) ---
// This middleware checks if the authenticated user has one of the required roles.
function authorize(...allowedRoles) { // Accepts a list of roles (e.g., 'admin', 'supervisor').
    return (req, res, next) => { // Returns another middleware function.
        // Check if req.user exists (meaning 'auth' middleware ran successfully before this one).
        if (!req.user || !req.user.role) {
            return res.status(403).json({ msg: 'User role not found in token, forbidden' });
        }

        // Check if the user's role is included in the list of allowed roles for this route.
        if (!allowedRoles.includes(req.user.role)) {
            // If the user's role is not allowed.
            return res.status(403).json({ msg: 'Access forbidden: Insufficient role' }); // 403 Forbidden.
        }
        next(); // If role is allowed, pass control to the next middleware or route handler.
    };
}

module.exports = { auth, authorize }; // Export both middleware functions.
