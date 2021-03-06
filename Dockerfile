FROM node:8.2.1
RUN apt-get update && apt-get install -y git
RUN npm install -g webpack babel-cli truffle-contract
ADD package.json /tmp/package.json
RUN cd /tmp && npm install && npm install truffle-contract

RUN mkdir -p /app && cp -a /tmp/node_modules /app/

COPY . /app/
RUN cd /app && npm run build

WORKDIR /app
