# Music Pitch App

A React application to play music and modify its pitch, with YouTube integration.

## Features

- Play local audio files
- Stream YouTube audio (including age-restricted content via Google Sign-In)
- Change playback speed and pitch independently
- Loop sections

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Start the development server (Backend + Frontend):
    ```bash
    npm run dev:full
    ```

    Or run them separately:
    - Backend: `npm run server` (port 3001)
    - Frontend: `npm run dev` (port 5173)

## Deployment

### Backend (Render)
1.  Connect your repo to Render and choose **Docker** as the environment.
2.  Set the following environment variables:
    - `PORT`: `3001`
    - `NODE_ENV`: `production`

### Frontend (Vercel)
1.  Connect your repo to Vercel.
2.  Set the environment variable:
    - `VITE_API_URL`: `https://your-backend-name.onrender.com` (Replace with your Render URL).
3.  Redeploy.

## Authentication
... (existing content)
