FROM node:24-trixie-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
 ca-certificates curl git python3 python3-venv python3-ipython \
 python3-matplotlib python3-numpy python3-pandas tmux inotify-tools fuse3 s3fs \
 && python3 -m venv --system-site-packages /opt/venv \
 && rm -rf /var/lib/apt/lists/*

COPY --from=docker.io/cloudflare/sandbox:1.0.3 /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
COPY --from=docker.io/cloudflare/cloudflared:2026.10.2 /usr/local/bin/cloudflared /usr/local/bin/cloudflared
RUN printf 'set -g mouse on\nset -g history-limit 50000\nset -g default-shell /bin/bash\n' > /etc/tmux.conf
COPY container/ /opt/
ENV PATH="/opt/venv/bin:${PATH}"
WORKDIR /workspace
CMD ["sleep", "infinity"]
