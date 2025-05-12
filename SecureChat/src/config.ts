// src/config.ts
export const API_URL = 'https://localhost:8443';

// Utility for axios requests that bypasses SSL verification in development
export const axiosConfig = {
  httpsAgent: {
    rejectUnauthorized: false
  }
};