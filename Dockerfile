FROM node:18-alpine as builder
COPY . /app
WORKDIR /app
RUN yarn install && yarn build

FROM node:18-alpine
COPY --from=builder /app/dist /app
COPY .env.docker /app/.env
COPY package.json /app/package.json
WORKDIR /app
RUN yarn install --production
CMD [ "node", "src/main.js" ]
