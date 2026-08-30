"""Package the one-off migration runner into a Lambda zip.

Bundles index.js with the `pg` driver that the API Lambda already vendors under
lambda/dist/node_modules, so nothing new has to be installed to run a migration.

The archive is written wherever the caller asks, which run-migration.sh points at
a temporary directory - it is a build artifact, not something to keep in the repo.

Usage:  python build.py <output.zip>
"""

import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ENTRY = os.path.join(HERE, "index.js")
DEPS = os.path.normpath(os.path.join(HERE, "..", "..", "lambda", "dist", "node_modules"))


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python build.py <output.zip>", file=sys.stderr)
        return 2
    out = sys.argv[1]

    if not os.path.isdir(DEPS):
        print(
            "missing " + DEPS + "\nRun `cd lambda && npm run build` first.",
            file=sys.stderr,
        )
        return 1

    if os.path.exists(out):
        os.remove(out)

    count = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(ENTRY, "index.js")
        count += 1
        for root, _dirs, files in os.walk(DEPS):
            for name in files:
                full = os.path.join(root, name)
                rel = os.path.relpath(full, DEPS).replace(os.sep, "/")
                z.write(full, "node_modules/" + rel)
                count += 1

    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        if "index.js" not in names:
            print("index.js missing from archive", file=sys.stderr)
            return 1
        if not any(n.startswith("node_modules/pg/") for n in names):
            print("pg driver missing from archive", file=sys.stderr)
            return 1

    print("built %s (%d entries, %.1f MB)" % (out, count, os.path.getsize(out) / 1048576))
    return 0


if __name__ == "__main__":
    sys.exit(main())
