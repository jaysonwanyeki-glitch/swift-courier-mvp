/* ==========================================================================
   Swift Courier Service — deployment config
   --------------------------------------------------------------------------
   Public pages always call /api on this origin. In production Vercel rewrites
   /api/* to the Railway API using RAILWAY_API_DOMAIN. Locally serve-dev.js
   proxies /api to localhost:4000. This preserves one API origin across deploys.
   ========================================================================== */
window.SWIFT_API = '';
