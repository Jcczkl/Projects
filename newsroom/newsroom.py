"""
Newsroom engine for the public demo board at https://jcczkl.github.io/Projects/
(Room 5, "Live news tracker"). A trimmed copy of the news tracker's own engine:
the clustering, scoring, dateline, Google Trends and robots/pacing code is
unchanged, so this board matches the app. Removed: desktop notifications,
picks, the watchlist, and the private "developing / covered" inputs (empty here).

$0 and no AI: fetching, parsing, clustering and scoring are all plain code.

What it READS: the RSS / Atom feeds in newsroom/news_feeds.yaml (headlines +
links only, never article text) and Google Trends "Trending now" RSS per
country. Every fetch checks that host's robots.txt first, sends an honest
User-Agent, keeps a per-host gap, and never retries around a refusal.

What it WRITES: .news_state/state.json (its cache), never committed.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import html
import json
import math
import os
import pathlib
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import copy
import xml.etree.ElementTree as ET

import yaml

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG_DIR = pathlib.Path(__file__).resolve().parent      # newsroom/news_feeds.yaml
STATE_DIR = REPO_ROOT / ".news_state"                      # restored from the Actions cache

UA = "JosephProjectsNewsBoard/1.0 (public demo board, rebuilt hourly; headlines and links only; respects robots.txt; https://jcczkl.github.io/Projects/)"
SGT = _dt.timezone(_dt.timedelta(hours=8), "SGT")
# "The West" for the 🌏 badge. Oceania (Australia, NZ) and Canada added
# 2026-10-06 (claude_code_newsroom_more_sources.md): Western-aligned
# English-language press, same reasoning as the US/Europe.
WEST = {"Europe", "US", "Wire", "Oceania", "Canada"}
HOST_GAP_S = 2.0
ROBOTS_TTL_S = 24 * 3600
FLAGS = {"Africa": "🌍", "South Asia": "🌏", "SE Asia": "🌏", "East Asia": "🌏", "Middle East": "🌍",
         "Latin America": "🌎", "Global South": "🌐", "Wire": "📰", "Europe": "🇪🇺", "US": "🇺🇸",
         "Oceania": "🇦🇺", "Canada": "🇨🇦"}

# Google Trends country -> the same regions the outlets use (2026-10-06,
# claude_code_newsroom_country_breakdown.md). Matches where outlets already sit:
# Turkey with Anadolu in the Middle East, Russia with Meduza in Europe.
# tests/test_newsroom.py checks every country in config/news_feeds.yaml is here.
COUNTRY_REGION = {
    "US": "US", "CA": "Canada",
    "MX": "Latin America", "BR": "Latin America", "AR": "Latin America", "CO": "Latin America",
    "GB": "Europe", "DE": "Europe", "FR": "Europe", "IT": "Europe", "ES": "Europe", "NL": "Europe",
    "PL": "Europe", "UA": "Europe", "RU": "Europe",
    "TR": "Middle East", "SA": "Middle East", "AE": "Middle East", "IL": "Middle East", "EG": "Middle East",
    "NG": "Africa", "KE": "Africa", "ZA": "Africa",
    "IN": "South Asia", "PK": "South Asia", "BD": "South Asia",
    "ID": "SE Asia", "PH": "SE Asia", "VN": "SE Asia", "TH": "SE Asia", "MY": "SE Asia", "SG": "SE Asia",
    "JP": "East Asia", "KR": "East Asia", "TW": "East Asia", "HK": "East Asia",
    "AU": "Oceania", "NZ": "Oceania",
}
COUNTRY_NAMES = {
    "US": "United States", "CA": "Canada", "MX": "Mexico", "BR": "Brazil", "AR": "Argentina", "CO": "Colombia",
    "UY": "Uruguay", "GB": "United Kingdom", "DE": "Germany", "FR": "France", "IT": "Italy", "ES": "Spain",
    "NL": "Netherlands", "PL": "Poland", "UA": "Ukraine", "RU": "Russia", "TR": "Turkey", "SA": "Saudi Arabia",
    "AE": "UAE", "IL": "Israel", "EG": "Egypt", "NG": "Nigeria", "KE": "Kenya", "ZA": "South Africa",
    "ET": "Ethiopia", "IN": "India", "PK": "Pakistan", "BD": "Bangladesh", "NP": "Nepal", "ID": "Indonesia",
    "PH": "Philippines", "VN": "Vietnam", "TH": "Thailand", "MY": "Malaysia", "SG": "Singapore", "JP": "Japan",
    "KR": "South Korea", "TW": "Taiwan", "HK": "Hong Kong", "AU": "Australia", "NZ": "New Zealand",
}
REGIONAL = ""      # section key for outlets with no single home country

# ── Wire datelines (2026-10-06, claude_code_newsroom_fix_country_categorization.md) ──
# A Reuters story CNA/Straits Times republish ("WASHINGTON, Oct 5 - McDonald's
# sued...") was filed under Singapore because only Singapore outlets carried
# it. Checked every live feed's descriptions first: only the Straits Times'
# world feed reliably opens with a wire dateline (14 of 50); CNA's teasers
# carry none; Indian Express, Nikkei Asia and Taipei Times send no description.
# So this fixes the confident cases only: an ALL-CAPS city from this list at
# the very start, optional "(Reuters)"-style tag and date, then a dash or
# colon. Anything else keeps the outlet-based placement. city -> (country, region).
DATELINE_CITIES = {
    "WASHINGTON": ("US", "US"), "NEW YORK": ("US", "US"), "CHICAGO": ("US", "US"), "LOS ANGELES": ("US", "US"),
    "SAN FRANCISCO": ("US", "US"), "UNITED NATIONS": ("US", "US"), "MIAMI": ("US", "US"), "HOUSTON": ("US", "US"),
    "OTTAWA": ("CA", "Canada"), "TORONTO": ("CA", "Canada"), "MONTREAL": ("CA", "Canada"),
    "MEXICO CITY": ("MX", "Latin America"), "BRASILIA": ("BR", "Latin America"), "SAO PAULO": ("BR", "Latin America"),
    "RIO DE JANEIRO": ("BR", "Latin America"), "BUENOS AIRES": ("AR", "Latin America"), "BOGOTA": ("CO", "Latin America"),
    "CARACAS": ("VE", "Latin America"), "LIMA": ("PE", "Latin America"), "SANTIAGO": ("CL", "Latin America"),
    "HAVANA": ("CU", "Latin America"), "MONTEVIDEO": ("UY", "Latin America"), "QUITO": ("EC", "Latin America"),
    "LONDON": ("GB", "Europe"), "PARIS": ("FR", "Europe"), "BERLIN": ("DE", "Europe"), "FRANKFURT": ("DE", "Europe"),
    "BRUSSELS": ("BE", "Europe"), "ROME": ("IT", "Europe"), "MILAN": ("IT", "Europe"), "MADRID": ("ES", "Europe"),
    "BARCELONA": ("ES", "Europe"), "LISBON": ("PT", "Europe"), "AMSTERDAM": ("NL", "Europe"), "THE HAGUE": ("NL", "Europe"),
    "WARSAW": ("PL", "Europe"), "KYIV": ("UA", "Europe"), "KIEV": ("UA", "Europe"),
    "KHARKIV": ("UA", "Europe"), "ODESA": ("UA", "Europe"), "LVIV": ("UA", "Europe"), "DNIPRO": ("UA", "Europe"), "MOSCOW": ("RU", "Europe"),
    "ST PETERSBURG": ("RU", "Europe"), "GENEVA": ("CH", "Europe"), "ZURICH": ("CH", "Europe"), "VIENNA": ("AT", "Europe"),
    "PRAGUE": ("CZ", "Europe"), "BUDAPEST": ("HU", "Europe"), "ATHENS": ("GR", "Europe"), "STOCKHOLM": ("SE", "Europe"),
    "OSLO": ("NO", "Europe"), "COPENHAGEN": ("DK", "Europe"), "HELSINKI": ("FI", "Europe"), "DUBLIN": ("IE", "Europe"),
    "PRISTINA": ("XK", "Europe"), "BELGRADE": ("RS", "Europe"), "BUCHAREST": ("RO", "Europe"), "SOFIA": ("BG", "Europe"),
    "MINSK": ("BY", "Europe"), "VILNIUS": ("LT", "Europe"), "RIGA": ("LV", "Europe"), "TALLINN": ("EE", "Europe"),
    "TBILISI": ("GE", "Europe"), "YEREVAN": ("AM", "Europe"), "BAKU": ("AZ", "Europe"), "VATICAN CITY": ("VA", "Europe"),
    "ANKARA": ("TR", "Middle East"), "ISTANBUL": ("TR", "Middle East"), "TEHRAN": ("IR", "Middle East"),
    "BAGHDAD": ("IQ", "Middle East"), "DAMASCUS": ("SY", "Middle East"), "BEIRUT": ("LB", "Middle East"),
    "JERUSALEM": ("IL", "Middle East"), "TEL AVIV": ("IL", "Middle East"), "GAZA": ("PS", "Middle East"),
    "CAIRO": ("EG", "Middle East"), "RIYADH": ("SA", "Middle East"), "DUBAI": ("AE", "Middle East"),
    "ABU DHABI": ("AE", "Middle East"), "DOHA": ("QA", "Middle East"), "AMMAN": ("JO", "Middle East"),
    "NAIROBI": ("KE", "Africa"), "LAGOS": ("NG", "Africa"), "ABUJA": ("NG", "Africa"), "JOHANNESBURG": ("ZA", "Africa"),
    "CAPE TOWN": ("ZA", "Africa"), "PRETORIA": ("ZA", "Africa"), "ADDIS ABABA": ("ET", "Africa"), "KHARTOUM": ("SD", "Africa"),
    "KINSHASA": ("CD", "Africa"), "ACCRA": ("GH", "Africa"), "DAKAR": ("SN", "Africa"), "KAMPALA": ("UG", "Africa"),
    "NEW DELHI": ("IN", "South Asia"), "MUMBAI": ("IN", "South Asia"), "ISLAMABAD": ("PK", "South Asia"),
    "KARACHI": ("PK", "South Asia"), "LAHORE": ("PK", "South Asia"), "DHAKA": ("BD", "South Asia"),
    "KATHMANDU": ("NP", "South Asia"), "COLOMBO": ("LK", "South Asia"), "KABUL": ("AF", "South Asia"),
    "SINGAPORE": ("SG", "SE Asia"), "KUALA LUMPUR": ("MY", "SE Asia"), "JAKARTA": ("ID", "SE Asia"),
    "BANGKOK": ("TH", "SE Asia"), "MANILA": ("PH", "SE Asia"), "HANOI": ("VN", "SE Asia"),
    "HO CHI MINH CITY": ("VN", "SE Asia"), "PHNOM PENH": ("KH", "SE Asia"), "YANGON": ("MM", "SE Asia"),
    "NAYPYITAW": ("MM", "SE Asia"), "VIENTIANE": ("LA", "SE Asia"),
    "BEIJING": ("CN", "East Asia"), "SHANGHAI": ("CN", "East Asia"), "HONG KONG": ("HK", "East Asia"),
    "TAIPEI": ("TW", "East Asia"), "TOKYO": ("JP", "East Asia"), "OSAKA": ("JP", "East Asia"), "SEOUL": ("KR", "East Asia"),
    "PYONGYANG": ("KP", "East Asia"), "ULAANBAATAR": ("MN", "East Asia"),
    "SYDNEY": ("AU", "Oceania"), "CANBERRA": ("AU", "Oceania"), "MELBOURNE": ("AU", "Oceania"),
    "WELLINGTON": ("NZ", "Oceania"), "AUCKLAND": ("NZ", "Oceania"),
}
_DATELINE = re.compile(
    r"^\s*([A-Z][A-Z .'\-]{1,24}?)"                                 # ALL-CAPS city
    r"(?:,\s*[A-Z][A-Za-z .'\-]{1,24}?)??"                          # optional ", STATE/COUNTRY"
    r"(?:\s*\((?:Reuters|AP|AFP|Bloomberg|Xinhua|Bernama|ANI|PTI|IANS|UPI|dpa|Kyodo|Yonhap)\))?"
    r"(?:,?\s*(?P<mon>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s*(?P<day>\d{1,2}))?"
    r"(?:\s*\((?:Reuters|AP|AFP|Bloomberg|Xinhua|Bernama|ANI|PTI|IANS|UPI|dpa|Kyodo|Yonhap)\))?"   # tag after the date too
    r"\s*[-–—:]\s")


def detect_dateline(text: str, now: float | None = None) -> dict | None:
    """{"city", "cc", "region", "date"} for a confident wire dateline at the
    very start of `text`, else None. Only cities in DATELINE_CITIES count.
    "date" (2026-10-06) is the dateline's own month/day in the page's "05 Oct"
    style, or None when the dateline has none. A dateline carries no year or
    time, so none is invented; a month/day later than today is taken as last
    year's (kept in "date_iso" only - the page shows day and month)."""
    m = _DATELINE.match(text or "")
    if not m:
        return None
    city = re.sub(r"\s+", " ", m.group(1)).strip(" .")
    hit = DATELINE_CITIES.get(city)
    if not hit:
        return None
    out = {"city": city, "cc": hit[0], "region": hit[1], "date": None, "date_iso": None}
    if m.group("mon") and m.group("day"):
        today = _dt.datetime.fromtimestamp(now or time.time(), SGT).date()
        try:
            d = _dt.datetime.strptime(f"{m.group('mon')[:3]} {int(m.group('day'))} {today.year}", "%b %d %Y").date()
            if d > today:
                d = d.replace(year=today.year - 1)
            out["date"], out["date_iso"] = d.strftime("%d %b"), d.isoformat()
        except ValueError:
            pass                                   # "Feb 30" and the like: keep the city, no date
    return out


def dateline_status(dateline: dict | None, homes: set) -> str:
    """How a story's dateline relates to the home countries of the outlets
    that carried it (2026-10-06). One rule for both the section placement and
    the badges, so they can never disagree:
      "none"     - no dateline detected: placement unchecked
      "agrees"   - the dateline is one of the outlets' own countries
      "moved"    - only one country's outlets carried it, datelined elsewhere:
                   region_sections puts it where it happened
      "conflict" - datelined elsewhere, but several countries' outlets carried
                   it, so it is NOT moved (one stray dateline must not drag a
                   multi-country story) - the placement is in doubt."""
    if not dateline:
        return "none"
    if dateline["cc"] in homes:
        return "agrees"
    if len(homes) == 1 and None not in homes:
        return "moved"
    return "conflict"

# ════════════════════════════ config ════════════════════════════

def load_config(config_dir: pathlib.Path = CONFIG_DIR) -> dict:
    cfg = yaml.safe_load((config_dir / "news_feeds.yaml").read_text(encoding="utf-8")) or {}
    cfg["watch_keywords"] = []          # no watchlist on the public board
    return cfg


def country_flag(cc: str) -> str:
    return "".join(chr(0x1F1E6 + ord(c) - 65) for c in cc.upper() if "A" <= c <= "Z")


# ════════════════════════════ fetching ════════════════════════════

class Fetcher:
    """robots.txt per host (cached a day), a minimum gap per host, timeouts,
    and an honest User-Agent. Never retries around a refusal."""

    def __init__(self, opener=None):
        self._robots: dict = {}
        self._last_hit: dict = {}
        self._lock = threading.Lock()
        self._open = opener or self._urlopen

    @staticmethod
    def _urlopen(url: str, timeout: float = 20) -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                   "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.5"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(5_000_000)                      # headlines feeds are small; cap it

    def _pace(self, host: str) -> None:
        with self._lock:
            wait = self._last_hit.get(host, 0) + HOST_GAP_S - time.monotonic()
            self._last_hit[host] = time.monotonic() + max(0.0, wait)
        if wait > 0:
            time.sleep(wait)

    def allowed(self, url: str) -> bool:
        u = urllib.parse.urlsplit(url)
        base = f"{u.scheme}://{u.netloc}"
        got = self._robots.get(base)
        if not got or time.time() - got[1] > ROBOTS_TTL_S:
            rp = urllib.robotparser.RobotFileParser()
            try:
                self._pace(u.netloc)
                rp.parse(self._open(base + "/robots.txt", 12).decode("utf-8", "replace").splitlines())
            except urllib.error.HTTPError as e:
                # RFC 9309: a 4xx robots.txt means "no rules"; a 5xx (or 429)
                # means "assume everything is disallowed" - for now, retried
                # next time. (Several news sites answer robots.txt itself with a
                # 403 to unknown agents; that is not a ban on their feed.)
                rp.parse([] if 400 <= e.code < 500 and e.code != 429 else ["User-agent: *", "Disallow: /"])
                if e.code >= 500 or e.code == 429:
                    self._robots[base] = (rp, time.time() - ROBOTS_TTL_S + 600)
                    return rp.can_fetch(UA, url)
            except Exception:
                rp.parse([])                   # unreachable robots.txt = no rules (the standard)
            self._robots[base] = got = (rp, time.time())
        return got[0].can_fetch(UA, url)

    def get(self, url: str, timeout: float = 20) -> bytes:
        if not self.allowed(url):
            raise PermissionError("robots.txt disallows it")
        self._pace(urllib.parse.urlsplit(url).netloc)
        return self._open(url, timeout)


# ════════════════════════════ parsing ════════════════════════════

_TAG = re.compile(r"<[^>]+>")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child_text(el, *names) -> str:
    for c in el:
        if _local(c.tag) in names:
            if _local(c.tag) == "link" and c.get("href"):
                return c.get("href")
            if c.text and c.text.strip():
                return c.text.strip()
    return ""


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub(" ", s or ""))).strip()


def _zone(tz: str | None):
    if not tz:
        return _dt.timezone.utc
    try:
        import zoneinfo
        return zoneinfo.ZoneInfo(tz)
    except Exception:
        return _dt.timezone.utc


def parse_time(s: str, tz: str | None = None) -> float | None:
    """Feed date -> UNIX time. A date written with no zone is read in `tz`
    (the outlet's `tz:` in config/news_feeds.yaml), else UTC."""
    s = (s or "").strip()
    if not s:
        return None
    m = re.match(r"(\d{1,2}) ([A-Za-z]+) (\d{4})\s*-\s*(\d{1,2}):(\d{2})$", s)   # NL Times: "5 October 2026 - 22:00"
    if m:
        try:
            return _dt.datetime.strptime(" ".join(m.groups()), "%d %B %Y %H %M").replace(
                tzinfo=_zone(tz)).timestamp()
        except ValueError:
            return None
    from email.utils import parsedate_to_datetime
    for fn in (parsedate_to_datetime, lambda x: _dt.datetime.fromisoformat(x.replace("Z", "+00:00"))):
        try:
            d = fn(s)
            if d.tzinfo is None:
                d = d.replace(tzinfo=_zone(tz))
            return d.timestamp()
        except Exception:
            continue
    m = re.match(r"\w+day (\w{3}) (\d{1,2}) (\d{4}) (\d{1,2}):(\d{2}):(\d{2})", s)   # News24's own format
    if m:
        try:
            return _dt.datetime.strptime(" ".join(m.groups()), "%b %d %Y %H %M %S").replace(
                tzinfo=_dt.timezone.utc).timestamp()
        except ValueError:
            return None
    return None


def parse_feed(body: bytes, tz: str | None = None, now: float | None = None) -> list[dict]:
    """RSS 2.0, RSS 1.0 (RDF) and Atom -> [{title, link, published, dateline}].
    Headlines only: the description is read here just to spot a wire dateline
    and is never kept - only the detected city/country is."""
    root = ET.fromstring(body)
    out = []
    for el in root.iter():
        if _local(el.tag) not in ("item", "entry"):
            continue
        title = _clean(_child_text(el, "title"))
        link = _child_text(el, "link") or _child_text(el, "guid", "id")
        if not title or not link:
            continue
        desc = _clean(_child_text(el, "description", "summary"))
        out.append({"title": title, "link": link.strip(),
                    "published": parse_time(_child_text(el, "pubDate", "published", "updated", "date"), tz),
                    "dateline": detect_dateline(desc, now) or detect_dateline(title, now)})
    return out


def parse_trends(body: bytes) -> list[dict]:
    """Google Trends 'Trending now' RSS -> [{term, traffic, traffic_label, news[]}]."""
    root = ET.fromstring(body)
    out = []
    for it in root.iter("item"):
        term = _clean(_child_text(it, "title"))
        label = _child_text(it, "approx_traffic")
        news = []
        for c in it:
            if _local(c.tag) == "news_item":
                news.append({"title": _clean(_child_text(c, "news_item_title")),
                             "url": _child_text(c, "news_item_url"),
                             "source": _child_text(c, "news_item_source")})
        if term:
            out.append({"term": term, "traffic_label": label, "traffic": _traffic(label), "news": news,
                        "published": parse_time(_child_text(it, "pubDate"))})
    return out


def _traffic(label: str) -> int:
    m = re.search(r"([\d,.]+)\s*([KkMm]?)", label or "")
    if not m:
        return 0
    n = float(m.group(1).replace(",", ""))
    return int(n * {"k": 1e3, "m": 1e6}.get(m.group(2).lower(), 1))


def parse_gdelt(body: bytes) -> list[float]:
    j = json.loads(body or b"{}")
    try:
        return [float(p["value"]) for p in j["timeline"][0]["data"]]
    except (KeyError, IndexError, TypeError, ValueError):
        return []


def gdelt_ratio(values: list[float]) -> float | None:
    """Last 2 h vs the 24 h baseline (15-minute points). None if not enough data."""
    if len(values) < 16:
        return None
    recent, base = values[-8:], values[:-8]
    b = sum(base) / len(base)
    r = sum(recent) / len(recent)
    if b <= 0:
        return None if r <= 0 else 99.0
    return r / b


# ════════════════════════════ text ════════════════════════════

STOP = set("""a about above after again against all also am an and any are as at be because been before being
below between both but by can could did do does doing down during each few for from further had has have having he
her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or
other our ours out over own same she should so some such than that the their them then there these they this those
through to too under until up very was we were what when where which while who whom why will with you your
says said say new news live update updates latest video watch photos breaking report reports amid over after
year years day days week weeks month months today yesterday tomorrow first last top how why what who more
mr mrs ms vs via per get gets got make makes made take takes took one two three four five six seven eight
nine ten could would may might must shall still back than into onto upon s t""".split())


def tokens(text: str) -> set[str]:
    out = set()
    for w in re.findall(r"[^\W_]+(?:['’][^\W_]+)?", (text or "").lower()):
        w = re.sub(r"['’]s$", "", w).replace("’", "'")
        if len(w) < 3 or w in STOP or w.isdigit():
            continue
        if len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]                                 # crude plural fold: "workers" ~ "worker"
        out.add(w)
    return out


# ════════════════════════════ clustering + scoring ════════════════════════════

CLUSTER_SIM = 0.30        # TF-IDF cosine, item vs cluster
MIN_SHARED = 2            # and at least this many shared words


def cluster_items(items: list[dict], now: float, window_h: float = 48) -> list[dict]:
    """Group headlines about the same event. Deterministic: items in time
    order, each joins the most similar existing cluster (TF-IDF cosine against
    the cluster's words, >= CLUSTER_SIM and >= MIN_SHARED shared words) or
    starts a new one. An inverted index keeps it to clusters sharing a word."""
    lo = now - window_h * 3600
    live = [it for it in items if (it.get("t") or now) >= lo]
    toks = [tokens(it["title"]) for it in live]
    df: dict = {}
    for ts in toks:
        for w in ts:
            df[w] = df.get(w, 0) + 1
    n = len(live) or 1
    idf = {w: math.log((n + 1) / (c + 1)) + 1 for w, c in df.items()}

    order = sorted(range(len(live)), key=lambda i: (live[i].get("t") or now, live[i]["outlet"]))
    clusters: list[dict] = []
    index: dict = {}
    for i in order:
        ts = toks[i]
        if not ts:
            continue
        vec = {w: idf[w] for w in ts}
        norm = math.sqrt(sum(v * v for v in vec.values()))
        best, best_s = None, 0.0
        for ci in {c for w in ts for c in index.get(w, ())}:
            c = clusters[ci]
            shared = ts & c["words"].keys()
            if len(shared) < MIN_SHARED:
                continue
            dot = sum(vec[w] * c["words"][w] for w in shared)
            s = dot / (norm * c["norm"]) if c["norm"] else 0
            if s > best_s:
                best, best_s = ci, s
        if best is not None and best_s >= CLUSTER_SIM:
            c = clusters[best]
            c["items"].append(live[i])
            for w, v in vec.items():
                c["words"][w] = c["words"].get(w, 0) + v
                index.setdefault(w, set()).add(best)
            c["norm"] = math.sqrt(sum(v * v for v in c["words"].values()))
        else:
            clusters.append({"items": [live[i]], "words": dict(vec), "norm": norm})
            for w in ts:
                index.setdefault(w, set()).add(len(clusters) - 1)
    return _merge_on_rare_words(clusters, df, n)


RARE_DF = 0.02     # a word in at most 2% of headlines (min 3) counts as rare


def _merge_on_rare_words(clusters: list[dict], df: dict, n: int) -> list[dict]:
    """Second pass: one event told from different angles ("Irkutsk hospitals
    quarantine..." / "plague institute worker dies in Irkutsk") shares its
    rare words, not its common ones.

    Greedy and NON-transitive (2026-10-06, after the first live run chained the
    Irkutsk story, Madrid housing protests and more into one 28-outlet blob
    through single headlines that shared two rare words with each). Each
    group has a CORE: its rare words that appear in at least half of its
    headlines. Strongest pairs first, two groups merge only if their CURRENT
    cores share 2+ words, and the merged group's core is recomputed - so it
    narrows as the group grows and nothing can chain through it."""
    cap = max(3, RARE_DF * n)
    tok_cache = [[tokens(it["title"]) for it in c["items"]] for c in clusters]

    def core_of(tok_lists):
        cnt: dict = {}
        for ts in tok_lists:
            for w in ts:
                if df.get(w, 0) <= cap:
                    cnt[w] = cnt.get(w, 0) + 1
        need = len(tok_lists) / 2
        return {w for w, k in cnt.items() if k >= need}

    group = list(range(len(clusters)))                 # cluster -> group id
    members = {i: [i] for i in range(len(clusters))}   # group id -> clusters
    cores = {i: core_of(tok_cache[i]) for i in range(len(clusters))}
    by_word: dict = {}
    for ci, ws in cores.items():
        for w in ws:
            by_word.setdefault(w, []).append(ci)
    pairs = set()
    for ci, ws in cores.items():
        for cj in {c for w in ws for c in by_word[w] if c > ci}:
            k = len(ws & cores[cj])
            if k >= 2:
                pairs.add((k, ci, cj))
    for _, ci, cj in sorted(pairs, reverse=True):
        gi, gj = group[ci], group[cj]
        if gi == gj or len(cores[gi] & cores[gj]) < 2:
            continue
        for c in members[gj]:
            group[c] = gi
        members[gi] += members.pop(gj)
        cores[gi] = core_of([ts for c in members[gi] for ts in tok_cache[c]])
        cores.pop(gj, None)
    merged = []
    for gid, cs in members.items():
        m = {"items": [], "words": {}, "norm": 0.0}
        for ci in cs:
            m["items"] += clusters[ci]["items"]
            for w, v in clusters[ci]["words"].items():
                m["words"][w] = m["words"].get(w, 0) + v
        m["norm"] = math.sqrt(sum(v * v for v in m["words"].values()))
        merged.append(m)
    return merged


def _trend_matches(keys: list, words: set, title_toks: list, df: dict, n_items: int) -> bool:
    """A Google Trends term matches a story when all its words are in it.
    One-word terms are stricter (seen live: Nigeria/Kenya searching "protest"
    stuck to every protest story): the word must be rare across today's
    headlines AND in at least half of this story's own headlines."""
    keys = set(keys)
    if not keys or not keys <= words:
        return False
    if len(keys) >= 2:
        return True
    w = next(iter(keys))
    rare = df.get(w, 0) <= max(3, RARE_DF * n_items)
    return rare and sum(1 for tt in title_toks if w in tt) * 2 >= len(title_toks)


DATELINE_BELONGS = 0.40   # a dated headline's similarity to its story (see _cluster_dateline)


def _cluster_dateline(items: list[dict], df: dict | None = None, n_items: int = 0) -> dict | None:
    """The story's dateline when its dated headlines all agree on the country
    (conflicting datelines = not confident = None).

    With `df` (2026-10-06): a dated headline only counts if it really belongs to
    the story - its rarity-weighted cosine (the clustering's own measure) with
    at least one other headline in the story is >= DATELINE_BELONGS. Live, 5 of
    8 "maybe elsewhere" stories were clustering accidents: a different Straits
    Times story merged in ("Brazil's Lula weighs VP..." inside Japan's
    fiscal-policy story, "Congo river boats" inside an English Channel boat
    story) whose dateline was then taken for the whole story. Measured on the
    live board: genuine 0.50-0.74 (Spain, Siberia plague, Kosovo), accidents
    0.14-0.26; loose Ukraine-war merges 0.18-0.30 are dropped too. (A shared-
    rare-words rule was tried first and let them all through: "finance",
    "minister", "boat", "dead" all count as rare at 2% of headlines.)"""
    found = [it["dateline"] for it in items if it.get("dateline")]
    if df is not None and len(items) > 1:
        n = max(1, n_items)

        def vec(t):
            return {w: math.log((n + 1) / (df.get(w, 0) + 1)) + 1 for w in tokens(t)}

        def cos(a, b):
            dot = sum(a[w] * b[w] for w in a.keys() & b.keys())
            na, nb = math.sqrt(sum(v * v for v in a.values())), math.sqrt(sum(v * v for v in b.values()))
            return dot / (na * nb) if na and nb else 0.0
        vecs = [vec(it["title"]) for it in items]
        found = [it["dateline"] for i, it in enumerate(items) if it.get("dateline")
                 and max(cos(vecs[i], vecs[j]) for j in range(len(items)) if j != i) >= DATELINE_BELONGS]
    if not found or len({d["cc"] for d in found}) != 1:
        return None
    return found[0]


def score_clusters(clusters: list[dict], now: float, *, developing=(), covered=(), watch=(),
                   trends=(), gdelt=None, country_of=None) -> list[dict]:
    """-> one dict per cluster for the page: headline, outlets, badges, score."""
    gdelt = gdelt or {}
    df: dict = {}
    for c in clusters:
        for it in c["items"]:
            for w in tokens(it["title"]):
                df[w] = df.get(w, 0) + 1
    n_items = sum(len(c["items"]) for c in clusters)
    out = []
    for c in clusters:
        its = sorted(c["items"], key=lambda x: x.get("t") or now)
        words = set(c["words"])
        joins: dict = {}
        for it in its:
            joins.setdefault(it["outlet"], it.get("t") or now)
        regions = {it["region"] for it in its}
        first = its[0]
        major = next((it for it in its if it["region"] in WEST), first)
        cid = hashlib.sha1((first["link"] or first["title"]).encode("utf-8")).hexdigest()[:12]
        recent = [o for o, t in joins.items() if t >= now - 2 * 3600]
        badges = []
        if (first.get("t") or now) >= now - 3600:
            badges.append("new")
        g = gdelt.get(cid)
        surging = len(recent) >= 3 or (g is not None and g >= 3)
        if surging:
            badges.append("surging")
        dev = [d["story"] for d in developing if len(words & set(d["keys"])) >= 2]
        if dev:
            badges.append("update")
        cov = [t["topic"] for t in covered if len(words & set(t["keys"])) >= max(2, math.ceil(0.6 * len(t["keys"])))]
        if cov:
            badges.append("covered")
        outlet_regions = [next(it["region"] for it in its if it["outlet"] == o) for o in joins]
        if outlet_regions and all(r not in WEST for r in outlet_regions):
            badges.append("nonwest")      # every outlet on it is outside the US/Europe
        hit_watch = [k for k in watch if tokens(k) and tokens(k) <= words]
        if hit_watch:
            badges.append("watch")
        # 2026-10-06: was this story's country placement actually checked?
        dl = _cluster_dateline(its, df, n_items)
        homes = {(country_of or {}).get(o) for o in joins}
        dl_state = dateline_status(dl, homes)
        if dl_state == "none":
            badges.append("unverified")          # common and calm: nothing to check it against
        elif dl_state == "conflict":
            badges.append("maybe-elsewhere")     # rarer, pointed: a dateline disagrees
        links = {it["link"] for it in its}
        title_toks = [tokens(it["title"]) for it in its]
        tr = [t for t in trends if links & set(t.get("urls", ())) or _trend_matches(t["keys"], words, title_toks, df, n_items)]
        if tr:
            badges.append("trending")
        score = (3 * len(joins) + 2 * len(regions) + 4 * len(recent)
                 + (5 if g is not None and g >= 3 else 0) + (6 if tr else 0)
                 + (3 if dev else 0) + (2 if hit_watch else 0) + (50 if surging and tr else 0))
        out.append({
            "id": cid, "headline": major["title"], "first_seen": first.get("t") or now,
            "first_outlet": first["outlet"], "score": score, "badges": badges,
            "outlets": [{"name": o, "region": next(it["region"] for it in its if it["outlet"] == o),
                         "joined": t} for o, t in sorted(joins.items(), key=lambda x: x[1])],
            "regions": sorted(regions), "recent_outlets": len(recent),
            "links": [{"outlet": it["outlet"], "title": it["title"], "url": it["link"],
                       "time": it.get("t"), "fetched": it.get("fetched")} for it in its],
            "developing": dev, "covered": cov, "watch": hit_watch, "gdelt_ratio": g,
            "dateline": dl, "dateline_state": dl_state,
            "trending": [{"cc": t["cc"], "term": t["term"], "traffic": t["traffic_label"]} for t in tr],
            "_words": words,
        })
    out.sort(key=lambda x: (-x["score"], -x["first_seen"]))
    return out


def trend_terms(trends_by_cc: dict) -> list[dict]:
    out = []
    for cc, entry in trends_by_cc.items():
        for t in entry.get("items", []):
            out.append({"cc": cc, "term": t["term"], "traffic": t["traffic"], "traffic_label": t["traffic_label"],
                        "keys": sorted(tokens(t["term"])), "urls": [n["url"] for n in t.get("news", []) if n.get("url")],
                        "news": t.get("news", [])})
    return out


def searching_strip(terms: list[dict], scored: list[dict]) -> list[dict]:
    """Trending terms with NO matching news cluster, merged across countries."""
    matched = {(t["cc"], t["term"]) for c in scored for t in c["trending"]}
    merged: dict = {}
    for t in terms:
        if (t["cc"], t["term"]) in matched:
            continue
        m = merged.setdefault(t["term"].lower(), {"term": t["term"], "countries": [], "traffic": 0, "news": []})
        m["countries"].append({"cc": t["cc"], "flag": country_flag(t["cc"]), "traffic": t["traffic_label"]})
        m["traffic"] = max(m["traffic"], t["traffic"])
        if not m["news"]:
            m["news"] = t["news"][:2]
    for m in merged.values():
        m["url"] = first_news_url(m["news"])
    return sorted(merged.values(), key=lambda m: (-len(m["countries"]), -m["traffic"]))


def first_news_url(news: list) -> str | None:
    """The first real article link Google Trends gave for a term, or None.
    Never a substitute (no search-engine query link)."""
    for n in news or []:
        u = (n.get("url") or "").strip()
        if u.startswith(("http://", "https://")):
            return u
    return None


def region_sections(region: str, clusters: list[dict], terms: list[dict]) -> list[dict]:
    """One section per country in `region`: that country's own Trends terms
    (raw, per country - not the cross-country merged strip) and the ids of the
    stories that have an outlet from it. A story with outlets from two
    countries is listed under both. Outlets with no home country go under
    REGIONAL. Countries with neither stories nor terms get no section.
    `clusters` carry outlets with "region" and "country" (as view() builds them)."""
    sections: dict = {}

    def sec(cc):
        return sections.setdefault(cc, {"cc": cc, "name": COUNTRY_NAMES.get(cc, cc) if cc else "Regional",
                                        "flag": country_flag(cc) if cc else "🌐", "terms": [], "stories": []})
    for c in clusters:
        d = c.get("dateline")
        homes = {o.get("country") for o in c["outlets"]}
        if dateline_status(d, homes) == "moved":
            # 2026-10-06: a wire story carried ONLY by one country's outlets but
            # datelined elsewhere (CNA + Straits Times republishing Reuters'
            # "WASHINGTON, Oct 5 - McDonald's...") goes where it happened, not
            # where it was republished; an untracked country -> REGIONAL.
            # Only for single-country coverage: tried first on every story, the
            # live board moved 8, mostly wrongly - one Straits Times dateline
            # (e.g. a WASHINGTON side-angle merged into the 11-outlet Siberia
            # plague story) dragged whole multi-country stories with it.
            if d["region"] == region:
                cc = d["cc"] if COUNTRY_REGION.get(d["cc"]) == region else REGIONAL
                if c["id"] not in sec(cc)["stories"]:
                    sec(cc)["stories"].append(c["id"])
            continue
        if region not in c.get("regions", []):
            continue
        for cc in sorted({o.get("country") or REGIONAL for o in c["outlets"] if o["region"] == region}):
            if c["id"] not in sec(cc)["stories"]:
                sec(cc)["stories"].append(c["id"])
    for t in terms:
        if COUNTRY_REGION.get(t["cc"]) == region:
            sec(t["cc"])["terms"].append({"term": t["term"], "traffic": t["traffic_label"],
                                          "url": first_news_url(t.get("news"))})
    # Within a country, its OWN stories first: the most of that country's own
    # outlets on it, then the share of the story that is that country's, then
    # the board's score order. Seen live, in order: score alone opened
    # Singapore with Brazil's vote and the Nobel prize (CNA/Straits Times
    # carried them too); share alone opened it with one-outlet world briefs.
    rank = {c["id"]: i for i, c in enumerate(clusters)}
    by_id = {c["id"]: c for c in clusters}
    for cc, sct in sections.items():
        def local(cid, cc=cc):
            outs = by_id[cid]["outlets"]
            mine = sum(1 for o in outs if (o.get("country") or REGIONAL) == cc)
            return (-mine, -mine / max(1, len(outs)), rank[cid])
        sct["stories"].sort(key=local)
    for sct in sections.values():
        sct["terms"] = sorted(sct["terms"], key=lambda x: -_traffic(x["traffic"]))[:12]
    out = [x for x in sections.values() if x["terms"] or x["stories"]]
    return sorted(out, key=lambda x: (x["cc"] == REGIONAL, -len(x["stories"]), -len(x["terms"]), x["name"]))


# ════════════════════════════ the newsroom ════════════════════════════

def _sgt(ts: float | None) -> str:
    return _dt.datetime.fromtimestamp(ts, SGT).strftime("%d %b %H:%M SGT") if ts else "-"


class Newsroom:
    def __init__(self, *, fetcher: Fetcher | None = None,
                 config_dir: pathlib.Path = CONFIG_DIR, state_dir: pathlib.Path = STATE_DIR):
        self.fetcher = fetcher or Fetcher()
        self.config_dir = config_dir
        self.state_dir = state_dir
        self.lock = threading.RLock()
        self.wake = threading.Event()
        self.items: dict = {}           # key -> item
        self.feeds: dict = {}           # url -> health
        self.trends: dict = {}          # cc -> {items, status, fetched, next_due}
        self.gdelt: dict = {}           # cluster id -> ratio
        self.gdelt_status = {"status": "not used on the public board", "backoff_until": 0.0, "fails": 0, "last_try": 0.0}
        self.alerted: set = set()
        self.last_poll = None
        self.last_poll_ok = None
        self.offline = False
        self.polling = False
        self.next_poll = None
        self._version = 0               # bumped whenever items/trends/GDELT change
        self._board_cache = None        # ((version, minute), scored, strip)
        self._load()

    # ---- persistence (.news_state/ is never committed) ----
    def _state_path(self) -> pathlib.Path:
        return self.state_dir / "state.json"

    def _load(self) -> None:
        try:
            j = json.loads(self._state_path().read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        self.items = j.get("items", {})
        self.feeds = j.get("feeds", {})
        self.trends = j.get("trends", {})
        self.gdelt = j.get("gdelt", {})
        self.alerted = set(j.get("alerted", []))
        self.last_poll, self.last_poll_ok = j.get("last_poll"), j.get("last_poll_ok")

    def _save(self) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        tmp = self._state_path().with_suffix(".tmp")
        tmp.write_text(json.dumps({"items": self.items, "feeds": self.feeds, "trends": self.trends,
                                   "gdelt": self.gdelt, "alerted": sorted(self.alerted),
                                   "last_poll": self.last_poll, "last_poll_ok": self.last_poll_ok}),
                       encoding="utf-8")
        os.replace(tmp, self._state_path())

    # ---- one poll ----
    def poll_feeds(self, now: float | None = None) -> None:
        now = now or time.time()
        cfg = load_config(self.config_dir)
        window = cfg.get("settings", {}).get("window_hours", 48) * 3600
        attempted = ok = 0
        for o in cfg.get("outlets", []):
            for url in o.get("feeds") or []:
                h = self.feeds.setdefault(url, {"outlet": o["name"], "fails": 0, "next_try": 0})
                h["outlet"] = o["name"]
                if h.get("next_try", 0) > now:
                    continue
                attempted += 1
                try:
                    entries = parse_feed(self.fetcher.get(url), o.get("tz"), now)
                except PermissionError as e:
                    h.update(status=f"not fetched: {e}", fails=0, next_try=now + 24 * 3600)
                    continue
                except Exception as e:
                    h["fails"] = h.get("fails", 0) + 1
                    h.update(status=f"error: {type(e).__name__}: {str(e)[:80]}",
                             next_try=now + min(2 * 3600, 600 * 2 ** (h["fails"] - 1)))   # back off
                    continue
                ok += 1
                newest = max((e["published"] for e in entries if e["published"]), default=None)
                stale = newest is not None and newest < now - 7 * 24 * 3600
                h.update(fails=0, next_try=0, last_ok=now, count=len(entries), newest=newest,
                         status=("stale feed (newest item " + _sgt(newest) + ")") if stale else "ok")
                with self.lock:
                    for e in entries:
                        key = e["link"] or (o["name"] + "|" + e["title"])
                        pub = e["published"]
                        if pub and pub > now + 600:
                            pub = None                     # a future date is a feed bug, not news
                        old = self.items.get(key)
                        fetched = old["fetched"] if old else now
                        t = pub or fetched
                        if t < now - window:
                            continue
                        self.items[key] = {"title": e["title"], "link": e["link"], "outlet": o["name"],
                                           "region": o["region"], "published": pub, "fetched": fetched, "t": t,
                                           "dateline": e.get("dateline")}
        with self.lock:
            for k in [k for k, it in self.items.items() if it["t"] < now - window]:
                del self.items[k]
            self.last_poll = now
            if ok:
                self.last_poll_ok = now
            self.offline = attempted > 0 and ok == 0
            self._version += 1

    def poll_trends(self, now: float | None = None) -> None:
        now = now or time.time()
        cfg = load_config(self.config_dir)
        tcfg = cfg.get("trends") or {}
        period = cfg.get("settings", {}).get("trends_minutes", 30) * 60
        ccs = [cc for group in (tcfg.get("countries") or {}).values() for cc in group]
        for i, cc in enumerate(ccs):
            e = self.trends.setdefault(cc, {"items": [], "status": "not tried yet", "next_due": 0})
            if e.get("next_due", 0) > now:
                continue
            try:
                items = parse_trends(self.fetcher.get(tcfg["url"].format(cc=cc)))
                e.update(items=items, status="ok" if items else "no data returned", fetched=now)
            except PermissionError as ex:
                e.update(status=f"not fetched: {ex}")
            except Exception as ex:
                e.update(status=f"error: {type(ex).__name__}: {str(ex)[:60]}")
            # Stagger: the first run checks every country; after that they fall
            # into three batches a third of the period apart, so each 10-minute
            # poll fetches about a third of them instead of all at once.
            first = not e.get("fetched_once")
            e["fetched_once"] = True
            e["next_due"] = now + period * (1 + (i % 3) / 3 if first else 1)
            self._version += 1

    def board(self, now: float | None = None) -> tuple[list[dict], list[dict]]:
        """Clustered + scored board. Cached until the data changes or the minute
        turns (the status line asks every second; clustering every headline that
        often would be wasteful). Callers get their own copy to annotate."""
        now = now or time.time()
        key = (self._version, int(now // 60))
        cached = self._board_cache
        if cached is None or cached[0] != key:
            cached = self._board_cache = (key, *self._compute_board(now))
        return copy.deepcopy(cached[1]), copy.deepcopy(cached[2])

    def _compute_board(self, now: float) -> tuple[list[dict], list[dict]]:
        cfg = load_config(self.config_dir)
        with self.lock:
            items = list(self.items.values())
        clusters = cluster_items(items, now, cfg.get("settings", {}).get("window_hours", 48))
        terms = trend_terms(self.trends)
        scored = score_clusters(clusters, now, developing=[], covered=[], watch=[],
                                trends=terms, gdelt=self.gdelt,
                                country_of={o["name"]: o.get("country") for o in cfg.get("outlets", [])})
        return scored, searching_strip(terms, scored)

    # ---- what the page gets ----
    def view(self, now: float | None = None, region: str | None = None) -> dict:
        now = now or time.time()
        cfg = load_config(self.config_dir)
        scored, strip = self.board(now)
        country_of = {o["name"]: o.get("country") for o in cfg.get("outlets", [])}
        shown = [c for c in scored if len(c["outlets"]) >= 2 or
                 {"trending", "update", "watch", "new"} & set(c["badges"])][:400]
        for c in shown:
            c.pop("_words", None)
            c["first_seen_sgt"] = _sgt(c["first_seen"])
            for o in c["outlets"]:
                o["flag"] = FLAGS.get(o["region"], "")
                o["country"] = country_of.get(o["name"])
            for l in c["links"]:
                l["time_sgt"], l["fetched_sgt"] = _sgt(l["time"]), _sgt(l["fetched"])
        feeds = []
        for o in cfg.get("outlets", []):
            if o.get("unavailable"):
                feeds.append({"outlet": o["name"], "region": o["region"], "status": "not used: " + o["unavailable"], "live": False})
                continue
            for url in o.get("feeds") or []:
                h = self.feeds.get(url, {})
                feeds.append({"outlet": o["name"], "region": o["region"], "url": url,
                              "status": h.get("status", "not polled yet"), "count": h.get("count"),
                              "last_ok": _sgt(h.get("last_ok")) if h.get("last_ok") else None,
                              "live": h.get("status") == "ok"})
        trends = [{"cc": cc, "flag": country_flag(cc), "status": e.get("status"), "terms": len(e.get("items", []))}
                  for cc, e in sorted(self.trends.items())]
        return {
            "now_sgt": _sgt(now), "last_poll": _sgt(self.last_poll), "last_poll_ok": _sgt(self.last_poll_ok),
            "next_poll": _sgt(self.next_poll), "polling": self.polling, "offline": self.offline,
            "never_polled": self.last_poll is None,
            "clusters": shown, "searching": strip[:40],
            # only when a region is asked for; "all regions" is unchanged
            "region": region or None,
            "sections": region_sections(region, shown, trend_terms(self.trends)) if region else None,
            "sources": {"feeds": feeds, "feeds_live": sum(1 for f in feeds if f["live"]),
                        "outlets_live": len({f["outlet"] for f in feeds if f["live"]}),
                        "trends": trends, "gdelt": self.gdelt_status["status"],
                        "not_covered": (cfg.get("trends") or {}).get("not_covered", [])},
        }
