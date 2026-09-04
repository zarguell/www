/**
 * AimChat widget wiring — chat state (localStorage), menus, drag, window controls.
 * Mounted by the AimChat.astro component.
 */


const buddyName = 'zachisawesome';

// Cap on persisted chat history; oldest messages are trimmed beyond this
const MAX_STORED_MESSAGES = 100;

interface ChatMessage {
	sender: 'me' | 'them';
	text: string;
	time: string;
}

function loadStored(): ChatMessage[] {
	try {
		return JSON.parse(localStorage.getItem('aimChatMessages') || '[]') as ChatMessage[];
	} catch {
		return [];
	}
}

// Auto-responses for the "buddy"
const autoResponses = [
	'lol',
	'that\'s cool',
	'so what r u doing?',
	'omg same',
	'haha yeah',
	'sure',
	'idk maybe',
	'yeah totally',
	'nm u?',
	'awesome!',
	'sweet',
	'rad',
	'crazy right?',
	'for real tho',
	'i guess',
	'maybe later',
	'sounds good',
	'haha',
	'lmao',
	'right?',
	'exactly!',
	'no way',
	'seriously?',
	'wow',
	'interesting...',
	'tell me more',
	'oh ic',
	'gotcha',
	'nice',
	'cool',
	'sick',
	'dope',
	'legit',
	'for sure',
	'hey',
	'sup?',
	'watcha up to?',
];

function getCurrentTime(): string {
	const now = new Date();
	let hours = now.getHours();
	const minutes = now.getMinutes().toString().padStart(2, '0');
	const ampm = hours >= 12 ? 'PM' : 'AM';
	hours = hours % 12;
	hours = hours ? hours : 12;
	return `${hours}:${minutes} ${ampm}`;
}

function createMessageElement(sender: 'me' | 'them', text: string, time: string): HTMLElement {
	const msgDiv = document.createElement('div');
	msgDiv.className = `aim-message aim-message-${sender}`;

	if (sender === 'them') {
		const senderSpan = document.createElement('span');
		senderSpan.className = 'aim-sender-name';
		senderSpan.textContent = `${buddyName}:`;
		msgDiv.appendChild(senderSpan);
	}

	const textSpan = document.createElement('span');
	textSpan.className = 'aim-message-text';
	textSpan.textContent = text;
	msgDiv.appendChild(textSpan);

	const timeSpan = document.createElement('span');
	timeSpan.className = 'aim-message-time';
	timeSpan.textContent = time;
	msgDiv.appendChild(timeSpan);

	return msgDiv;
}

function addMessage(sender: 'me' | 'them', text: string, time?: string) {
	const chatContent = document.getElementById('aimChatContent');
	const messagesContainer = document.getElementById('messagesContainer');

	if (!chatContent || !messagesContainer) return;

	const msgTime = time || getCurrentTime();
	const msgElement = createMessageElement(sender, text, msgTime);
	messagesContainer.appendChild(msgElement);

	// Scroll to bottom
	chatContent.scrollTop = chatContent.scrollHeight;

	// Save to localStorage (capped at the most recent messages)
	const messages = loadStored();
	messages.push({ sender, text, time: msgTime });
	if (messages.length > MAX_STORED_MESSAGES) {
		messages.splice(0, messages.length - MAX_STORED_MESSAGES);
	}
	localStorage.setItem('aimChatMessages', JSON.stringify(messages));
}

function showTypingIndicator() {
	const chatContent = document.getElementById('aimChatContent');
	const messagesContainer = document.getElementById('messagesContainer');

	if (!chatContent || !messagesContainer) return;

	// Remove existing typing indicator if any
	const existing = document.getElementById('typingIndicator');
	if (existing) existing.remove();

	const typingDiv = document.createElement('div');
	typingDiv.id = 'typingIndicator';
	typingDiv.className = 'aim-typing-indicator';
	typingDiv.textContent = `${buddyName} is typing...`;
	messagesContainer.appendChild(typingDiv);

	chatContent.scrollTop = chatContent.scrollHeight;
}

function hideTypingIndicator() {
	const typingIndicator = document.getElementById('typingIndicator');
	if (typingIndicator) {
		typingIndicator.remove();
	}
}

// Initialize messages from localStorage
function loadMessages() {
	const messages = loadStored();
	// Trim to the most recent messages and persist the trimmed history
	if (messages.length > MAX_STORED_MESSAGES) {
		messages.splice(0, messages.length - MAX_STORED_MESSAGES);
		localStorage.setItem('aimChatMessages', JSON.stringify(messages));
	}
	const messagesContainer = document.getElementById('messagesContainer');
	const chatContent = document.getElementById('aimChatContent');

	if (!messagesContainer || !chatContent) return;

	// Clear existing messages
	messagesContainer.innerHTML = '';

	// If no messages, add default welcome
	if (messages.length === 0) {
		const defaultMessages = [
			{ sender: 'them' as const, text: 'hey!', time: '3:42 PM' },
			{ sender: 'me' as const, text: 'hey hows it going', time: '3:42 PM' },
			{ sender: 'them' as const, text: 'good, you?', time: '3:43 PM' },
		];
		defaultMessages.forEach(msg => {
			const msgElement = createMessageElement(msg.sender, msg.text, msg.time);
			messagesContainer.appendChild(msgElement);
		});
		localStorage.setItem('aimChatMessages', JSON.stringify(defaultMessages));
	} else {
		messages.forEach(msg => {
			const msgElement = createMessageElement(msg.sender, msg.text, msg.time);
			messagesContainer.appendChild(msgElement);
		});
	}

	// Scroll to bottom
	chatContent.scrollTop = chatContent.scrollHeight;
}

// Send message functionality
const sendBtn = document.getElementById('sendBtn');
const aimInput = document.getElementById('aimInput') as HTMLInputElement | null;

function sendMessage() {
	if (!aimInput) return;

	const text = aimInput.value.trim();
	if (!text) return;

	// Add user message
	addMessage('me', text);
	aimInput.value = '';

	// Simulate buddy response after a delay
	showTypingIndicator();
	const delay = 1000 + Math.random() * 2000; // 1-3 seconds

	setTimeout(() => {
		hideTypingIndicator();
		const response = autoResponses[Math.floor(Math.random() * autoResponses.length)];
		addMessage('them', response);
	}, delay);
}

sendBtn?.addEventListener('click', sendMessage);
aimInput?.addEventListener('keypress', (e) => {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

// Menu dropdown functionality
const menuButtons = document.querySelectorAll<HTMLElement>('.aim-menu-item');
const closeAllMenus = () => {
	document.querySelectorAll('.aim-dropdown-menu').forEach(menu => {
		menu.classList.remove('active');
	});
	document
		.querySelectorAll('.aim-menu-item[aria-expanded="true"]')
		.forEach(btn => btn.setAttribute('aria-expanded', 'false'));
};
const setExpanded = (button: Element, expanded: boolean) => {
	button.setAttribute('aria-expanded', String(expanded));
};
menuButtons.forEach(button => {
	button.addEventListener('click', (e) => {
		e.stopPropagation();
		const menuName = (button as HTMLElement).dataset.menu;
		if (!menuName) return;

		// Close all other menus
		document.querySelectorAll('.aim-dropdown-menu').forEach(menu => {
			if (menu.id !== `${menuName}Menu`) {
				menu.classList.remove('active');
			}
		});

		// Toggle current menu
		const dropdown = document.getElementById(`${menuName}Menu`);
		const opening = !dropdown?.classList.contains('active');
		dropdown?.classList.toggle('active');
		setExpanded(button, opening);
		if (opening) {
			(dropdown?.querySelector('.aim-dropdown-item') as HTMLElement | null)?.focus();
		}
	});
	// ArrowDown opens the menu without a pointer
	button.addEventListener('keydown', (e) => {
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
		const menuName = (button as HTMLElement).dataset.menu;
		const dropdown = menuName ? document.getElementById(`${menuName}Menu`) : null;
		if (!dropdown) return;
		e.preventDefault();
		dropdown.classList.add('active');
		setExpanded(button, true);
		(dropdown.querySelector('.aim-dropdown-item') as HTMLElement | null)?.focus();
	});
});

// Close dropdowns when clicking outside
document.addEventListener('click', () => {
	closeAllMenus();
});

// Dropdown item clicks (just visual feedback)
document.querySelectorAll('.aim-dropdown-item').forEach(item => {
	item.addEventListener('click', (e) => {
		e.stopPropagation();
		// Close all menus
		closeAllMenus();
	});
});

// Close the open dropdown with Esc and return focus to its menu button
document.querySelectorAll<HTMLElement>('.aim-menu-dropdown').forEach((dropdown) => {
	dropdown.addEventListener('keydown', (e) => {
		if (e.key !== 'Escape') return;
		const menu = dropdown.querySelector('.aim-dropdown-menu');
		if (!menu?.classList.contains('active')) return;
		menu.classList.remove('active');
		setExpanded(dropdown.querySelector('.aim-menu-item') as Element, false);
		(dropdown.querySelector('.aim-menu-item') as HTMLElement | null)?.focus();
		e.stopPropagation();
	});
});

// Window controls
const aimChatWindow = document.getElementById("aimChatWindow") as HTMLElement | null;
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeBtn = document.getElementById('maximizeBtn');
const closeBtn = document.getElementById('closeBtn');

// Make window draggable
const titleBar = document.getElementById('aimTitleBar');
let isDragging = false;
let currentX = 0;
let currentY = 0;
let initialX = 0;
let initialY = 0;
let xOffset = 0;
let yOffset = 0;

titleBar?.addEventListener('mousedown', dragStart);

// Touch support for mobile
titleBar?.addEventListener('touchstart', dragStart, { passive: false });

// Document-level move/end listeners are bound only while the window is
// visible (attached on open, detached on close) so a hidden window costs nothing.
function attachDragListeners() {
	document.addEventListener('mousemove', drag);
	document.addEventListener('mouseup', dragEnd);
	document.addEventListener('touchmove', drag, { passive: false });
	document.addEventListener('touchend', dragEnd);
}

function detachDragListeners() {
	document.removeEventListener('mousemove', drag);
	document.removeEventListener('mouseup', dragEnd);
	document.removeEventListener('touchmove', drag);
	document.removeEventListener('touchend', dragEnd);
}

function dragStart(e: MouseEvent | TouchEvent) {
	if (e.type === 'touchstart') {
		initialX = (e as TouchEvent).touches[0].clientX - xOffset;
		initialY = (e as TouchEvent).touches[0].clientY - yOffset;
	} else {
		initialX = (e as MouseEvent).clientX - xOffset;
		initialY = (e as MouseEvent).clientY - yOffset;
	}

	if (e.target === titleBar || (titleBar as HTMLElement).contains(e.target as Node)) {
		isDragging = true;
	}
}

function drag(e: MouseEvent | TouchEvent) {
	if (isDragging) {
		e.preventDefault();

		if (e.type === 'touchmove') {
			currentX = (e as TouchEvent).touches[0].clientX - initialX;
			currentY = (e as TouchEvent).touches[0].clientY - initialY;
		} else {
			currentX = (e as MouseEvent).clientX - initialX;
			currentY = (e as MouseEvent).clientY - initialY;
		}

		xOffset = currentX;
		yOffset = currentY;

		setTranslate(currentX, currentY, aimChatWindow);
	}
}

function setTranslate(xPos: number, yPos: number, el: HTMLElement | null) {
	if (el) {
		el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
	}
}

function dragEnd() {
	initialX = currentX;
	initialY = currentY;
	isDragging = false;
}

// Minimize functionality
minimizeBtn?.addEventListener('click', () => {
	aimChatWindow?.classList.toggle('minimized');
});

// Maximize functionality (toggle minimized)
maximizeBtn?.addEventListener('click', () => {
	aimChatWindow?.classList.remove('minimized');
});

// Close functionality (hide window and persist state)
closeBtn?.addEventListener('click', () => {
	aimChatWindow?.style.setProperty('display', 'none');
	localStorage.setItem('aimChatOpen', 'false');
	detachDragListeners();
	// Show the launch button if it exists (for index page)
	const launchBtn = document.getElementById('launchChatBtn');
	if (launchBtn && launchBtn.parentElement) {
		launchBtn.parentElement.style.setProperty('display', 'block');
	}
});

// Restore window state from localStorage. Closed by default — it only
// reopens if the visitor explicitly opened (and didn't close) it before.
const chatOpenState = localStorage.getItem('aimChatOpen');
if (chatOpenState === 'true') {
	aimChatWindow?.style.setProperty('display', 'flex');
	attachDragListeners();
}

// Re-bind drag listeners when the index-page launcher reopens the window
document.getElementById('launchChatBtn')?.addEventListener('click', attachDragListeners);

// Clear chat functionality
document.getElementById('clearChatItem')?.addEventListener('click', () => {
	const messagesContainer = document.getElementById('messagesContainer');
	if (messagesContainer) {
		messagesContainer.innerHTML = '';
		localStorage.removeItem('aimChatMessages');
	}
});


export function initAimChat(): void {
	loadMessages();
}
