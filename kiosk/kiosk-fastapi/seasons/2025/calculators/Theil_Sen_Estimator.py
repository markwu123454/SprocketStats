def theil_sen_estimator(y: list[float], x: list[float] = None) -> tuple[float, float]:
    """
    Computes the Theil-Sen estimator.
    If x is not provided, assumes x = [0, 1, 2, ..., len(y) - 1].
    Returns: (slope, intercept)
    """
    if x is None:
        x = list(range(len(y)))
    if len(x) != len(y):
        raise ValueError("x and y must be the same length")
    if len(y) < 2:
        raise ValueError("Need at least 2 points")

    # Compute all pairwise slopes
    slopes = []
    for i in range(len(x)):
        for j in range(i + 1, len(x)):
            dx = x[j] - x[i]
            if dx != 0:
                dy = y[j] - y[i]
                slopes.append(dy / dx)

    if not slopes:
        raise ValueError("All x values are identical")

    slope = median(slopes)
    intercept = median([y[i] - slope * x[i] for i in range(len(x))])

    return slope, intercept


def median(data: list[float]) -> float:
    s = sorted(data)
    n = len(s)
    mid = n // 2
    return 0.5 * (s[mid - 1] + s[mid]) if n % 2 == 0 else s[mid]
