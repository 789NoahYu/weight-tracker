# Use Node.js official image
FROM node:20-alpine

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy the rest of the application
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Expose the port
EXPOSE 3100

# Start the server
CMD ["npm", "start"]
