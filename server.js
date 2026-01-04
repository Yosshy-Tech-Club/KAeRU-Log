// -------------------- モジュール --------------------
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const crypto = require('crypto');
const Redis = require('ioredis');
const cron = require('node-cron');
require('dotenv').config();

// -------------------- 環境変数 --------------------
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL;
const WORKER_SECRET = process.env.WORKER_SECRET || 'supersecretkey1234';
const SECRET_KEY = process.env.SECRET_KEY || 'supersecretkey1234';
const ADMIN_PASS = process.env.ADMIN_PASS || 'adminkey1234';

if (!REDIS_URL) {
    console.error('REDIS_URL is not set');
    process.exit(1);
}

// -------------------- Redis --------------------
const redis = new Redis(REDIS_URL);
redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error', err));

// -------------------- Express & Socket.IO --------------------
const app = express();
app.use(express.json({ limit: '100kb' }));

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

// -------------------- ヘルパー --------------------
function isFromCloudflare(headers) {
    return headers['cf-ray'] && headers['cf-connecting-ip'] && headers['cf-visitor'];
}

function formatJST(date) {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth()+1).padStart(2,'0')}/${String(jst.getUTCDate()).padStart(2,'0')} ${String(jst.getUTCHours()).padStart(2,'0')}:${String(jst.getUTCMinutes()).padStart(2,'0')}`;
}

function formatJSTLog(date) {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth()+1).padStart(2,'0')}/${String(jst.getUTCDate()).padStart(2,'0')} ${String(jst.getUTCHours()).padStart(2,'0')}:${String(jst.getUTCMinutes()).padStart(2,'0')}:${String(jst.getUTCSeconds()).padStart(2,'0')}`;
}

function escapeHTML(str = '') {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function logUserAction(clientId, action, extra={}) {
    const time = formatJSTLog(new Date());
    const username = extra.username ? ` [Username:${extra.username}]` : '';
    const extraStr = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
    console.log(`[${time}] [User:${clientId}]${username} Action: ${action}${extraStr}`);
}

function createSystemMessage(htmlMessage) {
    return { username:'システム', message:htmlMessage, time:new Date().toISOString(), clientId:'system', seed:'system' };
}

function createAuthToken(clientId) {
    const timestamp = Date.now();
    const hmac = crypto.createHmac('sha256', SECRET_KEY);
    hmac.update(`${clientId}.${timestamp}`);
    return `${clientId}.${timestamp}.${hmac.digest('hex')}`;
}

async function validateAuthToken(token) {
    if (!token) return null;
    const [clientId, timestampStr, signature] = token.split('.');
    if (!clientId || !timestampStr || !signature) return null;
    const hmac = crypto.createHmac('sha256', SECRET_KEY);
    hmac.update(`${clientId}.${timestampStr}`);
    if (hmac.digest('hex') !== signature) return null;
    const stored = await redis.get(`token:${clientId}`);
    return stored === token ? clientId : null;
}

// -------------------- Middleware --------------------
io.use(async (socket, next) => {
    const headers = socket.handshake.headers;
    if (!isFromCloudflare(headers) || headers['x-worker-secret'] !== WORKER_SECRET) return next(new Error('Forbidden'));
    next();
});

app.use((req, res, next) => {
    const h = req.headers;
    if (!isFromCloudflare(h) || h['x-worker-secret'] !== WORKER_SECRET || h['user-agent'] !== 'cf-worker-kaeru-log') {
        return res.status(403).send('Forbidden');
    }
    next();
});

// -------------------- Redis 月次リセット --------------------
async function monthlyRedisReset(io) {
    const now = new Date();
    const jstMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const savedMonth = await redis.get('system:current_month');
    if (savedMonth === jstMonth) return;

    const lockKey = 'system:reset_lock';
    const locked = await redis.set(lockKey, '1', 'NX', 'EX', 30);
    if (!locked) return;

    console.log('[Redis] Month changed, flushing DB...');
    const keys = await redis.keys('messages:*');
    const roomIds = keys.map(k => k.replace('messages:',''));
    await redis.flushdb();
    await redis.set('system:current_month', jstMonth);

    const msg = createSystemMessage('<strong>メンテナンスのためデータベースがリセットされました</strong>');
    roomIds.forEach(id => io.to(id).emit('newMessage', msg));
    console.log('[Redis] Flushdb completed');
}

// -------------------- API --------------------
app.get('/api/messages/:roomId', async (req,res) => {
    const roomId = req.params.roomId;
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.status(400).json({ error:'invalid roomId' });

    const raw = await redis.lrange(`messages:${roomId}`, 0, -1);
    const messages = raw.map(m => JSON.parse(m));
    res.json(messages);
});

app.post('/api/messages', async (req,res) => {
    const { username, message, token, seed, roomId } = req.body;
    if (!username || !message || !token || !seed || !roomId) return res.status(400).json({ error:'Invalid data' });
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return res.status(400).json({ error:'invalid roomId' });

    const clientId = await validateAuthToken(token);
    if (!clientId) return res.status(403).json({ error:'Invalid token' });

    const storedMsg = { username: escapeHTML(username), message: escapeHTML(message), time: formatJST(new Date()), clientId, seed };
    const roomKey = `messages:${roomId}`;
    const lua = `redis.call('RPUSH', KEYS[1], ARGV[1]); redis.call('LTRIM', KEYS[1], -100, -1); return 1`;
    await redis.eval(lua, 1, roomKey, JSON.stringify(storedMsg));
    io.to(roomId).emit('newMessage', storedMsg);
    logUserAction(clientId,'sendMessage',{roomId, username});
    res.json({ ok:true });
});

// -------------------- Socket.IO --------------------
io.on('connection', socket => {
    socket.on('authenticate', async ({ token, username }) => {
        const ip = socket.handshake.headers['cf-connecting-ip'];
        if (!ip) return socket.disconnect(true);

        let clientId = token ? await validateAuthToken(token) : null;
        if (!clientId) {
            clientId = crypto.randomUUID();
            token = createAuthToken(clientId);
            await redis.set(`token:${clientId}`, token, 'EX', 86400);
            socket.emit('assignToken', token);
        }

        socket.data = { clientId, username: escapeHTML(username) };
        await redis.set(`username:${clientId}`, socket.data.username, 'EX', 86400);
        socket.join(clientId);
        socket.emit('authenticated');
    });

    socket.on('joinRoom', ({ roomId }) => {
        if (!socket.data?.clientId) return socket.disconnect(true);
        if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) return;

        if (socket.data.roomId) socket.leave(socket.data.roomId);
        socket.join(roomId);
        socket.data.roomId = roomId;

        logUserAction(socket.data.clientId,'joinRoom',{roomId, username: socket.data.username});
        const count = io.sockets.adapter.rooms.get(roomId)?.size || 0;
        io.to(roomId).emit('roomUserCount', count);
        socket.emit('joinedRoom',{roomId});
    });

    socket.on('disconnecting', () => {
        const roomId = socket.data?.roomId;
        if (roomId) {
            const count = (io.sockets.adapter.rooms.get(roomId)?.size || 1) - 1;
            io.to(roomId).emit('roomUserCount', count);
        }
        if (socket.data?.clientId) logUserAction(socket.data.clientId,'disconnecting',{roomId, username: socket.data.username});
    });
});

// -------------------- SPA対応 --------------------
app.use(express.static(`${__dirname}/public`));
app.get(/^\/(?!api\/).*/, (req,res) => res.sendFile(`${__dirname}/public/index.html`));

// -------------------- サーバー起動 --------------------
(async () => {
    try {
        await monthlyRedisReset(io);
        cron.schedule('0 0 0 1 * *', async () => await monthlyRedisReset(io), { timezone:'Asia/Tokyo' });
    } finally {
        server.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
    }
})();
