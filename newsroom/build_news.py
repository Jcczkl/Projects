"""
Build news.json for Room 5's live board (run hourly by .github/workflows/news.yml).

One feed poll and one Google Trends poll with the engine in newsroom.py, then the
app's own view() logic, cut down to the public contract the page reads:
top 40 stories, the "people are searching" strip, and one health row per outlet.
GDELT is skipped (it throttles hard; the app reports it as throttled anyway).

Exit codes: 0 = news.json written and fit to publish; 1 = news.json written but
fewer than MIN_OUTLETS outlets answered (or it failed its own checks), so the
deploy is skipped and the last good site stays up; 2 = the build itself failed.

Plain Python, no AI, no paid APIs. Headlines and links only.
"""
from __future__ import annotations

import datetime as _dt
import json
import pathlib
import re
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import newsroom as nr  # noqa: E402

OUT = nr.REPO_ROOT / "news.json"
TOP_STORIES = 40
TOP_SEARCHING = 14
FIRST_LINKS = 4
MIN_OUTLETS = 10
MAX_BYTES = 150_000
RUN_BUDGET_S = 12 * 60            # the workflow kills the job at 15 minutes
BADGES = ("new", "surging", "trending", "nonwest", "maybe-elsewhere")


class RunBudgetExceeded(Exception):
    """Raised instead of starting a fetch once the run's time budget is used up."""


def budget_opener(deadline: float):
    """The engine's own fetch (same User-Agent and headers), but no new request
    starts after `deadline`, and none may outlast it."""
    def _open(url: str, timeout: float = 20) -> bytes:
        left = deadline - time.monotonic()
        if left <= 1:
            raise RunBudgetExceeded("this run's time limit was reached")
        return nr.Fetcher._urlopen(url, min(timeout, left))
    return _open


def plain_reason(status: str) -> str:
    """A feed's health status in plain English for the Sources view."""
    s = status or ""
    if s.startswith("not used: "):
        return s[len("not used: "):]
    if s == "not polled yet":
        return "not read yet"
    if s.startswith("stale feed"):
        return "its feed has gone stale" + s[len("stale feed"):]
    if s.startswith("not fetched: robots.txt"):
        return "its robots.txt disallows the feed (not fetched)"
    if "RunBudgetExceeded" in s:
        return "not read: this run's time limit was reached"
    m = re.search(r"HTTP Error (\d{3})", s)
    if m:
        code = m.group(1)
        if code == "403":
            return "site refuses automated readers (HTTP 403) on this read"
        return f"its feed returned an error ({code}) on this read"
    low = s.lower()
    if "certificate" in low or "ssl" in low:
        return "its HTTPS certificate failed verification on this read (not bypassed)"
    if "timed out" in low or "timeout" in low:
        return "its feed timed out on this read"
    if "parseerror" in low:
        return "its feed could not be read as RSS on this read"
    if "refused" in low or "reset" in low or "remotedisconnected" in low or "getaddrinfo" in low \
            or "name or service" in low or "urlerror" in low:
        return "could not connect to it on this read"
    return "its feed could not be read on this read"


def _http(url) -> bool:
    return isinstance(url, str) and url.startswith(("http://", "https://"))


def public_board(view: dict, now: float, trends_n: int) -> dict:
    """The app's view() -> the page's news.json contract (schema 1)."""
    clusters = view["clusters"]
    stories = []
    for c in clusters[:TOP_STORIES]:
        links = [l for l in c["links"] if _http(l.get("url"))]
        dl = c.get("dateline")
        stories.append({
            "id": c["id"],
            "h": c["headline"],
            "b": [b for b in c["badges"] if b in BADGES],
            "o": [[o["name"], o["region"]] for o in c["outlets"]],
            "r": c["regions"],
            "fs": c["first_seen_sgt"],
            "fo": c["first_outlet"],
            "ro": c["recent_outlets"],
            "tr": [[t["cc"], t["traffic"]] for t in c["trending"][:4]],
            "dl": {"city": dl["city"], "date": dl.get("date")} if dl else None,
            "n": len(c["links"]),
            "l": [[l["outlet"], l["title"], l["url"], l["time_sgt"]] for l in links[:FIRST_LINKS]],
        })
    searching = [[m["term"], m["url"] if _http(m.get("url")) else None,
                  [x["cc"] for x in m["countries"]][:5], m["traffic"]]
                 for m in view["searching"][:TOP_SEARCHING]]

    # One row per outlet, in config order: live if any of its feeds is live.
    rows: dict = {}
    for f in view["sources"]["feeds"]:
        r = rows.setdefault(f["outlet"], {"region": f["region"], "live": False, "reasons": []})
        if f["live"]:
            r["live"] = True
        else:
            r["reasons"].append(plain_reason(f["status"]))
    feeds = [[name, r["region"], 1 if r["live"] else 0, "" if r["live"] else (r["reasons"][0] if r["reasons"] else "")]
             for name, r in rows.items()]

    trends_ok = sum(1 for t in view["sources"]["trends"] if t["status"] == "ok")
    return {
        "schema": 1,
        "updated_utc": _dt.datetime.fromtimestamp(now, _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "snap": _dt.datetime.fromtimestamp(now, nr.SGT).strftime("%d %b %H:%M SGT"),
        "total": len(clusters),
        "placement_checked": sum(1 for c in clusters if c.get("dateline_state") != "none"),
        "outlets_live": view["sources"]["outlets_live"],
        "feeds_live": view["sources"]["feeds_live"],
        "trends_ok": trends_ok,
        "trends_n": trends_n,
        "stories": stories,
        "searching": searching,
        "feeds": feeds,
        "not_covered": view["sources"]["not_covered"],
    }


def problems(board: dict, size: int) -> list[str]:
    """Checks the file must pass before it is fit to publish."""
    out = []
    if size >= MAX_BYTES:
        out.append(f"news.json is {size} bytes (limit {MAX_BYTES})")
    if not board["stories"]:
        out.append("no stories")
    bad = {b for s in board["stories"] for b in s["b"]} - set(BADGES)
    if bad:
        out.append(f"badges outside the allowed set: {sorted(bad)}")
    if board["outlets_live"] < MIN_OUTLETS:
        out.append(f"only {board['outlets_live']} outlets answered (need {MIN_OUTLETS})")
    return out


def main() -> int:
    t0 = time.monotonic()
    room = nr.Newsroom(fetcher=nr.Fetcher(opener=budget_opener(t0 + RUN_BUDGET_S)))
    restored = len(room.items)
    room.poll_feeds()
    room.poll_trends()
    now = time.time()
    view = room.view(now)
    cfg = nr.load_config(room.config_dir)
    trends_n = sum(len(g) for g in ((cfg.get("trends") or {}).get("countries") or {}).values())
    board = public_board(view, now, trends_n)
    text = json.dumps(board, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(text, encoding="utf-8")
    room._save()

    size = len(text.encode("utf-8"))
    took = time.monotonic() - t0
    print(f"restored {restored} headlines from state; now {len(room.items)}")
    print(f"{board['total']} stories, top {len(board['stories'])} written; "
          f"{board['outlets_live']} outlets / {board['feeds_live']} feeds live; "
          f"Trends {board['trends_ok']}/{board['trends_n']}; {size} bytes; {took:.0f} s")
    for name, region, live, why in board["feeds"]:
        if not live:
            print(f"  not live: {name} ({region}): {why}")
    bad = problems(board, size)
    for p in bad:
        print(f"NOT FIT TO PUBLISH: {p}")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:                      # the build itself broke: keep the last good site
        print(f"build failed: {type(e).__name__}: {e}")
        sys.exit(2)
