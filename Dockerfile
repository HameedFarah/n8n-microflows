# N8N Microflows Docker Configuration

FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S n8n && \
    adduser -S n8n -u 1001 -G n8n

# Set ownership
RUN chown -R n8n:n8n /app
USER n8n

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default command
CMD ["npm", "start"]

# =============================================================================
# Development stage
FROM base AS development

USER root
RUN npm install
USER n8n

CMD ["npm", "run", "dev"]

# =============================================================================
# Production stage  
FROM base AS production

# Add production-specific optimizations
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn

# Run validation and setup
RUN npm run validate-all

CMD ["npm", "start"]
