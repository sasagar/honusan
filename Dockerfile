# ベースイメージを指定
FROM node:latest

# ディレクトリを移動する
WORKDIR /app

# node.js の環境変数を定義する
# 本番環境では production
ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:$PATH

# ffmpegのインストール
RUN apt update && apt -y install ffmpeg

# package.jsonだけコピーしてインストール
COPY package*.json /app/
RUN npm install