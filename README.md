# Logbook

## What This Is

Logbook is a personal bodybuilding logbook that you install on your iPhone from Safari. It does three things:

1. Tracks workouts (and shows what you did **last time** the moment you add an exercise).
2. Tracks progression per exercise (estimated 1RM, top weight, volume).
3. Tracks body weight and body-fat %.

It works offline, needs no account, and has no server. Your data is stored only on your phone.

It is built from plain HTML, CSS and JavaScript files. **There is nothing to build or install**: the files in this folder *are* the app. You upload them to GitHub and GitHub serves them as a website.

## Files

| File or folder | What it is |
| --- | --- |
| `index.html` | The page the app starts from. |
| `css/app.css` | All the styling, including Light and Dark Mode colors. |
| `js/` | The app itself. `logic.js` = the math (1RM, volume, Last Time, averages, backup checks). `db.js` = saving to the phone's database. `workout.js`, `progress.js`, `body.js`, `settings.js` = the screens. `exercises.js` = the built-in exercise list. `config.js` = the app name. |
| `manifest.webmanifest` | Tells the iPhone this is an installable app (name, icon, full-screen). |
| `sw.js` | The "service worker" that makes the app open without internet. |
| `icons/` | The Home Screen icon in the sizes iPhone needs. `icon.svg` is the original drawing. |
| `tests/` | Automatic checks of the math and of the whole app. Not needed to use the app. |
| `dev/` | Helper files for testing on a computer, including sample data. Not needed to use the app. |
| `package.json` | Shortcuts for the optional developer commands at the bottom of this page. |

## How to Upload to GitHub

You only need the GitHub website and a computer.

1. **Unzip** `logbook-pwa.zip`. You get a folder called `logbook-pwa`.
2. Sign in at [github.com](https://github.com). Click the **+** at the top right, then **New repository**.
3. Repository name: `logbook` (any name works). Choose **Public**. Leave everything else as it is. Click **Create repository**.
   - It has to be Public for free GitHub Pages. Only the app's code is public. Your workouts are never uploaded anywhere.
4. On the next page, click the link **uploading an existing file**.
5. Open the `logbook-pwa` folder on your computer. **Select everything inside it** (Ctrl+A on Windows, Cmd+A on Mac) and drag it all onto the GitHub page. Drag the *contents* of the folder, not the folder itself, so that `index.html` ends up at the top level.
6. Wait for the upload list to finish, then click **Commit changes**.
7. Check: the repository page should now show `index.html`, `sw.js`, and the folders `css`, `js`, `icons`.
8. Turn on GitHub Pages: click **Settings** (the tab along the top of the repository), then **Pages** in the left menu.
9. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Set **Branch** to **main** and the folder to **/ (root)**. Click **Save**.
10. Wait about a minute and refresh the page. A box appears at the top: **Your site is live at** `https://YOUR-USERNAME.github.io/logbook/`. That is your app's address.

No GitHub Actions workflow is needed, because there is no build step.

## How to Install on iPhone

1. Open your app's address in **Safari** on your iPhone (it must be Safari).
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name **Logbook**.
5. Tap **Add**.
6. Launch **Logbook** from the Home Screen. It opens full-screen like any other app, and works without internet from then on.

**Where your data lives:** on that iPhone, inside the Home Screen app. It is not in iCloud and not on GitHub. The Home Screen app and the Safari tab keep separate data, so always use the Home Screen app. Deleting the Home Screen app deletes its data, so export a backup first.

## Using It

- **Start Workout**, then **Add Exercise**. The app shows **Last Time** for that exercise.
- **Use Last Time** copies those sets into today. Change only what is different.
- The grey numbers in empty boxes are last time's numbers. Tapping the circle on an empty row accepts them.
- Tap the circle to mark a set done. Only checked sets count toward Last Time and stats.
- **Add Set** copies the set above it.
- Tap a **set number** to delete that set. Tap **•••** to remove an exercise or see its history.
- Everything saves as you type. You can close the app mid-workout and pick up where you left off.
- The **gear** button holds units (lb/kg), Light/Dark, and backup.

## How to Back Up My Data

1. Tap the **gear** button, then **Export Data**.
2. The iPhone share sheet opens. Choose **Save to Files** and pick iCloud Drive (or AirDrop/email it to yourself).
3. You get a file named like `logbook-backup-2026-10-01.json`. It contains everything: workouts, body entries, custom exercises, settings.

Do this regularly (monthly is sensible). iOS can clear a web app's storage in rare cases, and a backup is the only protection.

## How to Restore My Data

1. Tap the **gear** button, then **Import Data**.
2. Pick your backup file.
3. The app checks the file and tells you what is in it. Tap **Replace My Data** to confirm.

Restoring **replaces** everything currently in the app with the backup. A file that is damaged or is not a Logbook backup is refused and nothing changes.

## How to Update the App

1. In your GitHub repository, click **Add file**, then **Upload files**.
2. Drag in the new versions of the files (same names, same folders) and click **Commit changes**. GitHub redeploys by itself in about a minute.
3. On your iPhone, open Logbook once while online, then close it (swipe it away in the app switcher) and open it again. The new version appears on that second launch.

Updating only replaces the app's files. Your workout data sits in a separate database on the phone (IndexedDB) and is not touched.

## Changing the App Name

- Inside the app: `js/config.js`.
- On the Home Screen: `index.html` (the `<title>` and `apple-mobile-web-app-title` lines) and `manifest.webmanifest` (`name` and `short_name`).

## How to Run Locally (optional, for developers)

Needs [Node.js](https://nodejs.org) 20 or newer. No packages to install.

```
npm run dev      # serves the app at http://localhost:4173/logbook/
npm test         # runs the logic tests in three time zones
```

`tests/e2e.py` drives the whole app in a real browser at iPhone size (needs Python and Playwright). `dev/sample-data.json` is six weeks of made-up data for testing; load it with **Import Data** in a desktop browser. The app never loads sample data by itself.

Technical notes:

- All weights are stored in pounds; kg is converted only for display and input.
- Database changes must go through `upgrade()` in `js/db.js` with a new version number. Never clear data in a migration.
- Backups carry a `schemaVersion` (currently 1).
