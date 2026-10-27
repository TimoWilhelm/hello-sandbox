function closeSocket(socket: WebSocket, code: number, reason: string) {
	try {
		socket.close(code === 1005 || code === 1006 ? 1000 : code, reason);
	} catch {
		/* Already closed. */
	}
}

function relay(from: WebSocket, to: WebSocket) {
	from.addEventListener('message', (event) => {
		try {
			to.send(event.data);
		} catch {
			closeSocket(from, 1011, 'The other side closed');
		}
	});
	from.addEventListener('close', (event) => closeSocket(to, event.code, event.reason));
	from.addEventListener('error', () => {
		closeSocket(from, 1011, 'Preview connection failed');
		closeSocket(to, 1011, 'Preview connection failed');
	});
}

/** Accept both ends so an active preview connection keeps its container alive. */
export function bridgeWebSocket(response: Response): Response {
	const upstream = response.webSocket!;
	const [client, server] = Object.values(new WebSocketPair());
	upstream.binaryType = 'arraybuffer';
	server.binaryType = 'arraybuffer';
	upstream.accept();
	server.accept();
	relay(server, upstream);
	relay(upstream, server);
	const headers = new Headers();
	const protocol = response.headers.get('Sec-WebSocket-Protocol');
	if (protocol) headers.set('Sec-WebSocket-Protocol', protocol);
	return new Response(undefined, { status: 101, webSocket: client, headers });
}
