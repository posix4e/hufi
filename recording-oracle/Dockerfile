# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Install dependencies
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable && yarn install --frozen-lockfile

# Copy source and build
COPY . .
RUN yarn build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy dependency files
COPY package.json yarn.lock .yarnrc.yml ./

# Install build dependencies, production deps, then cleanup in single layer
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    corepack enable && \
    yarn workspaces focus --production && \
    apk del .build-deps && \
    rm -rf /var/cache/apk/* ~/.cache

# Copy built application
COPY --from=builder /app/dist ./dist

# Set environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=12000

EXPOSE 12000

CMD ["node", "dist/src/main"]
