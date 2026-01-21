import numpy as np
import matplotlib.pyplot as plt
from scipy.ndimage import gaussian_filter
from PIL import Image

def _rotate_180(x, y):
    return 1.0 - x, 1.0 - y


def _kde_density(points, weights, field_shape, sigma_px, min_density_frac):
    H, W = field_shape
    grid = np.zeros((H, W), dtype=float)

    for (x, y), w in zip(points, weights):
        x_px = int(x * W)
        y_px = int(y * H)
        if 0 <= x_px < W and 0 <= y_px < H:
            grid[y_px, x_px] += w

    grid_s = gaussian_filter(grid, sigma=sigma_px)
    min_density = min_density_frac * np.max(grid_s)
    return np.ma.masked_where(grid_s < min_density, grid_s)


def _kde_accuracy(points, attempts_w, makes_w, field_shape, sigma_px, min_density_frac):
    H, W = field_shape
    attempts = np.zeros((H, W), dtype=float)
    makes = np.zeros((H, W), dtype=float)

    for (x, y), a, m in zip(points, attempts_w, makes_w):
        x_px = int(x * W)
        y_px = int(y * H)
        if 0 <= x_px < W and 0 <= y_px < H:
            attempts[y_px, x_px] += a
            makes[y_px, x_px] += m

    attempts_s = gaussian_filter(attempts, sigma=sigma_px)
    makes_s = gaussian_filter(makes, sigma=sigma_px)

    with np.errstate(divide="ignore", invalid="ignore"):
        accuracy = makes_s / attempts_s

    min_density = min_density_frac * np.max(attempts_s)
    return np.ma.masked_where(attempts_s < min_density, accuracy)



def generate_three_shot_heatmaps(
    shots,
    field_image_path,
    sigma_px=10,
    min_density_frac=0.02,
    figsize=(6, 5),
):
    field = Image.open(field_image_path).convert("L")
    field_arr = np.asarray(field) / 255.0
    field_shape = field_arr.shape

    origin_pts, origin_attempts, origin_makes = [], [], []
    all_origin_pts, all_origin_w = [], []
    target_pts, target_w = [], []

    for s in shots:
        x1, y1 = 1.0 - s["x1"], 1.0 - s["y1"]
        x2, y2 = 1.0 - s["x2"], 1.0 - s["y2"]

        origin_pts.append((x1, y1))
        origin_attempts.append(s["fuelShot"])
        origin_makes.append(s["fuelScored"])

        all_origin_pts.append((x1, y1))
        all_origin_w.append(s["fuelShot"])

        target_pts.append((x2, y2))
        target_w.append(s["fuelShot"])

    accuracy_map = _kde_accuracy(
        origin_pts,
        origin_attempts,
        origin_makes,
        field_shape,
        sigma_px,
        min_density_frac,
    )

    origin_density_map = _kde_density(
        all_origin_pts,
        all_origin_w,
        field_shape,
        sigma_px,
        min_density_frac,
    )

    target_density_map = _kde_density(
        target_pts,
        target_w,
        field_shape,
        sigma_px,
        min_density_frac,
    )

    figures = []

    # 1. Accuracy-colored scored origins
    fig1 = plt.figure(figsize=figsize)
    plt.imshow(field_arr, cmap="gray", alpha=0.9)
    plt.imshow(accuracy_map, cmap="RdYlGn", vmin=0, vmax=1, alpha=0.75)
    plt.colorbar(label="Shot Accuracy")
    plt.title("Shot Origin Accuracy")
    plt.axis("off")
    figures.append(fig1)

    # 2. All shooting locations (density)
    fig2 = plt.figure(figsize=figsize)
    plt.imshow(field_arr, cmap="gray", alpha=0.9)
    plt.imshow(origin_density_map, cmap="viridis", alpha=0.75)
    plt.title("All Shooting Locations")
    plt.axis("off")
    figures.append(fig2)

    # 3. Shooting-to locations (density)
    fig3 = plt.figure(figsize=figsize)
    plt.imshow(field_arr, cmap="gray", alpha=0.9)
    plt.imshow(target_density_map, cmap="viridis", alpha=0.75)
    plt.title("Shot Target Locations")
    plt.axis("off")
    figures.append(fig3)

    return figures

if __name__ == "__main__":
    shots = [{'fuelScored': 0,
              'fuelShot': 14,
              'x1': 0.372881322903419,
              'x2': 0.8009459919715074,
              'y1': 0.8427276348439666,
              'y2': 0.22703980533803314},
             {'fuelScored': 0,
              'fuelShot': 2,
              'x1': 0.4103271481890495,
              'x2': 0.8691367728531606,
              'y1': 0.24201814988708736,
              'y2': 0.6937327625908825},
             {'fuelScored': 0,
              'fuelShot': 31,
              'x1': 0.2455656468454941,
              'x2': 0.39456051909857837,
              'y1': 0.728419375459523,
              'y2': 0.4864012255724355},
             {'fuelScored': 11,
              'fuelShot': 14,
              'x1': 0.8782026044280343,
              'x2': 0.6992510791638468,
              'y1': 0.8403626368716954,
              'y2': 0.5013795701214898},
             {'fuelScored': 17,
              'fuelShot': 14,
              'x1': 0.8900275942893903,
              'x2': 0.69570358220544,
              'y1': 0.3610563330420631,
              'y2': 0.49507293292010346},
             {'fuelScored': 2,
              'fuelShot': 21,
              'x1': 0.4773354481280696,
              'x2': 0.908159239395635,
              'y1': 0.2727631235266127,
              'y2': 0.2751281214988839},
             {'fuelScored': 0,
              'fuelShot': 4,
              'x1': 0.7993693326711608,
              'x2': 0.6917619068893197,
              'y1': 0.6480094444023028,
              'y2': 0.4982262154337914},
             {'fuelScored': 12,
              'fuelShot': 13,
              'x1': 0.7745368539623134,
              'x2': 0.6913677646186112,
              'y1': 0.8908159149178122,
              'y2': 0.5005912134060626},
             {'fuelScored': 0,
              'fuelShot': 26,
              'x1': 0.43673630424174603,
              'x2': 0.630271959610269,
              'y1': 0.27828140401257184,
              'y2': 0.914465894640524}]

    figs = generate_three_shot_heatmaps(
        shots=shots,
        field_image_path="field.png",
        sigma_px=10,
        min_density_frac=0.02,
    )

    for fig in figs:
        fig.show()
