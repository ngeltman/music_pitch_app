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

// Startup Check
const checkEnvironment = async () => {
    const { execSync } = await import('child_process');
    try {
        const ffmpegVersion = execSync('ffmpeg -version').toString().split('\n')[0];
        console.log(`[BACKEND] ffmpeg found: ${ffmpegVersion}`);
    } catch (e) {
        console.error('[BACKEND] ffmpeg NOT FOUND in PATH. Streaming will likely fail.');
    }

    const ytdlpPath = process.env.YTDLP_PATH || (process.platform === 'win32' ? path.join(__dirname, 'yt-dlp.exe') : 'yt-dlp');
    try {
        const ytdlpVersion = execSync(`${ytdlpPath} --version`).toString().trim();
        console.log(`[BACKEND] yt-dlp found: ${ytdlpVersion} at ${ytdlpPath}`);
    } catch (e) {
        console.error(`[BACKEND] yt-dlp NOT FOUND at ${ytdlpPath}`);
    }
};
checkEnvironment();

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Music Pitch Backend is alive' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
});

// Debug endpoint
app.get('/api/debug', async (req, res) => {
    const { execSync } = await import('child_process');
    const debugInfo = {
        platform: process.platform,
        node: process.version,
        env: process.env.NODE_ENV,
        ytdlp_path: process.env.YTDLP_PATH || 'default',
        ffmpeg: 'not found',
        ytdlp: 'not found'
    };
    try { debugInfo.ffmpeg = execSync('ffmpeg -version').toString().split('\n')[0]; } catch (e) { }
    try {
        const path_to_use = process.env.YTDLP_PATH || (process.platform === 'win32' ? path.join(__dirname, 'yt-dlp.exe') : 'yt-dlp');
        debugInfo.ytdlp = execSync(`${path_to_use} --version`).toString().trim();
    } catch (e) { }
    res.json(debugInfo);
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

    console.log(`[BACKEND] Streaming using: ${ytdlpPath} - URL: ${url}`);

    const ytdlp = spawn(ytdlpPath, [
        '-f', 'bestaudio',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--no-playlist',
        '--force-overwrites',
        '-o', '-',
        url
    ]);

    let headersSent = false;

    ytdlp.stdout.once('data', (data) => {
        if (!headersSent) {
            console.log(`[BACKEND] Starting to stream audio: ${data.length} bytes received`);
            res.setHeader('Content-Type', 'audio/mpeg');
            headersSent = true;
        }
    });

    ytdlp.stdout.pipe(res);

    ytdlp.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('ERROR')) {
            console.error(`[BACKEND] yt-dlp ERROR: ${msg}`);
            if (!headersSent) {
                headersSent = true;
                res.status(500).json({ error: 'yt-dlp failed to start', details: msg });
            }
        }
    });

    ytdlp.on('close', (code) => {
        console.log(`[BACKEND] yt-dlp process exited with code ${code}`);
        if (code !== 0 && !headersSent) {
            res.status(500).json({ error: `yt-dlp process exited with code ${code}` });
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
