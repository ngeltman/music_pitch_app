FROM node:20

# Install python3, ffmpeg, and build tools
# python-is-python3 ensures 'python' points to 'python3' for node-gyp
RUN apt-get update && \
    apt-get install -y python3 ffmpeg python-is-python3 build-essential curl && \
    apt-get clean

# Pre-download yt-dlp to a known location
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy package files
COPY package*.json ./

# Clean installation
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copy the rest of the app
COPY . .

# Build the frontend (Vite generates /dist)
RUN npm run build

# Environment settings
ENV PORT=3001
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV NODE_ENV=production

EXPOSE 3001

CMD ["npm", "run", "server"]
