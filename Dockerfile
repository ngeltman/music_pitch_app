FROM node:20-slim

# Install python3, ffmpeg, and curl
RUN apt-get update && \
    apt-get install -y python3 ffmpeg curl && \
    apt-get clean

# Pre-download yt-dlp to a known location
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Build the frontend (even if using Vercel, it helps to have it for testing/fallback)
RUN npm run build

# Start the server
ENV PORT=3001
EXPOSE 3001

# Ensure yt-dlp is in the path for yt-dlp-exec
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

CMD ["npm", "run", "server"]
