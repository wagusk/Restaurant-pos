// frontend/src/index.js
// This is the main entry point for your React application.

import React from 'react'; // Import the React library.
import ReactDOM from 'react-dom/client'; // Import ReactDOM for rendering.
import App from './App'; // Import the main App component.
import './index.css'; // Import global CSS styles (we'll create this next).

// Create a root for the React application to render into.
// This targets the 'root' div in public/index.html.
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render the App component inside the root.
root.render(
  <React.StrictMode> {/* StrictMode helps catch potential problems in your app */}
    <App /> {/* The main application component */}
  </React.StrictMode>
);
