import { UniversalCache, Innertube, OAuth } from 'youtubei.js';
import fs from 'fs';
import path from 'path';

let youtube = null;
const CREDENTIALS_FILE = './yt-credentials.json';

let logCallback = (msg) => console.log(msg);
export const setLogCallback = (cb) => { logCallback = cb; };

const addToLogs = (msg) => {
    logCallback(`[AUTH] ${msg}`);
};

export const initYoutube = async () => {
    addToLogs('initYoutube called');
    if (youtube) return youtube;

    try {
        addToLogs('Creating Innertube instance...');
        youtube = await Innertube.create({
            cache: new UniversalCache(false),
            generate_session_locally: true,
            client_type: 'WEB_REMIX'
        });
        addToLogs('Innertube instance created with WEB_REMIX');

        // Try to load existing credentials
        if (fs.existsSync(CREDENTIALS_FILE)) {
            addToLogs('Loading YouTube credentials from file...');
            const creds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));

            // Restore session
            await youtube.session.signIn(creds);
            addToLogs('YouTube session restored successfully');
        }
    } catch (error) {
        addToLogs(`Error initializing YouTube: ${error.message}`);
    }

    return youtube;
};

export const startAuthFlow = async () => {
    const yt = await initYoutube();

    return new Promise((resolve, reject) => {
        let authData = null;

        const handleAuth = (data) => {
            console.log('[AUTH] Auth code received:', data.user_code);
            authData = data;
            resolve({
                verification_url: data.verification_url,
                user_code: data.user_code,
                device_code: data.device_code
            });
        };

        const handleSuccess = async () => {
            console.log('[AUTH] Sign in successful!');

            // Access credentials from the session
            // In youtubei.js session.oauth holds the tokens
            const creds = yt.session.oauth.oauth2_tokens;

            if (creds) {
                fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
                console.log('[AUTH] Credentials saved to', CREDENTIALS_FILE);
            }

            yt.session.off('auth-pending', handleAuth);
            yt.session.off('auth', handleSuccess);
        };

        const handleError = (err) => {
            console.error('[AUTH] Auth error:', err);
            reject(err);
            yt.session.off('auth-pending', handleAuth);
            yt.session.off('auth', handleSuccess);
            yt.session.off('auth-error', handleError);
        };

        yt.session.on('auth-pending', handleAuth);
        yt.session.on('auth', handleSuccess);
        yt.session.on('auth-error', handleError);

        yt.session.signIn().catch(err => {
            console.log('[AUTH] SignIn waiting for user or failed:', err.message);
        });
    });
};

export const getYoutube = async () => {
    if (!youtube) {
        await initYoutube();
    }
    return youtube;
};

export const getSessionStatus = async () => {
    const yt = await getYoutube();
    if (!yt) return { logged_in: false };

    if (yt.session.logged_in) {
        try {
            const info = await yt.account.getInfo();
            // Try to find the name in various possible structures
            let name = info.name || info.contents?.contents?.[0]?.account_name?.text || 'Authenticated User';
            return { logged_in: true, name: name };
        } catch (e) {
            console.error('[AUTH] Error getting account info:', e.message);
            // Even if info fails, we might still be logged in
            return { logged_in: true, name: 'Active Session' };
        }
    }
    return { logged_in: false };
};

export const getSessionCookies = async () => {
    const yt = await getYoutube();
    if (!yt) {
        console.log('[AUTH] No YouTube instance for cookies');
        return null;
    }
    if (!yt.session.logged_in) {
        console.log('[AUTH] Session NOT logged in for cookies');
        return null;
    }

    try {
        const cookies = yt.session.cookie_jar.getCookies({ domain: 'youtube.com' });
        const googleCookies = yt.session.cookie_jar.getCookies({ domain: 'google.com' });
        const allCookies = [...(cookies || []), ...(googleCookies || [])];

        addToLogs(`Exporting ${allCookies.length} cookies...`);
        if (allCookies.length === 0) return null;

        let netscape = '# Netscape HTTP Cookie File\n';
        cookies.forEach(c => {
            const domain = c.domain.startsWith('.') ? c.domain : `.${c.domain} `;
            const path = c.path || '/';
            const secure = c.secure ? 'TRUE' : 'FALSE';
            const expires = c.expires ? Math.floor(new Date(c.expires).getTime() / 1000) : 0;
            const name = c.key;
            const value = c.value;
            netscape += `${domain} \tTRUE\t${path} \t${secure} \t${expires} \t${name} \t${value} \n`;
        });
        return netscape;
    } catch (e) {
        console.error('[AUTH] Error exporting cookies:', e.message);
        return null;
    }
};

export const signOut = async () => {
    if (youtube) {
        await youtube.session.signOut();
        youtube = null;
    }

    if (fs.existsSync(CREDENTIALS_FILE)) {
        fs.unlinkSync(CREDENTIALS_FILE);
    }

    return { success: true };
};
