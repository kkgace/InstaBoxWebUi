# InstaBox WebUI 控制台 — 生产镜像
# 构建: docker build -t instabox-ui .
# 运行: docker run -p 3000:3000 instabox-ui
# 可选注入服务端 API Key（客户端不带 Key 时使用）:
#   docker run -p 3000:3000 -e INSTABOX_API_KEY=ibk_xxx instabox-ui
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY package.json ./
RUN npm install ws@8 --omit=dev --no-audit --no-fund
EXPOSE 3000
CMD ["node", "server/index.mjs"]
