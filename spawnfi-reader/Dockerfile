FROM node:20-alpine
ARG WIREPROXY_VERSION=v1.0.9
RUN apk add --no-cache curl tar \
 && curl -fsSL -o /tmp/wp.tgz "https://github.com/whyvl/wireproxy/releases/download/${WIREPROXY_VERSION}/wireproxy_linux_amd64.tar.gz" \
 && tar -xzf /tmp/wp.tgz -C /usr/local/bin wireproxy && chmod +x /usr/local/bin/wireproxy && rm /tmp/wp.tgz
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.js start.sh ./
CMD ["sh", "./start.sh"]
