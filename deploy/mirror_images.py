#!/usr/bin/env python3
"""
mirror_images.py
Downloads every external product image (Amazon CDN, etc.) to the local
/var/gifteeng/uploads/product/ directory and updates the DB row in-place.
Safe to re-run — already-local URLs are skipped.
"""
import os, sys, json, hashlib, time, urllib.request, urllib.error
import psycopg2

DB_URL     = os.environ.get('DATABASE_URL',
             'postgresql://gifteeng:471c1ec84d944b3ee7422c26d7b61c35@127.0.0.1:5432/gifteeng')
UPLOAD_DIR = '/var/gifteeng/uploads/product'
URL_PREFIX = '/uploads/product'          # served via Next.js /uploads/* rewrite
EXTERNAL_HOSTS = ('m.media-amazon.com', 'images.unsplash.com', 'i.imgur.com',
                  'cf.shopify.com', 'cdn.shopify.com')

os.makedirs(UPLOAD_DIR, exist_ok=True)

def is_external(url):
    return bool(url and url.startswith('http') and
                any(h in url for h in EXTERNAL_HOSTS))

def ext_from_url(url):
    path = url.split('?')[0].split('#')[0]
    ext  = os.path.splitext(path)[-1].lower()
    return ext if ext in ('.jpg', '.jpeg', '.png', '.webp', '.gif') else '.jpg'

def download(url, dest):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; GifteengBot/1.0)',
        'Referer':    'https://www.amazon.in/',
    })
    with urllib.request.urlopen(req, timeout=20) as r, open(dest, 'wb') as f:
        f.write(r.read())

conn = psycopg2.connect(DB_URL)
cur  = conn.cursor()

cur.execute("SELECT id, images FROM products WHERE images IS NOT NULL AND images::text != '[]'")
rows = cur.fetchall()
print(f'Found {len(rows)} products with images')

updated = skipped = errors = 0

for (pid, images) in rows:
    if not isinstance(images, list):
        images = json.loads(images) if isinstance(images, str) else []

    changed   = False
    new_images = []
    for img in images:
        url = img.get('url', '') if isinstance(img, dict) else str(img)
        alt = img.get('alt', '') if isinstance(img, dict) else ''

        if not is_external(url):
            new_images.append(img)
            skipped += 1
            continue

        # Stable filename: sha1 of original URL so it's idempotent
        sha   = hashlib.sha1(url.encode()).hexdigest()[:20]
        ext   = ext_from_url(url)
        fname = f'mirror-{sha}{ext}'
        dest  = os.path.join(UPLOAD_DIR, fname)
        local = f'{URL_PREFIX}/{fname}'

        if not os.path.exists(dest):
            try:
                download(url, dest)
                size = os.path.getsize(dest)
                print(f'  DL  {fname}  ({size//1024}kB)  <- {url[:70]}')
                time.sleep(0.08)  # polite throttle
            except Exception as e:
                print(f'  ERR {url[:70]}: {e}', file=sys.stderr)
                new_images.append(img)
                errors += 1
                continue
        else:
            print(f'  HIT {fname}  (cached)')

        new_images.append({'alt': alt, 'url': local})
        changed  = True
        updated += 1

    if changed:
        cur.execute(
            'UPDATE products SET images=%s, "updatedAt"=NOW() WHERE id=%s',
            (json.dumps(new_images), pid)
        )

conn.commit()
cur.close()
conn.close()

print(f'\nDone — {updated} images mirrored, {skipped} already local, {errors} errors')
