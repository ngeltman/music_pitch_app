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

## Authentication

To access restricted YouTube content, click "Sign in with Google" in the app header and follow the instructions to authorize the device.
