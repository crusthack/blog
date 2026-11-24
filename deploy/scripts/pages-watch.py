"""EC2 Pages publisher. Run against the SQLite volume on the host."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time
import urllib.request
import urllib.error
from zoneinfo import ZoneInfo

PUBLIC = """ FROM Posts p LEFT JOIN Categories c ON c.Id=p.CategoryId
 WHERE p.DeletedAtUtc IS NULL AND p.Visibility='Public'
 AND (p.CategoryId IS NULL OR c.IsVisible=1)"""
SEOUL = ZoneInfo("Asia/Seoul")


def snapshot(db, full):
    posts = [str(row[0]) for row in db.execute("SELECT p.PostNumber" + PUBLIC)]
    assets = list(db.execute("SELECT a.Id,a.UpdatedAtUtc FROM PostAssets a WHERE a.PostId IN (SELECT p.Id" + PUBLIC + ") ORDER BY a.Id"))
    ids = set("p:" + number for number in posts)
    ids.update("a:" + row[0].lower() for row in assets)
    if not full:
        return ids, None
    digest = hashlib.sha256()
    for query in ("SELECT p.*" + PUBLIC + " ORDER BY p.Id",
                  "SELECT * FROM Categories WHERE IsVisible=1 ORDER BY Id",
                  "SELECT * FROM PostAssets WHERE PostId IN (SELECT p.Id" + PUBLIC + ") ORDER BY Id",
                  "SELECT Key,Value FROM SiteSettings WHERE Key IN ('page-home','page-about','external-links','useful-links') ORDER BY Key"):
        for row in db.execute(query):
            digest.update(json.dumps(row).encode() + b"\n")
    # Include template and dependency changes following a code deployment.
    root = Path(__file__).resolve().parents[2]
    for file in sorted([*root.glob("scripts/pages/*"), *root.glob("apps/frontend/content/*.md"),
                        root / "apps/frontend/src/lib/markdownHeadings.ts", root / "package-lock.json"]):
        digest.update(file.read_bytes())
    return ids, digest.hexdigest()


def run():
    url = os.environ["PAGES_URL"].rstrip("/") + "/static-manifest.json"
    db = sqlite3.connect(Path(os.environ["BLOG_DB"]).resolve().as_uri() + "?mode=ro", uri=True)
    previous = None
    refreshed = attempted = 0
    manifest = {}
    while True:
        now = time.monotonic()
        if not refreshed or now - refreshed >= 60:
            try:
                with urllib.request.urlopen(url, timeout=15) as response:
                    manifest = json.load(response)
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
                manifest = {}
            refreshed = now
        today = dt.datetime.now(SEOUL)
        version = db.execute("PRAGMA data_version").fetchone()[0]
        daily = today.hour >= 1 and previous != today.date()
        if daily or version != getattr(run, "version", None) or getattr(run, "manifest", None) != manifest:
            db.execute("BEGIN")
            ids, key = snapshot(db, daily)
            revoked = set(manifest.get("publicIds", [])) - ids
            if revoked and not daily:
                _, key = snapshot(db, True)
            db.rollback()
            pending = (daily and manifest.get("sourceVersion") != key) or revoked
            if pending and (not attempted or now - attempted >= 600 or revoked != getattr(run, "revoked", None)):
                payload = json.dumps({"ref":"main","inputs":{"source_version":key}}).encode()
                request = urllib.request.Request("https://api.github.com/repos/crusthack/blog/actions/workflows/pages.yml/dispatches",
                    data=payload, headers={"Authorization":"Bearer " + os.environ["PAGES_DISPATCH_TOKEN"], "Content-Type":"application/json"})
                with urllib.request.urlopen(request, timeout=20):
                    pass
                attempted = now
                run.revoked = revoked
            if not pending:
                run.version, run.manifest = version, manifest
                if daily:
                    previous = today.date()
        time.sleep(5)


if __name__ == "__main__":
    run()
