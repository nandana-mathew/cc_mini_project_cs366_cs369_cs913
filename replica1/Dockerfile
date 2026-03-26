FROM node:20-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json .
RUN npm install
RUN npm install -g nodemon
COPY . .
CMD ["nodemon", "--watch", "/app/src", "--ext", "js", "/app/src/index.js"]
