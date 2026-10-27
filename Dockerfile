FROM node:22-alpine AS build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY build.cjs bridge.cjs inject-danmu*.js ./
RUN npm run build
FROM build AS bridge
USER node
CMD ["node", "bridge.cjs"]
FROM nginx:1.28-alpine AS web
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /build/dist /usr/share/nginx/html/danmu
