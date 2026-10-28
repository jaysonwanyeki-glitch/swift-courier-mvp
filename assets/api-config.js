/* ==========================================================================
   Swift Courier Service — deployment config
   --------------------------------------------------------------------------
   The site calls the API same-origin by default (/api). When the API lives on
   another host — e.g. the Express container behind Docker, or a Vercel deploy
   with the backend elsewhere — set that origin here, once:

     window.SWIFT_API = 'https://api.swiftcourier.co.ke/api';

   Leave it as an empty string for same-origin (local preview, docker compose,
   nginx proxy). This file is loaded before assets/site.js on every page.
   ========================================================================== */
window.SWIFT_API = '';
