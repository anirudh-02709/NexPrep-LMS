// Environment-aware API configuration
// Automatically detects production vs. development environment

let API_BASE_URL;

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  // Local development environment
  API_BASE_URL = 'http://localhost:5000';
} else {
  // Production environment - use the deployed Render backend URL
  // Update this with your actual Render backend URL
  API_BASE_URL = 'https://jee-lms-backend.onrender.com';
}

