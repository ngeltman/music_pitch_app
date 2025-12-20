import express from 'express';
import cors from 'cors';
import { getYoutube, startAuthFlow, getSessionStatus } from './auth.js';
import ytDlp from 'yt-dlp-exec';


const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

// Initialize YouTube on startup
getYoutube().then(() => {
    console.log('YouTube client initialized');
});

app.get('/api/auth/login', async (req, res) => {
    try {
        const authData = await startAuthFlow();
        res.json(authData);
    } catch (error) {
        console.error('Error starting auth flow:', error);
        res.status(500).send('Error starting authentication');
    }
});

app.get('/api/auth/status', async (req, res) => {
    const status = await getSessionStatus();
    res.json(status);
});

app.get('/api/auth/logout', async (req, res) => {
    try {
        await signOut();
        res.json({ success: true });
    } catch (error) {
        console.error('Error signing out:', error);
        res.status(500).send('Error signing out');
    }
});

app.get('/api/youtube', async (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).send('URL is required');
    }

    try {
        const urlObj = new URL(videoUrl);
        if (urlObj.searchParams.has('v')) {
            videoUrl = `https://www.youtube.com/watch?v=${urlObj.searchParams.get('v')}`;
        }
    } catch (e) {
        console.log('Error cleaning URL:', e);
    }

    console.log(`Processing URL: ${videoUrl}`);

    try {
        res.header('Content-Disposition', `attachment; filename="youtube_audio.webm"`);
        res.header('Content-Type', 'audio/webm');

        const subprocess = ytDlp.exec(videoUrl, {
            output: '-',
            format: 'bestaudio[ext=webm]/bestaudio',
            noWarnings: true,
            noCallHome: true
        });

        subprocess.stdout.pipe(res);

        subprocess.stderr.on('data', (data) => {
            console.log(`yt-dlp log: ${data}`);
        });

    } catch (error) {
        console.error('Error processing YouTube URL:', error);
        if (!res.headersSent) {
            res.status(500).send('Internal Server Error: ' + error.message);
        }
    }
});

app.get('/api/info', async (req, res) => {
    let videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).send('URL is required');
    }

    try {
        const urlObj = new URL(videoUrl);
        if (urlObj.searchParams.has('v')) {
            videoUrl = `https://www.youtube.com/watch?v=${urlObj.searchParams.get('v')}`;
        }
    } catch (e) {
        console.log('Error cleaning URL:', e);
    }

    console.log(`Info Request URL: ${videoUrl}`);

    try {
        const info = await ytDlp(videoUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true
        });

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
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
