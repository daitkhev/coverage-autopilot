# The image the commands of a repository run in: Node, the ps program and
# Corepack. The mutation tool ends its test runners through ps, and the
# slim image of Node leaves it out, so a run of the tool ended there with
# no report. Node 26 no longer ships Corepack, which fetches the exact
# pnpm or yarn a repository names while its install has the network. No
# manager is in the image, so nothing after the install can start one.
FROM node:26-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global corepack@0.36.0 \
    && npm cache clean --force
