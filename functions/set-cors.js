// One-time script to set CORS on the Firebase Storage bucket
const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const refreshToken = config.tokens.refresh_token;

const { OAuth2Client } = require('google-auth-library');
const { Storage } = require('@google-cloud/storage');

const accessToken = config.tokens.access_token;
const authClient = new OAuth2Client();
authClient.setCredentials({ access_token: accessToken });

const storage = new Storage({ projectId: 'ifta-wizard-a9061', authClient });
const bucket = storage.bucket('ifta-wizard-a9061.firebasestorage.app');

bucket.setCorsConfiguration([
    {
        origin: ['https://ifta-wizard-a9061.web.app', 'http://localhost:5000'],
        method: ['GET'],
        responseHeader: ['Content-Type', 'Content-Disposition'],
        maxAgeSeconds: 3600
    }
]).then(() => {
    console.log('CORS configured successfully on ifta-wizard-a9061.firebasestorage.app');
    process.exit(0);
}).catch(err => {
    console.error('Failed to set CORS:', err.message);
    process.exit(1);
});
