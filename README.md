# Trade-Journal

A ThinkorSwim options trade grouper and interactive dashboard for tracking trades.

## What it does
ThinkorSwim exports every buy and sell as individual rows. This project:

1. Groups Buy to Open / Sell to Close pairs into single position rows
2. Splits the combined TOS symbol format (MSFT 05/15/2026 440.00 C) into individual columns
3. Calculates per-trade P&L using proportional cost allocation across multiple close dates (FIFO)
4. Tracks open positions with remaining cost basis
5. Visualises everything in an interactive dashboard with charts, a P&L calendar, and a full trade journal


## Running locally
Because the app loads JS and CSS from the src/ folder, it needs a local server — browsers block local file imports for security. Two easy options:
VS Code + Live Server (recommended)

1. Install VS Code
2. Install the Live Server extension by Ritwick Dey (Ctrl+Shift+X → search "Live Server")
3. Open the project folder in VS Code
4. Right-click index.html → Open with Live Server
5. Browser opens at http://127.0.0.1:5500


## How to use

1. In ThinkorSwim, export your transaction history as a CSV (Monitor → Account Statement → Export)
2. Open the dashboard in your browser
3. Click Load CSV / Excel or drag and drop the file onto the drop zone
4. The dashboard groups all trades and renders automatically


## Supported input format
The app handles the raw TOS export directly — no pre-formatting needed:

Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount

Non-trade rows (transfers, journal entries, money movement) are filtered out automatically.



## Features
3 tabs
- Overview — all positions combined
- Day Trades — positions held under 24 hours
- Swing Trades — positions held 24 hours or longer

Each tab includes
- KPI strip (P&L, win rate, open positions, capital at risk, avg P&L/trade, hold time)
- Charts (P&L by symbol, win rate by symbol, status mix / avg hold time)
- Symbol cards with win rate bar
- Sortable, filterable, searchable positions table with pagination

Overview tab also includes
- P&L Calendar — monthly view of daily closed P&L, click any day for a trade breakdown
