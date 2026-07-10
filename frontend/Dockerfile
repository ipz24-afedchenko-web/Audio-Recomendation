# Multi-stage build for React frontend

# Stage 1: Build
# Node 20+ required: Tailwind v4 (@tailwindcss/oxide) needs Node >= 20
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files (package.json only — resolve deps fresh in-container so the
# correct Linux native bindings for @tailwindcss/oxide are installed)
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build application
RUN npm run build

# Stage 2: Production
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
