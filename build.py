#!/usr/bin/env python3
"""Build dist/ui.zip — draw.io as a filex app interface (no module).

    python build.py                 # download draw.war (pinned), build dist/
    python build.py --war draw.war  # use a local copy (still checked against the pin)
    python build.py --stamp         # also write ui.bundle.url + sha256 into filex-app.json

What goes into the bundle:

- draw.io's own release, `draw.war` from github.com/jgraph/drawio, as it is:
  every file but WEB-INF/ and META-INF/ (the Java servlet parts a static
  interface does not use). The version and sha256 are pinned in
  drawio.lock.json; a download that does not match is refused.
- js/PreConfig.js — the file draw.io loads first on a self-hosted domain —
  with two scripts appended: the filex interface SDK (vendor/, the
  @brftech/filex-app-ui IIFE build) and filex-adapter.js, which speaks
  draw.io's embed protocol to filex. Nothing of draw.io's own code changes.
- filex/blank.xml — the blank page a new .drawio file starts as
  (template/blank.xml; the manifest's new_documents template).
- LICENSE (draw.io's Apache License 2.0, LICENSES/drawio-Apache-2.0.txt) and
  NOTICE at the top of the bundle; draw.io's own license files stay where
  draw.io put them (img/, shapes/, stencils/, templates/, js/libavoid-js/).

The zip is REPRODUCIBLE, byte for byte, on any machine: filex-app.json pins
its sha256 and a GitHub install checks it, so the bundle CI builds at a tag
must be the very bundle the manifest was stamped with. draw.io's own entries
are copied as they are in draw.war — their compressed bytes, not
re-compressed (a zlib on another machine could compress differently) — and
the four entries this build writes are stored uncompressed. Every entry gets
the same timestamp and attributes, in draw.war's order.
"""
import argparse
import hashlib
import json
import struct
import sys
import urllib.request
import zipfile
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOCK = json.loads((HERE / 'drawio.lock.json').read_text(encoding='utf-8'))
MANIFEST = HERE / 'filex-app.json'
SDK = HERE / 'vendor' / 'filex-app-ui.iife.js'
ADAPTER = HERE / 'filex-adapter.js'
REPO = 'BRF-Tech/filex-drawio'

# 1980-01-01 00:00:00 in MS-DOS time/date: the earliest a zip can say.
DOS_TIME, DOS_DATE = 0, (0 << 9) | (1 << 5) | 1
SKIP = ('WEB-INF/', 'META-INF/')


def lf(b: bytes) -> bytes:
    """This repository's own text as LF, whatever the checkout made of it
    (a Windows checkout may hold CRLF): the bundle must not depend on it."""
    return b.replace(b'\r\n', b'\n')


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def fetch_war(local: str | None) -> bytes:
    if local:
        data = Path(local).read_bytes()
    else:
        cache = HERE / 'dist' / f"draw-{LOCK['version']}.war"
        if cache.exists():
            data = cache.read_bytes()
        else:
            print(f"downloading {LOCK['url']}")
            with urllib.request.urlopen(LOCK['url']) as r:
                data = r.read()
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(data)
    got = sha256(data)
    if got != LOCK['sha256']:
        sys.exit(f"draw.war sha256 {got} is not the pinned {LOCK['sha256']} (drawio.lock.json)")
    return data


class Writer:
    """A zip written by hand, so every byte is decided here."""

    def __init__(self) -> None:
        self.out = bytearray()
        self.central = bytearray()
        self.count = 0

    def add(self, name: str, method: int, crc: int, csize: int, usize: int, payload: bytes) -> None:
        nb = name.encode('utf-8')
        flags = 0x0800  # names are UTF-8
        offset = len(self.out)
        self.out += struct.pack('<IHHHHHIIIHH', 0x04034B50, 20, flags, method, DOS_TIME, DOS_DATE,
                                crc, csize, usize, len(nb), 0)
        self.out += nb + payload
        self.central += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014B50, (3 << 8) | 20, 20, flags, method,
                                    DOS_TIME, DOS_DATE, crc, csize, usize, len(nb), 0, 0, 0, 0,
                                    0o100644 << 16, offset)
        self.central += nb
        self.count += 1

    def stored(self, name: str, data: bytes) -> None:
        self.add(name, 0, zlib.crc32(data) & 0xFFFFFFFF, len(data), len(data), data)

    def finish(self) -> bytes:
        cd_off = len(self.out)
        self.out += self.central
        self.out += struct.pack('<IHHHHIIH', 0x06054B50, 0, 0, self.count, self.count,
                                len(self.central), cd_off, 0)
        return bytes(self.out)


def raw_entry(war: bytes, info: zipfile.ZipInfo) -> bytes:
    """The compressed bytes of one entry, as draw.war holds them."""
    off = info.header_offset
    sig, = struct.unpack('<I', war[off:off + 4])
    if sig != 0x04034B50:
        sys.exit(f'draw.war: no local header for {info.filename}')
    nlen, xlen = struct.unpack('<HH', war[off + 26:off + 30])
    start = off + 30 + nlen + xlen
    return war[start:start + info.compress_size]


def build(war: bytes) -> tuple[bytes, int]:
    import io
    src = zipfile.ZipFile(io.BytesIO(war))
    sdk = lf(SDK.read_bytes()).decode('utf-8')
    adapter = lf(ADAPTER.read_bytes()).decode('utf-8')
    w = Writer()
    names = set()
    for info in src.infolist():
        name = info.filename
        if name.startswith(SKIP) or name.endswith('/'):
            continue
        names.add(name)
        if name == 'js/PreConfig.js':
            pre = src.read(name).decode('utf-8')
            w.stored(name, (pre + '\n' + sdk + '\n' + adapter).encode('utf-8'))
            continue
        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            sys.exit(f'draw.war: {name} uses compression {info.compress_type}; filex serves stored or deflate')
        w.add(name, info.compress_type, info.CRC, info.compress_size, info.file_size, raw_entry(war, info))
    for name, path in (('filex/blank.xml', HERE / 'template' / 'blank.xml'),
                       ('LICENSE', HERE / 'LICENSES' / 'drawio-Apache-2.0.txt'),
                       ('NOTICE', HERE / 'NOTICE')):
        if name in names:
            sys.exit(f'draw.war already has {name}; choose another name for it')
        w.stored(name, lf(path.read_bytes()))
    return w.finish(), w.count


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--war', help='a local draw.war (checked against drawio.lock.json)')
    ap.add_argument('--stamp', action='store_true', help='write ui.bundle.url and sha256 into filex-app.json')
    args = ap.parse_args()

    zipped, files = build(fetch_war(args.war))
    digest = sha256(zipped)
    dist = HERE / 'dist'
    dist.mkdir(exist_ok=True)
    (dist / 'ui.zip').write_bytes(zipped)
    (dist / 'ui.zip.sha256').write_text(f'{digest}  ui.zip\n', encoding='utf-8')

    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if manifest['version'] != LOCK['version']:
        sys.exit(f"filex-app.json version {manifest['version']} is not draw.io {LOCK['version']} (drawio.lock.json)")
    url = f"https://github.com/{REPO}/releases/download/v{manifest['version']}/ui.zip"
    if args.stamp:
        manifest['ui']['bundle'] = {'url': url, 'sha256': digest}
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    (dist / 'filex-app.json').write_bytes(MANIFEST.read_bytes())

    pinned = manifest['ui'].get('bundle', {}).get('sha256', '')
    print(f'dist/ui.zip: {files} files, {len(zipped) / (1 << 20):.1f} MiB, sha256 {digest}')
    if pinned and pinned != digest:
        sys.exit(f'filex-app.json pins ui.bundle.sha256 {pinned}, this tree builds {digest} - run: python build.py --stamp')


if __name__ == '__main__':
    main()
