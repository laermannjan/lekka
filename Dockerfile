FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./

VOLUME /app/data
ENV DATABASE_URL=/app/data/lekka.db
ENV PORT=3000
EXPOSE 3000

CMD ["node", "build"]
