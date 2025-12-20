import { Innertube, UniversalCache } from 'youtubei.js';
import fs from 'fs';
import path from 'path';

let youtube = null;
const CREDENTIALS_FILE = path.join(process.cwd(), 'youtube-auth.json');

export const initYoutube = async () => {
    if (youtube) return youtube;

    try {
        youtube = await Innertube.create({
            cache: new UniversalCache(false),
            generate_session_locally: true
        });

        // Try to load existing credentials
        if (fs.existsSync(CREDENTIALS_FILE)) {
            console.log('Loading YouTube credentials from file...');
            const creds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));

            // Restore session
            await youtube.session.signIn(creds);

            console.log('YouTube session restored successfully');

            // Verify if we are actually signed in
            if (youtube.session.logged_in) {
                console.log('Signed in as:', (await youtube.account.getInfo()).name);
            }
        }
    } catch (error) {
        console.error('Error initializing YouTube:', error);
    }

    return youtube;
};

export const startAuthFlow = async () => {
    const yt = await initYoutube();

    // We need to trigger the OAuth flow. 
    // youtubei.js handles this via an event emitter on the session.

    return new Promise((resolve, reject) => {
        let authData = null;

        const handleAuth = (data) => {
            console.log('Auth data received:', data);
            authData = data;

            // We resolve immediately with the verification info so the frontend can show it
            resolve({
                verification_url: data.verification_url,
                user_code: data.user_code,
                device_code: data.device_code
            });
        };

        const handleSuccess = async () => {
            console.log('Sign in successful!');

            // Save credentials
            // In newer youtubei.js versions, credentials might be a property or named differently
            console.log('OAuth object keys:', Object.keys(yt.session.oauth));
            console.log('Full OAuth object:', JSON.stringify(yt.session.oauth, null, 2)); // DEBUG LOG
            const creds = yt.session.oauth.oauth2_tokens; // FIX: Use oauth2_tokens

            if (creds) {
                fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
                console.log('Credentials saved to', CREDENTIALS_FILE);
            } else {
                console.error('Could not find credentials in OAuth object');
            }

            // Remove listeners to avoid leaks if called again (though this is a one-off per login)
            yt.session.off('auth-pending', handleAuth);
            yt.session.off('auth', handleSuccess);
        };

        const handleError = (err) => {
            console.error('Auth error:', err);
            reject(err);

            yt.session.off('auth-pending', handleAuth);
            yt.session.off('auth', handleSuccess);
            yt.session.off('auth-error', handleError);
        };

        // Set up listeners BEFORE calling signIn
        yt.session.on('auth-pending', handleAuth);
        yt.session.on('auth', handleSuccess);
        yt.session.on('auth-error', handleError);

        // Start the sign-in process
        yt.session.signIn().catch(err => {
            // If signIn fails immediately (e.g. network), reject
            // But note that signIn() promise resolves when auth is COMPLETE
            // We want to return the code to the user first.
            console.log('SignIn promise catch (might be normal if waiting for user):', err);
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
            console.log('DEBUG: Account Info JSON:', JSON.stringify(info, null, 2));

            let name = info.name;

            if (!name) {
                console.log('DEBUG: Name not found at root. Checking nested...');
                try {
                    if (info.contents && info.contents.contents && info.contents.contents.length > 0) {
                        const item = info.contents.contents[0];
                        console.log('DEBUG: First item:', item);
                        if (item.account_name && item.account_name.text) {
                            name = item.account_name.text;
                            console.log('DEBUG: Found name in nested:', name);
                        } else {
                            console.log('DEBUG: Item has no account_name.text');
                        }
                    } else {
                        console.log('DEBUG: Invalid contents structure');
                    }
                } catch (err) {
                    console.log('DEBUG: Error parsing nested:', err);
                }
            }

            if (name) {
                return { logged_in: true, name: name };
            }

            console.log('DEBUG: Session active but no user name found.');
            return { logged_in: false };
        } catch (e) {
            console.error('Error getting account info:', e);
            return { logged_in: false };
        }
    }
    return { logged_in: false };
};

export const signOut = async () => {
    if (youtube) {
        await youtube.session.signOut();
        youtube = null;
    }

    if (fs.existsSync(CREDENTIALS_FILE)) {
        fs.unlinkSync(CREDENTIALS_FILE);
        console.log('Credentials file deleted');
    }

    return { success: true };
};
