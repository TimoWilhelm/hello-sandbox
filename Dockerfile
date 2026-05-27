FROM docker.io/cloudflare/sandbox:0.10.3-python

# Required during local development to access exposed ports
EXPOSE 8080

# Restore PTY job control so Ctrl+C reaches foreground processes.
RUN printf '%s\n' '[ -z "$SANDBOX_JOBCTL" ] && exec script -q -c "export SANDBOX_JOBCTL=1; exec bash -i" /dev/null' > /root/.bashrc
