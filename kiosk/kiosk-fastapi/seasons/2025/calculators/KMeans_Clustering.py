from typing import Callable, Any

import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler


def compute_ai_ratings(
        per_match_data: dict,
        field_extractors: list[Callable[[str, str, str, dict], dict]],
        derived_feature_functions: list[Callable[[pd.DataFrame], pd.DataFrame]],
        category_calculators: list[dict[str, Any]],  # [{"name": "auto", "fn": lambda df: ...}, ...]
        n_clusters: int = 5,
):
    # 1. Extract basic features
    rows = []
    for match_type, matches in per_match_data.items():
        for match_num, match in matches.items():
            if not isinstance(match, dict): continue
            for color in ['red', 'blue']:
                if color not in match: continue
                for team, data in match[color].items():
                    row = {
                        "match_type": match_type,
                        "match_num": int(match_num),
                        "team_num": int(team),
                        "alliance_color": f"{color}Alliance"
                    }
                    for extractor in field_extractors:
                        row |= extractor(match_type, match_num, color, data)
                    rows.append(row)

    df = pd.DataFrame(rows)

    # 2. Apply derived features
    for fn in derived_feature_functions:
        df = fn(df)

    # 3. Apply category calculators
    category_names = []
    for calc in category_calculators:
        name = calc["name"]
        fn = calc["fn"]
        df[name] = fn(df)
        category_names.append(name)

    # 4. Aggregate per team
    agg = {col: "mean" for col in df.columns if col not in ["match_type", "match_num", "team_num", "alliance_color"]}
    stats = df.groupby("team_num").agg(agg).fillna(0)

    # 5. Clustering on category fields
    X = stats[category_names].copy()
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    stats["cluster"] = kmeans.fit_predict(X_scaled)

    # --- Ranked K-Means: rank teams within each cluster ---
    centroids = kmeans.cluster_centers_
    scores = []
    for i, (team, row) in enumerate(stats.iterrows()):
        c = int(row["cluster"])
        w = abs(centroids[c]) / (abs(centroids[c]).sum() + 1e-9)  # avoid div by 0
        s = float((X_scaled[i] * w).sum())
        scores.append(s)

    stats["intra_rank_score"] = scores
    stats["cluster_rank"] = (
        stats.groupby("cluster")["intra_rank_score"]
        .rank(ascending=False, method="dense")
        .astype(int)
    )

    # 6. Format output

    # (a) Per-team detailed output
    per_team_output = {
        team: {
            **{cat: round(row[cat].item(), 3) for cat in category_names},
            "cluster": int(row["cluster"])
        }
        for team, row in stats.iterrows()
    }

    # (b) Per-cluster averages
    cluster_summary = (
        stats
        .groupby("cluster")[category_names]
        .mean()
        .round(2)
        .to_dict(orient="index")
    )

    return {
        "team_stats": per_team_output,
        "cluster_summary": cluster_summary,
        "raw_stats": stats
    }
