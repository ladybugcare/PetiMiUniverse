#!/usr/bin/env bash
lsof -ti tcp:3000 | xargs -r kill
npm run dev