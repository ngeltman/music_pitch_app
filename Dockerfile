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

# Use npm install instead of ci for more flexibility with the lockfile
# --legacy-peer-deps handles React 19 vs dependencies like Tone or youtubei.js
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copy the rest of the app
COPY . .

# Build the frontend
RUN npm run build

# Start the server
ENV PORT=3001
EXPOSE 3001

# Ensure yt-dlp is in the path for yt-dlp-exec
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

CMD ["npm", "run", "server"]
