# Base image for building
FROM node:18-slim AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
RUN npm install

# Copy frontend source
COPY . .

# Build frontend
RUN npm run build

# Final image
FROM node:18-slim

WORKDIR /app

# Copy built assets
COPY --from=builder /app/dist ./dist

# Copy backend files and dependencies
COPY package*.json ./
COPY functions/package*.json ./functions/
RUN npm install --production
RUN cd functions && npm install --production

# Copy all source files (needed for agents logic)
COPY . .

# Environment variables
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Start server
CMD ["node", "server.js"]
