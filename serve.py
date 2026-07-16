import os
from waitress import serve
import app
port = int(os.environ.get("PORT", 5001))
serve(app.app, host="0.0.0.0", port=port, threads=4)
