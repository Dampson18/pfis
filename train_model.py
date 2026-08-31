"""
Day 3 deliverable: feature engineering + robust ensemble model training.
Optimized for 100k records, 10-fold CV, and complex real-world patterns.
"""

import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import joblib

from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import (
    precision_recall_curve, average_precision_score, roc_auc_score,
    classification_report, confusion_matrix, RocCurveDisplay
)
from sklearn.preprocessing import RobustScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline

import lightgbm as lgb
import xgboost as xgb
from catboost import CatBoostClassifier
from sklearn.ensemble import VotingClassifier

# Configuration
DATA_PATH = "C:/Users/darkwa/Desktop/Projects/PFIS_nk/scamguard_day1-3/data/synthetic_transactions.csv"
PIPELINE_OUT = "C:/Users/darkwa/Desktop/Projects/PFIS_nk/scamguard_day1-3/models/pipeline.joblib"
REPORT_OUT = "C:/Users/darkwa/Desktop/Projects/PFIS_nk/scamguard_day1-3/docs/day3_evaluation_report.md"
PLOTS_OUT = "C:/Users/darkwa/Desktop/Projects/PFIS_nk/scamguard_day1-3/docs/model_evaluation_plots.png"

os.makedirs("C:/Users/darkwa/Desktop/Projects/PFIS_nk/scamguard_day1-3/models", exist_ok=True)
os.makedirs("C:/Users/darkwa/Desktop/Projects/PFIS_nk/scamguard_day1-3/docs", exist_ok=True)

# 1. Load Data
print("Loading data...")
df = pd.read_csv(DATA_PATH)
df['timestamp'] = pd.to_datetime(df['timestamp'])
df = df.sort_values('timestamp').reset_index(drop=True)

# 2. Feature Engineering
print("Engineering features...")
df['hour_of_day'] = df['timestamp'].dt.hour
df['day_of_week'] = df['timestamp'].dt.dayofweek
df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
df["amount_vs_sender_typical"] = df["amount"] / df["sender_typical_amount"].clip(lower=1)
df["tenure_diff_days"] = df["sender_tenure_days"] - df["recipient_account_age_days"]
df['credential_event_minutes_missing'] = (df['credential_event_minutes_before_txn'] == -1.0).astype(int)
df['credential_event_minutes_before_txn_imp'] = df['credential_event_minutes_before_txn'].replace(-1.0, 0)

df["credential_event_recent"] = (
    (df["has_credential_event"] == 1) &
    (df["credential_event_minutes_before_txn_imp"] >= 0) &
    (df["credential_event_minutes_before_txn_imp"] <= 15) &
    (df['credential_event_minutes_missing'] == 0)
).astype(int)

df["recipient_account_is_new"] = (df["recipient_account_age_days"] < 60).astype(int)
df["high_fanin_1h"] = (df["recipient_distinct_senders_1h"] >= 3).astype(int)

numerical_features = [
    "amount", "amount_vs_sender_typical", "tenure_diff_days", "recipient_account_age_days",
    "recipient_distinct_senders_1h", "recipient_distinct_senders_24h", "recipient_distinct_senders_7d",
    "credential_event_minutes_before_txn_imp", "credential_failed_attempts", "sender_age",
    "sender_tenure_days", "hour_of_day", "day_of_week"
]
categorical_features = ["channel", "currency", "credential_event_type"]
binary_features = [
    "recipient_is_new_to_sender", "recipient_account_is_new", "high_fanin_1h",
    "has_credential_event", "credential_event_recent", "is_weekend", "credential_event_minutes_missing"
]

feature_cols = numerical_features + categorical_features + binary_features
X = df[feature_cols].copy()
y = df["label"].values
X[categorical_features] = X[categorical_features].fillna('MISSING')

# 3. Pipeline Setup
preprocessor = ColumnTransformer(
    transformers=[
        ('num', RobustScaler(), numerical_features),
        ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), categorical_features)
    ],
    remainder='passthrough'
)

# Deep and regularized hyperparameters for generalization
models = {
    'LightGBM': lgb.LGBMClassifier(n_estimators=100, max_depth=12, learning_rate=0.03, num_leaves=64, random_state=42, n_jobs=-1, verbose=-1),
    'XGBoost': xgb.XGBClassifier(n_estimators=100, max_depth=12, learning_rate=0.03, random_state=42, n_jobs=-1),
    'CatBoost': CatBoostClassifier(iterations=100, depth=10, learning_rate=0.03, random_state=42, verbose=0, thread_count=-1)
}

# 4. 10-Fold Time-Based Cross Validation
print("Starting 10-fold CV training...")
tscv = TimeSeriesSplit(n_splits=10)
results = []
fig, axes = plt.subplots(1, 2, figsize=(16, 7))

for name, model in models.items():
    print(f"Evaluating {name}...")
    pipeline = ImbPipeline(steps=[
        ('preprocessor', preprocessor),
        ('smote', SMOTE(random_state=42)),
        ('classifier', model)
    ])

    cv_roc = []
    cv_pr = []
    
    # Store for plotting last fold
    lx, ly = None, None
    lprob = None

    for i, (train_idx, test_idx) in enumerate(tscv.split(X)):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]
        
        pipeline.fit(X_train, y_train)
        y_prob = pipeline.predict_proba(X_test)[:, 1]
        
        cv_roc.append(roc_auc_score(y_test, y_prob))
        cv_pr.append(average_precision_score(y_test, y_prob))
        
        lx, ly, lprob = X_test, y_test, y_prob
        print(f"  Fold {i+1} done")

    avg_roc = np.mean(cv_roc)
    avg_pr = np.mean(cv_pr)
    print(f"  {name} -> Avg ROC-AUC: {avg_roc:.4f}, Avg PR-AUC: {avg_pr:.4f}")

    results.append({'Model': name, 'ROC-AUC': avg_roc, 'PR-AUC': avg_pr})
    RocCurveDisplay.from_predictions(ly, lprob, name=f"{name}", ax=axes[0])

# 5. Final Ensemble Pipeline (Retrained with more estimators)
print("\nFitting Final Ensemble Pipeline (LGBM + XGB + CatBoost)...")
final_models = [
    ('lgbm', lgb.LGBMClassifier(n_estimators=300, max_depth=12, learning_rate=0.03, num_leaves=64, random_state=42, n_jobs=-1, verbose=-1)),
    ('xgb', xgb.XGBClassifier(n_estimators=300, max_depth=12, learning_rate=0.03, random_state=42, n_jobs=-1)),
    ('cat', CatBoostClassifier(iterations=300, depth=10, learning_rate=0.03, random_state=42, verbose=0, thread_count=-1))
]

ensemble_clf = VotingClassifier(estimators=final_models, voting='soft', weights=[1, 1, 1])

final_pipeline = ImbPipeline(steps=[
    ('preprocessor', preprocessor),
    ('smote', SMOTE(random_state=42)),
    ('classifier', ensemble_clf)
])

final_pipeline.fit(X, y)
joblib.dump(final_pipeline, PIPELINE_OUT)
print(f"Saved optimized Ensemble Pipeline to {PIPELINE_OUT}")

# Plotting and Reporting
axes[0].set_title("ROC Curves (Final CV Fold)")
axes[0].plot([0, 1], [0, 1], 'k--')
res_df = pd.DataFrame(results).sort_values(by='PR-AUC', ascending=True)
axes[1].barh(res_df['Model'], res_df['PR-AUC'], color='lightcoral')
axes[1].set_title('Avg PR-AUC (10-Fold CV)')
plt.tight_layout()
plt.savefig(PLOTS_OUT)

with open(REPORT_OUT, "w") as f:
    f.write("# Optimized Model Evaluation Report\n\n")
    f.write(f"Evaluated on {len(df)} transactions using 10-Fold TimeSeriesSplit.\n\n")
    f.write(pd.DataFrame(results).to_markdown(index=False))
    f.write("\n\n## Training Summary\n")
    f.write("- Data: Realistic distribution with high-fanin legitimate overlap.\n")
    f.write("- Models: Ensemble of Deep Trees (max_depth=10-12).\n")
    f.write("- Validation: 10-Fold CV ensures performance stability over time.\n")

print(f"Report written to {REPORT_OUT}")
