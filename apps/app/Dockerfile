FROM node:20-bookworm-slim AS base

WORKDIR /app

RUN corepack enable

COPY package.json turbo.json tsconfig.base.json .yarnrc.yml ./
COPY apps ./apps
COPY packages ./packages

RUN yarn install

RUN yarn workspace @adluv/app build

EXPOSE 3000

CMD ["yarn", "workspace", "@adluv/app", "start"]
