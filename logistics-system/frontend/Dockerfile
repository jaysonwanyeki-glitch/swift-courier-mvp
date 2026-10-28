FROM nginx:alpine

# Remove the default nginx landing page.
RUN rm -rf /usr/share/nginx/html/* /usr/share/nginx/ops

# Ops console → /ops  (internal bundle, single page + its own styles)
COPY public/ /usr/share/nginx/ops/

# Customer site → /  (multi-page, no build step).
# The site lives at the repo root, so the build context is the repo root and
# only the site files plus assets/ are copied in.
COPY index.html services.html book.html track.html coverage.html pricing.html custody.html faq.html /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/

# Minimal nginx config: multi-page routing + /api proxy + CORS.
COPY logistics-system/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]