(async () => {
	const socket = io();
	let seed = localStorage.getItem('chat_seed');
	if (!seed) {
		const res = await fetch('/api/register', {
			method: 'POST'
		}).then(r => r.json());
		seed = res.seed;
		localStorage.setItem('chat_seed', seed);
	}

	let username = localStorage.getItem('chat_username') || '';

	const el = {
		messages: document.getElementById('messages'),
		messageInput: document.getElementById('messageInput'),
		sendBtn: document.getElementById('sendBtn'),
		editUserBtn: document.getElementById('editUserBtn'),
		userModal: document.getElementById('userModal'),
		usernameInput: document.getElementById('usernameInput'),
		saveUsernameBtn: document.getElementById('saveUsernameBtn'),
		closeUserModalBtn: document.getElementById('closeUserModalBtn'),
		adminModal: document.getElementById('adminModal'),
		openAdminBtn: document.getElementById('openAdminBtn'),
		closeAdminModalBtn: document.getElementById('closeAdminModalBtn'),
		adminPassword: document.getElementById('adminPassword'),
		clearAllBtn: document.getElementById('clearAllBtn'),
		userCount: document.getElementById('userCount'),
		newIndicator: document.getElementById('newMsgIndicator'),
		mainContainer: document.querySelector('.main')
	};

	let isAutoScroll = true;

	function initials(name) {
		if (!name) return '?';
		return name.trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
	}

	const observer = new ResizeObserver(() => {
		if (isAutoScroll) scrollToBottom(false);
	});
	observer.observe(el.messages);

	el.mainContainer.addEventListener('scroll', () => {
		const threshold = 96;
		const pos = el.mainContainer.scrollHeight - el.mainContainer.scrollTop - el.mainContainer.clientHeight;
		isAutoScroll = pos <= threshold;
		if (isAutoScroll) hideNewIndicator();
	});

	function showNewIndicator() {
		el.newIndicator.style.display = 'block';
		el.newIndicator.setAttribute('aria-hidden', 'false');
	}

	function hideNewIndicator() {
		el.newIndicator.style.display = 'none';
		el.newIndicator.setAttribute('aria-hidden', 'true');
	}
	el.newIndicator.addEventListener('click', () => {
		scrollToBottom(true);
		hideNewIndicator();
	});

	function scrollToBottom(smooth = true) {
		el.mainContainer.scrollTo({
			top: el.mainContainer.scrollHeight,
			behavior: smooth ? 'smooth' : 'auto'
		});
	}

	function showUserModal() {
		el.usernameInput.value = username;
		el.userModal.classList.add('show');
	}

	function hideUserModal() {
		el.userModal.classList.remove('show');
	}

	function showAdminModal() {
		el.adminPassword.value = '';
		el.adminModal.classList.add('show');
	}

	function hideAdminModal() {
		el.adminModal.classList.remove('show');
	}

	el.editUserBtn.addEventListener('click', showUserModal);
	el.closeUserModalBtn.addEventListener('click', hideUserModal);
	el.saveUsernameBtn.addEventListener('click', async () => {
		const v = el.usernameInput.value.trim().slice(0, 24);
		if (!v) return;
		await fetch('/api/username', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				seed,
				username: v
			})
		});
		username = v;
		localStorage.setItem('chat_username', username);
		hideUserModal();
		await fetchMessages(true);
	});

	el.openAdminBtn.addEventListener('click', showAdminModal);
	el.closeAdminModalBtn.addEventListener('click', hideAdminModal);
	el.clearAllBtn.addEventListener('click', async () => {
		await fetch('/api/pass', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				password: el.adminPassword.value
			})
		});
		hideAdminModal();
	});

	async function renderMessage(m, i) {
		const wrapper = document.createElement('div');
		wrapper.className = 'msg' + (m.seed === seed ? ' self' : '');
		const avatar = document.createElement('div');
		avatar.className = 'avatar';
		avatar.textContent = initials(m.username);
		const bubble = document.createElement('div');
		bubble.className = 'bubble';
		const meta = document.createElement('div');
		meta.className = 'metaLine';
		const nameEl = document.createElement('div');
		nameEl.className = 'name';
		nameEl.textContent = m.username || '匿名';
		const timeEl = document.createElement('div');
		timeEl.className = 'time';
		timeEl.textContent = m.time || '';
		meta.appendChild(nameEl);
		meta.appendChild(timeEl);
		const text = document.createElement('div');
		text.className = 'text';
		text.textContent = m.message || '';
		bubble.appendChild(meta);
		bubble.appendChild(text);
		wrapper.appendChild(avatar);
		wrapper.appendChild(bubble);
		if (el.adminPassword.value) {
			const del = document.createElement('button');
			del.className = 'delete-btn';
			del.type = 'button';
			del.textContent = '×';
			del.addEventListener('click', async () => {
				await fetch('/api/pass', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						password: el.adminPassword.value,
						messageId: i
					})
				});
			});
			wrapper.appendChild(del);
		}
		return wrapper;
	}

	async function fetchMessages(triggeredBySocket = false) {
		const res = await fetch('/api/messages', {
			cache: 'no-store'
		});
		const msgs = await res.json();
		el.messages.innerHTML = '';
		for (let i = 0; i < msgs.length; i++) {
			const node = await renderMessage(msgs[i], i);
			el.messages.appendChild(node);
		}
		if (isAutoScroll) scrollToBottom(!triggeredBySocket);
		else if (!triggeredBySocket) showNewIndicator();
	}

	socket.on('newMessage', () => {
		if (isAutoScroll) fetchMessages(true);
		else {
			fetchMessages(false);
			showNewIndicator();
		}
	});
	socket.on('clearMessages', () => {
		fetchMessages();
	});
	socket.on('userCount', n => {
		el.userCount.textContent = n;
	});

	await fetchMessages();

	el.sendBtn.addEventListener('click', async () => {
		const msg = el.messageInput.value.trim();
		if (!msg) return;
		const time = new Date().toLocaleString();
		await fetch('/api/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				seed,
				message: msg,
				time,
				username
			})
		});
		el.messageInput.value = '';
		await fetchMessages(true);
	});

	el.messageInput.addEventListener('keydown', e => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			el.sendBtn.click();
		}
	});

	window.addEventListener('beforeunload', e => {
		if (el.messageInput.value.trim()) {
			e.preventDefault();
			e.returnValue = '';
		}
	});
})();
