# Atelier Studio — SPA estática (build + nginx)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN BASE_PUBLICA=/ npm run build

FROM nginx:1.27-alpine
# Plantilla procesada por los scripts de arranque de la imagen oficial
# (envsubst sobre /etc/nginx/templates/*.template -> conf.d/*.conf), para poder
# inyectar CATALEG_API_KEY sin hornearla en la imagen.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
