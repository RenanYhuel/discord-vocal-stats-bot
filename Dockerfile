FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml tsconfig.json eslint.config.js commitlint.config.js ./
RUN pnpm install --frozen-lockfile
COPY src ./src
RUN pnpm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm
RUN apk add --no-cache python3 make g++ sqlite
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod
COPY --from=builder /app/dist ./dist
COPY index.js ./

VOLUME ["/app/data"]
ENV DATABASE_PATH=/app/data/database.sqlite

CMD ["node", "dist/index.js"]
