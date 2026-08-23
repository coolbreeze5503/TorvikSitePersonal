"""
Exploratory script — NOT the final scraper.
Loads team.php for one team, dumps HTML + logs network requests,
so we can see what Cloudflare does and what the real DOM/data looks like.
"""
import sys
from playwright.sync_api import sync_playwright

TEAM = sys.argv[1] if len(sys.argv) > 1 else "Duke"
URL = f"https://barttorvik.com/team.php?team={TEAM}"

requests_log = []

def log_request(request):
    requests_log.append(request.url)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    page = context.new_page()
    page.on("request", log_request)

    print(f"Navigating to {URL} ...")
    page.goto(URL, wait_until="networkidle", timeout=60000)

    title = page.title()
    print(f"\nPage title: {title!r}")

    # Check for Cloudflare challenge text
    body_text = page.inner_text("body")
    if "Verifying" in body_text or "Checking your browser" in body_text:
        print("\n*** CLOUDFLARE CHALLENGE DETECTED ***")
    else:
        print("\nNo obvious Cloudflare challenge text found in body.")

    # Save full HTML for inspection
    html = page.content()
    with open("scraper/duke_team_page.html", "w") as f:
        f.write(html)
    print(f"\nSaved full HTML ({len(html)} chars) to scraper/duke_team_page.html")

    # Save screenshot
    page.screenshot(path="scraper/duke_team_page.png", full_page=True)
    print("Saved screenshot to scraper/duke_team_page.png")

    # Print interesting requests (json/xhr-like)
    print(f"\nTotal requests: {len(requests_log)}")
    interesting = [u for u in requests_log if any(x in u.lower() for x in ["json", "api", ".php?", "xhr", "ajax"])]
    print("\nRequests containing json/api/.php?/xhr/ajax:")
    for u in interesting:
        print(" ", u)

    browser.close()
