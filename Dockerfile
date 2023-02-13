FROM node:14.21.0-alpine as builder
RUN mkdir -p /opt/build
WORKDIR /opt/build
COPY . ./
RUN yarn install && yarn build

FROM node:14.21.0-alpine
RUN mkdir -p /opt/data
COPY --from=builder /opt/build/dist /opt/relayer/dist
WORKDIR /opt/relayer
COPY .env.docker .env
COPY package.json package.json
RUN yarn install --production 
CMD [ "node", "dist/main" ]
