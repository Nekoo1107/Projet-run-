import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server on 5173. The frontend talks to the backend directly at
// VITE_API_BASE (default http://localhost:3001), with CORS enabled server-side.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
