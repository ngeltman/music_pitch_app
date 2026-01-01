import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use((req, res, next) => {
    console.log(`[BACKEND] Request from Origin: ${req.get('Origin') || 'N/A'} - Path: ${req.path}`);
    next();
});
app.use(express.json());

let yt;
const initYouTube = async () => {
    if (!yt) {
        yt = await Innertube.create();
    }
    return yt;
};

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Music Pitch Backend is alive' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
});

// Get Video Info
app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const youtube = await initYouTube();
        const videoId = extractVideoId(url);
        console.log(`[BACKEND] Fetching info for ID: ${videoId}`);
        const info = await youtube.getBasicInfo(videoId);

        // Defensive mapping
        const basic = info.basic_info;
        const response = {
            title: basic.title || 'Unknown Title',
            thumbnail: basic.thumbnail?.[0]?.url || basic.thumbnail?.url || '',
            duration: basic.duration || 0,
            author: {
                name: typeof basic.author === 'string' ? basic.author : (basic.author?.name || basic.author || 'Unknown Author')
            }
        };

        console.log('[BACKEND] Sending mapped response:', response.title);
        res.json(response);
    } catch (error) {
        console.error('[BACKEND] Error fetching info:', error.message);
        if (error.stack) console.error(error.stack);
        res.status(500).json({ error: 'Failed to fetch video info', details: error.message });
    }
});

// Stream Audio using local yt-dlp.exe or system yt-dlp
app.get('/api/stream', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Use local exe if on Windows development, or environment path
    const isWindows = process.platform === 'win32';
    const localExe = path.join(__dirname, 'yt-dlp.exe');
    const ytdlpPath = process.env.YTDLP_PATH || (isWindows ? localExe : 'yt-dlp');

    console.log(`[BACKEND] Streaming using: ${ytdlpPath}`);

    const ytdlp = spawn(ytdlpPath, [
        '-f', 'bestaudio',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--no-playlist',
        '-o', '-',
        url
    ]);

    res.setHeader('Content-Type', 'audio/mpeg');
    ytdlp.stdout.pipe(res);

    ytdlp.stdout.on('data', (data) => {
        // Just log that we received data to verify it's working
        // console.log(`[BACKEND] Received ${data.length} bytes from yt-dlp`);
    });

    ytdlp.stderr.on('data', (data) => {
        console.error(`[BACKEND] yt-dlp stderr: ${data.toString()}`);
    });

    ytdlp.on('close', (code) => {
        console.log(`[BACKEND] yt-dlp process exited with code ${code}`);
        if (code !== 0) {
            console.error(`[BACKEND] yt-dlp error code ${code}`);
        }
    });

    req.on('close', () => {
        ytdlp.kill();
    });
});

function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : url;
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (bound to 0.0.0.0)`);
});
