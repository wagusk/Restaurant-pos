// backend/db.js
// This file sets up the connection to your PostgreSQL database.

require('dotenv').config(); // This line loads any environment variables from a .env file into your Node.js application.
                            // This helps keep sensitive info (like database passwords) out of your code.

const { Pool } = require('pg'); // We're using the 'pg' library, specifically its Pool feature.
                                // A Pool efficiently manages multiple database connections.

// Here, we create a new database connection pool.
// It uses environment variables to get the database details.
const pool = new Pool({
    user: process.env.DB_USER,      // Your PostgreSQL username. In Codespaces, this comes from docker-compose.yml.
    host: process.env.DB_HOST,      // The database server's address. In Codespaces, this will be 'db' (the name of our database service).
    database: process.env.DB_DATABASE, // The name of your database (e.g., 'restaurant_pos').
    password: process.env.DB_PASSWORD, // The password for your database user.
    port: process.env.DB_PORT,      // The port PostgreSQL is listening on, usually 5432.
});

// This section is for testing the database connection when the backend starts up.
// It tries to connect and run a simple query to ensure everything is working.
pool.connect((err, client, release) => {
    if (err) { // If there's an error connecting...
        return console.error('Error acquiring client', err.stack); // Log the error.
    }
    // If connected successfully, run a simple query to get the current time from the database.
    client.query('SELECT NOW()', (err, result) => {
        release(); // Release the client back to the pool, making it available for other connections.
        if (err) { // If there's an error with the query...
            return console.error('Error executing query', err.stack); // Log the error.
        }
        // If everything worked, print a success message with the current database time.
        console.log('PostgreSQL connected:', result.rows[0].now);
    });
});

module.exports = pool; // This makes our database connection pool available to other files in the backend.
