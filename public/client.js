const socket = io();
const messagesEl = document.getElementById('messages');
const sendBtn = document.getElementById('sendBtn');
const messageInput = document.getElementById('messageInput');
const clearAllBtn = document.getElementById('clearAllBtn');
const toastEl = document.getElementById('toast');

const SECRET_KEY = 'your-secret-key';

function showToast(msg, type='success') {
	toastEl.textContent = msg;
	toastEl.style.backgroundColor = type === 'success' ? 'var(--success)' : 'var(--danger)';
	toastEl.classList.add('show');
	setTimeout(() => toastEl.classList.remove('show'), 2000);
}

function createMessageEl(message) {
	const el = document.createElement('div');
	el.className = 'msg';
	el.id = message.id;
	el.innerHTML = `
		<div class="avatar">${message.user.charAt(0).toUpperCase()}</div>
		<div class="bubble">
			<div class="meta"><span class="name">${message.user}</span> <span>${new Date(message.time).toLocaleTimeString()}</span></div>
			<div class="text">${message.content}</div>
			<div class="reactions">
				<button class="btn danger deleteBtn">削除</button>
			</div>
		</div>
	`;
	const deleteBtn = el.querySelector('.deleteBtn');
	deleteBtn.addEventListener('click', async () => {
		const res = await fetch('/api/deleteMessage', {
			method: 'POST',
			headers: {'Content-Type':'application/json'},
			body: JSON.stringify({id: message.id, key: SECRET_KEY})
		});
		const data = await res.json();
		if(data.success) showToast('メッセージ削除成功');
		else showToast(data.message,'error');
	});
	return el;
}

socket.on('init', (msgs) => {
	messagesEl.innerHTML = '';
	msgs.forEach(msg => messagesEl.appendChild(createMessageEl(msg)));
});

socket.on('newMessage', (msg) => {
	messagesEl.appendChild(createMessageEl(msg));
	messagesEl.scrollTop = messagesEl.scrollHeight;
});

socket.on('deleteMessage', (id) => {
	const el = document.getElementById(id);
	if(el) el.remove();
});

socket.on('deleteAllMessages', () => messagesEl.innerHTML = '');

sendBtn.addEventListener('click', () => {
	const content = messageInput.value.trim();
	if(!content) return;
	socket.emit('sendMessage', {user: 'User', content});
	messageInput.value = '';
});

clearAllBtn.addEventListener('click', async () => {
	const res = await fetch('/api/deleteAllMessages', {
		method:'POST',
		headers:{'Content-Type':'application/json'},
		body: JSON.stringify({key: SECRET_KEY})
	});
	const data = await res.json();
	if(data.success) showToast('全メッセージ削除成功');
	else showToast(data.message,'error');
});
