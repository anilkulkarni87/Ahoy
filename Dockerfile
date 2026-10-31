FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S ahoy && adduser -S ahoy -G ahoy && mkdir /app/data && chown ahoy:ahoy /app/data
COPY --from=build --chown=ahoy:ahoy /app/.next/standalone ./
COPY --from=build --chown=ahoy:ahoy /app/.next/static ./.next/static
COPY --from=build --chown=ahoy:ahoy /app/public ./public
USER ahoy
EXPOSE 3000
CMD ["node","server.js"]
