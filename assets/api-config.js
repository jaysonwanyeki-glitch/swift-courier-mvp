/* ==========================================================================
   Swift Courier Service — deployment config
   --------------------------------------------------------------------------
   The site calls the API same-origin by default (/api). The API now lives on
   Railway (Express + SQLite on a persistent volume), so set that origin here,
   once. After you deploy the backend and connect the Vercel domain, it looks
   like:

     window.SWIFT_API = 'https://<railway-service>-production.up.railway.app/api';

   Leave it as an empty string for same-origin (local preview with serve-dev.js).
   This file is loaded before assets/site.js on every page.
   ========================================================================== */
window.SWIFT_API = '';
