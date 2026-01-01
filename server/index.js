import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import * as auth from './auth.js';

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

// Helper to get YouTube instance (consolidated)
const getYouTube = async () => {
    return await auth.getYoutube();
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

// Auth Endpoints
app.get('/api/auth/status', async (req, res) => {
    const status = await auth.getSessionStatus();
    res.json(status);
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const authInfo = await auth.startAuthFlow();
        res.json(authInfo);
    } catch (error) {
        res.status(500).json({ error: 'Failed to start auth flow' });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    const result = await auth.signOut();
    res.json(result);
});

// Get Video Info
app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log(`[BACKEND] info request for URL: ${url}`);

    try {
        console.log('[BACKEND] Getting YouTube instance...');
        const youtube = await getYouTube();
        console.log('[BACKEND] Instance obtained. Extracting ID...');
        const videoId = extractVideoId(url);
        console.log(`[BACKEND] Extracted Video ID: "${videoId}"`);

        if (!videoId || videoId.length !== 11) {
            console.error('[BACKEND] Invalid/Incomplete Video ID:', videoId);
            return res.status(400).json({ error: 'Invalid YouTube URL', details: `Could not extract a valid 11-character video ID. Extracted: ${videoId}` });
        }

        console.log(`[BACKEND] Fetching info for ID: ${videoId}`);
        // Use getInfo instead of getBasicInfo for more robust metadata
        const info = await youtube.getInfo(videoId).catch(err => {
            console.error('[BACKEND] getInfo failed!');
            console.error('[BACKEND] Error Name:', err.name);
            console.error('[BACKEND] Error Message:', err.message);
            if (err.info) console.error('[BACKEND] Innertube Info:', JSON.stringify(err.info));
            throw err;
        });
        console.log('[BACKEND] Info fetched successfully');

        // Map response (getInfo structure is slightly different)
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
        '--force-ipv4',
        '--no-check-certificates',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

    const stderrChunks = [];
    ytdlp.stderr.on('data', (data) => {
        const msg = data.toString();
        stderrChunks.push(msg);
        console.error(`[BACKEND] yt-dlp stderr: ${msg}`);

        if (msg.includes('ERROR') && !headersSent) {
            headersSent = true;
            res.status(500).json({
                error: 'yt-dlp reported an error',
                details: msg.trim()
            });
        }
    });

    ytdlp.on('close', (code) => {
        console.log(`[BACKEND] yt-dlp process exited with code ${code}`);
        if (code !== 0 && !headersSent) {
            const finalError = stderrChunks.join('').trim() || `Exit code ${code}`;
            res.status(500).json({
                error: 'yt-dlp failed',
                details: finalError
            });
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
