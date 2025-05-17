ARG FROM_BRANCH=latest
FROM node:18

WORKDIR /home/jenkins/app

COPY package.json ./

RUN npm install

COPY . .

EXPOSE 3000

HEALTHCHECK CMD true