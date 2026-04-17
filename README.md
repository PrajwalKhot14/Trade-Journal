# Trade-Journal

A ThinkorSwim options trade grouper and interactive dashboard for tracking trades.

## What it does
ThinkorSwim exports every buy and sell as individual rows. This project:

1. Groups Buy to Open / Sell to Close pairs into single position rows
2. Splits the combined TOS symbol format (MSFT 05/15/2026 440.00 C) into individual columns
3. Calculates per-trade P&L using proportional cost allocation across multiple close dates (FIFO)
4. Tracks open positions with remaining cost basis
5. Visualises everything in an interactive dashboard with charts, a P&L calendar, and a full trade journal

Everything runs locally — your data never leaves your browser.


## Running locally

```
python server.py
# open http://localhost:5050
```
- Drop your daily TOS exports into the data/ folder. The server automatically picks up the newest CSV by modified date every time you refresh the page.
- If port 5050 is blocked, change PORT = 5050 in serve.py to any free port (e.g. 3000, 9000).



## Supported input format
The app handles the raw TOS export directly — no pre-formatting needed:

Date|Action|Symbol|Description|Quantity|Price|Fees & Comm|Amount

Non-trade rows (transfers, journal entries, money movement) are filtered out automatically.



## Features
3 tabs
- Overview — all positions combined
- Day Trades — positions held under 24 hours
- Swing Trades — positions held 24 hours or longer

Each tab includes
- KPI strip (P&L, open positions, capital at risk, avg P&L/trade)
- Charts (P&L by symbol, cumulative P&L)
- Symbol cards with win rate bar
- Sortable, filterable, searchable positions table with pagination

Overview tab also includes
- P&L Calendar — monthly view of daily closed P&L, click any day for a trade breakdown
- Date filter — filter everything by close date range with quick presets (Week, Month, Last Month, YTD, All)


## Sample data
A sample_tos_export.csv is included covering day trades, swing trades, partial closes, open positions, and a non-trade row — useful for testing or a GitHub demo.

<img width="1897" height="699" alt="image" src="https://github.com/user-attachments/assets/a61ecffe-8d9d-4683-88e7-70b619931574" />
<img width="1900" height="698" alt="image" src="https://github.com/user-attachments/assets/cf53256d-8c54-4f31-9cad-82ef6906b340" />
<img width="1891" height="933" alt="image" src="https://github.com/user-attachments/assets/5b498a34-c129-4d7c-b1b2-a12471a768d2" />
<img width="1894" height="828" alt="image" src="https://github.com/user-attachments/assets/04198a4a-1331-4748-9a4d-8f505a4a2d36" />
<img width="1888" height="836" alt="image" src="https://github.com/user-attachments/assets/01ba47c0-0a20-421c-8737-9c8064de5600" />



