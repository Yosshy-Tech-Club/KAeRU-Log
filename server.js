const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
const app = express();
require('dotenv').config();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.static('public'));

let messages = [];

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    ws.send(JSON.stringify({ type: 'init', messages }));
    ws.on('message', msg => {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'newMessage') {
                const message = {
                    id: uuidv4(),
                    content: data.content.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
                    createdAt: Date.now()
                };
                messages.push(message);
                broadcast({ type: 'newMessage', message });
            }
        } catch (e) {}
    });
});

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

app.post('/api/deleteMessage', (req, res) => {
    const { id, secret } = req.body;
    if (secret !== process.env.SECRET_KEY) return res.status(403).json({ success: false });
    const index = messages.findIndex(m => m.id === id);
    if (index !== -1) {
        const deleted = messages.splice(index, 1)[0];
        broadcast({ type: 'deleteMessage', id: deleted.id });
        return res.json({ success: true });
    }
    res.json({ success: false });
});

app.post('/api/deleteAllMessages', (req, res) => {
    const { secret } = req.body;
    if (secret !== process.env.SECRET_KEY) return res.status(403).json({ success: false });
    messages = [];
    broadcast({ type: 'deleteAllMessages' });
    res.json({ success: true });
});

server.listen(process.env.PORT || 3000);
