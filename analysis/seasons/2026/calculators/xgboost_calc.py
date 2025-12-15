import numpy as np
import pandas as pd
import xgboost as xgb
import random
from sklearn.metrics import roc_auc_score

np.random.seed(random.randint(0,10))

NUM_SAMPLES = 100

data = pd.DataFrame({
    "auto_points": np.random.normal(15, 5, NUM_SAMPLES),
    "teleop_points": np.random.normal(60, 15, NUM_SAMPLES),
    "endgame_points": np.random.normal(20, 8, NUM_SAMPLES),
    "cycles": np.random.normal(10, 3, NUM_SAMPLES),
    "fouls": np.random.poisson(1.2, NUM_SAMPLES),
    "defense_rating": np.random.uniform(0, 5, NUM_SAMPLES),
    "partner_strength": np.random.normal(50, 10, NUM_SAMPLES),
    "opponent_strength": np.random.normal(50, 10, NUM_SAMPLES),
    "won_match": np.random.randint(0, 2, NUM_SAMPLES)
})
print(data)
X = data.drop(columns=["won_match"])
y = data["won_match"]

def predict_team_win_rate(team_matches_df, model):
    x_team = team_matches_df.drop(columns=["won_match"], errors="ignore")
    probs = model.predict_proba(x_team)[:, 1]
    return probs.mean()

x_train, y_train = X, y



def xgBoostAlg(data, min_train_size=50):
    predictions = []
    actuals = []

    feature_cols = [c for c in data.columns if c != "won_match"]

    for i in range(min_train_size, len(data)):
        train_data = data.iloc[:i]
        test_data = data.iloc[i:i + 1]

        x_train = train_data[feature_cols]
        y_train = train_data["won_match"]

        x_next = test_data[feature_cols]
        y_next = test_data["won_match"].values[0]

        model = xgb.XGBClassifier(
            objective="binary:logistic",
            device="cuda",
            n_estimators=500,
            max_depth=7,
            learning_rate=0.7,
            subsample=0.8,
            colsample_bytree=0.8,
            eval_metric="logloss",
            random_state=42
        )

        model.fit(x_train, y_train)

        prob = model.predict_proba(x_next)[0, 1]

        predictions.append(prob)
        actuals.append(y_next)
        #print(predictions[-1], actuals[-1])
        print(abs(predictions[-1]- actuals[-1]))


    return np.array(predictions), np.array(actuals)


if __name__ == "__main__":
    preds, actuals = xgBoostAlg(data)

    auc = roc_auc_score(actuals, preds)
    print(f"Rolling ROC AUC: {auc:.3f}")




