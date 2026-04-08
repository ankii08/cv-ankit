#!/bin/sh
set -a
[ -f .env.local ] && . ./.env.local
set +a

# Avoid Vercel's recursive npm lifecycle detection when launched via `npm run dev`.
unset npm_lifecycle_event
unset npm_lifecycle_script
unset npm_command

exec npx vercel dev --local --listen 3000
