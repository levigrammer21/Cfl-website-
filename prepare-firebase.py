#!/usr/bin/env python3
"""Recreate the CFL source layout for Firebase deployment and development."""
from argparse import ArgumentParser
from pathlib import Path
from shutil import copyfile

FILES = {'.github/workflows/pages.yml': 'source--github--workflows--pages.yml', '.gitignore': 'source--gitignore', 'README.md': 'README.md', 'firebase.json': 'firebase.json', 'firestore.indexes.json': 'firestore.indexes.json', 'firestore.rules': 'firestore.rules', 'fixtures/legacy.json': 'source--fixtures--legacy.json', 'functions/domain.mjs': 'source--functions--domain.mjs', 'functions/index.mjs': 'source--functions--index.mjs', 'functions/package-lock.json': 'source--functions--package-lock.json', 'functions/package.json': 'source--functions--package.json', 'functions/projection.mjs': 'source--functions--projection.mjs', 'functions/schema.mjs': 'source--functions--schema.mjs', 'functions/setup-firebase.mjs': 'source--functions--setup-firebase.mjs', 'index.html': 'source--index.html', 'package-lock.json': 'source--package-lock.json', 'package.json': 'source--package.json', 'public/.nojekyll': 'source--public--.nojekyll', 'public/field.svg': 'source--public--field.svg', 'public/mark.svg': 'source--public--mark.svg', 'scripts/migrate-public.py': 'source--scripts--migrate-public.py', 'src/cloud.js': 'source--src--cloud.js', 'src/firebase-app.js': 'source--src--firebase-app.js', 'src/main.jsx': 'source--src--main.jsx', 'src/office.jsx': 'source--src--office.jsx', 'src/public.jsx': 'source--src--public.jsx', 'src/staff.js': 'source--src--staff.js', 'src/style.css': 'source--src--style.css', 'src/ui.jsx': 'source--src--ui.jsx', 'storage.rules': 'storage.rules', 'tests/domain.test.mjs': 'source--tests--domain.test.mjs', 'tests/emulator.mjs': 'source--tests--emulator.mjs', 'vite.config.js': 'source--vite.config.js'}


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('destination', nargs='?', type=Path, default=Path('CFL-Firebase-Project'))
    target = parser.parse_args().destination.resolve()
    source = Path(__file__).resolve().parent
    missing = [filename for filename in FILES.values() if not (source / filename).is_file()]
    if missing:
        parser.error('Missing source files: ' + ', '.join(missing))
    if target == source or (target.exists() and (not target.is_dir() or any(target.iterdir()))):
        parser.error('Choose a new or empty destination folder.')
    target.mkdir(parents=True, exist_ok=True)
    for relative, filename in FILES.items():
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        copyfile(source / filename, destination)
    print('CFL Firebase project ready at', target)


if __name__ == '__main__':
    main()
