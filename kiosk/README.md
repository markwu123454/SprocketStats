## C# / WPF Basics for This Project

This section briefly explains C# and the WPF client.

---

### Solution vs Project

This repository contains both a **solution** and a **project**:

- **Solution:** `kiosk-wpf.App`
    - A Visual Studio container that groups related projects
    - Open this file when working in Visual Studio

- **Project:** `kiosk-wpf`
    - The actual buildable unit
    - Produces the final executable: `kiosk-wpf.App.exe`
    - Defines dependencies, build targets, and output settings

In practice:
- You open the **solution**
- You build the **project**

---

### File Types Used in This Project

The WPF UI is composed of three primary file types:

#### `.xaml`
- Defines **UI layout only**
- Similar to HTML
- Should not contain application logic

#### `.xaml.cs`
- “Code-behind” for a XAML file
- Used only for:
    - Initial setup
    - Wiring events
    - Minimal UI-related glue code
- Should remain **thin**

#### `.cs`
- Pure C# source files
- Contains:
    - ViewModels
    - Services
    - Models
    - Application logic

**Rule of thumb:**
If you are writing logic, it almost certainly belongs in a `.cs` file, not in `.xaml.cs`.

---

### Application Entry Point

The application starts at:

- `App.xaml` / `App.xaml.cs`
    - Application-level startup
    - Global configuration

The primary UI window is:

- `MainWindow.xaml` / `MainWindow.xaml.cs`
    - Root window of the application
    - Hosts the main UI content

There is also a dedicated view for configuration:

- `SettingsView.xaml` / `SettingsView.xaml.cs` / `SettingsView.json`
    - Builds and displays the settings panel
    - Settings are defined declaratively in JSON

---

## Backend Communication Model

The WPF client communicates with the backend **exclusively via WebSockets**, not HTTP.

#### Verifying the Backend Is Running

When the backend starts successfully, it prints a **large, obvious purple
`SPROCKETSTAT` ASCII art banner** to the console.

If you do not see this banner, the backend is not running correctly.

This check also works in the final build exe.

---

### WebSocket Message Protocol

All WebSocket messages use a `type` field to indicate their purpose.

#### Messages Sent from the UI → Backend

The client sends messages with the following `type` values:

- `"command"`
    - Triggers backend actions(download data, run calculator, upload data)

- `"set_settings"`
    - Sends settings changes from the SettingsView to the backend

- `"python"`
    - Directly execute python commands the user types in the console

#### Messages Sent from Backend → UI

The backend sends messages with the following `type` values:

- `"log"`
    - Log output to the console

- `"state"`
    - Signals backend execution state
    - Used to lock or unlock UI actions to prevent race conditions

Any new WebSocket message types must be coordinated between the UI and backend.

---

### Guardrails

- Do **not** introduce HTTP calls unless explicitly required
- All backend communication should remain centralized in the existing WebSocket layer
- Changes to message `type` values require backend changes as well


## Build the C# Application

### Repository Location

The WPF application lives at:

```text
<SprocketStats repo root>/kiosk/kiosk-wpf
```

All build commands should be run **from this directory**.

---

### Build & Publish (Windows x64)

This project is published as a **self-contained single executable** for Windows.

#### Step 1: Navigate to the project

```bash
cd SprocketStats/kiosk/kiosk-wpf
```

---

#### Step 2: Build the project

```bash
dotnet build
```

This verifies the project compiles successfully.

---

#### Step 3: Publish the executable

```bash
dotnet publish -c Release -r win-x64 /p:PublishSingleFile=true /p:SelfContained=true /p:IncludeNativeLibrariesForSelfExtract=true
```

**What this does:**

* `Release` — optimized build
* `win-x64` — Windows 64-bit target
* `PublishSingleFile=true` — produces a single `.exe`
* `SelfContained=true` — does NOT require .NET installed on the target machine
* `IncludeNativeLibrariesForSelfExtract=true` — ensures native dependencies work correctly

---

#### Step 4: Verify successful publish

You should see output similar to:

```text
kiosk-wpf.App net10.0-windows win-x64 succeeded (XXX ms) → <output path>
```

The output path is typically:

```text
kiosk-wpf.App/bin/Release/net10.0-windows/win-x64/publish/
```

---

### Running the App

Navigate to the publish directory:

```bash
cd kiosk-wpf.App/bin/Release/net10.0-windows/win-x64/publish/
```

The executable named `kiosk-wpf.App.exe` is the **final, distributable, self-contained desktop application**.

---

### Before Building a Release

Before building, ensure the application version constant is updated in:

```text
kiosk/kiosk-wpf/kiosk-wpf.App/MainWindow.xaml.cs
```

At the top of the file, update `private const string AppVersion`:

```csharp
private const string AppVersion = "v<YY>.<major>.<minor>";
```

Example:

```csharp
private const string AppVersion = "v26.0.0";
```

This value is used to identify and display the frontend version for releases and must match the GitHub release tag and release title.

---

### Notes


* The published `.exe` can be copied to another Windows machine and run directly
* No .NET runtime installation is required on the target machine
* If the app fails to start, check:

    * If `fastapi.exe` exists in the same folder and runs normally without error
    * Any running process on localhost port 8000
    * Windows permissions / antivirus interference

---

## Build the FastAPI Application (Python)

The FastAPI application is packaged as a **standalone Windows executable** for release.
Unlike the frontend and backend during development, this executable is **built and released manually**.

---

### Repository Location

The FastAPI application lives at:

```text
<SprocketStats repo root>/kiosk/kiosk-fastapi
````

All build commands should be run **from this directory**.

---

### Build (Windows)

The backend is built using **PyInstaller**.

#### Step 1: Navigate to the project

```bash
cd SprocketStats/kiosk/kiosk-fastapi
```

---

#### Step 2: Build the executable

```bash
pyinstaller --clean build.spec
```

This produces a standalone executable.

---

### Build Output

```text
kiosk-fastapi/dist/fastapi.exe
```

This `fastapi.exe` file is the backend executable used for releases.

---

### Before Building a Release

Before building a release executable, ensure:

1. All dependencies are pinned in:

   ```text
   kiosk/kiosk-fastapi/requirements.txt
   ```
   
2. The application version constant is updated in:

   ```text
   kiosk/kiosk-fastapi/main.py
    ```

    At the top of the file, update the `__version__` constant:

    ```python
    __version__ = "v<YY>.<major>.<minor>"
    ```

    Example:

    ```python
    __version__ = "v26.0.0"
    ```

    This value is used to identify the backend version for releases and must match
the GitHub release tag and release title.

3. The executable has been tested locally:

    * Run `fastapi.exe` directly
    * Verify it starts without errors
    * Verify expected endpoints respond correctly

---

### Notes & Guardrails

* If new dependencies are added (e.g. `matplotlib`, `scipy`):

    * Update `requirements.txt`
    * Update `build.spec` if required
* This executable is **not deployed automatically**
* The backend executable must be built **before** creating a GitHub release

---

## Releasing the Application (GitHub)

This section describes how to package and publish a **Windows executable release** of the application on GitHub.

---

### Release Artifacts

Each release **must include the following files**:

- `kiosk-wpf.App.exe` — WPF desktop application
- `fastapi.exe` — backend executable
- `.env.example` — environment variable template

These files should be bundled together into a single `.zip`.

---

### Release Versioning

Releases follow the version format:

```text
v<YY>.<major>.<minor>
```

Example:

```text
v25.1.0
```

This version string is used **consistently** for:

* Folder name
* Zip file name
* GitHub release title
* Git tag

---

### Step-by-Step Release Process

#### 1. Create the release folder

Create a folder named after the release version on your desktop:

```text
v<YY>.<major>.<minor>/
```

Place the following files inside:

```text
v<YY>.<major>.<minor>/
├─ kiosk-wpf.App.exe - follow "Build the C# Application" to get the exe
├─ fastapi.exe - follow "Build the FastAPI Application" to get the exe
└─ .env.example - copy from SprocketStats/kiosk/kiosk-fastapi/.env.example
```

---

#### 2. Create the ZIP archive

Zip the entire version folder:

```text
v<YY>.<major>.<minor>.zip
```

This `.zip` is the artifact uploaded to GitHub.

---

#### 3. Create the GitHub release

On GitHub:

1. Go to **Releases → Draft a new release**

2. Set:

    * **Release title:**

      ```text
      SprocketStat Analytics v<YY>.<major>.<minor>
      ```
    * **Tag:**

      ```text
      v<YY>.<major>.<minor>
      ```

      (Create the tag if it does not exist)

3. Upload:

    * `v<YY>.<major>.<minor>.zip`

---

#### 4. Write the changelog

Add a simple, human-readable changelog:

```markdown
- Change A
- Change B
- Fix C
```

Keep this concise — focus on user-visible changes.

---

#### 5. Pre-release (if applicable)

* If the release is not final:

    * Check **“This is a pre-release”**
* Otherwise:

    * Leave unchecked

---

#### 6. Publish

Click **Publish release**.

---

### Notes & Guardrails

* The `.env.example` file is required so users can configure their environment
* Do NOT include real secrets in any release artifact
* The backend (`fastapi.exe`) and UI (`kiosk-wpf.App.exe`) must always be released together
* Version naming must be consistent across:

    * Folder name
    * Zip file
    * GitHub release
    * Git tag