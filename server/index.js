import express from 'express';
import cors from 'cors';
import { Innertube } from 'youtubei.js';
import { spawn } from 'child_process';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

let yt;
const initYouTube = async () => {
    if (!yt) {
        yt = await Innertube.create();
    }
    return yt;
};

// Health check
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
        const info = await youtube.getBasicInfo(videoId);

        res.json({
            title: info.basic_info.title,
            thumbnail: info.basic_info.thumbnail[0].url,
            duration: info.basic_info.duration,
            author: info.basic_info.author
        });
    } catch (error) {
        console.error('Error fetching info:', error);
        res.status(500).json({ error: 'Failed to fetch video info' });
    }
});

// Stream Audio
app.get('/api/stream', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';

    // Use yt-dlp to stream audio as mp3
    const ytdlp = spawn(ytdlpPath, [
        '-f', 'bestaudio',
        '--extract-audio',
        '--audio-format', 'mp3',
        '-o', '-',
        url
    ]);

    res.setHeader('Content-Type', 'audio/mpeg');

    ytdlp.stdout.pipe(res);

    ytdlp.stderr.on('data', (data) => {
        // We don't want to log noise but helpful for debugging if it fails
        // console.log(`yt-dlp stderr: ${data}`);
    });

    ytdlp.on('close', (code) => {
        if (code !== 0) {
            console.error(`yt-dlp process exited with code ${code}`);
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
