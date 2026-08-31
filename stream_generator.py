import time
import requests
import argparse
import sys
import os

# Add the parent directory to sys.path so we can import from the same directory if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from generate_synthetic_data import TransactionStreamer

def run_streamer(api_url, interval, once=False):
    streamer = TransactionStreamer(seed=int(time.time()))
    print(f"Starting stream generator. Targeting {api_url} every {interval}s")

    loop_count = 0
    scenario = None

    while True:
        # Check for pending injection every 4 loops to reduce overhead
        if loop_count % 4 == 0:
            try:
                inject_resp = requests.get(f"{api_url}/demo/pending_injection", timeout=0.2)
                if inject_resp.status_code == 200:
                    data = inject_resp.json()
                    new_scenario = data.get("scenario")
                    if new_scenario:
                        scenario = new_scenario
                        print(f"\nQueued scenario: {scenario}")
            except Exception:
                pass

        txn = streamer.get_next(scenario=scenario)
        # Clear scenario once used
        scenario = None

        try:
            # Short timeout for POST to maintain loop cadence
            resp = requests.post(f"{api_url}/score", json=txn, timeout=0.5)
            if resp.status_code == 200:
                result = resp.json()
                # Use \r to keep line count low in console but show activity
                sys.stdout.write(f"\r[{txn['txn_id']}] {txn['amount']} GHS -> {result['risk_band']} ({result['risk_score']})      ")
                sys.stdout.flush()
            else:
                print(f"\nError scoring {txn['txn_id']}: {resp.status_code}")
        except Exception as e:
            print(f"\nFailed to connect: {e}")

        if once:
            break

        loop_count += 1
        time.sleep(interval)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:5001")
    parser.add_argument("--interval", type=float, default=0.5)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    run_streamer(args.url, args.interval, args.once)
