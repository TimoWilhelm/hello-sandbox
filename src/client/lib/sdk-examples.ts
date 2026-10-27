// Examples match the application's SDK 1.0 and native container implementation.
export const sdkExamples = {
	commands: `// Inside a Durable Object, after starting the container:
const process = await this.ctx.container.exec(['python3', '--version']);
const { stdout, stderr, exitCode } = await process.output();
console.log(new TextDecoder().decode(stdout), exitCode);`,
	files: `import { Files } from '@cloudflare/sandbox';
const files = new Files(this.ctx.container);
await files.mkdir('/workspace/project', { recursive: true });
await files.writeFile('/workspace/project/main.py', code);
const content = await (await files.readFile('/workspace/project/main.py')).text();
const entries = await files.readDirectory('/workspace');`,
	interpreter: `// This app's Durable Object runs persistent IPython/Node kernels.
const sandbox = env.Sandbox.getByName(sandboxId);
const first = await sandbox.runCode('x = 42', 'python');
const result = await sandbox.runCode('print(x * 2)', 'python', first.contextId);`,
	preview: `// Application methods wrap native exec() and getTcpPort().
const sandbox = env.Sandbox.getByName(sandboxId);
await sandbox.startServer('python3 /opt/http-server.py 8080', 8080, '/workspace/preview');
const { url } = await sandbox.exposePort(8080, { hostname });
// The Worker checks the URL token before forwarding to the port.`,
	tunnels: `// Application methods run cloudflared with native exec().
const sandbox = env.Sandbox.getByName(sandboxId);
await sandbox.startServer('python3 /opt/http-server.py 8081', 8081, '/workspace/tunnel');
const { url } = await sandbox.openTunnel(8081);
// cloudflared tunnel --url http://127.0.0.1:8081`,
	watch: `// Native container execution streams inotify events.
const process = await this.ctx.container.exec([
  'inotifywait', '-m', '-r', '--format', '%e|%w%f', '/workspace'
]);
// This app converts stdout lines into EventSource messages.
for await (const chunk of process.stdout) console.log(chunk);`,
	backup: `import { Files, S3Mount } from '@cloudflare/sandbox';
const mounts = new S3Mount(this.ctx.container, this.ctx.exports.S3Gateway);
await mounts.mount({
  mountPath: '/data', keyPrefix: 'sandboxes/' + this.ctx.id.name,
  access: 'read-write', source: {
    type: 's3', endpoint: this.env.S3_ENDPOINT, region: 'auto',
    bucket: this.env.S3_BUCKET, credentials: {
      type: 'static', accessKeyId: this.env.S3_ACCESS_KEY_ID,
      secretAccessKey: this.env.S3_SECRET_ACCESS_KEY
    }
  }
});
await new Files(this.ctx.container).writeFile('/data/results.json', json);
await mounts.unmount('/data');`,
	auth: `import { WorkerEntrypoint } from 'cloudflare:workers';
export class Outbound extends WorkerEntrypoint {
  async fetch(request) {
    const headers = new Headers(request.headers);
    headers.set('Authorization', 'Bearer sb_demo_secret_token_12345');
    headers.set('X-Sandbox-Auth', 'injected-by-outbound-worker');
    return fetch(new Request(request, { headers }));
  }
}
// In the Durable Object, before running commands:
await container.interceptOutboundHttps('httpbin.org', this.ctx.exports.Outbound({ props: {} }));
// Install the intercept CA in the container's trust bundle.`,
	opencode: `// This app's Durable Object clones cloudflare/agents and runs:
// opencode serve --hostname 0.0.0.0 --port 4096
const sandbox = env.OpencodeSandbox.getByName('oc-' + sandboxId);
const { url } = await sandbox.startOpencode(hostname);
// A token-protected preview forwards the OpenCode UI and API.`,
	terminal: `// In the Durable Object, after starting the container:
const terminal = await container.exec(['tmux', 'new-session', '-A', '-s', 'main'], {
  pty: { cols: 120, rows: 30 }, env: { TERM: 'xterm-256color' }, cwd: '/workspace'
});
// Bridge terminal.stdin/stdout and resize() to a WebSocket.
// The browser uses xterm.js; tmux keeps the shell on reconnect.`,
	opencodeImage: `FROM node:24-trixie-slim
# Install ca-certificates, git, Python and tmux.
COPY --from=cloudflare/sandbox:1.0.3 /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
COPY --from=oven/bun:1.4.0 /usr/local/bin/bun /usr/local/bin/bun
RUN BUN_INSTALL=/usr/local bun add --global opencode-ai@1.2.26
CMD ["sleep", "infinity"]`,
	r2Config: `// Worker variables: S3_ENDPOINT and S3_BUCKET.
// Worker secrets: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.
// Grant Object Read & Write only for the backup bucket.
export { S3Gateway } from '@cloudflare/sandbox';
// S3Gateway signs requests; bucket credentials stay in the Worker.`,
};
