FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY server.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
