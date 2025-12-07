import express from 'express';
import cors from 'cors';
import ytDlp from 'yt-dlp-exec';
import fs from 'fs';
import path from 'path';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

app.get('/api/youtube', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).send('URL is required');
    }

    try {
        console.log(`Processing URL: ${videoUrl}`);

        // SKIP metadata fetch to speed up start time
        // const info = await ytDlp(videoUrl, { ... });
        const title = 'youtube_audio';

        // Use WebM (Opus) which is much better for streaming than MP4/M4A
        res.header('Content-Disposition', `attachment; filename="${title}.webm"`);
        res.header('Content-Type', 'audio/webm');

        const cookiesPath = path.join(process.cwd(), 'cookies.txt');
        const execOptions = {
            output: '-',
            format: 'bestaudio[ext=webm]',
            noWarnings: true,
            noCallHome: true,
        };

        if (fs.existsSync(cookiesPath)) {
            console.log('Using cookies.txt for authentication');
            execOptions.cookies = cookiesPath;
        }

        const subprocess = ytDlp.exec(videoUrl, execOptions);

        subprocess.stdout.pipe(res);

        subprocess.stderr.on('data', (data) => {
            // console.log('yt-dlp stderr:', data.toString());
        });

        subprocess.on('close', (code) => {
            if (code !== 0) {
                console.error(`yt-dlp process exited with code ${code}`);
                if (!res.headersSent) {
                    res.status(500).send('Error downloading audio');
                }
            } else {
                console.log('Download finished successfully');
            }
        });

    } catch (error) {
        console.error('Error processing YouTube URL:', error);
        if (!res.headersSent) {
            res.status(500).send('Internal Server Error: ' + error.message);
        }
    }
});

app.get('/api/info', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).send('URL is required');
    }

    try {
        const cookiesPath = path.join(process.cwd(), 'cookies.txt');
        const execOptions = {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
        };

        if (fs.existsSync(cookiesPath)) {
            execOptions.cookies = cookiesPath;
        }

        const info = await ytDlp(videoUrl, execOptions);

        // Find best thumbnail
        let thumbnail = info.thumbnail;

        // 1. Try to find high-res in thumbnails array
        if (info.thumbnails && Array.isArray(info.thumbnails)) {
            // Sort by resolution (height) descending
            const sorted = info.thumbnails.sort((a, b) => (b.height || 0) - (a.height || 0));
            if (sorted.length > 0) {
                thumbnail = sorted[0].url;
            }
        }

        // 2. Fallback: Extract Video ID and use standard YouTube thumbnail URL
        // googleusercontent links sometimes expire or 403, so we prefer the direct ID link
        if (info.id) {
            // Force usage of hqdefault which is very reliable
            thumbnail = `https://img.youtube.com/vi/${info.id}/hqdefault.jpg`;
        }

        console.log(`[Backend] Video ID: ${info.id}`);
        console.log(`[Backend] Final Thumbnail URL: ${thumbnail}`);

        res.json({
            title: info.title,
            thumbnail: thumbnail,
            duration: info.duration,
            uploader: info.uploader
        });
    } catch (error) {
        console.error('Error fetching video info:', error);
        res.status(500).send('Error fetching video info');
    }
});

app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});
