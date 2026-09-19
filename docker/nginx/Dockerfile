FROM nginx:1.25-alpine

# Remove default configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy production configuration
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf

# Expose HTTP and HTTPS ports
EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
