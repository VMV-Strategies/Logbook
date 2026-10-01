"""End-to-end check in a real browser engine (Chromium) at iPhone size.
Developer-only. Needs Python + Playwright and the local server:
    node dev/serve.mjs &      then      python3 tests/e2e.py
Covers the critical workout, persistence, body, offline and backup flows."""
import json, os, re, sys
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("LOGBOOK_URL", "http://localhost:4173/logbook/")
SHOTS = os.environ.get("SHOTS", "/tmp/shots")
os.makedirs(SHOTS, exist_ok=True)
errors = []
step_no = [0]

def step(msg):
    step_no[0] += 1
    print(f"ok {step_no[0]:>2}  {msg}")

def add_exercise(page, name):
    page.get_by_role("button", name="Add Exercise").click()
    page.locator("#overlays").get_by_label("Search exercises").fill(name[:12])
    page.locator("#overlays .sheet .row", has_text=name).first.click()
    expect(page.locator(".sheet-layer")).to_have_count(0)

def fill_set(page, n, weight, reps):
    page.get_by_label(f"Set {n} weight in lb").fill(str(weight))
    page.get_by_label(f"Set {n} reps").fill(str(reps))

def set_values(page):
    rows = page.locator("#tab .set-row")
    return [(rows.nth(i).locator("input").nth(0).input_value(), rows.nth(i).locator("input").nth(1).input_value()) for i in range(rows.count())]

def finish(page, label="Finish Workout"):
    page.locator("#tab .btn.primary", has_text="Finish Workout").click()
    page.locator("#overlays .action-btn", has_text=label).click()
    expect(page.get_by_role("heading", name="Workout", exact=True)).to_be_visible()

def no_overflow(page, where):
    bad = page.evaluate("""() => { const out = [];
      if (document.documentElement.scrollWidth > innerWidth) out.push('document');
      for (const el of document.querySelectorAll('.scroll, .sheet-scroll')) if (el.scrollWidth > el.clientWidth + 1) out.push(el.className);
      return out; }""")
    assert not bad, f"horizontal overflow on {where}: {bad}"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                              accept_downloads=True, timezone_id="America/Toronto", locale="en-CA")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE)
    expect(page.get_by_role("button", name="Start Workout")).to_be_visible()
    expect(page.get_by_text("No workouts yet")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/01-home-empty.png")
    step("opens under a /repository/ subpath with an empty database (no sample data)")

    # ---- critical workout test ----
    page.get_by_role("button", name="Start Workout").click()
    add_exercise(page, "Incline Dumbbell Press")
    expect(page.get_by_text("No previous history")).to_be_visible()
    fill_set(page, 1, 70, 10)
    page.get_by_role("button", name="Add Set").click()
    assert set_values(page)[1] == ("70", "10"), "smart add set copies the previous set"
    page.get_by_label("Set 2 reps").fill("9")
    page.get_by_role("button", name="Add Set").click()
    fill_set(page, 3, 65, 11)
    for n in (1, 2, 3):
        page.get_by_label(f"Set {n} done").click()
    assert page.locator("#tab .set-row.done").count() == 3
    page.get_by_label("Note for Incline Dumbbell Press").fill("Bench notch 4")
    page.screenshot(path=f"{SHOTS}/02-active-first.png")
    finish(page)
    step("first workout logged: 70x10, 70x9, 65x11, checked and finished")

    page.reload()  # close and reopen
    expect(page.locator("#tab .row")).to_have_count(1)
    page.get_by_role("button", name="Start Workout").click()
    add_exercise(page, "Incline Dumbbell Press")
    last = page.locator("#tab .last-sets li").all_inner_texts()
    assert last == ["70 lb × 10", "70 lb × 9", "65 lb × 11"], last
    expect(page.locator("#tab .last-title")).to_contain_text("Last Time ·")
    step("after reopening, Last Time shows 70x10, 70x9, 65x11")

    page.get_by_role("button", name="Use Last Time").click()
    assert set_values(page) == [("70", "10"), ("70", "9"), ("65", "11")], set_values(page)
    assert page.locator("#tab .set-row.done").count() == 0
    step("Use Last Time copies the sets into today")

    fill_set(page, 1, "72.5", 10)
    page.get_by_label("Set 3 weight in lb").fill("")      # blank while editing must not crash
    page.get_by_label("Set 3 weight in lb").fill("70")
    add_exercise(page, "Cable Fly")
    page.get_by_label("Set 1 weight in lb").nth(1).fill("30")
    page.get_by_label("Set 1 reps").nth(1).fill("12")
    page.wait_for_timeout(300)

    # ---- critical persistence test: reload mid-workout ----
    page.reload()
    expect(page.locator("#tab .ex")).to_have_count(2)
    assert set_values(page) == [("72.5", "10"), ("70", "9"), ("70", "11"), ("30", "12")], set_values(page)
    expect(page.get_by_role("button", name="Start Workout")).to_have_count(0)
    step("unfinished workout survives a reload with every exercise and set intact")

    page.screenshot(path=f"{SHOTS}/03-active-last-time.png")
    no_overflow(page, "active workout")
    page.locator("#tab .btn.primary", has_text="Finish Workout").click()
    expect(page.locator("#overlays .action-title")).to_contain_text("4 sets are not checked off")
    page.locator("#overlays .action-btn", has_text="Check All and Finish").click()
    expect(page.locator("#tab .row")).to_have_count(2)
    step("second workout finished; both workouts are in history")

    page.get_by_role("button", name="Start Workout").click()
    add_exercise(page, "Incline Dumbbell Press")
    last = page.locator("#tab .last-sets li").all_inner_texts()
    assert last == ["72.5 lb × 10", "70 lb × 9", "70 lb × 11"], last
    # one tap on the check accepts the grey suggestion from last time
    page.get_by_label("Set 1 done").click()
    assert set_values(page)[0] == ("72.5", "10")
    page.get_by_role("button", name="Discard Workout").click()
    page.locator("#overlays .action-btn.destructive").click()
    expect(page.locator("#tab .row")).to_have_count(2)
    step("the newer workout is now Last Time; discarding a workout leaves history untouched")

    # ---- history detail, edit, exercise history ----
    page.locator("#tab .row").first.click()
    expect(page.locator(".page.in .set-lines li")).to_have_count(4)
    page.locator(".page.in").screenshot(path=f"{SHOTS}/04-workout-detail.png")
    page.get_by_role("button", name="Edit", exact=True).click()
    edit = page.locator(".page.in").last
    edit.get_by_label("Set 2 reps").first.fill("10")
    edit.get_by_role("button", name="Done", exact=True).click()
    expect(page.locator(".page.in .set-lines li").nth(1)).to_contain_text("70 lb × 10")
    page.locator(".page.in .ex-link").first.click()
    hist = page.locator(".page.in").last
    expect(hist.locator(".hist")).to_have_count(2)
    hist.screenshot(path=f"{SHOTS}/05-exercise-history.png")
    hist.get_by_role("button", name="Back").click()
    page.get_by_role("button", name="Workouts").click()
    expect(page.locator(".page")).to_have_count(0)
    step("workout detail, editing a past workout, and exercise history all work")

    # ---- progress ----
    page.locator("#tabbar button", has_text="Progress").click()
    expect(page.locator(".select-value")).to_have_text("Incline Dumbbell Press")
    expect(page.locator(".stat", has_text="Completed sessions").locator("dd")).to_have_text("2")
    expect(page.locator(".stat", has_text="Heaviest weight").locator("dd")).to_contain_text("72.5 lb")
    expect(page.locator(".stat", has_text="Best estimated 1RM").locator("dd")).to_contain_text("96.7 lb")
    assert page.locator(".chart circle.c-dot.main").count() == 2
    for m in ("Top Weight", "Volume", "Est. 1RM"):
        page.locator(".segmented button", has_text=m).click()
        assert page.locator(".chart circle.c-dot.main").count() == 2
    step("progress stats and all three charts reflect both sessions")

    # ---- critical body test ----
    page.locator("#tabbar button", has_text="Body").click()
    page.get_by_label("Weight in lb").fill("184.6")
    page.get_by_label("Body fat percent, optional").fill("13.8")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator(".body-row")).to_have_count(1)
    page.reload()
    page.locator("#tabbar button", has_text="Body").click()
    expect(page.get_by_label("Weight in lb")).to_have_value("184.6")
    expect(page.get_by_label("Body fat percent, optional")).to_have_value("13.8")
    page.get_by_label("Weight in lb").fill("184.2")
    page.get_by_role("button", name="Update", exact=True).click()
    expect(page.locator(".body-row")).to_have_count(1)
    expect(page.locator(".body-row .b-weight")).to_have_text("184.2 lb")
    expect(page.locator(".stat", has_text="Current weight").locator("dd")).to_contain_text("184.2 lb")
    assert page.locator(".chart circle").count() >= 1  # single point renders
    page.get_by_label("Body fat percent, optional").fill("140")
    page.get_by_role("button", name="Update", exact=True).click()
    expect(page.locator(".form-error")).to_contain_text("between 0 and 100")
    page.get_by_label("Weight in lb").fill("")
    page.get_by_role("button", name="Update", exact=True).click()
    expect(page.locator(".form-error")).to_contain_text("Enter your weight")
    step("body entry saves, survives reopening, updates in place (no duplicate), validates input")

    # ---- critical offline test ----
    page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)
    page.wait_for_timeout(500)
    ctx.set_offline(True)
    page.reload()
    expect(page.get_by_role("button", name="Start Workout")).to_be_visible()
    page.get_by_role("button", name="Start Workout").click()
    add_exercise(page, "Lat Pulldown")
    fill_set(page, 1, 130, 10)
    page.get_by_label("Set 1 done").click()
    finish(page)
    page.reload()
    expect(page.locator("#tab .row")).to_have_count(3)
    page.locator("#tabbar button", has_text="Progress").click()
    expect(page.locator(".chart svg")).to_be_visible()
    page.locator("#tabbar button", has_text="Body").click()
    expect(page.locator(".body-row")).to_have_count(1)
    ctx.set_offline(False)
    step("offline: app loads, workout logged and finished, history/progress/body all available")

    # ---- backup: export, bad import, restore ----
    page.get_by_label("Settings").click()
    with page.expect_download() as dl:
        page.locator("#overlays .sheet .row", has_text="Export Data").click()
    path = dl.value.path()
    backup = json.load(open(path))
    assert backup["app"] == "logbook" and backup["schemaVersion"] == 1 and len(backup["workouts"]) == 3 and len(backup["bodyMeasurements"]) == 1
    assert re.match(r"logbook-backup-\d{4}-\d{2}-\d{2}\.json", dl.value.suggested_filename)
    expect(page.locator("#overlays .sheet .footnote").first).not_to_contain_text("never")

    open("/tmp/bad.json", "w").write('{"app":"logbook","schemaVersion":1,"workouts":"oops"}')
    page.locator("#overlays .sheet input[type=file]").set_input_files("/tmp/bad.json")
    expect(page.locator("#overlays .action-title")).to_contain_text("can’t be imported")
    page.locator("#overlays .action-btn", has_text="OK").click()
    open("/tmp/junk.json", "w").write("not json at all")
    page.locator("#overlays .sheet input[type=file]").set_input_files("/tmp/junk.json")
    expect(page.locator("#overlays .action-message")).to_contain_text("not valid JSON")
    page.locator("#overlays .action-btn", has_text="OK").click()
    step("export produces a versioned JSON backup; malformed files are refused without touching data")

    sample = os.path.join(os.path.dirname(__file__), "..", "dev", "sample-data.json")
    page.locator("#overlays .sheet input[type=file]").set_input_files(sample)
    expect(page.locator("#overlays .action-title")).to_contain_text("Replace all data")
    page.locator("#overlays .action-btn.destructive").click()
    expect(page.locator(".sheet-layer.in")).to_have_count(0)
    n_sample = len(json.load(open(sample))["bodyMeasurements"])
    expect(page.locator(".body-row")).to_have_count(14)
    expect(page.get_by_role("button", name=f"Show All {n_sample} Entries")).to_be_visible()
    page.wait_for_timeout(400)
    page.screenshot(path=f"{SHOTS}/06-body.png")
    no_overflow(page, "body")
    page.locator(".segmented button", has_text="Body Fat").click()
    page.locator(".segmented button", has_text="1M").click()
    assert page.locator(".chart svg").count() == 1
    page.locator("#tabbar button", has_text="Progress").click()
    page.wait_for_timeout(300)
    page.screenshot(path=f"{SHOTS}/07-progress.png")
    no_overflow(page, "progress")
    page.locator("#tabbar button", has_text="Workout").click()
    page.screenshot(path=f"{SHOTS}/08-home.png")
    step("sample backup imports through the normal Import path (dev data stays separate)")

    # restore the real backup and confirm it round-trips exactly
    page.get_by_label("Settings").click()
    page.locator("#overlays .sheet input[type=file]").set_input_files(path)
    page.locator("#overlays .action-btn.destructive").click()
    expect(page.locator("#tab .row")).to_have_count(3)
    page.reload()
    expect(page.locator("#tab .row")).to_have_count(3)
    step("restoring the exported backup brings back exactly the original data")

    # ---- units ----
    page.get_by_label("Settings").click()
    page.locator("#overlays .sheet .segmented button", has_text="kg").click()
    page.screenshot(path=f"{SHOTS}/09-settings.png")
    page.get_by_role("button", name="Done", exact=True).click()
    page.locator("#tab .row").nth(1).click()
    expect(page.locator(".page.in .set-lines li").first).to_contain_text("32.89 kg × 10")
    page.get_by_role("button", name="Workouts").click()
    page.get_by_label("Settings").click()
    page.locator("#overlays .sheet .segmented button", has_text="lb").click()
    page.get_by_role("button", name="Done", exact=True).click()
    page.locator("#tab .row").nth(1).click()
    expect(page.locator(".page.in .set-lines li").first).to_contain_text("72.5 lb × 10")
    page.get_by_role("button", name="Workouts").click()
    step("switching lb → kg → lb only changes the display; stored numbers are unchanged")

    # ---- custom exercise, picker, delete workout ----
    page.get_by_role("button", name="Start Workout").click()
    page.get_by_role("button", name="Add Exercise").click()
    page.wait_for_timeout(350)
    page.screenshot(path=f"{SHOTS}/10-picker.png")
    page.locator("#overlays").get_by_label("Search exercises").fill("Reverse Hyper")
    page.locator("#overlays .sheet .row.create").click()
    page.locator("#overlays .sheet .chip", has_text="Hamstrings / Glutes").click()
    page.locator("#overlays .sheet .btn.primary").click()
    expect(page.locator("#tab .ex-name")).to_have_text("Reverse Hyper")
    fill_set(page, 1, "0", 15)
    page.get_by_label("Set 1 done").click()
    finish(page)
    page.locator("#tab .row").first.click()
    expect(page.locator(".page.in .set-lines li").first).to_contain_text("15 reps")
    page.get_by_role("button", name="Delete Workout").click()
    page.locator("#overlays .action-btn.destructive").click()
    expect(page.locator("#tab .row")).to_have_count(3)
    step("custom exercise created and logged; workout deletion asks for confirmation")

    # ---- dark mode, small phone, tap targets ----
    dark = browser.new_context(viewport={"width": 375, "height": 667}, device_scale_factor=2, is_mobile=True, has_touch=True,
                               color_scheme="dark", storage_state=ctx.storage_state(indexed_db=True))
    dpage = dark.new_page()
    dpage.on("pageerror", lambda e: errors.append(str(e)))
    dpage.goto(BASE)
    expect(dpage.locator("#tab .row")).to_have_count(3)
    assert dpage.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(0, 0, 0)"
    dpage.get_by_role("button", name="Start Workout").click()
    add_exercise(dpage, "Incline Dumbbell Press")
    dpage.get_by_role("button", name="Use Last Time").click()
    dpage.get_by_label("Set 1 done").click()
    dpage.wait_for_timeout(300)
    dpage.screenshot(path=f"{SHOTS}/11-dark-active.png")
    no_overflow(dpage, "dark active (iPhone SE size)")
    small = dpage.evaluate("""() => [...document.querySelectorAll('#app button, #app input')].filter(el => el.offsetParent)
        .map(el => { const r = el.getBoundingClientRect(); const a = getComputedStyle(el, '::after');
          const extra = a.content !== 'none' ? 10 : 0; return [el.className || el.tagName, Math.round(r.width), Math.round(r.height + extra)]; })
        .filter(([, w, h]) => h < 40 || w < 36)""")
    assert not small, f"small tap targets: {small}"
    dpage.locator("#tabbar button", has_text="Progress").click()
    dpage.wait_for_timeout(300)
    dpage.screenshot(path=f"{SHOTS}/12-dark-progress.png")
    step("dark mode and iPhone SE size: no overflow, tap targets at least 40pt")

    manifest = page.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json())")
    assert manifest["display"] == "standalone" and manifest["start_url"] == "./"
    for icon in manifest["icons"]:
        assert page.evaluate("(u) => fetch(new URL(u, document.querySelector('link[rel=manifest]').href)).then(r => r.ok)", icon["src"])
    assert page.evaluate("fetch(document.querySelector('link[rel=apple-touch-icon]').href).then(r => r.ok)")
    step("manifest, icons and apple-touch-icon resolve under the subpath")
    browser.close()

real = [e for e in errors if "net::ERR_INTERNET_DISCONNECTED" not in e]
if real:
    print("CONSOLE ERRORS:", *real, sep="\n  ")
    sys.exit(1)
print("\nAll end-to-end checks passed.")
