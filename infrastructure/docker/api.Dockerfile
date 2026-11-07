# syntax=docker/dockerfile:1.7
# RecoverOS API / worker image (same image, different command).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @recoveros/api --workspace @recoveros/shared --include-workspace-root --ignore-scripts

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @recoveros/shared && npm run build -w @recoveros/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S recoveros && adduser -S recoveros -G recoveros
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @recoveros/api --workspace @recoveros/shared --include-workspace-root --ignore-scripts && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
USER recoveros
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/health/live || exit 1
CMD ["node", "dist/server.js"]
