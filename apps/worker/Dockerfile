FROM node:20-bookworm-slim AS base

WORKDIR /app

RUN corepack enable

COPY package.json turbo.json tsconfig.base.json .yarnrc.yml ./
COPY apps ./apps
COPY packages ./packages

RUN yarn install

CMD ["yarn", "workspace", "@adluv/worker", "dev"]
