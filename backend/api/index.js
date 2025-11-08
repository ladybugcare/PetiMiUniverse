// Vercel serverless function wrapper for Express app
// This file is used by Vercel to handle all routes
// Note: The build must be run first (npm run build) to generate dist/app.js

// Import the compiled Express app
const app = require('../dist/app.js').default;

// Export as Vercel serverless function
module.exports = app;

