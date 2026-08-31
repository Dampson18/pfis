"""
Day 2 deliverable: calibrated synthetic transaction data generator.
Refactored for Demo Tooling PRD.
Increased complexity and dataset size for robust model training.
"""

import csv
import random
import os
import numpy as np
from datetime import datetime, timedelta

class TransactionStreamer:
    def __init__(self, seed=42):
        self.seed = seed
        random.seed(self.seed)
        np.random.seed(self.seed)

        self.N_SENDERS = 5000
        self.N_LEGIT_RECIPIENTS = 2500
        self.N_COLLECTOR_RECIPIENTS = 80
        self.CHANNELS = ["p2p", "cash_out", "cash_in", "bill_payment", "merchant_payment", "airtime_topup"]

        self.sender_ids = [f"SND-{i:05d}" for i in range(self.N_SENDERS)]
        self.legit_recipient_ids = [f"REC-{i:05d}" for i in range(self.N_LEGIT_RECIPIENTS)]
        self.collector_recipient_ids = [f"COL-{i:03d}" for i in range(self.N_COLLECTOR_RECIPIENTS)]

        # High-fanin legitimate recipients (merchants, susu, etc.)
        # Increased count and variety to overlap with fraud collector behavior
        self.legit_merchants = set(random.sample(self.legit_recipient_ids, k=100))
        self.legit_high_fanin_recipients = set(random.sample(list(set(self.legit_recipient_ids) - self.legit_merchants), k=50))

        self.sender_profiles = {}
        for sid in self.sender_ids:
            # Pareto-like distribution for typical amounts
            typical = float(np.random.lognormal(mean=5.5, sigma=1.0)) # Median ~244, range can go high
            self.sender_profiles[sid] = {
                "typical_amount": max(20, min(5000, typical)),
                "age": random.randint(18, 80),
                "tenure_days": random.randint(1, 3000),
                "known_recipients": random.sample(self.legit_recipient_ids, k=random.randint(1, 12)),
                "risk_tolerance": random.random(), # Personality factor
            }

        self.collector_history = {cid: [] for cid in self.collector_recipient_ids + list(self.legit_high_fanin_recipients) + list(self.legit_merchants)}
        self.base_time = datetime(2026, 6, 1, 0, 0, 0)
        self.txn_count = 0
        self.last_scam_recipient = None

    def _distinct_senders_within(self, cid, ts, window):
        cutoff = ts - window
        recent = [s for (s, t) in self.collector_history.get(cid, []) if t >= cutoff]
        return len(set(recent))

    def get_next(self, is_scam=None, scenario=None):
        txn_id = f"TXN-{self.txn_count:07d}"
        self.txn_count += 1

        sender_id = random.choice(self.sender_ids)
        profile = self.sender_profiles[sender_id]
        # Realistic time distribution (more txns during day)
        p = np.array([0.01, 0.005, 0.005, 0.01, 0.02, 0.04, 0.07, 0.08, 0.08, 0.07, 0.06, 0.06, 0.06, 0.06, 0.07, 0.08, 0.08, 0.06, 0.04, 0.03, 0.02, 0.02, 0.01, 0.01])
        p /= p.sum() # Normalize to ensure it sums to 1.0
        hour = int(np.random.choice(range(24), p=p))
        ts = self.base_time + timedelta(days=random.randint(0, 90), hours=hour, minutes=random.randint(0, 59))

        force_creds = None
        recipient_id = None

        if scenario == 'scam_with_creds':
            is_scam = True
            force_creds = True
        elif scenario == 'scam_repeat_to_blacklisted_recipient':
            is_scam = True
            force_creds = False
            if self.last_scam_recipient:
                recipient_id = self.last_scam_recipient
        elif scenario == 'safe':
            is_scam = False
            force_creds = False

        if is_scam is None:
            # Natural scam rate ~2%
            is_scam = random.random() < 0.02

        if is_scam:
            if not recipient_id:
                recipient_id = random.choice(self.collector_recipient_ids)

            self.last_scam_recipient = recipient_id
            recipient_is_new_to_sender = recipient_id not in profile["known_recipients"]

            # Scams are often larger, but not always. Use a mixture.
            if random.random() < 0.4:
                # "Empty the wallet" or large request
                amount = round(profile["typical_amount"] * random.uniform(5.0, 15.0), 2)
            else:
                # Normal-ish looking request
                amount = round(random.uniform(100, 3000), 2)

            amount = min(amount, 20000)
            channel = random.choices(["p2p", "cash_out", "cash_in"], weights=[0.6, 0.3, 0.1])[0]

            if force_creds is True:
                has_cred_event = True
            elif force_creds is False:
                has_cred_event = False
            else:
                # Not all scams have credential events (e.g. social engineering without direct takeover)
                has_cred_event = random.random() < 0.55

            if has_cred_event:
                cred_event_type = random.choices(["otp_requested", "pin_failed_then_success", "pin_failed"], weights=[0.4, 0.4, 0.2])[0]
                cred_minutes_before = random.uniform(0.1, 45) # Much wider window
                failed_attempts = random.randint(1, 5) if "failed" in cred_event_type else 0
            else:
                cred_event_type = None
                cred_minutes_before = None
                failed_attempts = 0

            self.collector_history.setdefault(recipient_id, [])
            self.collector_history[recipient_id].append((sender_id, ts))

        else:
            # Legitimate Transaction
            # 15% go to merchants (high volume, established)
            if random.random() < 0.15:
                recipient_id = random.choice(list(self.legit_merchants))
                amount = round(random.uniform(10, 5000), 2)
                channel = random.choice(self.CHANNELS)
            # 5% go to high-fanin social (susu, church) - these mimic fraud signals
            elif random.random() < 0.05:
                recipient_id = random.choice(list(self.legit_high_fanin_recipients))
                amount = round(profile["typical_amount"] * random.uniform(0.5, 3.0), 2)
                channel = "p2p"
            else:
                # Standard P2P
                use_known = random.random() < 0.65
                if use_known and profile["known_recipients"]:
                    recipient_id = random.choice(profile["known_recipients"])
                else:
                    recipient_id = random.choice(self.legit_recipient_ids)

                amount = round(profile["typical_amount"] * np.random.gamma(shape=2.0, scale=0.5), 2)
                channel = random.choices(self.CHANNELS, weights=[0.4, 0.1, 0.1, 0.1, 0.2, 0.1])[0]

            amount = min(amount, 20000)
            recipient_is_new_to_sender = recipient_id not in profile["known_recipients"]

            # Legit users also have credential events occasionally
            has_cred_event = random.random() < 0.08
            if has_cred_event:
                cred_event_type = random.choice(["otp_requested", "pin_failed_then_success", "pin_failed"])
                cred_minutes_before = random.uniform(0.1, 120)
                failed_attempts = random.randint(1, 2)
            else:
                cred_event_type = None
                cred_minutes_before = None
                failed_attempts = 0

            if recipient_id in self.collector_history:
                self.collector_history[recipient_id].append((sender_id, ts))

        # compute features
        if recipient_id in self.legit_merchants:
            recipient_account_age_days = random.randint(365, 5000)
            recipient_type = "merchant"
        elif recipient_id in self.legit_high_fanin_recipients:
            recipient_account_age_days = random.randint(180, 2000)
            recipient_type = "high_fanin_legit"
        elif recipient_id in self.collector_recipient_ids:
            recipient_account_age_days = random.randint(1, 120) # Usually newer
            recipient_type = "collector"
        else:
            recipient_account_age_days = random.randint(10, 3000)
            recipient_type = "standard"

        fanin_1h = self._distinct_senders_within(recipient_id, ts, timedelta(hours=1))
        fanin_24h = self._distinct_senders_within(recipient_id, ts, timedelta(hours=24))
        fanin_7d = self._distinct_senders_within(recipient_id, ts, timedelta(days=7))

        return {
            "txn_id": txn_id,
            "sender_id": sender_id,
            "recipient_id": recipient_id,
            "amount": amount,
            "currency": "GHS",
            "channel": channel,
            "timestamp": ts.isoformat(),
            "sender_age": profile["age"],
            "sender_tenure_days": profile["tenure_days"],
            "sender_typical_amount": round(profile["typical_amount"], 2),
            "recipient_is_new_to_sender": int(recipient_is_new_to_sender),
            "recipient_account_age_days": recipient_account_age_days,
            "recipient_distinct_senders_1h": fanin_1h,
            "recipient_distinct_senders_24h": fanin_24h,
            "recipient_distinct_senders_7d": fanin_7d,
            "has_credential_event": int(has_cred_event),
            "credential_event_type": cred_event_type or "none",
            "credential_event_minutes_before_txn": cred_minutes_before if cred_minutes_before is not None else -1,
            "credential_failed_attempts": failed_attempts,
            "label": int(is_scam),
        }

def generate_batch(n_transactions=100000, scam_rate=0.025, output_path="data/synthetic_transactions.csv"):
    streamer = TransactionStreamer(seed=42)
    rows = []
    n_scam = 0

    print(f"Generating {n_transactions} transactions...")
    for i in range(n_transactions):
        # Maintain target scam rate with some randomness
        is_scam = (random.random() < scam_rate)
        if is_scam: n_scam += 1

        row = streamer.get_next(is_scam=is_scam)
        rows.append(row)
        if i % 10000 == 0 and i > 0:
            print(f"...{i} generated")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {n_transactions} transactions, {n_scam} scam-labeled ({n_scam/n_transactions:.2%})")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    data_path = os.path.join(project_root, "data", "synthetic_transactions.csv")
    generate_batch(output_path=data_path)
