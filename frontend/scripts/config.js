// Environment-aware API configuration
// Automatically detects production vs. development environment

let API_BASE_URL;

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  // Local development environment
  API_BASE_URL = 'http://localhost:5000';
} else {
  // Production environment - use the deployed Render backend URL
  // Set to the actual Render backend URL for NexPrep
  API_BASE_URL = 'https://nexprep-backend.onrender.com';
}

