from sklearn.ensemble import RandomForestRegressor
from typing import Callable


# ============================================================
# Aspect Regressor for multi-aspect (coral, algae, climb, auto)
# ============================================================
class AspectRegressor:
    def __init__(self, aspects: list[str]):
        self.aspects = aspects
        self.models: dict[str, RandomForestRegressor] = {}

    def train(self, robot_match_history: list[dict]):
        """Train one RandomForest per aspect."""
        for aspect in self.aspects:
            x_train, y_train = [], []
            for entry in robot_match_history:
                if aspect in entry["aspects"]:
                    x_train.append(entry["features"])
                    y_train.append(entry["aspects"][aspect])

            if not x_train or not y_train:
                print(f"[WARN] Aspect '{aspect}' has no training samples.")
                continue

            model = RandomForestRegressor(
                n_estimators=300,
                max_depth=10,
                n_jobs=-1,
                random_state=42
            )
            model.fit(x_train, y_train)
            self.models[aspect] = model
            print(f"[INFO] Trained RF for aspect '{aspect}' with {len(x_train)} samples.")

    def predict(self, robot_list: list[dict]) -> dict:
        """Predict per-robot performance on all aspects."""
        result = {}
        for robot in robot_list:
            team_id = str(robot["team"])
            feats = robot["features"]

            team_pred = {}
            total = 0.0
            for aspect in self.aspects:
                if aspect not in self.models:
                    pred = 0.0
                else:
                    try:
                        pred = float(self.models[aspect].predict([feats])[0])
                    except Exception:
                        pred = 0.0
                team_pred[aspect] = pred
                total += pred
            team_pred["total"] = total
            result[team_id] = team_pred
        return result


# ============================================================
# Combined training + prediction helper
# ============================================================
def train_and_predict(
    robot_match_history: list[dict],
    next_match_robots: dict[str, list[dict]],
    aspects: list[str]
):
    """Train on past match history, then predict next match."""
    regressor = AspectRegressor(aspects)
    regressor.train(robot_match_history)

    # Ensure at least one trained model
    if not regressor.models:
        print("[WARN] No aspects trained — returning empty result.")
        return {"alliance_totals": {}, "robot_predictions": {}}

    all_robots = [r for lst in next_match_robots.values() for r in lst]
    predictions = regressor.predict(all_robots)

    alliance_totals = {"red": {}, "blue": {}}
    for alliance in ["red", "blue"]:
        alliance_totals[alliance] = {a: 0.0 for a in aspects}
        for robot in next_match_robots[alliance]:
            tid = str(robot["team"])
            for aspect in aspects:
                alliance_totals[alliance][aspect] += predictions.get(tid, {}).get(aspect, 0.0)
        alliance_totals[alliance]["total"] = sum(alliance_totals[alliance].values())

    return {
        "alliance_totals": alliance_totals,
        "robot_predictions": predictions
    }


# ============================================================
# Convert match data to feature/aspect training records
# ============================================================
def build_robot_match_history(
    raw_match_data: dict,
    team_features_fn: Callable[[str, str, int], list[float]],
    aspect_extractors: dict[str, Callable[[dict], float]],
    match_type: str = "qm"
) -> list[dict]:
    """Transform per-match JSON structure into flat training records."""
    history = []
    match_type_data = raw_match_data.get(match_type, {})

    for match_num, alliances in match_type_data.items():
        for alliance, teams in alliances.items():
            for team_id, data in teams.items():
                tid = str(team_id)
                try:
                    features = team_features_fn(tid, match_type, int(match_num))
                    aspects = {
                        aspect: extractor(data)
                        for aspect, extractor in aspect_extractors.items()
                    }
                    history.append({
                        "match_type": match_type,
                        "match_num": int(match_num),
                        "alliance": alliance,
                        "team": tid,
                        "features": features,
                        "aspects": aspects
                    })
                except Exception as e:
                    print(f"[WARN] Failed to process team {tid} in match {match_num}: {e}")
                    continue

    print(f"[INFO] Built robot match history with {len(history)} entries.")
    return history


# ============================================================
# Predict outcomes for all playable matches
# ============================================================
def predict_all_playable_matches(
    raw_match_data: dict,
    team_features_fn: Callable[[str, str, int], list[float]],
    aspect_extractors: dict[str, Callable[[dict], float]],
    match_type: str = "qm"
) -> list[dict]:
    """Run Random Forest predictions for each match with prior data."""
    match_data = raw_match_data.get(match_type, {})
    match_entries = sorted(
        match_data.items(),
        key=lambda x: int(x[0]) if isinstance(x[0], str) else x[0]
    )

    all_results = []
    full_history = build_robot_match_history(
        raw_match_data,
        team_features_fn,
        aspect_extractors,
        match_type
    )

    seen_teams: set[str] = set()

    for match_num, alliances in match_entries:
        match_num = int(match_num)
        red_teams = [str(t) for t in alliances.get("red", {}).keys()]
        blue_teams = [str(t) for t in alliances.get("blue", {}).keys()]
        all_teams = red_teams + blue_teams

        # Require all teams to have been seen before
        if not all(t in seen_teams for t in all_teams):
            seen_teams.update(all_teams)
            continue

        # Use all prior matches for training
        history = [h for h in full_history if h["match_num"] < match_num]
        if len(history) < 3:
            print(f"[WARN] Skipping match {match_num}: only {len(history)} training samples.")
            continue

        # Build robot feature sets
        try:
            next_match_robots = {
                "red": [
                    {"team": tid, "features": team_features_fn(tid, match_type, match_num)}
                    for tid in red_teams
                ],
                "blue": [
                    {"team": tid, "features": team_features_fn(tid, match_type, match_num)}
                    for tid in blue_teams
                ]
            }
        except Exception as e:
            print(f"[ERROR] Feature extraction failed for match {match_num}: {e}")
            continue

        print(f"[INFO] Running Random Forest for match {match_num}...")
        result = train_and_predict(history, next_match_robots, list(aspect_extractors.keys()))

        robot_predictions = result["robot_predictions"]
        match_result = {
            "match_num": match_num,
            "red": red_teams,
            "blue": blue_teams,
            "predicted": {
                "red": {t: robot_predictions.get(t, {}) for t in red_teams},
                "blue": {t: robot_predictions.get(t, {}) for t in blue_teams}
            }
        }

        all_results.append(match_result)
        seen_teams.update(all_teams)

    print(f"[INFO] Completed Random Forest predictions for {len(all_results)} matches.")
    return all_results
