FROM node:20-alpine

# Install build dependencies for sqlite3 compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy project source code
COPY . .

# Expose port 8080 (standard Fly.io port)
EXPOSE 8080

# Start server
CMD ["node", "server.js"]
