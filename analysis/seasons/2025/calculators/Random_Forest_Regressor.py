from sklearn.ensemble import RandomForestRegressor
from typing import Callable


class AspectRegressor:
    def __init__(self, aspects: list[str]):
        self.aspects = aspects
        self.models: dict[str, RandomForestRegressor] = {}

    def train(self, robot_match_history: list[dict]):
        for aspect in self.aspects:
            x_train, y_train = [], []
            for entry in robot_match_history:
                if aspect in entry["aspects"]:
                    x_train.append(entry["features"])
                    y_train.append(entry["aspects"][aspect])
            model = RandomForestRegressor(n_estimators=300, max_depth=10, n_jobs=-1)
            model.fit(x_train, y_train)
            self.models[aspect] = model

    def predict(self, robot_list: list[dict]) -> dict:
        result = {}
        for robot in robot_list:
            team_id = robot["team"]
            feats = robot["features"]
            team_pred = {}
            total = 0.0
            for aspect in self.aspects:
                try:
                    pred = float(self.models[aspect].predict([feats])[0])
                except Exception:
                    pred = 0.0
                team_pred[aspect] = pred
                total += pred
            team_pred["total"] = total
            result[team_id] = team_pred
        return result


def train_and_predict(
    robot_match_history: list[dict],
    next_match_robots: dict[str, list[dict]],
    aspects: list[str]
):
    regressor = AspectRegressor(aspects)
    regressor.train(robot_match_history)

    all_robots = [robot for teamlist in next_match_robots.values() for robot in teamlist]
    predictions = regressor.predict(all_robots)

    alliance_totals = {
        "red": {aspect: 0.0 for aspect in aspects},
        "blue": {aspect: 0.0 for aspect in aspects}
    }
    for alliance in ["red", "blue"]:
        for robot in next_match_robots[alliance]:
            team_id = robot["team"]
            for aspect in aspects:
                alliance_totals[alliance][aspect] += predictions[team_id][aspect]
        alliance_totals[alliance]["total"] = sum(alliance_totals[alliance][a] for a in aspects)

    return {
        "alliance_totals": alliance_totals,
        "robot_predictions": predictions
    }


def build_robot_match_history(
    raw_match_data: dict,
    team_features_fn: Callable[[int, str, int], list[float]],
    aspect_extractors: dict[str, Callable[[dict], float]],
    match_type: str = "qm"
) -> list[dict]:
    history = []
    match_type_data = raw_match_data.get(match_type, {})
    for match_num, alliances in match_type_data.items():
        for alliance, teams in alliances.items():
            for team_id, data in teams.items():
                try:
                    features = team_features_fn(team_id, match_type, match_num)
                    aspects = {
                        aspect: extractor(data)
                        for aspect, extractor in aspect_extractors.items()
                    }
                    history.append({
                        "match_type": match_type,
                        "match_num": match_num,
                        "alliance": alliance,
                        "features": features,
                        "aspects": aspects
                    })
                except Exception:
                    continue
    return history


def predict_all_playable_matches(
    raw_match_data: dict,
    team_features_fn: Callable[[int, str, int], list[float]],
    aspect_extractors: dict[str, Callable[[dict], float]],
        match_type: str = "qm"
) -> list[dict]:
    match_data = raw_match_data.get(match_type, {})
    match_entries = sorted(match_data.items(), key=lambda x: int(x[0]) if isinstance(x[0], str) else x[0])
    seen_teams: set[int] = set()
    all_results = []

    full_history = build_robot_match_history(
        raw_match_data,
        team_features_fn,
        aspect_extractors,
        match_type
    )

    for match_num, alliances in match_entries:
        red_teams = list(alliances.get("red", {}).keys())
        blue_teams = list(alliances.get("blue", {}).keys())
        all_teams = red_teams + blue_teams

        if not all(team in seen_teams for team in all_teams):
            seen_teams.update(all_teams)
            continue

        # Filter only prior matches for training
        history = [h for h in full_history if int(h["match_num"]) < int(match_num)]
        if not history:
            continue

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
        except Exception:
            continue

        print(f"Running random forest... ({match_num}/{match_entries[-1][0]})")
        result = train_and_predict(
            history,
            next_match_robots,
            list(aspect_extractors.keys())
        )

        robot_predictions = result["robot_predictions"]
        match_result = {
            "match_num": match_num,
            "red": red_teams,
            "blue": blue_teams,
            "predicted": {
                "red": {team: robot_predictions[team] for team in red_teams if team in robot_predictions},
                "blue": {team: robot_predictions[team] for team in blue_teams if team in robot_predictions}
            }
        }

        all_results.append(match_result)
        seen_teams.update(all_teams)

    return all_results
