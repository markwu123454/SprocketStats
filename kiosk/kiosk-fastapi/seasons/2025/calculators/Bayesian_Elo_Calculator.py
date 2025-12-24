"""
Feature-based Elo Rating System (Coulom-style)

This module provides a general-purpose implementation of multi-agent feature Elo,
suitable for settings like robotics competitions or game strategy modeling where each
entity (e.g., robot) can be represented as a combination of abstract feature tags.

Includes:
- Elo training from matchups of feature teams
- Quantile-based feature tagging
- Per-team axis score reconstruction from feature ratings

How to Use
----------

1. Prepare match-level data:
   Each item should be a dict with fields extractable into a scalar metric (e.g., coral cycles, auto points).

   Example:
       data = [{"team": 1, "coral": 12}, {"team": 2, "coral": 6}, ...]

2. Build a quantile-based feature extractor:
       from feature_elo_module import make_quantile_binner

       coral_binner = make_quantile_binner(
           data,
           extract_fn=lambda d: d["coral"],
           n_bins=4,
           tag_prefix="coral",
           quantile_labels=["low", "mid", "high", "elite"]
       )

   This returns a function: `coral_binner(team_match_dict) → ["coral_high"]`

3. Format matchups:
   You must create matchups in the form:
       List[Tuple[List[str], List[str], float]]
   Where each tuple is:
       (red_features, blue_features, outcome)

   Example:
       games = [
           (["coral_high"], ["coral_low"], 1.0),  # red wins
           (["coral_mid"], ["coral_mid"], 0.5),   # tie
           ...
       ]

4. Train feature-level Elo:
       from feature_elo_module import train_feature_elo

       elo_table = train_feature_elo(games)

   Output:
       {
           "coral_low": 978.1,
           "coral_high": 1023.7,
           ...
       }

5. Score a team over multiple matches:
       from feature_elo_module import team_axis_score

       team_score = team_axis_score(team_matches, elo_table, coral_binner)

   Where:
       team_matches = [match1_dict, match2_dict, ...]  # same format as original data
"""

from typing import Callable, List, Tuple, Sequence
from collections import defaultdict
import pandas as pd
import numpy as np


def compute_feature_elos(team_match_records, per_match_data, per_team_data, feature_axes):
    elos, binners = {}, {}

    # Build binners + train Elo per axis
    for axis, extractor in feature_axes.items():
        binner = make_quantile_binner(team_match_records, extractor, tag_prefix=axis)
        binners[axis] = binner
        elos[axis] = train_feature_elo(build_elo_games(per_match_data, binner))

    # Apply to each team
    for team, tdata in per_team_data.items():
        team_matches = [
            per_match_data[typ][num][alli][team]
            for typ, num in tdata["match"]
            for alli in ["red", "blue"]
            if team in per_match_data[typ][num].get(alli, {})
        ]
        tdata["elo_featured"] = {
            axis: team_axis_score(team_matches, elos[axis], binners[axis])
            for axis in feature_axes
        }

    return per_team_data



def expected(r_a: float, r_b: float) -> float:
    """Compute the expected win probability of rating A vs B using Elo formula."""
    return 1 / (1 + 10 ** ((r_b - r_a) / 400))


def k_factor(n_games: int, k_start: float = 32.0, k_min: float = 8.0) -> float:
    """Compute dynamic K factor based on the number of games played."""
    if n_games < 30:
        return k_start
    if n_games > 200:
        return k_min
    return k_start - (k_start - k_min) * ((n_games - 30) / 170)


def train_feature_elo(
        games: Sequence[Tuple[List[str], List[str], float]],
        base_rating: float = 1000.0,
        k_start: float = 32.0,
        k_min: float = 8.0,
        virtual_wl: int = 1,
        iterations: int = 3
) -> dict[str, float]:
    """Train Coulom-style Elo ratings for feature teams over multiple match outcomes."""
    rating = defaultdict(lambda: base_rating)
    games_played = defaultdict(lambda: 2 * virtual_wl)

    for _ in range(iterations):
        for red_feats, blue_feats, result in games:
            red_avg = sum(rating[f] for f in red_feats) / len(red_feats)
            blue_avg = sum(rating[f] for f in blue_feats) / len(blue_feats)
            exp_red = expected(red_avg, blue_avg)
            delta = result - exp_red

            k_red = k_factor(sum(games_played[f] for f in red_feats) // len(red_feats), k_start, k_min)
            k_blue = k_factor(sum(games_played[f] for f in blue_feats) // len(blue_feats), k_start, k_min)

            adj_red = k_red * delta
            adj_blue = -k_blue * delta

            for f in red_feats:
                rating[f] += adj_red / len(red_feats)
                games_played[f] += 1
            for f in blue_feats:
                rating[f] += adj_blue / len(blue_feats)
                games_played[f] += 1

    return dict(rating)


def make_quantile_binner(
        data: List[dict],
        extract_fn: Callable[[dict], float],
        n_bins: int = 4,
        tag_prefix: str = "feature",
        quantile_labels: List[str] = None
) -> Callable[[dict], List[str]]:
    """Create a quantile-based feature tagger from scalar data."""
    values = [extract_fn(d) for d in data]
    bins = pd.qcut(values, q=n_bins, retbins=True, duplicates="drop")[1]

    if quantile_labels and len(quantile_labels) == len(bins) - 1:
        labels = quantile_labels
    else:
        labels = [f"{tag_prefix}_Q{i}" for i in range(1, len(bins))]

    def tag_fn(d: dict) -> List[str]:
        val = extract_fn(d)
        if val is None or pd.isna(val) or not np.isfinite(val):
            return []  # Skip bad input

        idx = int(np.digitize(val, bins[1:], right=True))

        # Clamp index to valid range
        if idx < 0 or idx >= len(labels):
            return []  # Out-of-range fallback

        return [labels[idx]]

    return tag_fn


def team_axis_score(
        team_matches: List[dict],
        axis_ratings: dict[str, float],
        feature_fn: Callable[[dict], List[str]]
) -> float:
    """Compute a team’s average axis score based on match feature tags and trained ratings."""
    scores = []
    for m in team_matches:
        feats = feature_fn(m)
        if feats:
            scores.append(sum(axis_ratings[f] for f in feats) / len(feats))
    return sum(scores) / len(scores) if scores else None



def build_elo_games(per_match_data, binner):
    games = []

    for mtype in per_match_data.values():
        for match in mtype.values():
            # ======= Validate presence of alliances =======
            if not isinstance(match, dict) or "red" not in match or "blue" not in match:
                continue

            red_alliance = match["red"]
            blue_alliance = match["blue"]

            # ======= Validate team counts and structure =======
            if not (isinstance(red_alliance, dict) and isinstance(blue_alliance, dict)):
                continue
            if len(red_alliance) != 3 or len(blue_alliance) != 3:
                continue

            try:
                red_feats = []
                blue_feats = []

                for d in red_alliance.values():
                    tags = binner(d)
                    if not tags:
                        raise ValueError("Missing red tags")
                    red_feats += tags

                for d in blue_alliance.values():
                    tags = binner(d)
                    if not tags:
                        raise ValueError("Missing blue tags")
                    blue_feats += tags

                red_score = sum(d["score_breakdown"]["total"] for d in red_alliance.values())
                blue_score = sum(d["score_breakdown"]["total"] for d in blue_alliance.values())

                if not isinstance(red_score, (int, float)) or not isinstance(blue_score, (int, float)):
                    continue

                result = 1.0 if red_score > blue_score else 0.0 if red_score < blue_score else 0.5
                games.append((red_feats, blue_feats, result))

            except (KeyError, TypeError, ValueError):
                # Skip malformed matches
                continue

    return games

