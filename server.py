"""
serve.py — serves the Trade Journal and exposes the latest CSV from data/

Run:  python serve.py
Then: open http://localhost:8080
"""

import http.server
import os
import glob
import json

PORT = 5050

class Handler(http.server.SimpleHTTPRequestHandler):

    def do_GET(self):
        # Special endpoint: returns the latest CSV from data/ as JSON path
        if self.path == '/latest-csv':
            csvs = sorted(glob.glob('data/*.csv'), key=os.path.getmtime, reverse=True)
            if csvs:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'file': csvs[0]}).encode())
            else:
                self.send_response(404)
                self.end_headers()
            return

        # Serve CSV files from data/ folder
        if self.path.startswith('/data/') and self.path.endswith('.csv'):
            filepath = self.path.lstrip('/')
            if os.path.exists(filepath):
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                with open(filepath, 'rb') as f:
                    self.wfile.write(f.read())
                return

        # Serve everything else normally (index.html, src/, etc.)
        super().do_GET()

    def log_message(self, format, *args):
        # Suppress noisy request logs
        pass

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f'Trade Journal running at http://localhost:{PORT}')
    print(f'Watching data/ folder for CSVs...')
    csvs = sorted(glob.glob('data/*.csv'), key=os.path.getmtime, reverse=True)
    if csvs:
        print(f'Latest CSV: {csvs[0]}')
    else:
        print('No CSVs found in data/ yet.')
    http.server.HTTPServer(('', PORT), Handler).serve_forever()
