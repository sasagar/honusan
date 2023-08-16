# ベースイメージを指定
FROM node:slim

# ディレクトリを移動する
WORKDIR /app

# ffmpegのインストール
RUN apt update && apt -y install ffmpeg libjemalloc2

# node.js の環境変数を定義する
# 本番環境では production
ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:$PATH
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# package.jsonだけコピーしてインストール
COPY package*.json /app/
RUN npm install