// backend/index.js
// This is the main file that starts your Express.js backend server.

require('dotenv').config(); // Loads environment variables from your .env file. This should always be at the very top.

const express = require('express'); // Imports the Express.js library to build our web server.
const cors = require('cors');     // Imports CORS middleware, which handles security for requests from different web addresses (like your frontend).
const pool = require('./db');     // Imports our database connection pool from db.js, allowing the server to talk to PostgreSQL.

// Import all our separate route files for better organization.
const menuRoutes = require('./routes/menuRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const discountRoutes = require('./routes/discountRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express(); // Creates a new Express application.
const PORT = process.env.PORT || 3001; // Sets the port for the server. It will try to use the PORT from your .env file, or default to 3001.

// --- Middleware Setup ---
app.use(cors()); // Enables Cross-Origin Resource Sharing (CORS) for all incoming requests. This is important for your frontend to communicate with your backend.
app.use(express.json()); // Tells Express to understand and parse incoming requests that have JSON data in their body (e.g., when you send data to create a new menu item).

// --- Register API Routes ---
// These lines connect specific URL paths to their corresponding route files.
// For example, any request to '/api/menu' or '/api/menu/:id' will be handled by menuRoutes.js.
app.use('/api/menu', menuRoutes); // Routes for managing menu items and categories.
app.use('/api/orders', orderRoutes); // Routes for creating, fetching, and updating orders.
app.use('/api/payments', paymentRoutes); // Routes for processing payments.
app.use('/api/discounts', discountRoutes); // Routes for managing discounts.
app.use('/api/shifts', shiftRoutes); // Routes for managing cashier shifts (starting/ending).
app.use('/api/reports', reportRoutes); // Routes for generating various sales and operational reports.

// --- Simple Root Route ---
// This is a basic route that responds when someone accesses the base URL of your API (e.g., http://localhost:3001/).
app.get('/', (req, res) => {
    res.send('Restaurant POS Backend API is running!'); // Sends a simple text message back.
});

// --- Start the Server ---
// This tells your Express application to start listening for incoming requests on the specified port.
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`); // Logs a message to the console once the server starts.
    console.log(`Access backend via http://localhost:${PORT}`); // Provides the base URL for accessing your API.
});
