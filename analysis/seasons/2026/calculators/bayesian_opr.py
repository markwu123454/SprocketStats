import numpy as np


"""
FAST LATENT OFFENSE + DEFENSE MODEL (RIDGE REGRESSION)
------------------------------------------------------

This includes fixes:
 - Removed deprecated np.sum(generator) usage
 - Synthetic data generator now matches the model structure
 - Noise model corrected to be realistic and mathematically consistent
"""


def fit_latent_offdef_linear(team_lists, contributions, num_teams, reg=1.0):
    """
    Fit the latent offense + defense model using ridge regression.

    contribution[r] = O[r] - sum(D[o] for o in opponents) + noise
    """

    O_offset = 0
    D_offset = num_teams
    num_params = num_teams * 2

    rows = []
    ys = []

    for match, teams in enumerate(team_lists):
        blue = teams["blue"]
        red = teams["red"]

        for team_id, score in contributions[match].items():

            row = np.zeros(num_params)

            # Offensive coefficient for the robot
            row[O_offset + team_id] = 1.0

            # Defensive suppression from opponents
            opponents = red if team_id in blue else blue
            for opp in opponents:
                row[D_offset + opp] -= 1.0

            rows.append(row)
            ys.append(score)

    X = np.vstack(rows)
    y = np.array(ys)

    # Closed-form ridge
    regI = reg * np.eye(num_params)
    XtX = X.T @ X
    XtY = X.T @ y

    theta = np.linalg.solve(XtX + regI, XtY)

    offense = theta[:num_teams]
    defense = theta[num_teams:]

    return {
        "offense": offense,
        "defense": defense,
        "theta": theta,
    }


def generate_random_matches(num_matches=15, num_teams=12):
    """Generate random alliances for synthetic matches."""
    team_lists = []
    rng = np.random.default_rng()

    for _ in range(num_matches):
        teams = rng.choice(num_teams, size=6, replace=False)
        team_lists.append({
            "blue": list(teams[:3]),
            "red": list(teams[3:])
        })

    return team_lists


def generate_synthetic_contributions(team_lists, true_off, true_def, off_std, def_std):
    """
    Generate synthetic robot-level contributions consistent with the regression model:

        contribution = O[r] - sum(D[o] for o in opponents) + noise

    Noise variance matches the structure of the model.
    """

    contributions = []
    rng = np.random.default_rng()

    for match in team_lists:
        blue = match["blue"]
        red = match["red"]

        mapping = {}

        for r in blue + red:
            opponents = red if r in blue else blue

            # EXPECTED VALUE
            expected = true_off[r] - sum(true_def[o] for o in opponents)

            # NOISE MODEL — realistic & consistent
            noise_scale = np.sqrt(
                off_std[r] ** 2 + sum(def_std[o] ** 2 for o in opponents)
            )
            noise = rng.normal(0, noise_scale)

            mapping[r] = expected + noise

        contributions.append(mapping)

    return contributions


if __name__ == "__main__":

    num_matches = 500
    num_teams = 12

    rng = np.random.default_rng()

    # TRUE MODEL PARAMETERS
    true_off = rng.uniform(3, 10, size=num_teams)
    true_def = rng.uniform(0.5, 3, size=num_teams)
    off_std = rng.uniform(0.5, 2, size=num_teams)
    def_std = rng.uniform(0.2, 1, size=num_teams)

    # Force special outliers
    true_off[0] *= 3
    true_def[1] *= 3

    print("TRUE OFFENSE:", true_off)
    print("TRUE DEFENSE:", true_def)

    # GENERATE MATCH STRUCTURE
    team_lists = generate_random_matches(num_matches, num_teams)

    # SYNTHETIC CONTRIBUTIONS
    contributions = generate_synthetic_contributions(
        team_lists, true_off, true_def, off_std, def_std
    )

    # FIT SOLVER
    results = fit_latent_offdef_linear(team_lists, contributions, num_teams)

    learned_off = results["offense"]
    learned_def = results["defense"]

    print("\n===== OFFENSE: TRUE vs LEARNED =====")
    for t in range(num_teams):
        print(f"Team {t:2d}: true={true_off[t]:6.2f}   learned={learned_off[t]:8.2f}")

    print("\n===== DEFENSE: TRUE vs LEARNED =====")
    print("(NOTE: learned defense is NEGATIVE; stronger defense = more negative)")
    for t in range(num_teams):
        print(f"Team {t:2d}: true={true_def[t]:6.2f}   learned={learned_def[t]:8.2f}")

    print("\nDONE.")
