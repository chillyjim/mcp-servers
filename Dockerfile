ARG FROM_BRANCH=latest
FROM node:22

WORKDIR /home/jenkins/app

COPY package.json ./

RUN npm install

COPY . .

EXPOSE 3000

HEALTHCHECK CMD true