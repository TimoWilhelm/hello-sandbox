import base64
import io
import json
import os
import signal
import sys
import traceback
from http.server import BaseHTTPRequestHandler
from socketserver import TCPServer

os.environ["MPLBACKEND"] = "Agg"

from IPython.core.interactiveshell import InteractiveShell
from IPython.utils.capture import capture_output

PORT = int(sys.argv[1])
FORMATS = {
    "text/plain": "text",
    "text/html": "html",
    "text/markdown": "markdown",
    "text/latex": "latex",
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/svg+xml": "svg",
    "application/json": "json",
    "application/javascript": "javascript",
}

shell = InteractiveShell.instance(colors="NoColor")
# Return values and errors in the response, not in stdout.
shell.displayhook.write_output_prompt = lambda: None
shell.displayhook.write_format_data = lambda *a, **k: None
shell.showtraceback = lambda *a, **k: None
shell.showsyntaxerror = lambda *a, **k: None
running = False


def interrupt(signum, frame):
    # Stop a running cell. An idle kernel ignores the signal.
    if running:
        raise KeyboardInterrupt


def formats(data):
    return {
        FORMATS[kind]: value
        for kind, value in data.items()
        if kind in FORMATS
    }


def figures():
    if "matplotlib.pyplot" not in sys.modules:
        return []
    import matplotlib.pyplot as plt

    images = []
    for number in plt.get_fignums():
        buffer = io.BytesIO()
        plt.figure(number).savefig(
            buffer, format="png", bbox_inches="tight"
        )
        png = base64.b64encode(buffer.getvalue()).decode()
        images.append({"png": png})
    plt.close("all")
    return images


def describe(error):
    if error is None:
        return None
    if isinstance(error, SyntaxError):
        lines = traceback.format_exception_only(error)
    else:
        # Skip the frame of the kernel itself.
        lines = traceback.format_exception(
            type(error), error, error.__traceback__.tb_next
        )
    return {
        "name": type(error).__name__,
        "message": str(error),
        "traceback": lines,
    }


def run(code):
    global running
    running = True
    try:
        with capture_output(display=True) as captured:
            cell = shell.run_cell(code, store_history=True)
    finally:
        running = False

    results = [formats(output.data) for output in captured.outputs]
    results += figures()
    if isinstance(cell.result, (dict, list)):
        results.append({"json": cell.result})
    elif cell.result is not None:
        data, _ = shell.display_formatter.format(cell.result)
        results.append(formats(data))

    stdout, stderr = captured.stdout, captured.stderr
    return {
        "logs": {
            "stdout": [stdout] if stdout else [],
            "stderr": [stderr] if stderr else [],
        },
        "results": results,
        "error": describe(
            cell.error_before_exec or cell.error_in_exec
        ),
        "executionCount": cell.execution_count,
    }


class Kernel(BaseHTTPRequestHandler):
    def do_GET(self):
        self.reply(b"ready")

    def do_POST(self):
        length = int(self.headers["Content-Length"])
        code = self.rfile.read(length).decode()
        result = json.dumps(run(code), default=repr)
        self.reply(result.encode())

    def reply(self, body):
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


signal.signal(signal.SIGINT, interrupt)
# HTTPServer looks up the container hostname, which is too
# long to resolve.
TCPServer.allow_reuse_address = True
TCPServer(("0.0.0.0", PORT), Kernel).serve_forever()
