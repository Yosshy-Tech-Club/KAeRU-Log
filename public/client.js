const ws = new WebSocket(`ws://${location.host}`);
const messagesDiv = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('messageInput');
const toast = document.getElementById('toast');
const deleteAllBtn = document.getElementById('deleteAllBtn');

function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 2000);
}

function addMessage(message) {
    const div = document.createElement('div');
    div.className = 'message';
    div.id = message.id;
    div.innerHTML = `<span>${message.content}</span><button data-id="${message.id}">削除</button>`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    div.querySelector('button').onclick = () => deleteMessage(message.id);
}

function deleteMessage(id) {
    fetch('/api/deleteMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, secret: 'supersecretkey' })
    }).then(r => r.json()).then(res => {
        if(res.success) showToast('削除しました');
        else showToast('削除失敗');
    });
}

deleteAllBtn.onclick = () => {
    fetch('/api/deleteAllMessages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'supersecretkey' })
    }).then(r => r.json()).then(res => {
        if(res.success) showToast('全削除しました');
        else showToast('削除失敗');
    });
};

form.onsubmit = e => {
    e.preventDefault();
    if(input.value.trim() === '') return;
    ws.send(JSON.stringify({ type: 'newMessage', content: input.value }));
    input.value = '';
};

ws.onmessage = msg => {
    const data = JSON.parse(msg.data);
    if(data.type === 'init') data.messages.forEach(addMessage);
    if(data.type === 'newMessage') addMessage(data.message);
    if(data.type === 'deleteMessage') {
        const el = document.getElementById(data.id);
        if(el) el.remove();
    }
    if(data.type === 'deleteAllMessages') messagesDiv.innerHTML = '';
};
