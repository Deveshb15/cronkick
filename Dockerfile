# Same image runs on DigitalOcean now and AWS (ECS/Fargate) later.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY migrations ./migrations
COPY src ./src
COPY scripts ./scripts
USER node
EXPOSE 3000
# tsx directly (not npm) so SIGTERM reaches the app and in-flight dispatches drain.
CMD ["node_modules/.bin/tsx", "src/main.ts"]
