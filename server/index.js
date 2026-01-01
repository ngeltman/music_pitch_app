import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import * as auth from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Log buffer for remote debugging
const logBuffer = [];
const addToLogs = (msg) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logBuffer.push(entry);
    if (logBuffer.length > 100) logBuffer.shift();
    console.log(msg); // Keep local console too
};
const addErrorToLogs = (msg) => {
    const entry = `[${new Date().toLocaleTimeString()}] ERROR: ${msg}`;
    logBuffer.push(entry);
    if (logBuffer.length > 100) logBuffer.shift();
    console.error(msg);
};

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

app.get('/api/logs', (req, res) => {
    res.json({ logs: logBuffer });
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
    addToLogs(`info request for URL: ${url}`);

    try {
        const videoId = extractVideoId(url);
        addToLogs(`Extracted Video ID: "${videoId}"`);

        if (!videoId || videoId.length !== 11) {
            addErrorToLogs(`Invalid/Incomplete Video ID: "${videoId}"`);
            return res.status(400).json({ error: 'Invalid YouTube URL', details: `Could not extract a valid 11-char ID. Got: ${videoId}` });
        }

        let responseMetadata = null;

        // Try youtubei.js first (Authenticated)
        try {
            addToLogs('Attempting metadata fetch via youtubei.js (getBasicInfo)...');
            const youtube = await getYouTube();

            // Log session status for visibility
            addToLogs(`Session Logged In: ${youtube.session.logged_in}`);

            // getBasicInfo is lighter and less likely to hit 400 than getInfo (which calls /next)
            const info = await youtube.getBasicInfo(videoId);
            const basic = info.basic_info;

            responseMetadata = {
                source: 'youtubei.js (basic)',
                title: basic.title || 'Unknown Title',
                thumbnail: basic.thumbnail?.[0]?.url || basic.thumbnail?.url || '',
                duration: basic.duration || 0,
                author: {
                    name: typeof basic.author === 'string' ? basic.author : (basic.author?.name || basic.author || 'Unknown Author')
                }
            };
            addToLogs('youtubei.js basic metadata fetch successful');
        } catch (ytError) {
            addErrorToLogs(`youtubei.js getBasicInfo failed: ${ytError.message}. Trying YouTube Search (bypass)...`);

            try {
                const youtube = await getYouTube();
                // Search is much less likely to be blocked than /player
                const searchResults = await youtube.search(videoId, { type: 'video' });
                const video = searchResults.results?.[0];

                if (video && video.id === videoId) {
                    responseMetadata = {
                        source: 'youtubei.js (search)',
                        title: video.title?.toString() || 'Unknown Title',
                        thumbnail: video.thumbnails?.[0]?.url || '',
                        duration: video.duration?.seconds || 0,
                        author: {
                            name: video.author?.name || 'Unknown Author'
                        }
                    };
                    addToLogs('YouTube Search metadata fetch successful');
                } else {
                    throw new Error('Video not found in search results');
                }
            } catch (searchError) {
                addErrorToLogs(`Search fallback failed: ${searchError.message}. Trying yt-dlp fallback...`);

                try {
                    const isWindows = process.platform === 'win32';
                    const ytdlpPath = process.env.YTDLP_PATH || (isWindows ? path.join(__dirname, 'yt-dlp.exe') : 'yt-dlp');
                    const { execSync } = await import('child_process');

                    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                    // Added --js-runtime node to help with signature extraction
                    const cmd = `"${ytdlpPath}" --dump-json --no-playlist --skip-download --force-ipv4 --no-check-certificates --user-agent "${userAgent}" --js-runtime node "${url}"`;
                    addToLogs(`Running yt-dlp fallback...`);

                    const stdout = execSync(cmd).toString();
                    const json = JSON.parse(stdout);

                    responseMetadata = {
                        source: 'yt-dlp',
                        title: json.title || 'Unknown Title',
                        thumbnail: json.thumbnail || '',
                        duration: json.duration || 0,
                        author: {
                            name: json.uploader || json.channel || 'Unknown Author'
                        }
                    };
                    addToLogs('yt-dlp metadata fetch successful');
                } catch (dlpError) {
                    addErrorToLogs(`yt-dlp fallback also failed. Trying oEmbed (Last Resort)...`);

                    try {
                        // oEmbed is public and almost never blocked
                        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
                        const res = await fetch(oembedUrl);
                        const data = await res.json();

                        responseMetadata = {
                            source: 'oEmbed (Safe Fallback)',
                            title: data.title || 'Unknown Title',
                            thumbnail: data.thumbnail_url || '',
                            duration: 0, // oEmbed doesn't provide duration
                            author: {
                                name: data.author_name || 'YouTube User'
                            }
                        };
                        addToLogs('oEmbed metadata fetch successful');
                    } catch (oError) {
                        addErrorToLogs(`oEmbed also failed: ${oError.message}`);
                        throw new Error(`All metadata methods failed. Player: ${ytError.message}, Search: ${searchError.message}, yt-dlp: ${dlpError.message}`);
                    }
                }
            }
        }

        res.json(responseMetadata);
    } catch (error) {
        addErrorToLogs(`Final metadata error: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch video info', details: error.message });
    }
});

// Stream Audio using local yt-dlp.exe or system yt-dlp
app.get('/api/stream', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    addToLogs(`Streaming request for URL: ${url}`);

    try {
        const videoId = extractVideoId(url);
        addToLogs(`Attempting direct stream via youtubei.js for: ${videoId}`);
        const youtube = await getYouTube();

        // Use download() to get a web stream
        const webStream = await youtube.download(videoId, {
            type: 'audio',
            quality: 'best',
            format: 'mp4'
        });

        addToLogs(`Direct stream obtained. Bridging WebStream to NodeStream...`);
        res.setHeader('Content-Type', 'audio/mpeg');

        // Convert Web ReadableStream to Node Readable
        const nodeStream = Readable.fromWeb(webStream);

        nodeStream.on('error', (err) => {
            addErrorToLogs(`youtubei.js stream error: ${err.message}`);
        });

        nodeStream.pipe(res);

        req.on('close', () => {
            addToLogs('Client disconnected, stopping stream.');
            // Some streams might need explicit destroy/cancel but pipe usually handles it
        });

    } catch (ytError) {
        addErrorToLogs(`Direct streaming failed: ${ytError.message}. Falling back to yt-dlp...`);

        // FALLBACK TO YT-DLP
        const isWindows = process.platform === 'win32';
        const localExe = path.join(__dirname, 'yt-dlp.exe');
        const ytdlpPath = process.env.YTDLP_PATH || (isWindows ? localExe : 'yt-dlp');

        addToLogs(`Streaming using yt-dlp fallback: ${ytdlpPath}`);

        const ytdlp = spawn(ytdlpPath, [
            '-f', 'bestaudio',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--no-playlist',
            '--force-overwrites',
            '--force-ipv4',
            '--no-check-certificates',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--js-runtime', 'node',
            '-o', '-',
            url
        ]);

        let headersSent = false;

        ytdlp.stdout.once('data', (data) => {
            if (!headersSent) {
                addToLogs(`Starting to stream audio (yt-dlp): ${data.length} bytes received`);
                res.setHeader('Content-Type', 'audio/mpeg');
                headersSent = true;
            }
        });

        ytdlp.stdout.pipe(res);

        const stderrChunks = [];
        ytdlp.stderr.on('data', (data) => {
            const msg = data.toString();
            stderrChunks.push(msg);
            addErrorToLogs(`yt-dlp stderr: ${msg.trim()}`);

            if (msg.includes('ERROR') && !headersSent) {
                headersSent = true;
                res.status(500).json({
                    error: 'yt-dlp reported an error',
                    details: msg.trim()
                });
            }
        });

        ytdlp.on('close', (code) => {
            addToLogs(`yt-dlp process exited with code ${code}`);
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
    }
});

function extractVideoId(url) {
    if (!url) return '';
    const trimmed = url.trim();
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = trimmed.match(regex);
    if (match && match[1]) return match[1];

    // Last ditch: if it's 11 chars, assume it's the ID
    if (trimmed.length === 11 && !trimmed.includes('/') && !trimmed.includes('.')) return trimmed;

    return trimmed;
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (bound to 0.0.0.0)`);
});
